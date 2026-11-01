# Production media playback repair — 2026-10-30

## Cause

The credit workflow release was built in a new worktree without `NEXT_PUBLIC_MEDIA_URL` in its build environment. The deployed Worker retained its runtime secrets, but those cannot populate Next.js browser bundles after compilation. The browser media helper therefore returned no URL, removing posters and showing the misleading “still being prepared” message for already published films.

Both published films and both posters remained present in R2/CDN. No media data repair was needed.

## Repair and prevention

- Rebuilt using the existing production public configuration, including `https://cdn.arcenray.com`, in the ignored `apps/web/.env.production.local` file.
- Added a production compilation guard in `apps/web/next.config.js`. A missing, placeholder, non-HTTPS, or malformed media origin now stops the build. Local development remains available without production configuration.
- Added regression tests to the web test command, including invocation of the actual Next configuration in production-build mode.
- Checked the built browser chunks: the CDN origin is embedded and no unresolved `NEXT_PUBLIC_MEDIA_URL` lookup remains.
- Deployed Worker version `7231d537-0d0e-45a5-b9cf-1d4339e26f42` at 100% traffic. Production and staging use this same Worker.

## Verification

- Web tests: 48 passed. Lint, type checks, OpenNext build, and Wrangler dry run passed.
- Public CDN requests: both posters returned HTTP 200 with `image/webp`; both films returned HTTP 200 with `video/mp4` and byte-range support.
- Bounded range requests for both films returned HTTP 206, correct Content-Range, and MP4 headers.
- Live browser: both home-page posters decoded successfully; Falling Pieces and Varnika loaded 1920×1080 video and started playback. Seeking was checked through the visible scrubber.

## Release procedure

Before every production build, supply the production public settings in the build environment or ignored `.env.production.local`. `wrangler deploy --keep-vars` preserves Worker settings but does not repair missing values inside compiled browser JavaScript. Verify posters and actual playback after deployment; a credits-only interface check is insufficient for a site release.
