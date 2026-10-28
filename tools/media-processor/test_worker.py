"""Supervisor controls remain isolated and use only claimed queue identities."""
import io
import json
import os
import unittest
from unittest.mock import patch

from worker import WorkerError, call_api, validate_claimed_job


def claimed():
    return {
        "job_id": "00000000-0000-4000-8000-000000000001",
        "attempt_id": "00000000-0000-4000-8000-000000000002",
        "owner_id": "00000000-0000-4000-8000-000000000003",
        "asset_id": "00000000-0000-4000-8000-000000000004",
        "source_key": "00000000-0000-4000-8000-000000000003/00000000-0000-4000-8000-000000000005",
        "source_etag": '"source-etag"', "source_bytes": 1024,
        "lease_token": "00000000-0000-4000-8000-000000000006",
        "output_key": "processing/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/film.mp4",
    }


class WorkerTests(unittest.TestCase):
    def test_claim_must_be_canonical_and_job_bound(self):
        self.assertEqual(validate_claimed_job(claimed())["source_bytes"], 1024)
        for changes in (
            {"output_key": "assets/public.mp4"},
            {"source_key": "other-user/video"},
            {"source_bytes": True},
            {"lease_token": "not-a-uuid"},
        ):
            with self.subTest(changes=changes), self.assertRaises(WorkerError):
                validate_claimed_job({**claimed(), **changes})

    def test_control_api_uses_public_gateway_jwt_and_separate_worker_secret(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, _limit): return b'{"job":null}'

        with patch.dict(os.environ, {
            "MEDIA_PROCESSING_URL": "https://example.supabase.co/functions/v1/media-processing",
            "MEDIA_PROCESSOR_TOKEN": "worker-only-test-token",
            "SUPABASE_ANON_KEY": "eyJ.public-anon-key",
        }), patch("worker.urlopen", return_value=Response()) as request:
            self.assertIsNone(call_api("claim")["job"])
            sent = request.call_args.args[0]
            self.assertEqual(sent.get_header("Authorization"), "Bearer eyJ.public-anon-key")
            self.assertEqual(sent.get_header("X-media-processor-token"), "worker-only-test-token")
            self.assertEqual(json.loads(sent.data), {"action": "claim"})


if __name__ == "__main__":
    unittest.main()
