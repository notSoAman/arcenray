/** Missing auth configuration never blocks reading published content. */
export function SetupNotice() {
  return (
    <div className="notice notice-error" role="alert">
      <div>
        <strong>Sign-in is not configured on this machine.</strong> Configure
        the selected Clerk application and restart the app. You can still browse
        public films and profiles.
      </div>
    </div>
  );
}
