import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PublicationNotice } from "../../components/publication-notice";
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
      <Suspense fallback={null}>
        <PublicationNotice />
      </Suspense>
    </div>
  );
}
