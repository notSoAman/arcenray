# Remaining reliability work — implementation contract

Owner: founder + Codex. Proposed after the verified readiness checkpoint in PR7.
This document authorizes local implementation boundaries, not shared database changes
or deployment. Concrete migrations/functions require founder review before apply.

## Durable indexing

Use a private, RLS-protected Postgres work table, existing gte-small384 runtime and
an operations-only Edge worker. No new queue service/provider/dependency. Metadata
and credit edits invalidate old vectors and enqueue the relevant film/profile;
publication/onboarding and source deletion must be handled transactionally. Keep
client-triggered indexing for immediate feedback; background work is a repair path.

Service-only contracts: `backend_claim_index_jobs(p_limit integer default3)` returns
bounded rows `{kind,entity_id,owner_id,version,source_updated_at,content}`;
`backend_finish_index_job(p_kind,p_id,p_version,p_success)` handles versioned completion
or retry. All signatures/grants are scoped and search_path fixed. The worker uses
existing `backend_set_embedding` compare-and-set, never overwrites newer metadata,
processes at most3 jobs, and reports counts only. Missing source/inactive/private
content is not exposed to callers. Delete orphan jobs/vectors with their source.

Worker endpoint `index-pending`: gateway JWT verification enabled plus the existing
dedicated operations secret; no public user token alone permits batch execution.
Minute cron uses the existing Vault service JWT/operations secret. Resolve the exact
backend URL from the one enabled trusted Supabase issuer; fail closed on ambiguity.
No hardcoded development destination may be reused silently for production.

## Resumable native film upload

Retain direct PUT for small hook/poster/profile images. Native main films should use
fixed16MiB R2 multipart slices, sequential initially. Reserve quota once; refresh
part signatures on the same asset/session. Keep all media bytes browser-to-R2.
Server owns object key/upload ID, verifies canonical R2 ListParts/HEAD and then runs
existing MP4 validation before publication. Bound part signing in batches; no CORS
or browser ETag exposure change is required.

Pause preserves a session; explicit discard durably aborts it. Save draft/session
association before transfer, support lost responses, and safely reconcile in-flight
create/completion/abort with account deletion and cleanup. A 24-hour resume deadline
is separate from short signature/writer leases; do not hold deleted-account storage
for the entire resume window. List/reap ambiguous exact-key multipart initiations.

After reload, reselecting the same film must match a bounded-memory full-content
fingerprint (hash each16MiB slice, then hash the ordered digest manifest). Never skip
parts merely because filename/size/timestamp or sampled ends match. Store no auth
credentials in browser upload checkpoints. The2GiB quota includes hook/poster, so do
not imply an exactly2GiB main film fits alongside mandatory media.

Tests: cross-user/guessed IDs, quota reuse, signature renewal, slice boundaries,
wrong-file reselection, failed/overwritten parts, canonical completion, pause/discard,
lost responses, stale workers and cleanup races. Realistic large-file interruption
and mobile-browser checks remain release gates until executed.

### Multipart service contract (local implementation boundary)

Private session rows are created before R2 initiation and keep owner/draft/request
IDs, full-content fingerprint, R2 upload ID, status, resume expiry and operation
lease. Native film parts are16MiB (max128). Session status is initializing/uploading/
completing/completed/aborting/aborted; public descriptors derive uploaded/ready from
verified asset state. No raw upload ID/object key is returned to browsers.

Service-only RPCs (all return internal JSON snapshots except list):

- `backend_create_multipart(p_owner,p_draft,p_request,p_bytes,p_fingerprint)` reserves
  quota once, idempotently, and associates the pending asset with its owned draft.
- `backend_multipart(p_owner,p_asset)` and `backend_list_multipart(p_owner,p_draft)`
  read owned internal snapshots; list returns an array (Edge wraps `uploads`).
- `backend_claim_multipart_operation(p_owner,p_asset,p_operation)` accepts initialize
  or complete, locks owner→asset→session and registers a five-minute writer lease.
- `backend_initialize_multipart(p_owner,p_asset,p_token,p_upload_id)` records a known
  initiation; `backend_complete_multipart(p_owner,p_asset,p_token)` records assembled
  object completion. Both require matching live leases and pending active ownership.
- `backend_abort_multipart(p_owner,p_asset)` durably queues deletion and marks aborting;
  completed verified assets use normal film removal instead. No quota is released
  until trusted cleanup confirms abort/deletion. List/status remains meaningful.

Snapshots include asset_id,owner_id,draft_id,object_key,bytes,fingerprint,upload_id,
status,resume_expires_at,op_token,op_until,part_size,part_count,asset_status,public_key.
The pending asset expiry is24hours. `media_jobs.multipart` marks these sessions so
cleanup aborts every exact-key incomplete upload first; after that, part signatures
cannot create an object and the long resume deadline need not delay deletion.
Existing plain-PUT cleanup holds remain unchanged. Init/completion writer leases
still delay cleanup. Discarded draft sessions and source deletion enqueue pending
uploads; pending sessions cannot be attached to a different draft. Verified assets
can still be reused by the same owner. Full descriptor and API parsers are typed
contracts, not edits to generated database definitions.
