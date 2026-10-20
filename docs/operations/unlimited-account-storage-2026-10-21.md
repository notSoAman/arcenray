# Account-wide storage cap removal

Founder requested MP4-only video uploads, removal of the 2 GiB account cap and production deployment. No Stream integration, additional formats, paid plans or infrastructure changes are included.

`private.user_state.quota_bytes = NULL` explicitly means no account-wide storage cap. Existing accounts are updated and new accounts default to NULL. Usage, pending reservations, cleanup accounting, owner locks, suspensions and rate limits remain in force. The existing 2 GiB per-film, 50 MiB hook and compact image limits remain. Finite administrative caps still work if deliberately configured later; clients cannot change them.

The migration updates the current hardened reservation functions with assertions against expected guard text; it does not replace them with historical bodies or broaden grants. A missing account row is still denied separately from a present row with a NULL cap. The legacy single-upload reservation path now explicitly enforces the retained 2 GiB per-file ceiling too.

The web checks the explicit NULL marker instead of coercing it to zero. Malformed/missing quota data still fails closed. Rollback-only SQL tests reserve more than 2 GiB through both single and multipart paths and test accounting, ownership, invalid formats, suspension and per-file limits. Existing finite-cap regression fixtures configure their cap explicitly.

Recovery: redeploy the prior web release and restore an explicit founder-selected quota/default together if a capped policy is reinstated. This release does not remove media, accounts or usage records. No large blobs or durable QA accounts are created by the SQL tests.
