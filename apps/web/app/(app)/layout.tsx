import { redirect } from "next/navigation";
import { AppNav } from "../../components/app-nav";
import { getViewer, isSupabaseConfigured } from "../../lib/session";

export const dynamic = "force-dynamic";

/** Signed-in, onboarded area. RLS stays the authority; this only routes people. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) redirect("/");
  const { user, profile } = await getViewer();
  if (!user) redirect("/sign-in");
  if (!profile?.onboarding_completed) redirect("/onboarding");

  return (
    <div className="app-shell">
      <AppNav
        viewer={{
          name: profile.full_name,
          handle: profile.handle,
          picKey: profile.profile_pic_key,
        }}
      />
      {children}
    </div>
  );
}
