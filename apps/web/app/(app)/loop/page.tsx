import type { Metadata } from "next";
import { createArcenrayClient } from "@repo/shared";
import { withCreators } from "../../../lib/feed";
import { getViewer } from "../../../lib/session";
import { LoopFeed } from "./loop-feed";
import styles from "./loop.module.css";

export const metadata: Metadata = {
  title: "Discover short films",
  description:
    "Explore independent short films, new voices, and fresh perspectives from filmmakers on Arcenray.",
  alternates: { canonical: "/loop" },
};
export const dynamic = "force-dynamic";
const PAGE_SIZE = 10;

export default async function LoopPage() {
  const { supabase, user } = await getViewer();
  const api = createArcenrayClient(supabase);
  const [page, preferences] = await Promise.all([
    api.loop.page([], PAGE_SIZE),
    user ? api.loop.preferences() : Promise.resolve({ data: [], error: null }),
  ]);
  const films =
    page.error || !page.data ? [] : await withCreators(supabase, page.data);
  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Loop — discover short films</h1>
      <LoopFeed
        initialFilms={films}
        initialFailed={Boolean(page.error) || !page.data}
        initialHasMore={(page.data?.length ?? 0) === PAGE_SIZE}
        initialPreferences={preferences.data ?? []}
        preferencesFailed={Boolean(preferences.error)}
        viewerId={user?.id ?? null}
      />
    </main>
  );
}
