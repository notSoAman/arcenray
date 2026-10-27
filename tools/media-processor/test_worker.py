"""Regression tests for the worker's scratch-space admission report."""
import importlib
import os
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
