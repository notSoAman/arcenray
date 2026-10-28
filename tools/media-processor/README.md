# Arcenray media processor

This contains the FFmpeg processor and a single-concurrency supervisor for the
private Supabase queue. The supervisor polls an authenticated Edge Function,
reports scratch capacity, renews its lease during processing, and submits output
metadata for independent R2/MP4 checks before the database marks an asset ready.
The VM never receives the Supabase service-role key. It uses the public anonymous
JWT at the Edge gateway plus a separate worker-only token stored in a secret file.
The service has no inbound listener or published ports.

Requires Linux, Python3.12+, patched FFmpeg/ffprobe with libx264/AAC, and sufficient
scratch disk. Local processing and tests use Python's standard library only:

```sh
python3 -m unittest discover -s tools/media-processor -v
mkdir /tmp/arcenray-output
python3 tools/media-processor/processor.py --local /absolute/source.mp4 \
  --output-dir /tmp/arcenray-output
```

The deployed supervisor is run with Docker Compose on the private processing VM.
Build and run only after the matching database migration and
`media-processing` Edge Function are deployed. Provision `/etc/arcenray/media-processor.env`
mode `0600` with `MEDIA_PROCESSING_URL`, `MEDIA_PROCESSOR_TOKEN`,
`SUPABASE_ANON_KEY` (legacy JWT-format anon key), `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
`R2_UPLOAD_BUCKET_NAME=arcenray-uploads`. Use a credential scoped to object
read/write on that private bucket only. Create the scratch directory owned by
UID 10001 with restrictive permissions and enough free space for approximately
three times the admitted source plus a 1 GiB reserve. Do not place this file in
the repository, image, or build context.

```sh
sudo install -d -o 10001 -g 10001 -m 0700 /var/lib/arcenray-media-processor
sudo install -d -m 0755 /etc/arcenray
sudo chmod 0600 /etc/arcenray/media-processor.env
docker compose -f tools/media-processor/compose.yaml up -d --build
docker compose -f tools/media-processor/compose.yaml logs --tail=50
```

The environment file and the Edge Function token must be provisioned out of
band. Do not paste secret values into logs or commit them. Worker logs contain
only job IDs and safe status codes.

For the R2 transport dependency, use a dedicated virtual environment:

```sh
python3 -m venv /tmp/arcenray-processor-venv
/tmp/arcenray-processor-venv/bin/pip install --require-hashes \
  -r tools/media-processor/requirements.lock
```

Never commit media, job manifests, receipts or credentials. Do not run against live
content until backend lifecycle integration and a scoped pilot are approved.
