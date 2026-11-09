/** NEXT_PUBLIC values must exist during compilation; Worker secrets cannot fill browser bundles. */
export function assertMediaBuildConfig(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Set NEXT_PUBLIC_MEDIA_URL to the public media HTTPS origin before building. Runtime Worker settings cannot supply browser media URLs.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    ["localhost", "example.com", "example.org", "example.net"].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  ) {
    throw new Error(
      "NEXT_PUBLIC_MEDIA_URL must be a real public HTTPS origin without credentials, paths, or query parameters.",
    );
  }
}
