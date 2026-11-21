export default function ProfileLoading() {
  return (
    <main className="app-main" aria-busy="true">
      <div className="state-panel" role="status">
        <h1>Loading creative…</h1>
        <p>Loading their profile, films and listed credits.</p>
      </div>
    </main>
  );
}
