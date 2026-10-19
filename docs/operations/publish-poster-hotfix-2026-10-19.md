# Publication and poster hotfix — 19 October 2026

The reported Falling Pieces draft had both main film and poster verified as
`uploaded`; its 799×1200 WebP poster was 30,304 bytes. The failure was the Edge
publish handler's stale mandatory-hook check, which rejected no-hook films before
promotion. The earlier optional-hook release covered SQL and UI but missed this gate.

The handler now derives required assets through a tested helper and promotes the
poster plus native main film, including an optional hook only when present. All
existing ownership, asset verification, promotion snapshot and SQL publication
checks remain. No user draft was automatically published or media replaced.

Poster input now accepts browser-readable raster images (including JPEG/PNG/WebP,
GIF/BMP/AVIF where decoded), without requiring pre-sized artwork. Files up to100MiB
are resized preserving aspect ratio to at most800×1200, encoded to WebP and
compressed with bounded quality/downsize retries before trusted upload validation.
The former40MP rejection is removed; actual browser decode support/memory still
limits pathological inputs. SVG and unreadable formats are rejected. Animated
sources yield a static frame. Existing256×256 profile cropping remains.

Verification: 58 existing/new Edge unit tests plus an actual HTTP-handler regression
using mocked services for native/YouTube/Vimeo no-hook publishing; Edge type check;
web lint/types and31 tests; production OpenNext build. Real-browser conversions of
JPEG, PNG, WebP, GIF, BMP and a51MP JPEG produced correctly decoded WebP at allowed
dimensions/bytes. Profile cropping and corrupt-image rejection also passed.

No database contract, RLS, hosting plan or credential change was needed. Media goes
directly to R2 and image preparation runs in the browser. No paid plan was purchased.
