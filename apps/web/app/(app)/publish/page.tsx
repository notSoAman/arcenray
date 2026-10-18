import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { uuidSchema } from "@repo/shared";
import { getViewer } from "../../../lib/session";
import { PublishForm } from "./publish-form";
import styles from "./publish.module.css";

export const metadata: Metadata = { title: "Publish a film" };
export const dynamic = "force-dynamic";

export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { user, profile, supabase } = await getViewer();
  if (!user) redirect("/sign-in?next=%2Fpublish");
  if (!profile?.onboarding_completed) redirect("/onboarding");
  const { draft: id } = await searchParams;
  if (id && !uuidSchema.safeParse(id).success) notFound();
  const { data: drafts, error } = await supabase
    .from("films")
    .select("*")
    .eq("owner_id", user.id)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not load your drafts. Please retry.");
  let selected = null;
  if (id) {
    const result = await supabase
      .from("films")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .in("status", ["draft", "published"])
      .maybeSingle();
    if (result.error)
      throw new Error("Could not load your draft. Please retry.");
    if (!result.data) notFound();
    selected = result.data;
  }
  return (
    <main className={styles.page}>
      <header>
        <p className="kicker">Creator studio</p>
        <h1>Put your film into the world.</h1>
        <p className={styles.muted}>
          Save privately, choose your hook, then publish when you’re ready.
        </p>
      </header>
      <PublishForm
        key={id ?? "new"}
        initial={selected}
        drafts={drafts ?? []}
        handle={profile.handle}
        viewerId={user.id}
      />
    </main>
  );
}
