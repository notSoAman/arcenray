import styles from "./home.module.css";

/** Streaming skeleton while the server loads the feed. */
export default function HomeLoading() {
  return (
    <main className="app-main" aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading your films…
      </p>
      <div className={styles.intro} aria-hidden="true">
        <span className={`${styles.skeleton} ${styles.skeletonKicker}`} />
        <span className={`${styles.skeleton} ${styles.skeletonTitle}`} />
      </div>
      <div
        className={`${styles.skeleton} ${styles.skeletonFeatured}`}
        aria-hidden="true"
      />
      <div className={styles.grid} aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={styles.skeletonCard}>
            <span className={`${styles.skeleton} ${styles.skeletonPoster}`} />
            <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
            <span
              className={`${styles.skeleton} ${styles.skeletonLineShort}`}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
