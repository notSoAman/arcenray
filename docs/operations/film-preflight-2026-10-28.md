# Film upload preflight — 28 October 2026

The tested Troy MP4 has two audio tracks. The Oracle worker runs the same processor as the local probe, which rejects more than one audio track; its externally visible result is the generic `processing_failed`, so the live error alone does not identify the cause.

Web and Android now display the same processor requirements before upload. Both use a bounded, seek-based MP4 track check to reject a clearly identified multi-audio or multi-video file before transfer. Unreadable or nonstandard metadata is marked unverified, not claimed valid. This does not replace the server's complete probe, decode, or capacity check and does not select or remove a language track. Subtitle and data tracks are not retained by the processor.

The real 7,316,162,017-byte source was checked locally by reading 640 bytes across 43 bounded reads and was identified as multi-audio. In the local development web UI, selecting that file displayed the specific error without selecting it for upload; a compatible single-audio film was accepted for selection. No media was uploaded by this UI check. The disposable development account was removed and its deletion completed. Shared, web and mobile tests, lint, type checks, and builds passed. The Android bundle was built, but this change has not been exercised on an Android device.
