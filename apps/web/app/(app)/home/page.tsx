import type { Metadata } from "next";
import Link from "next/link";
import { FeaturedFilm } from "../../../components/featured-film";
import { PosterCard } from "../../../components/film-cards";
import { Avatar } from "../../../components/media";
import { WavelengthPicks } from "../../../components/wavelength";
import { loadFeedPage, PROFILE_CARD_COLUMNS } from "../../../lib/feed";
import { personRole } from "../../../lib/roles";
import { getViewer } from "../../../lib/session";
import { FeedMore } from "./feed-more";
import styles from "./home.module.css";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

const PICKS = 5;

export default async function HomePage() {
  const { supabase, user, profile } = await getViewer();

  const page = await loadFeedPage(supabase, 0);
  const firstName = profile
    ? profile.full_name.split(/\s+/)[0] || `@${profile.handle}`
    : null;

  // Filmmakers in the same city (exact match, completed public profiles only).
  const nearby =
    user && profile?.location_city
      ? ((
          await supabase
            .from("profiles")
            .select(PROFILE_CARD_COLUMNS)
            .ilike(
              "location_city",
              profile.location_city.replace(/[%_\\]/g, "\\$&"),
            )
            .neq("id", user.id)
            .limit(8)
        ).data ?? [])
      : [];

  const films = page.ok ? page.films : [];
  const featured = films[0];
  const picks = films.slice(1, 1 + PICKS);
  const rest = films.slice(1 + PICKS);

  return (
    <main className="app-main">
      <div className={styles.intro}>
        <span className="kicker page-kicker">
          {firstName ? `For ${firstName}` : "Independent cinema"}
        </span>
        <h1 className={styles.introTitle}>Short films for you</h1>
      </div>

      {!page.ok ? (
        <section className="state-panel" role="alert">
          <h2>We couldn&apos;t load your films.</h2>
          <p>
            This is usually a brief connection problem. Nothing you saved is
            lost.
          </p>
          <Link href="/home" className="btn btn-primary">
            Try again
          </Link>
        </section>
      ) : !featured ? (
        <section className="state-panel">
          <span
            className={`${styles.emptyArt} spectrum-strip`}
            aria-hidden="true"
          />
          <h2>No short films to show yet.</h2>
          <p>
            When filmmakers publish on arcenray, their work appears here —
            ranked by what you watch. Check back soon.
          </p>
          <Link href="/loop" className="btn btn-primary">
            Browse Loop
          </Link>
        </section>
      ) : (
        <>
          <FeaturedFilm film={featured} kicker="Tonight's pick" />
          {picks.length > 0 ? (
            <WavelengthPicks films={picks} viewerId={user?.id ?? null} />
          ) : null}
          {rest.length > 0 || page.hasMore ? (
            <section className={styles.section} aria-labelledby="more-films">
              <div className={styles.sectionHead}>
                <h2 id="more-films" className="section-title">
                  More to watch
                </h2>
                <Link href="/loop" className={styles.seeAll}>
                  See all
                </Link>
              </div>
              <div className={styles.grid}>
                {rest.map((film) => (
                  <PosterCard key={film.id} film={film} />
                ))}
              </div>
              <FeedMore start={films.length} initialHasMore={page.hasMore} />
            </section>
          ) : null}
        </>
      )}

      {nearby.length > 0 ? (
        <section className={styles.section} aria-labelledby="nearby">
          <div className={styles.sectionHead}>
            <div className={styles.headCopy}>
              <span className="kicker">Near {profile?.location_city}</span>
              <h2 id="nearby" className="section-title">
                Filmmakers close to you
              </h2>
            </div>
          </div>
          <div className={styles.people}>
            {nearby.map((p) => (
              <Link
                key={p.id}
                href={`/u/${p.handle}`}
                className={styles.person}
              >
                <Avatar
                  picKey={p.profile_pic_key}
                  name={p.full_name}
                  size={60}
                />
                <span className={styles.personText}>
                  <span className={styles.personName}>{p.full_name}</span>
                  <span className={styles.personRole}>
                    {p.roles
                      .map(personRole)
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(" · ") || "Creative"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
