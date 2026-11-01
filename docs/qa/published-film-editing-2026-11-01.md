# Published film editing

Owner: Codex. Branch: codex/robust-upload-publish.

Published films were locked in the form, excluded by the shared save query, and returned to draft by the database even for text-only edits. Owners can now save details while preserving publication, delivery keys and publication date. Existing RLS and column grants still restrict ownership and trusted publication fields.

Replacing media uses the existing private draft and publish flow. The form explains this before saving. Main-film replacement detaches the old asset before upload admission; poster/preview replacement preserves the main asset. Completed upload tasks are skipped, and saving details alone does not check quota or start any upload. Existing ready assets are reused during publication.

Validation:
- New SQL regression reproduced the metadata-unpublishing bug before migration and passed afterward on production using rolled-back fixtures. Checks include cross-user denial, retained delivery data, selective asset replacement and no encoding job from metadata/poster edits.
- Actual PublishForm in an isolated browser with mocked API/transfer ports: published fields editable; metadata save preserves asset ID and uses zero transfers/storage checks; main replacement starts one transfer; preview-only replacement starts zero main transfers; repeated save starts no additional transfers; no browser errors.
- pnpm test, pnpm check-types, pnpm lint passed.
- Next standalone production build, OpenNext packaging and Wrangler dry run passed.

The browser fixture is not an authenticated production upload test. No real creator films were modified for testing. No Edge Function or Oracle worker changes were needed.
