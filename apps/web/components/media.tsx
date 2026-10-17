import Image from "next/image";
import { mediaUrl } from "../lib/feed";
import styles from "./media.module.css";

/** Film poster or, when none exists, the spectrum artwork with the title. */
export function Poster({
  posterKey,
  title,
  sizes,
  eager,
}: {
  posterKey: string | null;
  title: string;
  sizes: string;
  eager?: boolean;
}) {
  const src = mediaUrl(posterKey);
  if (!src) {
    return (
      <span className={`${styles.fallback} spectrum-strip`} aria-hidden="true">
        <span>{title}</span>
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      className={styles.cover}
      // Posters are prepared as ≤800×1200 WebP before upload.
      unoptimized
      loading={eager ? "eager" : "lazy"}
    />
  );
}

/** Round profile picture; falls back to the initial over the spectrum. */
export function Avatar({
  picKey,
  name,
  size = 48,
  className,
}: {
  picKey: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}) {
  const src = mediaUrl(picKey);
  const initial = name.trim().charAt(0).toUpperCase() || "a";
  return (
    <span
      className={`${styles.avatar} ${className ?? ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          unoptimized
          className={styles.cover}
        />
      ) : (
        initial
      )}
    </span>
  );
}
