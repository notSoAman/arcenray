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

## Poster replacement redirect follow-up

Production inspection found a draft with a saved replacement poster and completed film processing, but an old `complete` publication request from its previous revision. The publication-status RPC returned that historical completion and the editor redirected away. The earlier fixture omitted the historical publication row, so it missed this case.

The regression now includes a completed request before editing and failed against the old implementation. The migration cancels completed requests when returning to draft, repairs existing stale completions, and only reports completion when the film is currently published. Pending/failed states must also match the current saved revision. The editor additionally reads the current film status before redirecting and checks for intervening edits.

Checks passed: updated published-edit SQL regression; durable publication/cancellation/recovery/access-control SQL suite (both rolled back); web tests, workspace type checks, web lint, production build and deploy dry run. Browser fixture deliberately retained a stale completion: reopened draft stayed editable; published film -> poster upload -> save stayed in the editor through polling; Publish then navigated correctly. Only the poster transferred, with zero main-film uploads. Browser ports were mocked; the real affected draft and uploaded poster were confirmed intact in production. No creator film was automatically published by the repair.
