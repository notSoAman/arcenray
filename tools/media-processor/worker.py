"""Single-concurrency supervisor for the private Arcenray media queue."""
from __future__ import annotations

import json
import os
from pathlib import Path
import signal
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from uuid import UUID
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

POLL_SECONDS = 20
HEARTBEAT_SECONDS = 45


class WorkerError(Exception):
    pass


def validate_claimed_job(job: dict) -> dict:
    required_fields = ("job_id", "attempt_id", "owner_id", "asset_id", "source_key",
                       "source_etag", "source_bytes", "lease_token", "output_key")
    try:
        for name in ("job_id", "attempt_id", "owner_id", "asset_id", "lease_token"):
            UUID(job[name])
        owner_id = str(UUID(job["owner_id"]))
        expected_output = f"processing/{job['job_id']}/{job['attempt_id']}/film.mp4"
        if (any(field not in job for field in required_fields)
                or job["owner_id"] != owner_id or job["output_key"] != expected_output
                or not isinstance(job["source_key"], str)
                or not job["source_key"].startswith(owner_id + "/")
                or not isinstance(job["source_etag"], str)
                or type(job["source_bytes"]) is not int or job["source_bytes"] <= 0):
            raise ValueError()
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        raise WorkerError("invalid_claimed_job") from exc
    return job


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise WorkerError("worker_configuration_missing")
    return value


def call_api(action: str, **payload):
    url = required("MEDIA_PROCESSING_URL")
    token = required("MEDIA_PROCESSOR_TOKEN")
    anon = required("SUPABASE_ANON_KEY")
    request = Request(url, data=json.dumps({"action": action, **payload}).encode(),
                      method="POST", headers={
                          "Content-Type": "application/json",
                          "apikey": anon,
                          "Authorization": f"Bearer {anon}",
                          "x-media-processor-token": token,
                      })
    try:
        with urlopen(request, timeout=20) as response:
            data = json.loads(response.read(32 * 1024))
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        raise WorkerError("control_api_unavailable") from exc
    return data


def heartbeat_loop(job: dict, stop: threading.Event, lost: threading.Event):
    while not stop.wait(HEARTBEAT_SECONDS):
        try:
            result = call_api("heartbeat", job_id=job["job_id"], lease_token=job["lease_token"])
            if result.get("ok") is not True:
                lost.set()
                return
        except WorkerError:
            # A lease lasts five minutes. A transient request can be retried once
            # before stopping; never finalize after an unconfirmed lease loss.
            if stop.wait(10):
                return
            try:
                if call_api("heartbeat", job_id=job["job_id"], lease_token=job["lease_token"]).get("ok") is True:
                    continue
            except WorkerError:
                pass
            lost.set()
            return


def run_job(job: dict, scratch: Path):
    validate_claimed_job(job)
    manifest_fields = ("job_id", "attempt_id", "owner_id", "asset_id", "source_key", "source_etag", "source_bytes")
    expected_output = job["output_key"]
    directory = Path(tempfile.mkdtemp(prefix="arcenray-job-", dir=scratch))
    os.chmod(directory, 0o700)
    try:
        manifest = directory / "job.json"
        manifest.write_text(json.dumps({k: job[k] for k in manifest_fields}))
        os.chmod(manifest, 0o600)
        output_dir = directory / "result"
        output_dir.mkdir(mode=0o700)
        command = [sys.executable, str(Path(__file__).with_name("processor.py")),
                   "--job", str(manifest), "--output-dir", str(output_dir)]
        env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
               "PROCESSOR_SCRATCH": str(scratch),
               "R2_ACCOUNT_ID": required("R2_ACCOUNT_ID"),
               "R2_ACCESS_KEY_ID": required("R2_ACCESS_KEY_ID"),
               "R2_SECRET_ACCESS_KEY": required("R2_SECRET_ACCESS_KEY"),
               "R2_UPLOAD_BUCKET_NAME": required("R2_UPLOAD_BUCKET_NAME")}
        if env["R2_UPLOAD_BUCKET_NAME"] != "arcenray-uploads":
            raise WorkerError("invalid_private_bucket")
        proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, env=env, start_new_session=True,
                                close_fds=True)
        stop, lost = threading.Event(), threading.Event()
        monitor = threading.Thread(target=heartbeat_loop, args=(job, stop, lost), daemon=True)
        monitor.start()
        try:
            while proc.poll() is None:
                if lost.wait(1):
                    os.killpg(proc.pid, signal.SIGTERM)
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        os.killpg(proc.pid, signal.SIGKILL)
                    raise WorkerError("lease_lost")
            stdout = proc.stdout.read(4096) if proc.stdout else b""
        finally:
            stop.set()
            monitor.join(timeout=2)
        if proc.returncode != 0:
            code = "processing_failed"
            try:
                report = json.loads(stdout.splitlines()[-1])
                if report.get("status") == "failed":
                    code = report.get("code", code)
            except (ValueError, IndexError, AttributeError):
                pass
            if code == "insufficient_scratch_space":
                code = "capacity"
            elif code == "source_changed":
                code = "source_changed"
            elif "invalid" in code or "unsupported" in code or "malformed" in code:
                code = "output_invalid"
            else:
                code = "processing_failed"
            raise WorkerError(code)
        receipt = json.loads((output_dir / "receipt.json").read_text())
        if (receipt.get("job_id") != job["job_id"] or receipt.get("attempt_id") != job["attempt_id"]
                or receipt.get("output_key") != expected_output or receipt.get("policy") != "1080p-v1"):
            raise WorkerError("invalid_receipt")
        media = receipt["media"]
        result = call_api("finish", job_id=job["job_id"], lease_token=job["lease_token"],
                          attempt_id=job["attempt_id"], output_key=expected_output,
                          output_etag=receipt["output_etag"], output_bytes=receipt["output_bytes"],
                          sha256=receipt["sha256"], width=media["width"], height=media["height"],
                          duration=media["duration"])
        if result.get("ok") is not True:
            raise WorkerError("finish_rejected")
    finally:
        shutil.rmtree(directory, ignore_errors=True)


def main():
    scratch = Path(required("PROCESSOR_SCRATCH")).resolve()
    if not scratch.is_dir() or shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise WorkerError("processor_runtime_missing")
    # Establish valid configuration before entering the loop. Never log values.
    for name in ("MEDIA_PROCESSING_URL", "MEDIA_PROCESSOR_TOKEN", "SUPABASE_ANON_KEY",
                 "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_UPLOAD_BUCKET_NAME"):
        required(name)
    while True:
        try:
            available = shutil.disk_usage(scratch).free
            call_api("capacity", available_bytes=available)
            claimed = call_api("claim").get("job")
            if claimed:
                try:
                    run_job(claimed, scratch)
                    print(json.dumps({"event": "job_complete", "job_id": claimed["job_id"]}), flush=True)
                except WorkerError as exc:
                    code = str(exc)
                    if code not in {"source_changed", "capacity", "storage", "output_invalid", "cancelled"}:
                        code = "processing_failed"
                    try:
                        call_api("fail", job_id=claimed["job_id"], lease_token=claimed["lease_token"], code=code)
                    except WorkerError:
                        pass
                    print(json.dumps({"event": "job_failed", "job_id": claimed.get("job_id"), "code": code}), flush=True)
                continue
        except WorkerError:
            print(json.dumps({"event": "control_unavailable"}), flush=True)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except WorkerError as exc:
        print(json.dumps({"event": "worker_stopped", "code": str(exc)}), file=sys.stderr)
        raise SystemExit(1)
