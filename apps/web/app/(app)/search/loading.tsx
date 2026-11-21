export default function SearchLoading() {
  return (
    <main className="app-main" aria-busy="true">
      <div className="state-panel" role="status">
        <h1>Searching films and people…</h1>
        <p>Finding public work and creative profiles.</p>
      </div>
    </main>
  );
}
