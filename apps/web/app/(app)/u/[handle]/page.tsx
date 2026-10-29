import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WideCard } from "../../../../components/film-cards";
import { IconPin } from "../../../../components/icons";
import { Avatar } from "../../../../components/media";
import { MessageButton } from "../../../../components/message-button";
import {
  FollowButton,
  ReportButton,
} from "../../../../components/social-actions";
import {
  FILM_DETAIL_COLUMNS,
  loadProfiles,
  type FeedCreator,
} from "../../../../lib/feed";
import { personRole } from "../../../../lib/roles";
import { getViewer } from "../../../../lib/session";
import { BlockButton } from "./profile-actions";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";

const TABS = { films: "Films", credits: "Credits", about: "About" } as const;
type Tab = keyof typeof TABS;

async function loadProfile(handle: string) {
  const { supabase, user } = await getViewer();
  if (!/^[a-z0-9_]{3,32}$/.test(handle)) return null;
  const { data } = await supabase
    .from("profiles")
    .select(
      "id,handle,full_name,bio,roles,location_city,skills_gear,profile_pic_key,onboarding_completed",
    )
    .eq("handle", handle)
    .maybeSingle();
  return data ? { profile: data, supabase, user } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const loaded = await loadProfile((await params).handle);
  return { title: loaded?.profile.full_name || "Profile" };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { handle } = await params;
  const rawTab = (await searchParams).tab;
  const tab: Tab =
    rawTab === "credits" || rawTab === "about" ? rawTab : "films";
  const loaded = await loadProfile(handle);
  if (!loaded) notFound();
  const { profile, supabase, user } = loaded;
  const isSelf = profile.id === user?.id;

  const [filmsRes, creditsRes, followRes, blockRes] = await Promise.all([
    supabase
      .from("films")
      .select(FILM_DETAIL_COLUMNS)
      .eq("owner_id", profile.id)
      .order("published_at", { ascending: false, nullsFirst: true }),
    supabase
      .from("film_credits")
      .select("id,film_id,role,created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false }),
    isSelf || !user
      ? Promise.resolve({ data: null })
      : supabase
          .from("profile_follows")
          .select("following_id")
          .eq("follower_id", user.id)
          .eq("following_id", profile.id)
          .maybeSingle(),
    isSelf || !user
      ? Promise.resolve({ data: null })
      : supabase
          .from("user_blocks")
          .select("blocked_id")
          .eq("blocker_id", user.id)
          .eq("blocked_id", profile.id)
          .maybeSingle(),
  ]);

  const films = (filmsRes.data ?? []).filter(
    (f) => isSelf || f.status === "published",
  );
  const allCredits = creditsRes.data ?? [];

  // Titles + owners for credited films (RLS returns only films this viewer may see).
  const creditFilmIds = [...new Set(allCredits.map((c) => c.film_id))];
  const { data: creditFilms } = creditFilmIds.length
    ? await supabase
        .from("films")
        .select("id,title,owner_id,published_at")
        .in("id", creditFilmIds)
    : {
        data: [] as {
          id: string;
          title: string;
          owner_id: string;
          published_at: string | null;
        }[],
      };
  const filmById = new Map((creditFilms ?? []).map((f) => [f.id, f]));
  const credits = isSelf
    ? allCredits
    : allCredits.filter((credit) => filmById.has(credit.film_id));

  // "Made with": people credited on their films, and owners of films they're credited on.
  const ownFilmIds = films.map((f) => f.id);
  const { data: teamCredits } = ownFilmIds.length
    ? await supabase
        .from("film_credits")
        .select("profile_id")
        .in("film_id", ownFilmIds)
    : { data: [] as { profile_id: string | null }[] };
  const collaboratorIds = [
    ...(teamCredits ?? []).map((c) => c.profile_id),
    ...(creditFilms ?? []).map((f) => f.owner_id),
  ].filter((id): id is string => Boolean(id) && id !== profile.id);
  const collaborators: FeedCreator[] = [
    ...(await loadProfiles(supabase, collaboratorIds)).values(),
  ].slice(0, 8);

  const roles = profile.roles.map(personRole).filter(Boolean).join(" · ");

  return (
    <main className="app-main">
      <section className={styles.hero}>
        <div className={`${styles.banner} spectrum-hero`}>
          <span className={styles.bannerShade} aria-hidden="true" />
        </div>
        <div className={styles.card}>
          <Avatar
            picKey={profile.profile_pic_key}
            name={profile.full_name || profile.handle}
            size={168}
            className={styles.avatar}
          />
          <div className={styles.identity}>
            <h1 className={styles.name}>
              {profile.full_name || `@${profile.handle}`}
            </h1>
            <span className={styles.handle}>@{profile.handle}</span>
            {roles ? <div className={styles.roles}>{roles}</div> : null}
            {profile.location_city ? (
              <div className={styles.place}>
                <IconPin size={16} />
                {profile.location_city}
              </div>
            ) : null}
          </div>
          <div className={styles.actions}>
            {isSelf ? (
              <>
                <Link href="/publish" className="btn btn-accent">
                  Publish a film
                </Link>
              </>
            ) : blockRes.data ? (
              <BlockButton profileId={profile.id} blocked />
            ) : (
              <>
                <FollowButton
                  profileId={profile.id}
                  initial={Boolean(followRes.data)}
                />
                <MessageButton
                  userId={profile.id}
                  className={`btn btn-accent ${styles.message}`}
                >
                  Message
                </MessageButton>
              </>
            )}
          </div>
        </div>
      </section>

      <div className={styles.layout}>
        <div className={styles.main}>
          <nav aria-label="Profile sections" className={styles.tabs}>
            {(Object.keys(TABS) as Tab[]).map((t) => (
              <Link
                key={t}
                href={
                  t === "films"
                    ? `/u/${profile.handle}`
                    : `/u/${profile.handle}?tab=${t}`
                }
                className={styles.tab}
                aria-current={tab === t ? "page" : undefined}
                scroll={false}
              >
                {TABS[t]}
              </Link>
            ))}
          </nav>

          {tab === "films" ? (
            films.length === 0 ? (
              <div className="state-panel">
                <h2>
                  {isSelf ? "You haven't published a film yet" : "No films yet"}
                </h2>
                <p>
                  {isSelf
                    ? "Use Publish a film to save a draft and share your work. Your films will show here."
                    : "When they publish, their short films will show here."}
                </p>
              </div>
            ) : (
              <div className={styles.films}>
                {films.map((f) => (
                  <WideCard
                    key={f.id}
                    film={f}
                    note={[
                      f.status !== "published" ? "Draft" : null,
                      f.genres[0],
                      f.published_at
                        ? new Date(f.published_at).getFullYear().toString()
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ))}
              </div>
            )
          ) : null}

          {tab === "credits" ? (
            credits.length === 0 ? (
              <div className="state-panel">
                <h2>No credits yet</h2>
                <p>
                  {isSelf
                    ? "Credits added to your films appear here."
                    : "No film credits have been listed for this creative yet."}
                </p>
              </div>
            ) : (
              <ul className={styles.creditList}>
                {credits.map((c) => {
                  const f = filmById.get(c.film_id);
                  return (
                    <li key={c.id} className={styles.creditRow}>
                      {f ? (
                        <Link
                          href={`/films/${f.id}`}
                          className={styles.creditWork}
                        >
                          {f.title}
                        </Link>
                      ) : (
                        <span className={styles.creditWork}>
                          A film not yet public
                        </span>
                      )}
                      <span className={styles.creditMeta}>
                        {c.role}
                        {f?.published_at
                          ? ` · ${new Date(f.published_at).getFullYear()}`
                          : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}

          {tab === "about" ? (
            <div className={styles.about}>
              {profile.bio ? (
                <p className={styles.bio}>{profile.bio}</p>
              ) : (
                <p className={styles.muted}>
                  {isSelf ? "Add a bio in Settings." : "No bio yet."}
                </p>
              )}
              {profile.skills_gear.length > 0 ? (
                <div className={styles.group}>
                  <span className="kicker">Skills &amp; tools</span>
                  <ul className={styles.skills}>
                    {profile.skills_gear.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className={styles.side}>
          {collaborators.length > 0 ? (
            <>
              <h2 className={styles.sideTitle}>Made with</h2>
              <div className={styles.people}>
                {collaborators.map((m) => (
                  <Link
                    key={m.id}
                    href={`/u/${m.handle}`}
                    className={styles.person}
                  >
                    <Avatar
                      picKey={m.profile_pic_key}
                      name={m.full_name}
                      size={56}
                    />
                    <span>{m.full_name.split(/\s+/)[0]}</span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
          {profile.bio && tab !== "about" ? (
            <>
              <h2 className={styles.sideTitle}>About</h2>
              <p className={styles.sideBio}>{profile.bio}</p>
            </>
          ) : null}
          {!isSelf ? (
            <div className={styles.safety}>
              <ReportButton
                target={{ profile_id: profile.id }}
                label="Report"
              />
              {!blockRes.data ? (
                <BlockButton profileId={profile.id} blocked={false} />
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
