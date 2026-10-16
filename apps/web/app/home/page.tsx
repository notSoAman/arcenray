import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../components/site-header";
import { loadFeedPage } from "../../lib/feed";
import { getViewer, isSupabaseConfigured } from "../../lib/session";
import { FeedMore } from "./feed-more";
import { FeaturedFilm, FilmCard } from "./film-card";
import styles from "./home.module.css";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isSupabaseConfigured()) redirect("/");
  const { supabase, user, profile } = await getViewer();
  if (!user) redirect("/sign-in");
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const page = await loadFeedPage(supabase, 0);
  const firstName = profile.full_name.split(/\s+/)[0] || `@${profile.handle}`;

  return (
    <div className={styles.page}>
      <SiteHeader
        variant="app"
        current="home"
        name={profile.full_name}
        handle={profile.handle}
      />
      <main className={styles.main}>
        <div className={styles.intro}>
          <span className={`kicker ${styles.introKicker}`}>
            For {firstName}
          </span>
          <h1 className={styles.introTitle}>Short films for you</h1>
        </div>

        {!page.ok ? (
          <section className={styles.state} role="alert">
            <h2>We couldn&apos;t load your films.</h2>
            <p>
              This is usually a brief connection problem. Nothing you saved is
              lost.
            </p>
            <Link href="/home" className="btn btn-primary">
              Try again
            </Link>
          </section>
        ) : page.films.length === 0 ? (
          <section className={`${styles.state} ${styles.empty}`}>
            <span
              className={`${styles.emptyArt} spectrum-strip`}
              aria-hidden="true"
            />
            <h2>No short films to show yet.</h2>
            <p>
              When filmmakers publish on arcenray, their work appears here —
              ranked by what you watch. Check back soon.
            </p>
          </section>
        ) : (
          <>
            <FeaturedFilm film={page.films[0]!} />
            {page.films.length > 1 ? (
              <section className={styles.section} aria-labelledby="new-films">
                <h2 id="new-films" className={styles.sectionTitle}>
                  More to watch
                </h2>
                <div className={styles.grid}>
                  {page.films.slice(1).map((film) => (
                    <FilmCard key={film.id} film={film} />
                  ))}
                </div>
                <FeedMore
                  start={page.films.length}
                  initialHasMore={page.hasMore}
                />
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
