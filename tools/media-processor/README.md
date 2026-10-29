# Arcenray media processor

The private R2 processor and outbound-only queue supervisor run on the Oracle
worker. The processing primitive cannot publish; the authenticated backend handles
explicit publication requests. See the [architecture plan](../../docs/architecture/r2-ffmpeg-processing.md)
and [recovery release](../../docs/operations/upload-recovery-2026-10-29.md).

Requires Linux, Python3.12+, patched FFmpeg/ffprobe with libx264/AAC, and sufficient
scratch disk. Local processing and tests use Python's standard library only:

```sh
python3 -m unittest discover -s tools/media-processor -v
mkdir /tmp/arcenray-output
python3 tools/media-processor/processor.py --local /absolute/source.mp4 \
  --output-dir /tmp/arcenray-output
```

For the R2 transport dependency, use a dedicated virtual environment:

```sh
python3 -m venv /tmp/arcenray-processor-venv
/tmp/arcenray-processor-venv/bin/pip install --require-hashes \
  -r tools/media-processor/requirements.lock
```

Never commit media, job manifests, receipts or credentials. Live tests must use explicitly authorized, disposable fixtures and clean up their
exact keys and accounts.
