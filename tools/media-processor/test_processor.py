"""Actual FFmpeg regression fixtures + isolated R2 failure tests; no cloud writes."""
import io
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest
import threading
from unittest.mock import Mock, patch

from processor import (Policy, ProcessingError, compatible, decision, digest,
                       download, mp4_layout, process, upload, validate_job)
import processor


class PolicyTests(unittest.TestCase):
    def meta(self, **changes):
        return {"width": 640, "height": 360, "duration": 10, "fps": 24,
                "video_codec": "h264", "pixel_format": "yuv420p", "profile": "High",
                "audio_codec": "aac", "audio_channels": 2, **changes}

    def test_policy_preserves_low_quality_source_without_upscale(self):
        self.assertEqual(decision(self.meta(), 100_000, Policy()), "preserve")
        self.assertEqual(decision(self.meta(width=3840, height=2160), 100_000, Policy()), "transcode")
        self.assertEqual(decision(self.meta(), 10_000_000, Policy()), "transcode")
        self.assertEqual(decision(self.meta(video_codec="hevc"), 100_000, Policy()), "transcode")
        self.assertFalse(compatible(self.meta(pixel_format="yuv420p10le")))

    def test_manifest_cannot_choose_public_bucket_or_external_source(self):
        base = {k: "00000000-0000-4000-8000-000000000001"
                for k in ("job_id", "attempt_id", "owner_id", "asset_id")}
        base.update(source_key=base["owner_id"] + "/original", source_etag='"abc"',
                    source_bytes=3 * 1024 ** 3)
        self.assertEqual(validate_job(base)["source_bytes"], 3 * 1024 ** 3)
        for key in ("https://example.com/video", "../secret", "other-user/video"):
            with self.subTest(key=key), self.assertRaises(ProcessingError):
                validate_job({**base, "source_key": key})
        for value in (True, 0, -1, "123"):
            with self.subTest(value=value), self.assertRaises(ProcessingError):
                validate_job({**base, "source_bytes": value})

    def test_changed_or_truncated_source_is_not_processed(self):
        with tempfile.TemporaryDirectory() as raw:
            client = Mock()
            body = io.BytesIO(b"short")
            client.get_object.return_value = {"Body": body, "ContentLength": 6, "ETag": '"abc"'}
            with self.assertRaisesRegex(ProcessingError, "source_incomplete"):
                download(client, "private", {"source_key": "x", "source_etag": '"abc"',
                         "source_bytes": 6}, Path(raw) / "in.mp4")
            self.assertTrue(body.closed)
            self.assertEqual(client.get_object.call_args.kwargs["IfMatch"], '"abc"')

    def test_storage_failure_aborts_only_attempt_multipart(self):
        with tempfile.TemporaryDirectory() as raw:
            source = Path(raw) / "film.mp4"
            source.write_bytes(b"fixture")
            client = Mock()
            client.create_multipart_upload.return_value = {"UploadId": "attempt"}
            client.upload_part.side_effect = RuntimeError("network")
            with self.assertRaises(RuntimeError):
                upload(client, "private", "processing/job/attempt/film.mp4", source,
                       {"sha256": digest(source)})
            client.abort_multipart_upload.assert_called_once_with(
                Bucket="private", Key="processing/job/attempt/film.mp4", UploadId="attempt")
            client.complete_multipart_upload.assert_not_called()
            client.delete_object.assert_not_called()

    def test_extended_mp4_boxes_above_four_gib_are_not_read_into_memory(self):
        with tempfile.TemporaryDirectory() as raw:
            source = Path(raw) / "sparse.mp4"
            length = 5 * 1024 ** 3
            with source.open("wb") as dest:
                dest.write(struct.pack(">I4s", 8, b"ftyp"))
                dest.write(struct.pack(">I4s", 8, b"moov"))
                dest.write(struct.pack(">I4sQ", 1, b"mdat", length - 16))
                dest.truncate(length)
            self.assertEqual(mp4_layout(source), (True, False))

    def test_parallel_download_is_etag_bound_and_reassembles_correct_bytes(self):
        with tempfile.TemporaryDirectory() as raw, patch.object(processor, "MIB", 1):
            data = bytes(range(200))
            barrier = threading.Barrier(4)
            def get(**kw):
                self.assertEqual(kw['IfMatch'], '"same-source"')
                start, end = map(int, kw['Range'][6:].split('-'))
                barrier.wait(timeout=5)
                return {'Body': io.BytesIO(data[start:end+1]), 'ContentLength': end-start+1,
                        'ContentRange': f'bytes {start}-{end}/200', 'ETag': '"same-source"'}
            client = Mock()
            client.get_object.side_effect = get
            target = Path(raw)/'source.mp4'
            download(client, 'private', {'source_key': 'owner/film', 'source_etag': '"same-source"', 'source_bytes':200}, target)
            self.assertEqual(target.read_bytes(), data)

    def test_parallel_download_rejects_changed_etag_and_truncated_range(self):
        for changed in (True, False):
            with tempfile.TemporaryDirectory() as raw, patch.object(processor, "MIB", 1), patch.object(processor.time, 'sleep'):
                client = Mock()
                def get(**kw):
                    start, end = map(int, kw['Range'][6:].split('-'))
                    return {'Body': io.BytesIO(b'bad'), 'ContentLength': end-start+1,
                            'ContentRange': f'bytes {start}-{end}/65', 'ETag': '"changed"' if changed else '"source"'}
                client.get_object.side_effect = get
                with self.assertRaises(ProcessingError):
                    download(client,'private',{'source_key':'owner/film','source_etag':'"source"','source_bytes':65},Path(raw)/'source.mp4')

    def test_parallel_upload_completes_in_part_order_after_out_of_order_transfer(self):
        with tempfile.TemporaryDirectory() as raw, patch.object(processor, 'MIB', 1):
            source = Path(raw)/'film.mp4'
            source.write_bytes(bytes(range(100)))
            client = Mock()
            client.create_multipart_upload.return_value = {'UploadId':'attempt'}
            barrier = threading.Barrier(2)
            def put(**kw):
                barrier.wait(timeout=5)
                return {'ETag': str(kw['PartNumber'])}
            client.upload_part.side_effect = put
            client.head_object.return_value={'ContentLength':100,'Metadata':{'sha256':'hash'},'ETag':'result'}
            self.assertEqual(upload(client,'private','output',source,{'sha256':'hash'}),'result')
            self.assertEqual(client.complete_multipart_upload.call_args.kwargs['MultipartUpload']['Parts'],
                             [{'PartNumber':1,'ETag':'1'},{'PartNumber':2,'ETag':'2'}])


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
class FFmpegTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def fixture(self, name, dimensions="640x360", codec="libx264", extra=(), audio=False):
        source = self.root / name
        argv = ["ffmpeg", "-v", "error", "-nostdin", "-f", "lavfi", "-i",
                f"testsrc2=size={dimensions}:rate=24:duration=0.5"]
        if audio:
            argv += ["-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", "-c:a", "aac"]
        subprocess.run(argv + ["-c:v", codec, "-threads", "2", "-pix_fmt", "yuv420p"]
                       + list(extra) + [str(source)], check=True, capture_output=True)
        return source

    def convert(self, source, policy=Policy()):
        work = self.root / (source.stem + "-work")
        work.mkdir()
        return process(source, work, policy)

    def test_low_resolution_faststart_mp4_is_byte_identical(self):
        source = self.fixture("small.mp4", extra=("-movflags", "+faststart"), audio=True)
        result, receipt = self.convert(source)
        self.assertEqual(receipt["mode"], "preserve")
        self.assertEqual(digest(source), digest(result))
        self.assertEqual(receipt["media"]["width"], 640)
        self.assertEqual(receipt["media"]["audio_codec"], "aac")

    def test_slowstart_remux_preserves_encoded_video_packets(self):
        source = self.fixture("slowstart.mp4")
        result, receipt = self.convert(source)
        self.assertEqual(receipt["mode"], "remux")
        self.assertEqual(mp4_layout(result), (True, False))
        def packets(path):
            output = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0",
                "-show_packets", "-show_data_hash", "sha256", "-show_entries", "packet=data_hash",
                "-of", "json", str(path)])
            return json.loads(output)["packets"]
        self.assertEqual(packets(source), packets(result))

    def test_4k_becomes_1080p_with_audio_and_seekable_mp4(self):
        source = self.fixture("large.mp4", "3840x2160", audio=True)
        result, receipt = self.convert(source)
        self.assertEqual(receipt["mode"], "transcode")
        self.assertEqual((receipt["media"]["width"], receipt["media"]["height"]), (1920, 1080))
        self.assertEqual(receipt["media"]["audio_codec"], "aac")
        self.assertEqual(mp4_layout(result), (True, False))

    def test_portrait_fits_without_stretch(self):
        source = self.fixture("portrait.mp4", "1200x2000")
        _, receipt = self.convert(source)
        media = receipt["media"]
        self.assertLessEqual(media["width"], 1080)
        self.assertLessEqual(media["height"], 1920)
        self.assertAlmostEqual(media["width"] / media["height"], 0.6, places=2)

    def test_unsupported_codec_mp4_converts_without_upscale(self):
        source = self.fixture("mpeg4.mp4", codec="mpeg4")
        _, receipt = self.convert(source)
        self.assertEqual(receipt["mode"], "transcode")
        self.assertEqual(receipt["media"]["video_codec"], "h264")
        self.assertEqual(receipt["media"]["width"], 640)

    def test_fragmented_mp4_gets_normalized(self):
        source = self.fixture("fragmented.mp4", extra=("-movflags", "+frag_keyframe+empty_moov"))
        result, receipt = self.convert(source)
        self.assertEqual(receipt["mode"], "remux")
        self.assertEqual(mp4_layout(result), (True, False))

    def test_hdr_is_not_silently_washed_out(self):
        source = self.fixture("hdr.mp4", extra=("-color_primaries", "bt2020",
                              "-color_trc", "smpte2084", "-colorspace", "bt2020nc"))
        with self.assertRaisesRegex(ProcessingError, "hdr_requires"):
            self.convert(source)

    def test_malformed_input_fails(self):
        source = self.root / "bad.mp4"
        source.write_bytes(b"not a video")
        with self.assertRaises(ProcessingError):
            self.convert(source)

    def test_larger_lossy_result_does_not_replace_compatible_source(self):
        source = self.fixture("lowquality.mp4", extra=("-crf", "45", "-movflags", "+faststart"))
        result, receipt = self.convert(source, Policy(bitrate=1))
        self.assertEqual(receipt["mode"], "remux_no_size_saving")
        self.assertEqual(receipt["media"]["width"], 640)
        self.assertEqual(mp4_layout(result), (True, False))

    def test_anamorphic_requires_explicit_export(self):
        source = self.fixture("anamorphic.mp4", extra=("-vf", "setsar=4/3"))
        with self.assertRaisesRegex(ProcessingError, "square_pixel"):
            self.convert(source)

    def test_attached_cover_does_not_bypass_single_video_policy(self):
        source = self.fixture("without-cover.mp4")
        covered = self.root / "with-cover.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(source), "-f", "lavfi", "-i",
                        "color=c=red:size=32x32:duration=0.1", "-map", "0:v:0", "-map", "1:v:0",
                        "-c:v:0", "copy", "-c:v:1", "mjpeg", "-threads:v:1", "1",
                        "-frames:v:1", "1", "-disposition:v:1", "attached_pic", str(covered)],
                       check=True, capture_output=True)
        with self.assertRaisesRegex(ProcessingError, "select_one_video"):
            self.convert(covered)

    def test_truncated_input_is_not_accepted_as_complete(self):
        source = self.fixture("truncated.mp4", extra=("-movflags", "+faststart"))
        with source.open("r+b") as dest:
            dest.truncate(source.stat().st_size - 512)
        with self.assertRaises(ProcessingError):
            self.convert(source)


class SDKContractTests(unittest.TestCase):
    def test_r2_sdk_parameters_and_successful_private_transfer(self):
        try:
            import boto3
            from botocore.stub import ANY, Stubber
        except ImportError:
            self.skipTest("install requirements.lock for actual S3 SDK contract test")
        client = boto3.client("s3", region_name="auto", endpoint_url="https://example.invalid",
                              aws_access_key_id="fixture", aws_secret_access_key="fixture")
        with tempfile.TemporaryDirectory() as raw, Stubber(client) as stub:
            source = Path(raw) / "in.mp4"
            stub.add_response("get_object", {"Body": io.BytesIO(b"fixture"),
                              "ContentLength": 7, "ETag": '"source"'},
                              {"Bucket": "private", "Key": "original", "IfMatch": '"source"'})
            download(client, "private", {"source_key": "original", "source_etag": '"source"',
                     "source_bytes": 7}, source)
            checksum = digest(source)
            stub.add_response("create_multipart_upload", {"UploadId": "attempt"},
                {"Bucket": "private", "Key": "processed", "ContentType": "video/mp4",
                 "Metadata": {"sha256": checksum, "policy": "1080p-v1"}})
            stub.add_response("upload_part", {"ETag": '"part"'},
                {"Bucket": "private", "Key": "processed", "UploadId": "attempt",
                 "PartNumber": 1, "Body": b"fixture", "ContentMD5": ANY})
            stub.add_response("complete_multipart_upload", {},
                {"Bucket": "private", "Key": "processed", "UploadId": "attempt",
                 "MultipartUpload": {"Parts": [{"PartNumber": 1, "ETag": '"part"'}]}})
            stub.add_response("head_object", {"ContentLength": 7, "ETag": '"output"',
                              "Metadata": {"sha256": checksum}},
                              {"Bucket": "private", "Key": "processed"})
            self.assertEqual(upload(client, "private", "processed", source,
                                    {"sha256": checksum}), '"output"')
            stub.assert_no_pending_responses()


if __name__ == "__main__":
    unittest.main()
