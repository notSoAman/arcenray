import Link from "next/link";
import { Lockup } from "../components/brand";

export default function NotFound() {
  return (
    <main
      className="app-main"
      style={{ minHeight: "80vh", justifyContent: "center" }}
    >
      <Lockup />
      <section className="state-panel">
        <h2>We couldn&apos;t find that.</h2>
        <p>
          The film or person may have been removed, made private, or the link is
          wrong.
        </p>
        <Link href="/home" className="btn btn-primary">
          Back to home
        </Link>
      </section>
    </main>
  );
}
