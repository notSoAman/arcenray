import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "../../../../lib/session";
import { ReportControls } from "./controls";
import styles from "./reports.module.css";

export const metadata: Metadata = {
  title: "Report review",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/** Both page access and every RPC independently require the server-managed moderator grant. */
export default async function ReportsPage() {
  const { user, supabase } = await getViewer();
  if (!user) redirect("/sign-in?next=%2Fadmin%2Freports");
  const moderator = await supabase.rpc("is_moderator");
  if (moderator.error)
    throw new Error("Could not verify report-review access. Please retry.");
  if (!moderator.data) notFound();
  const reports = await supabase.rpc("get_moderation_reports");
  if (reports.error) throw new Error("Could not load reports. Please retry.");
  const rows = reports.data ?? [];
  const profileIds = rows
    .map((report) => report.profile_id)
    .filter((id): id is string => !!id);
  const profiles = profileIds.length
    ? await supabase.from("profiles").select("id,handle").in("id", profileIds)
    : { data: [] };
  const handles = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.handle]),
  );
  return (
    <main className={`app-main ${styles.page}`}>
      <p className="kicker">Founder operations</p>
      <h1>Report review</h1>
      <p className={styles.muted}>
        Up to 100 reports, with open reports first. Private messages are not
        retrieved by this screen. Use recorded reasons for every decision.
      </p>
      <aside className={styles.caution}>
        <p>
          Hiding a film also affects other films reusing its exact media assets.
          Review the target before confirming.
        </p>
        <p>
          Restoring a film queues recovery; public playback returns only after
          its assets are ready. Suspending a profile restricts the account and
          its public content; reactivation does not override a separate film
          takedown.
        </p>
      </aside>
      {!rows.length ? (
        <section className="state-panel">
          <h2>No reports to review</h2>
          <p>New reports will appear here.</p>
        </section>
      ) : (
        <ol className={styles.list}>
          {rows.map((report) => (
            <li key={report.id} className={styles.report}>
              <header className={styles.heading}>
                <h2>
                  Report <span>{report.id.slice(0, 8)}</span>
                </h2>
                <span className="pill">{report.status}</span>
              </header>
              <dl className={styles.details}>
                <div>
                  <dt>Submitted</dt>
                  <dd>
                    <time dateTime={report.created_at}>
                      {new Date(report.created_at).toLocaleString("en-GB", {
                        timeZone: "UTC",
                      })}{" "}
                      UTC
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Report ID</dt>
                  <dd>{report.id}</dd>
                </div>
                <div>
                  <dt>Reporter ID</dt>
                  <dd>{report.reporter_id}</dd>
                </div>
                {report.film_id ? (
                  <div>
                    <dt>Film</dt>
                    <dd>
                      <Link href={`/films/${report.film_id}`}>
                        {report.film_id}
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {report.profile_id ? (
                  <div>
                    <dt>Profile</dt>
                    <dd>
                      {handles.has(report.profile_id) ? (
                        <Link href={`/u/${handles.get(report.profile_id)}`}>
                          {report.profile_id}
                        </Link>
                      ) : (
                        report.profile_id
                      )}
                    </dd>
                  </div>
                ) : null}
                {report.message_id ? (
                  <div>
                    <dt>Message ID</dt>
                    <dd>{report.message_id} (content not loaded)</dd>
                  </div>
                ) : null}
              </dl>
              <h3>Reporter’s reason</h3>
              <p className={styles.reason}>{report.reason}</p>
              <ReportControls
                report={{
                  id: report.id,
                  status: report.status,
                  film_id: report.film_id,
                  profile_id: report.profile_id,
                }}
              />
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
