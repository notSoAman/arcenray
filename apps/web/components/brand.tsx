import Image from "next/image";
import Link from "next/link";
import styles from "./brand.module.css";

/** The accepted lowercase "a" mark (exported from the design canvas). */
export function LogoMark({
  size = 30,
  decorative = true,
}: {
  size?: number;
  decorative?: boolean;
}) {
  return (
    <Image
      src="/brand/arcenray-mark.webp"
      alt={decorative ? "" : "arcenray"}
      width={size}
      height={Math.round((size * 185) / 160)}
      loading="eager"
    />
  );
}

/** Mark + wordmark lockup, linking home. */
export function Lockup({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className={styles.lockup} aria-label="arcenray. home">
      <LogoMark />
      <span className={styles.wordmark} aria-hidden="true">
        arcenray.
      </span>
    </Link>
  );
}

/** Large logo on a Void tile — the mark sits on a calm panel, never over busy art. */
export function LogoTile({ className }: { className?: string }) {
  return (
    <div className={`${styles.tile} ${className ?? ""}`}>
      <Image
        src="/brand/arcenray-a.webp"
        alt="arcenray logo"
        width={600}
        height={697}
        className={styles.tileImage}
        loading="eager"
      />
    </div>
  );
}
