process.loadEnvFile("apps/web/.env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
for (const name of ["media-upload", "index-entity", "search"]) {
  for (const token of [
    null,
    "eyJhbGciOiJub25lIn0.eyJpc3MiOiJodHRwczovL2dyb3dpbmctYnVycm8tOTQxOC5jbGVyay5hY2NvdW50cy5kZXYiLCJzdWIiOiJ1c2VyX2ZvcmdlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.",
  ]) {
    const response = await fetch(url + "/functions/v1/" + name, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: "{}",
    });
    if (response.status !== 401)
      throw new Error(name + " unexpected " + response.status);
  }
  console.log(name + ": missing and forged tokens rejected (401)");
}
