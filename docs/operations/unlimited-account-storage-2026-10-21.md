# Account-wide storage cap removal

Founder requested MP4-only video uploads, removal of the 2 GiB account cap and production deployment. No Stream integration, additional formats, paid plans or infrastructure changes are included.

`private.user_state.quota_bytes = NULL` explicitly means no account-wide storage cap. Existing accounts are updated and new accounts default to NULL. Usage, pending reservations, cleanup accounting, owner locks, suspensions and rate limits remain in force. The existing 2 GiB per-film, 50 MiB hook and compact image limits remain. Finite administrative caps still work if deliberately configured later; clients cannot change them.

The migration updates the current hardened reservation functions with assertions against expected guard text; it does not replace them with historical bodies or broaden grants. A missing account row is still denied separately from a present row with a NULL cap. The legacy single-upload reservation path now explicitly enforces the retained 2 GiB per-file ceiling too.

The web checks the explicit NULL marker instead of coercing it to zero. Malformed/missing quota data still fails closed. Rollback-only SQL tests reserve more than 2 GiB through both single and multipart paths and test accounting, ownership, invalid formats, suspension and per-file limits. Existing finite-cap regression fixtures configure their cap explicitly.

Recovery: redeploy the prior web release and restore an explicit founder-selected quota/default together if a capped policy is reinstated. This release does not remove media, accounts or usage records. No large blobs or durable QA accounts are created by the SQL tests.

## Release verification

The founder-approved migration passed rollback tests and was applied alone after a dry run. Database types were regenerated (public types unchanged). All 15 rollback-only SQL suites, all 41 web tests, TypeScript, the production OpenNext build and GitHub CI run 39491707687 passed. Supabase security advisors found no issues. Active policy inspection confirms NULL default and no configured finite account caps.

Deployed Cloudflare Worker version `105cef09-edae-40ba-a7f3-a3e1711b305a` from code commit `e0752cf`, preserving existing secrets/configuration. Previous Worker version: `433efb58-bfcd-4c8f-8bad-784fe63d7f63`. The existing staging/apex hostnames share this Worker and updated together. No Stream or billing changes. Tests reserve bytes transactionally without uploading actual multi-GiB objects.
