/** Shown instead of auth screens when the public Supabase settings are missing. */
export function SetupNotice() {
  return (
    <div className="notice notice-error" role="alert">
      <div>
        <strong>Sign-in isn&apos;t configured on this machine.</strong> Run{" "}
        <code>pnpm setup:web</code> from the repository root to create{" "}
        <code>apps/web/.env.local</code> with the public project settings, then
        restart the dev server.
      </div>
    </div>
  );
}
