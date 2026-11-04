# Discovery, chat and Loop release

Owner: Codex. Branch: `codex/discovery-chat-loop-release`.

Search supports filter-only browsing and case-normalized exact city, role and genre filters. Exact/partial titles, names and handles rank above meaning-based matches. Empty filters avoid embedding requests. Profile hydration failures show the search error state instead of false empty results. Signed-out search uses lexical matching; authenticated search supports hybrid meaning + words.

Chat has optimistic messages with idempotent retries, reconnect catch-up, private files/images/audio, native and browser voice recording, and emoji controls. Attachments are limited to 20 MiB each and 200 MiB reserved/attached per account. R2 objects remain private; the backend checks membership and blocking before signing temporary download links, and freezes verified uploaded bytes before binding them to a message. Abandoned/deleted-owner attachments use the existing cleanup worker.

Loop uses a bounded snapping viewport, active-only playback, sound/pause controls, keyboard/arrow navigation on web, and paginated native FlatList playback. The browser icon uses the approved logo silhouette for legibility at tab size.

Validation:
- Full repository tests, lint and type checks passed after source recovery; native chat lint/types passed after lifecycle review fixes.
- Production Next.js webpack build, OpenNext packaging and Wrangler dry run passed.
- Search SQL regression passed using rolled-back fixtures, including exact/partial identity, structured filters, semantic-only matches, and draft privacy.
- Attachment SQL tests passed for membership, blocks, verified binding and denial of direct client verification.
- Nov 3 live disposable-user tests passed private image, text and WAV upload/download, emoji, duplicate retry, nonmember denial, and authenticated hybrid search. Realtime samples: 613ms, 567ms and 611ms. These are samples, not latency guarantees.
- Earlier browser checks verified desktop/mobile Loop sizing and active-only playback; physical native-device verification remains pending.

Release limits:
- Web deployment status is recorded below only after deployment verification.
- Google Play public production is gated by incomplete store setup and the console's required closed test (12 testers for 14 days; zero opted in at inspection). A local signed bundle is not a public Play release.
- Source was recovered from saved tool commands after the original `/tmp` checkout was cleared. The release checkout now lives persistently under the project and all local checks were rerun.
