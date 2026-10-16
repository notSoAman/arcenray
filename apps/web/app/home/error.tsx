"use client";

import styles from "./home.module.css";

/** Unexpected failure boundary for the home route. */
export default function HomeError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className={styles.main}>
      <section className={styles.state} role="alert">
        <h2>Something went wrong loading arcenray.</h2>
        <p>Please try again. If it keeps happening, reload the page.</p>
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
