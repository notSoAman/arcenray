"""Regression tests for the worker's scratch-space admission report."""
import importlib
import os
import json
import tempfile
import threading
from pathlib import Path
from collections import namedtuple
from unittest import TestCase, mock


with mock.patch.dict(os.environ, {
    "MEDIA_PROCESSOR_URL": "https://example.invalid",
    "MEDIA_PROCESSOR_SECRET": "test",
    "PROCESSOR_SCRATCH": "/tmp",
}):
    worker = importlib.import_module("worker")


class CapacityTest(TestCase):
    def test_capacity_keeps_operating_system_reserve_free(self):
        gib = 1024 ** 3
        usage = namedtuple("usage", "total used free")
        with mock.patch.object(worker.shutil, "disk_usage", return_value=usage(100 * gib, 40 * gib, 60 * gib)):
            self.assertEqual(worker.capacity_bytes(), 40 * gib)
        with mock.patch.object(worker.shutil, "disk_usage", return_value=usage(100 * gib, 90 * gib, 10 * gib)):
            self.assertEqual(worker.capacity_bytes(), 0)
        with mock.patch.object(worker.shutil, "disk_usage", return_value=usage(200 * gib, 50 * gib, 150 * gib)):
            self.assertEqual(worker.capacity_bytes(), 110 * gib)

    def test_busy_worker_keeps_capacity_fresh_and_reports_stage(self):
        stop, lost = mock.Mock(), threading.Event()
        stop.wait.side_effect = [False, False, True]
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "progress.json"
            path.write_text(json.dumps({"stage": "encoding"}))
            with mock.patch.object(worker, "call", return_value={"active": True}) as call, \
                    mock.patch.object(worker, "report_capacity") as report:
                worker.heartbeat_loop({"job_id": "job", "lease_token": "token"}, stop, lost, path)
            self.assertEqual(report.call_count, 2)
            self.assertEqual(call.call_args.args[0]["stage"], "encoding")
            self.assertFalse(lost.is_set())

    def test_transient_heartbeat_errors_do_not_discard_valid_lease(self):
        stop, lost = mock.Mock(), threading.Event()
        stop.wait.side_effect = [False, False, False, True]
        with mock.patch.object(worker, "call", side_effect=[worker.WorkerError(), worker.WorkerError(), {"active": True}]), \
                mock.patch.object(worker, "report_capacity"), mock.patch.object(worker.time, "monotonic", return_value=0):
            worker.heartbeat_loop({"job_id": "job", "lease_token": "token"}, stop, lost)
        self.assertFalse(lost.is_set())

    def test_worker_stops_before_unrenewed_lease_expires(self):
        stop, lost = mock.Mock(), threading.Event()
        stop.wait.return_value = False
        with mock.patch.object(worker, "call") as call, \
                mock.patch.object(worker.time, "monotonic", side_effect=[0, 0, 271]):
            worker.heartbeat_loop({"job_id": "job", "lease_token": "token"}, stop, lost)
        self.assertTrue(lost.is_set())
        call.assert_not_called()

    def test_failure_codes_are_specific_but_never_leak_arbitrary_text(self):
        self.assertEqual(worker.failure_code('{"code":"select_one_video_and_at_most_one_audio_track"}'), "multiple_tracks")
        self.assertEqual(worker.failure_code('{"code":"hdr_requires_an_explicit_tone_mapping_policy"}'), "hdr_unsupported")
        self.assertEqual(worker.failure_code('{"code":"insufficient_scratch_space"}'), "capacity")
        for text in ('secret-key', '{"code":"https://private/key?secret"}', '[]', ''):
            self.assertEqual(worker.failure_code(text), "processing_failed")

    def test_lost_job_terminates_processor_and_ffmpeg_together(self):
        child = mock.Mock(pid=123)
        with mock.patch.object(worker.os, "killpg") as kill:
            worker.stop_child(child)
        kill.assert_called_once_with(123, worker.signal.SIGTERM)
        child.wait.assert_called_once()
