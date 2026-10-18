import { legalContact, type LegalPolicy } from "../../lib/legal";
import styles from "./legal.module.css";

export function PolicyDocument({ policy }: { policy: LegalPolicy }) {
  return (
    <main id="policy" className={styles.main}>
      <div className={styles.intro}>
        <p className="kicker">Arcenray · Trust & transparency</p>
        <h1>{policy.title}</h1>
        <p className={styles.date}>Last updated {legalContact.updated}</p>
        <p>{policy.introduction}</p>
      </div>
      <div className={styles.columns}>
        <nav className={styles.contents} aria-label="On this page">
          <p className="kicker">On this page</p>
          {policy.sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </nav>
        <article className={styles.body} aria-label={policy.title}>
          {policy.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
          <aside className={styles.contact}>
            <h2>Questions?</h2>
            <p>
              Contact {legalContact.operator}, {legalContact.country}.
            </p>
            <a href={`mailto:${legalContact.email}`}>{legalContact.email}</a>
          </aside>
        </article>
      </div>
    </main>
  );
}
