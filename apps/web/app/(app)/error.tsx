"use client";

/** Unexpected failure boundary for signed-in screens. */
export default function HomeError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="app-main">
      <section className="state-panel" role="alert">
        <h2>Something went wrong loading arcenray.</h2>
        <p>Please try again. If it keeps happening, reload the page.</p>
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
