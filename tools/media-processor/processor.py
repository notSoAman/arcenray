"""Offline/private-R2 processing primitive. Deliberately cannot publish a film.

Run with Python 3.12+ and FFmpeg/ffprobe on an isolated Linux compute host.
No HTTP server, public URLs, database credentials, or browser secrets are needed.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import resource
import shutil
import struct
import subprocess
import tempfile
from dataclasses import dataclass
from fractions import Fraction
from uuid import UUID


POLICY_VERSION = "1080p-v1"
MIB = 1024 * 1024
LOCAL_MP4 = ["-protocol_whitelist", "file", "-format_whitelist", "mov",
             "-enable_drefs", "0", "-use_absolute_path", "0"]


class ProcessingError(Exception):
    """Safe, non-secret error suitable for a job receipt."""


@dataclass(frozen=True)
class Policy:
    bitrate: int = 4_500_000
    threads: int = 2
    timeout: int = 6 * 60 * 60


def run(argv: list[str], *, timeout: int, output: Path | None = None,
        max_file_bytes: int = 1024 * MIB) -> None:
    # Local MP4 demuxing only. No shell and no FFmpeg network protocols.
    def limits():
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_FSIZE, (max_file_bytes, max_file_bytes))
        resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))

    with (output.open("wb") if output else open(os.devnull, "wb")) as stdout:
        try:
            subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=stdout,
                           stderr=subprocess.DEVNULL, check=True, timeout=timeout,
                           preexec_fn=limits)
        except subprocess.TimeoutExpired as exc:
            raise ProcessingError("processing_timeout") from exc
        except subprocess.CalledProcessError as exc:
            raise ProcessingError("media_decode_or_encode_failed") from exc


def probe(path: Path, work: Path) -> dict:
    dest = work / "probe.json"
    run(["ffprobe", "-v", "error", *LOCAL_MP4,
         "-show_streams", "-show_format", "-of", "json",
         str(path)], timeout=60, output=dest, max_file_bytes=MIB)
    try:
        data = json.loads(dest.read_text())
        streams = data["streams"]
        video = [s for s in streams if s["codec_type"] == "video"
                 and not s.get("disposition", {}).get("attached_pic")]
        audio = [s for s in streams if s["codec_type"] == "audio"]
        if len(video) != 1 or len(audio) > 1:
            raise ProcessingError("select_one_video_and_at_most_one_audio_track")
        v = video[0]
        duration = float(data["format"]["duration"])
        width, height = int(v["width"]), int(v["height"])
        fps = float(Fraction(v["avg_frame_rate"]))
        if not (math.isfinite(duration) and duration > 0 and 0 < fps <= 240
                and 0 < width <= 8192 and 0 < height <= 8192):
            raise ProcessingError("unsupported_dimensions_duration_or_frame_rate")
        sar = v.get("sample_aspect_ratio", "1:1")
        if sar not in ("1:1", "N/A", "0:1"):
            raise ProcessingError("export_square_pixel_video_first")
        if (v.get("color_transfer") in ("smpte2084", "arib-std-b67")
                or v.get("color_primaries") == "bt2020"):
            raise ProcessingError("hdr_requires_an_explicit_tone_mapping_policy")
        rotation = 0
        for side in v.get("side_data_list", []):
            if "rotation" in side:
                rotation = int(side["rotation"]) % 360
        if rotation not in (0, 90, 180, 270):
            raise ProcessingError("unsupported_display_rotation")
        if rotation in (90, 270):
            width, height = height, width
        return {"width": width, "height": height, "duration": duration,
                "fps": fps, "video_codec": v["codec_name"],
                "pixel_format": v.get("pix_fmt"), "profile": v.get("profile"),
                "audio_codec": audio[0]["codec_name"] if audio else None,
                "audio_channels": int(audio[0].get("channels", 0)) if audio else 0,
                "rotation": rotation, "streams": len(streams)}
    except (KeyError, ValueError, TypeError, ZeroDivisionError) as exc:
        raise ProcessingError("invalid_media_metadata") from exc


def mp4_layout(path: Path) -> tuple[bool, bool]:
    """Bounded-memory top-level MP4 inspection, including >4GiB box sizes."""
    size = path.stat().st_size
    offset = 0
    first = {}
    fragmented = False
    with path.open("rb") as source:
        for _ in range(100_000):
            if offset == size:
                break
            source.seek(offset)
            header = source.read(8)
            if len(header) != 8:
                raise ProcessingError("malformed_mp4")
            length, kind = struct.unpack(">I4s", header)
            minimum = 8
            if length == 1:
                raw = source.read(8)
                if len(raw) != 8:
                    raise ProcessingError("malformed_mp4")
                length = struct.unpack(">Q", raw)[0]
                minimum = 16
            elif length == 0:
                length = size - offset
            if length < minimum or offset + length > size:
                raise ProcessingError("malformed_mp4")
            first.setdefault(kind, offset)
            fragmented |= kind in (b"moof", b"styp")
            offset += length
        if offset != size or not all(k in first for k in (b"ftyp", b"moov", b"mdat")):
            raise ProcessingError("malformed_or_overcomplex_mp4")
    return first[b"moov"] < first[b"mdat"], fragmented


def compatible(meta: dict) -> bool:
    return (max(meta["width"], meta["height"]) <= 1920
            and min(meta["width"], meta["height"]) <= 1080
            and meta["video_codec"] == "h264"
            and meta["pixel_format"] == "yuv420p"
            and meta["profile"] in ("Constrained Baseline", "Baseline", "Main", "High")
            and meta["audio_codec"] in (None, "aac")
            and meta["audio_channels"] <= 2 and meta["fps"] <= 60)


def decision(meta: dict, size: int, policy: Policy) -> str:
    # Includes container/audio overhead. A small file is not necessarily low bitrate.
    if compatible(meta) and size * 8 / meta["duration"] <= policy.bitrate:
        return "preserve"
    return "transcode"


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(MIB):
            sha.update(chunk)
    return sha.hexdigest()


def process(source: Path, work: Path, policy: Policy = Policy()) -> tuple[Path, dict]:
    source = source.resolve(strict=True)
    size = source.stat().st_size
    meta = probe(source, work)
    faststart, fragmented = mp4_layout(source)
    mode = decision(meta, size, policy)
    output = work / "processed.mp4"
    common = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
              "-xerror", "-err_detect", "explode", *LOCAL_MP4,
              "-threads", str(policy.threads), "-i", str(source),
              "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn"]
    if mode == "preserve" and faststart and not fragmented and meta["streams"] <= 2:
        output = source  # Byte-for-byte preservation, no redundant temporary copy.
    else:
        if mode == "preserve":
            # Lossless remux for moov-at-end / fragmented input / extra data tracks.
            args = ["-c", "copy"]
            mode = "remux"
        else:
            long_edge, short_edge = ((1920, 1080) if meta["width"] >= meta["height"]
                                     else (1080, 1920))
            width = min(long_edge, meta["width"])
            height = min(short_edge, meta["height"])
            filters = (f"scale=w={width}:h={height}:force_original_aspect_ratio=decrease:"
                       "force_divisible_by=2,setsar=1")
            if meta["fps"] > 60:
                filters += ",fps=60"
            args = ["-vf", filters, "-c:v", "libx264", "-preset", "medium", "-crf", "22",
                    "-pix_fmt", "yuv420p", "-threads", str(policy.threads),
                    "-c:a", "aac", "-b:a", "160k", "-ac", "2"]
        run(common + args + ["-map_metadata", "-1", "-map_chapters", "-1",
                            "-movflags", "+faststart", str(output)],
            timeout=policy.timeout, max_file_bytes=2 * size + 64 * MIB)
        # Do not substitute a larger lossy file for a valid source. Still normalize
        # its container, and fully validate it below.
        if mode == "transcode" and compatible(meta) and output.stat().st_size >= size:
            output.unlink()
            run(common + ["-c", "copy", "-map_metadata", "-1", "-map_chapters", "-1",
                          "-movflags", "+faststart", str(output)],
                timeout=policy.timeout, max_file_bytes=2 * size + 64 * MIB)
            mode = "remux_no_size_saving"
    result = probe(output, work)
    seekable, fragmented = mp4_layout(output)
    if (not compatible(result) or not seekable or fragmented
            or abs(result["duration"] - meta["duration"]) > max(0.25, 2 / meta["fps"])
            or result["width"] > meta["width"] or result["height"] > meta["height"]
            or (meta["audio_codec"] is not None and result["audio_codec"] is None)):
        raise ProcessingError("output_validation_failed")
    # Decode every output packet, including pass-through originals. Metadata alone
    # cannot detect truncated/corrupt media. No raw decoder output retained/logged.
    run(["ffmpeg", "-v", "error", "-nostdin", "-xerror", "-err_detect", "explode",
         *LOCAL_MP4, "-threads",
         str(policy.threads), "-i", str(output), "-map", "0:v:0", "-map", "0:a:0?",
         "-f", "null", "-"], timeout=policy.timeout)
    return output, {"policy": POLICY_VERSION, "mode": mode,
                    "source_bytes": size, "output_bytes": output.stat().st_size,
                    "sha256": digest(output), "media": result}


def uuid(value: str) -> str:
    return str(UUID(value))


def validate_job(data: dict) -> dict:
    # Trusted job manifest only; never accept a browser-supplied bucket or URL.
    try:
        job = {k: uuid(data[k]) for k in ("job_id", "attempt_id", "owner_id", "asset_id")}
        job["source_key"] = data["source_key"]
        job["source_etag"] = data["source_etag"]
        job["source_bytes"] = data["source_bytes"]
        prefix = f"{job['owner_id']}/"
        key = job["source_key"]
        if (not isinstance(key, str) or not key.startswith(prefix) or len(key) > 1024
                or any(c in key for c in ("..", "\\", ":", "\n", "\r"))
                or not isinstance(job["source_etag"], str)
                or not job["source_etag"].strip('"')
                or type(job["source_bytes"]) is not int or job["source_bytes"] <= 0):
            raise ValueError()
        job["output_key"] = f"processing/{job['job_id']}/{job['attempt_id']}/film.mp4"
        return job
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        raise ProcessingError("invalid_trusted_job_manifest") from exc


def download(client, bucket: str, job: dict, target: Path) -> None:
    response = client.get_object(Bucket=bucket, Key=job["source_key"],
                                 IfMatch=job["source_etag"])
    body = response["Body"]
    try:
        if (response["ContentLength"] != job["source_bytes"]
                or response["ETag"] != job["source_etag"]):
            raise ProcessingError("source_changed")
        received = 0
        with target.open("xb") as dest:
            while chunk := body.read(MIB):
                received += len(chunk)
                if received > job["source_bytes"]:
                    raise ProcessingError("source_changed")
                dest.write(chunk)
        if received != job["source_bytes"]:
            raise ProcessingError("source_incomplete")
    finally:
        body.close()


def upload(client, bucket: str, key: str, path: Path, receipt: dict) -> str:
    # Explicit multipart lifecycle makes failures abortable; memory <=64MiB (or
    # larger dynamic part at provider-scale sizes). Disk I/O never loads full film.
    size = path.stat().st_size
    part_size = max(64 * MIB, math.ceil(size / 10_000 / MIB) * MIB)
    created = client.create_multipart_upload(Bucket=bucket, Key=key,
        ContentType="video/mp4", Metadata={"sha256": receipt["sha256"],
                                         "policy": POLICY_VERSION})
    upload_id = created["UploadId"]
    try:
        parts = []
        with path.open("rb") as source:
            while chunk := source.read(part_size):
                number = len(parts) + 1
                part = client.upload_part(Bucket=bucket, Key=key, UploadId=upload_id,
                                          PartNumber=number, Body=chunk,
                                          ContentMD5=base64.b64encode(
                                              hashlib.md5(chunk, usedforsecurity=False).digest()
                                          ).decode("ascii"))
                parts.append({"PartNumber": number, "ETag": part["ETag"]})
        client.complete_multipart_upload(Bucket=bucket, Key=key, UploadId=upload_id,
                                         MultipartUpload={"Parts": parts})
    except BaseException:
        try:
            client.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=upload_id)
        except Exception:
            pass  # Host crash/ambiguous completion needs orchestrator exact-key cleanup.
        raise
    head = client.head_object(Bucket=bucket, Key=key)
    if head["ContentLength"] != size or head.get("Metadata", {}).get("sha256") != receipt["sha256"]:
        raise ProcessingError("output_storage_validation_failed")
    return head["ETag"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--local", type=Path, help="inspect/convert a local MP4 without cloud access")
    group.add_argument("--job", type=Path, help="trusted private-R2 job manifest")
    parser.add_argument("--output-dir", type=Path, required=True,
                        help="existing empty directory for local output and/or private receipt")
    args = parser.parse_args()
    if not args.output_dir.is_dir() or any(args.output_dir.iterdir()):
        parser.error("output-dir must exist and be empty")
    os.umask(0o077)
    try:
        with tempfile.TemporaryDirectory(prefix="arcenray-process-",
                                         dir=os.environ.get("PROCESSOR_SCRATCH")) as raw:
            work = Path(raw)
            job = validate_job(json.loads(args.job.read_text())) if args.job else None
            source = args.local.resolve(strict=True) if args.local else work / "source.mp4"
            expected = job["source_bytes"] if job else source.stat().st_size
            # Local admission limit derives from available scratch space, not a2GiB
            # product cap. A host must reserve disk per single-concurrency worker.
            if shutil.disk_usage(work).free < 3 * expected + 1024 * MIB:
                raise ProcessingError("insufficient_scratch_space")
            if job:
                import boto3
                from botocore.config import Config
                account = os.environ["R2_ACCOUNT_ID"]
                if len(account) != 32 or any(c not in "0123456789abcdef" for c in account):
                    raise ProcessingError("invalid_r2_account")
                # Never use the public bucket. Credentials must be scoped to this
                # private bucket only. No ambient AWS role/metadata credential lookup.
                bucket = "arcenray-uploads"
                client = boto3.client("s3", endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                    region_name="auto", aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                    config=Config(connect_timeout=10, read_timeout=120,
                                  retries={"mode": "standard", "max_attempts": 5},
                                  request_checksum_calculation="when_required",
                                  response_checksum_validation="when_required"))
                download(client, bucket, job, source)
            output, receipt = process(source, work)
            if job:
                etag = upload(client, bucket, job["output_key"], output, receipt)
                receipt.update({**job, "output_etag": etag})
            else:
                shutil.copyfile(output, args.output_dir / "film.mp4")
            (args.output_dir / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
            print(json.dumps({"status": "processed_private", "mode": receipt["mode"]}))
    except (ProcessingError, OSError, ValueError, KeyError) as exc:
        # Do not print SDK exceptions (URLs/keys), filenames, or FFmpeg stderr.
        code = str(exc) if isinstance(exc, ProcessingError) else "processing_failed"
        print(json.dumps({"status": "failed", "code": code}))
        raise SystemExit(1)
    except Exception:
        print(json.dumps({"status": "failed", "code": "storage_or_dependency_failed"}))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
