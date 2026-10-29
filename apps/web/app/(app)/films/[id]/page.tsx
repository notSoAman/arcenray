import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WideCard } from "../../../../components/film-cards";
import { FilmPlayer } from "../../../../components/film-player";
import { Avatar } from "../../../../components/media";
import { MessageButton } from "../../../../components/message-button";
import {
  FilmToggles,
  FollowButton,
  ReportButton,
  ShareButton,
} from "../../../../components/social-actions";
import {
  FILM_COLUMNS,
  FILM_DETAIL_COLUMNS,
  formatDuration,
  loadProfiles,
  withCreators,
  type FilmRow,
} from "../../../../lib/feed";
import { personRole } from "../../../../lib/roles";
import { getViewer } from "../../../../lib/session";
import styles from "./film.module.css";

export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadFilm(id: string) {
  const { supabase, user } = await getViewer();
  if (!uuid.test(id)) return null;
  const { data } = await supabase
    .from("films")
    .select(FILM_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return data ? { film: data, supabase, user } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const loaded = await loadFilm((await params).id);
  return { title: loaded?.film.title ?? "Film" };
}

export default async function FilmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const loaded = await loadFilm(id);
  if (!loaded) notFound();
  const { film, supabase, user } = loaded;
  const isOwner = film.owner_id === user?.id;

  const [creators, credits, liked, saved, following, creatorFilms, related] =
    await Promise.all([
      loadProfiles(supabase, [film.owner_id]),
      supabase
        .from("film_credits")
        .select("id,display_name,role,profile_id")
        .eq("film_id", film.id)
        .order("created_at", { ascending: true }),
      user
        ? supabase
            .from("film_likes")
            .select("film_id")
            .eq("film_id", film.id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase
            .from("film_bookmarks")
            .select("film_id")
            .eq("film_id", film.id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase
            .from("profile_follows")
            .select("following_id")
            .eq("follower_id", user.id)
            .eq("following_id", film.owner_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("films")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", film.owner_id)
        .eq("status", "published"),
      (film.genres[0]
        ? supabase
            .from("films")
            .select(FILM_COLUMNS)
            .eq("status", "published")
            .neq("id", film.id)
            .contains("genres", [film.genres[0]])
        : supabase
            .from("films")
            .select(FILM_COLUMNS)
            .eq("status", "published")
            .neq("id", film.id)
      )
        .order("published_at", { ascending: false })
        .limit(4),
    ]);

  const creator = creators.get(film.owner_id) ?? null;
  const creditRows = credits.data ?? [];
  const creditProfiles = await loadProfiles(
    supabase,
    creditRows.map((c) => c.profile_id).filter((p): p is string => Boolean(p)),
  );
  const relatedFilms = await withCreators(
    supabase,
    (related.data ?? []) as FilmRow[],
  );

  const length = formatDuration(film.duration_seconds);
  const published = film.published_at
    ? new Date(film.published_at).toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric",
      })
    : null;
  const filmCount = creatorFilms.count ?? 0;

  return (
    <main className="app-main">
      <div className={styles.top}>
        <div className={styles.playerCol}>
          <FilmPlayer
            film={film}
            variant="inline"
            exitHref={`/watch/${film.id}`}
          />
        </div>

        <aside className={styles.info}>
          <div className={styles.titleBlock}>
            <span className={`kicker ${styles.kicker}`}>
              Short film{film.genres[0] ? ` · ${film.genres[0]}` : ""}
              {film.status !== "published"
                ? " · Draft (only you can see this)"
                : ""}
            </span>
            <h1 className={styles.title}>{film.title}</h1>
            <ul className={styles.facts} aria-label="Details">
              {length ? <li>{length}</li> : null}
              {film.language ? <li>{film.language}</li> : null}
              {film.location_city ? (
                <li>
                  <Link
                    href={`/search?q=${encodeURIComponent(film.location_city)}&city=${encodeURIComponent(film.location_city)}`}
                    className={styles.place}
                  >
                    Shot in {film.location_city}
                  </Link>
                </li>
              ) : null}
              {published ? <li>{published}</li> : null}
            </ul>
          </div>

          {creator ? (
            <div className={styles.creator}>
              <Link
                href={`/u/${creator.handle}`}
                className={styles.creatorLink}
              >
                <Avatar
                  picKey={creator.profile_pic_key}
                  name={creator.full_name}
                  size={52}
                />
                <span className={styles.creatorText}>
                  <span className={styles.creatorName}>
                    {creator.full_name}
                  </span>
                  <span className={styles.creatorMeta}>
                    {[
                      creator.roles
                        .map(personRole)
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("-"),
                      creator.location_city,
                      `${filmCount} film${filmCount === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </Link>
              {isOwner ? (
                <Link
                  className="btn btn-ghost"
                  href={`/publish?draft=${film.id}`}
                >
                  Manage film
                </Link>
              ) : null}
              {!isOwner ? (
                <div className={styles.creatorActions}>
                  <MessageButton userId={creator.id} className={styles.message}>
                    Message
                  </MessageButton>
                  <FollowButton
                    profileId={creator.id}
                    initial={Boolean(following.data)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={styles.toggles}>
            {isOwner && film.status === "draft" ? (
              <Link
                href={`/publish?draft=${film.id}`}
                className="btn btn-primary"
              >
                Continue editing draft
              </Link>
            ) : null}
            {film.status === "published" ? (
              <FilmToggles
                filmId={film.id}
                liked={Boolean(liked.data)}
                saved={Boolean(saved.data)}
              />
            ) : null}
            <ShareButton title={film.title} path={`/films/${film.id}`} />
          </div>

          {film.synopsis ? (
            <p className={styles.synopsis}>{film.synopsis}</p>
          ) : null}

          {film.mood_tags.length > 0 ? (
            <ul className={styles.moods} aria-label="Mood">
              {film.mood_tags.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}

          {isOwner ? (
            <Link className="btn btn-ghost" href={`/publish?draft=${film.id}`}>
              Manage film
            </Link>
          ) : null}
          {!isOwner ? (
            <ReportButton
              target={{ film_id: film.id }}
              label="Report this film"
            />
          ) : null}
        </aside>
      </div>

      <section className={styles.section} aria-labelledby="credits-title">
        <h2 id="credits-title" className="section-title">
          People behind the work
        </h2>
        {creditRows.length === 0 ? (
          <p className={styles.muted}>No credits listed yet.</p>
        ) : (
          <div className={styles.credits}>
            {creditRows.map((c) => {
              const p = c.profile_id
                ? creditProfiles.get(c.profile_id)
                : undefined;
              const body = (
                <>
                  <Avatar
                    picKey={p?.profile_pic_key}
                    name={p?.full_name ?? c.display_name}
                    size={46}
                  />
                  <span className={styles.creditText}>
                    <span className={styles.creditName}>
                      {p?.full_name ?? c.display_name}
                    </span>
                    <span className={styles.creditRole}>{c.role}</span>
                  </span>
                </>
              );
              return p ? (
                <Link
                  key={c.id}
                  href={`/u/${p.handle}`}
                  className={styles.credit}
                >
                  {body}
                </Link>
              ) : (
                <div key={c.id} className={styles.credit}>
                  {body}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {relatedFilms.length > 0 ? (
        <section className={styles.section} aria-labelledby="related-title">
          <h2 id="related-title" className="section-title">
            On the same wavelength
          </h2>
          <div className={styles.related}>
            {relatedFilms.map((r) => (
              <WideCard
                key={r.id}
                film={r}
                note={
                  film.genres[0] && r.genres.includes(film.genres[0])
                    ? `also ${film.genres[0].toLowerCase()}`
                    : null
                }
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
