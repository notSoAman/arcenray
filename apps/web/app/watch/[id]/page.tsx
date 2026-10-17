import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FilmPlayer } from "../../../components/film-player";
import { Poster } from "../../../components/media";
import {
  FILM_DETAIL_COLUMNS,
  formatDuration,
  loadFeedPage,
  loadProfiles,
} from "../../../lib/feed";
import { getViewer, isSupabaseConfigured } from "../../../lib/session";
import styles from "./watch.module.css";

export const metadata: Metadata = { title: "Watching" };
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Immersive full-screen player (W5 / 06 landscape). */
export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/");
  const { id } = await params;
  const { supabase, user, profile } = await getViewer();
  if (!user) redirect("/sign-in");
  if (!profile?.onboarding_completed) redirect("/onboarding");
  if (!uuid.test(id)) notFound();

  const { data: film } = await supabase
    .from("films")
    .select(FILM_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (!film) notFound();

  const [creators, feed] = await Promise.all([
    loadProfiles(supabase, [film.owner_id]),
    loadFeedPage(supabase, 0),
  ]);
  const creator = creators.get(film.owner_id);
  const next = feed.ok ? feed.films.find((f) => f.id !== film.id) : undefined;
  const meta = [
    creator?.full_name,
    film.genres[0],
    formatDuration(film.duration_seconds),
    film.language,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className={styles.page}>
      <h1 className="visually-hidden">{film.title}</h1>
      <FilmPlayer
        film={film}
        variant="immersive"
        autoPlay
        exitHref={`/films/${film.id}`}
        header={
          <div className={styles.heading}>
            <Image
              src="/brand/arcenray-mark.webp"
              alt=""
              width={30}
              height={35}
            />
            <div className={styles.headingText}>
              <span className={styles.title}>{film.title}</span>
              {meta ? <span className={styles.meta}>{meta}</span> : null}
            </div>
          </div>
        }
        aside={
          next ? (
            <Link href={`/watch/${next.id}`} className={`${styles.next} glass`}>
              <span className={styles.nextArt}>
                <Poster
                  posterKey={next.poster_key}
                  title={next.title}
                  sizes="96px"
                />
              </span>
              <span className={styles.nextText}>
                <span className={`kicker ${styles.nextKicker}`}>
                  Up next · for you
                </span>
                <span className={styles.nextTitle}>{next.title}</span>
                <span className={styles.nextMeta}>
                  {[
                    next.creator?.full_name,
                    formatDuration(next.duration_seconds),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </Link>
          ) : null
        }
      />
    </main>
  );
}
