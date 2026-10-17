import { redirect } from "next/navigation";
import { AppNav } from "../../components/app-nav";
import { getViewer, isSupabaseConfigured } from "../../lib/session";

export const dynamic = "force-dynamic";

/** Public browsing shell. Sensitive routes enforce authentication themselves. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) redirect("/");
  const { profile } = await getViewer();

  return (
    <div className="app-shell">
      <AppNav
        viewer={
          profile
            ? {
                name: profile.full_name,
                handle: profile.handle,
                picKey: profile.profile_pic_key,
              }
            : null
        }
      />
      {children}
    </div>
  );
}
