# Arcenray media processor — preparation only

This is an offline/private-R2 single-job runner, not a deployed service or a
production upload replacement. The durable queue, lease supervisor and publication
integration are specified in the [architecture plan](../../docs/architecture/r2-ffmpeg-processing.md).

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

Never commit media, job manifests, receipts or credentials. Do not run against live
content until backend lifecycle integration and a scoped pilot are approved.
