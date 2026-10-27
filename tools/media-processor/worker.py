"""Private outbound-only supervisor for Arcenray's FFmpeg queue."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

API = os.environ["MEDIA_PROCESSOR_URL"].rstrip("/")
SECRET = os.environ["MEDIA_PROCESSOR_SECRET"]
PROCESSOR = Path(__file__).with_name("processor.py")
PYTHON = os.environ.get("PROCESSOR_PYTHON", sys.executable)
SCRATCH = Path(os.environ.get("PROCESSOR_SCRATCH", "/var/lib/arcenray/scratch"))
SCRATCH.mkdir(parents=True, exist_ok=True, mode=0o700)
LEASE_SECONDS = 300
POLL_SECONDS = 10
CAPACITY_SECONDS = 45


class WorkerError(Exception):
    pass


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


def heartbeat_loop(job: dict, stop: threading.Event, lost: threading.Event) -> None:
    while not stop.wait(45):
        try:
            active = call({"action": "heartbeat", "job_id": job["job_id"], "lease_token": job["lease_token"]})
            if active.get("active") is not True:
                lost.set()
                return
        except WorkerError:
            # Retry briefly during a transient network issue; a full 300-second
            # lease gives the worker time to reconnect safely.
            if stop.wait(15):
                return
            try:
                active = call({"action": "heartbeat", "job_id": job["job_id"], "lease_token": job["lease_token"]})
                if active.get("active") is not True:
                    lost.set()
                    return
            except WorkerError:
                lost.set()
                return


def process(job: dict) -> None:
    stop, lost = threading.Event(), threading.Event()
    heartbeat = threading.Thread(target=heartbeat_loop, args=(job, stop, lost), daemon=True)
    heartbeat.start()
    safe_error = "processing_failed"
    try:
        with tempfile.TemporaryDirectory(prefix="arcenray-job-", dir=SCRATCH) as raw:
            work = Path(raw)
            manifest = work / "job.json"
            manifest.write_text(json.dumps(job, separators=(",", ":")))
            manifest.chmod(0o600)
            output = work / "receipt"
            output.mkdir(mode=0o700)
            command = [PYTHON, str(PROCESSOR), "--job", str(manifest), "--output-dir", str(output)]
            child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, text=True, close_fds=True)
            while child.poll() is None:
                if lost.wait(2):
                    child.kill()
                    child.wait(timeout=15)
                    safe_error = "cancelled"
                    raise WorkerError(safe_error)
            if child.returncode != 0:
                safe_error = "storage" if "storage" in (child.stdout.read(2048) if child.stdout else "") else "processing_failed"
                raise WorkerError(safe_error)
            if lost.is_set():
                safe_error = "cancelled"
                raise WorkerError(safe_error)
            receipt = json.loads((output / "receipt.json").read_text())
            if (receipt.get("job_id") != job["job_id"] or receipt.get("attempt_id") != job["attempt_id"]
                    or receipt.get("output_key") != job["output_key"]):
                safe_error = "output_invalid"
                raise WorkerError(safe_error)
            saved = call({"action": "complete", "job_id": job["job_id"], "lease_token": job["lease_token"],
                          "output_etag": receipt["output_etag"], "output_bytes": receipt["output_bytes"],
                          "sha256": receipt["sha256"]})
            if saved.get("completed") is not True:
                safe_error = "output_invalid"
                raise WorkerError(safe_error)
    except (WorkerError, OSError, ValueError, KeyError):
        # A failed heartbeat can mean a draft was deleted, hidden, or suspended.
        # Reporting failure releases our lease when it is still ours; a newer
        # worker's token makes this a harmless compare-and-set no-op.
        try:
            call({"action": "fail", "job_id": job["job_id"], "lease_token": job["lease_token"], "error": safe_error})
        except WorkerError:
            pass
    finally:
        stop.set()
        heartbeat.join(timeout=2)


def main() -> None:
    if not API.startswith("https://") or not SECRET:
        raise SystemExit("Worker configuration is incomplete")
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
