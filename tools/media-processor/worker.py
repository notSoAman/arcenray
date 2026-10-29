"""Private outbound-only supervisor for Arcenray's FFmpeg queue."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

API = os.environ.get("MEDIA_PROCESSOR_URL", "").rstrip("/")
SECRET = os.environ.get("MEDIA_PROCESSOR_SECRET", "")
PROCESSOR = Path(__file__).with_name("processor.py")
PYTHON = os.environ.get("PROCESSOR_PYTHON", sys.executable)
SCRATCH = Path(os.environ.get("PROCESSOR_SCRATCH", "/var/lib/arcenray/scratch"))
LEASE_SECONDS = 300
POLL_SECONDS = 10
CAPACITY_SECONDS = 45


class WorkerError(Exception):
    pass


def failure_code(stdout: str) -> str:
    """Only allow safe codes across the worker/API boundary, never exception text."""
    try:
        code = json.loads(stdout.splitlines()[-1]).get("code")
    except (ValueError, IndexError, AttributeError):
        return "processing_failed"
    if code == "select_one_video_and_at_most_one_audio_track":
        return "multiple_tracks"
    if code == "hdr_requires_an_explicit_tone_mapping_policy":
        return "hdr_unsupported"
    if code in ("unsupported_dimensions_duration_or_frame_rate", "export_square_pixel_video_first",
                "unsupported_display_rotation"):
        return "unsupported_media"
    if code in ("malformed_mp4", "malformed_or_overcomplex_mp4", "invalid_media_metadata",
                "media_decode_or_encode_failed"):
        return "invalid_media"
    if code == "insufficient_scratch_space":
        return "capacity"
    if code in ("source_changed", "processing_timeout"):
        return code
    if code in ("source_incomplete", "storage_or_dependency_failed", "output_storage_validation_failed"):
        return "storage"
    if code == "output_validation_failed":
        return "output_invalid"
    return "processing_failed"


def call(payload: dict, timeout: int = 20) -> dict:
    data = json.dumps(payload, separators=(",", ":")).encode()
    request = urllib.request.Request(API, data=data, method="POST", headers={
        "Content-Type": "application/json",
        "x-media-processor-secret": SECRET,
    })
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read(64 * 1024))
    except urllib.error.HTTPError as exc:
        # Never log URLs, response bodies, job payloads or credentials.
        raise WorkerError(f"processor_api_{exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        raise WorkerError("processor_api_unavailable") from None
    if not isinstance(result, dict):
        raise WorkerError("processor_api_invalid_response")
    return result


def capacity_bytes() -> int:
    # Reserve 20% of the filesystem for Ubuntu, logs, upgrades and safety. The
    # processor itself separately requires 3x input + 1 GiB free scratch.
    usage = shutil.disk_usage(SCRATCH)
    reserve = max(20 * 1024**3, usage.total // 5)
    return max(0, usage.free - reserve)


def report_capacity() -> None:
    call({"action": "capacity", "available_bytes": capacity_bytes()})


def heartbeat_loop(job: dict, stop: threading.Event, lost: threading.Event,
                   progress: Path | None = None) -> None:
    deadline = time.monotonic() + LEASE_SECONDS - 30
    delay = 45
    while not stop.wait(min(delay, max(0, deadline - time.monotonic()))):
        if time.monotonic() >= deadline:
            lost.set()
            return
        payload = {"action": "heartbeat", "job_id": job["job_id"], "lease_token": job["lease_token"]}
        if progress:
            try:
                stage = json.loads(progress.read_text()).get("stage")
                if stage in ("downloading", "encoding", "checking", "uploading"):
                    payload["stage"] = stage
            except (OSError, ValueError, AttributeError):
                pass
        try:
            active = call(payload)
            if active.get("active") is not True:
                lost.set()
                return
            deadline = time.monotonic() + LEASE_SECONDS - 30
            delay = 45
        except WorkerError:
            # A brief API outage must not throw away a long-running encode while
            # its lease is still valid. Stop before the last confirmed lease ends.
            if time.monotonic() >= deadline:
                lost.set()
                return
            delay = 10
        # Admission requires a capacity report <2 minutes old. Previously this
        # stopped for the entire encode, rejecting every subsequent upload.
        try:
            report_capacity()
        except WorkerError:
            pass


def stop_child(child: subprocess.Popen) -> None:
    # processor.py owns an FFmpeg subprocess. Killing only Python leaves an
    # orphan encode using both CPUs after the job has already been retried.
    try:
        os.killpg(child.pid, signal.SIGTERM)
        child.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=5)
    except ProcessLookupError:
        pass


def process(job: dict) -> None:
    stop, lost = threading.Event(), threading.Event()
    heartbeat = None
    safe_error = "processing_failed"
    try:
        with tempfile.TemporaryDirectory(prefix="arcenray-job-", dir=SCRATCH) as raw:
            work = Path(raw)
            manifest = work / "job.json"
            manifest.write_text(json.dumps(job, separators=(",", ":")))
            manifest.chmod(0o600)
            output = work / "receipt"
            output.mkdir(mode=0o700)
            heartbeat = threading.Thread(target=heartbeat_loop,
                args=(job, stop, lost, output / "progress.json"), daemon=True)
            heartbeat.start()
            command = [PYTHON, str(PROCESSOR), "--job", str(manifest), "--output-dir", str(output)]
            child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, text=True, close_fds=True,
                                     start_new_session=True)
            while child.poll() is None:
                if lost.wait(2):
                    stop_child(child)
                    safe_error = "cancelled"
                    raise WorkerError(safe_error)
            stdout = child.stdout.read(8192) if child.stdout else ""
            if child.stdout:
                child.stdout.close()
            if child.returncode != 0:
                safe_error = failure_code(stdout)
                raise WorkerError(safe_error)
            if lost.is_set():
                safe_error = "cancelled"
                raise WorkerError(safe_error)
            receipt = json.loads((output / "receipt.json").read_text())
            if (receipt.get("job_id") != job["job_id"] or receipt.get("attempt_id") != job["attempt_id"]
                    or receipt.get("output_key") != job["output_key"]):
                safe_error = "output_invalid"
                raise WorkerError(safe_error)
            # Retry the existing private output after transient API failures;
            # never download and encode the source again just for a lost reply.
            for attempt in range(3):
                try:
                    saved = call({"action": "complete", "job_id": job["job_id"], "lease_token": job["lease_token"],
                                  "output_etag": receipt["output_etag"], "output_bytes": receipt["output_bytes"],
                                  "sha256": receipt["sha256"]}, timeout=60)
                    break
                except WorkerError:
                    if attempt == 2 or lost.wait(2 ** attempt):
                        raise
            if saved.get("completed") is not True:
                safe_error = "output_invalid"
                raise WorkerError(safe_error)
            print(json.dumps({"event": "media_processed", "job_id": job["job_id"],
                              "mode": receipt.get("mode"), "timings": receipt.get("timings", {}),
                              "source_bytes": job["source_bytes"], "output_bytes": receipt["output_bytes"]}), flush=True)
    except (WorkerError, OSError, ValueError, KeyError):
        print(json.dumps({"event": "media_failed", "job_id": job["job_id"], "code": safe_error}), flush=True)
        # A failed heartbeat can mean a draft was deleted, hidden, or suspended.
        # Reporting failure releases our lease when it is still ours; a newer
        # worker's token makes this a harmless compare-and-set no-op.
        try:
            call({"action": "fail", "job_id": job["job_id"], "lease_token": job["lease_token"], "error": safe_error})
        except WorkerError:
            pass
    finally:
        stop.set()
        if heartbeat:
            heartbeat.join(timeout=2)


def main() -> None:
    if not API.startswith("https://") or not SECRET:
        raise SystemExit("Worker configuration is incomplete")
    SCRATCH.mkdir(parents=True, exist_ok=True, mode=0o700)
    last_capacity = 0.0
    while True:
        try:
            if time.monotonic() - last_capacity >= CAPACITY_SECONDS:
                report_capacity()
                last_capacity = time.monotonic()
            result = call({"action": "claim"})
            job = result.get("job")
            if job is None:
                time.sleep(POLL_SECONDS)
                continue
            if not isinstance(job, dict):
                raise WorkerError("processor_api_invalid_job")
            process(job)
            # Recompute after temporary scratch is released before accepting more.
            last_capacity = 0.0
        except WorkerError:
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
