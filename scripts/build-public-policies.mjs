import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import {
  privacyPolicy,
  termsOfService,
  legalContact,
} from "../apps/web/lib/legal.ts";

// Temporary public launch pages; use exactly the same policy copy as Next.js.
// No credentials, application bundle, database connection or analytics are exported.
const directory = new URL("../.policy-site/", import.meta.url);
mkdirSync(directory, { recursive: true });
mkdirSync(new URL("policy-assets/", directory), { recursive: true });
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const css = `:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0e0f0e;color:#f3efe9;font:17px/1.8 Arial,sans-serif}header,main,footer{max-width:1000px;margin:auto;padding:28px 24px}header,footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:20px}header{border-bottom:1px solid #ffffff22}a{color:inherit;text-underline-offset:4px}a:focus-visible{outline:2px solid #e8527a;outline-offset:5px}.brand{font-size:27px;font-weight:800;letter-spacing:-1px;text-decoration:none}main{padding-top:64px;padding-bottom:72px}h1{font-size:clamp(40px,8vw,72px);letter-spacing:-.05em;line-height:1.1;margin:16px 0 24px}h2{font-size:24px;line-height:1.3;margin:0 0 16px}p{color:#d9d3ca;margin:0 0 20px}.meta{font-size:14px;color:#a8a39c}.kicker{font:12px monospace;letter-spacing:.14em;text-transform:uppercase;color:#a8a39c}.intro{max-width:800px;margin-bottom:48px}.contents{padding:24px 0;border-block:1px solid #ffffff22;margin-bottom:48px;display:flex;flex-wrap:wrap;gap:12px 24px;font-size:14px}article{max-width:780px}section{margin-bottom:40px;scroll-margin-top:24px}footer{border-top:1px solid #ffffff22;font-size:14px;color:#a8a39c}nav{display:flex;flex-wrap:wrap;gap:20px}.contact{border-top:1px solid #ffffff22;padding-top:28px;overflow-wrap:anywhere}@media(max-width:600px){body{font-size:16px}main{padding-top:36px}.contents{display:grid;gap:12px}}`;
writeFileSync(new URL("policy-assets/styles.css", directory), css);
copyFileSync(
  new URL("../apps/web/public/brand/arcenray-mark.webp", import.meta.url),
  new URL("policy-assets/mark.webp", directory),
);
const footer = `<footer><span>Find your people, make your art.</span><nav aria-label="Legal and support"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="mailto:${legalContact.email}">Contact</a></nav></footer>`;
function document(title, path, description, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Arcenray</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="https://arcenray.com${path}"><link rel="icon" href="/policy-assets/mark.webp"><link rel="stylesheet" href="/policy-assets/styles.css"></head><body><header><a class="brand" href="/">arcenray.</a><a href="mailto:${legalContact.email}">Contact</a></header>${body}${footer}</body></html>`;
}
for (const [path, policy] of [
  ["privacy", privacyPolicy],
  ["terms", termsOfService],
]) {
  const contents = policy.sections
    .map((s) => `<a href="#${s.id}">${escape(s.title)}</a>`)
    .join("");
  const sections = policy.sections
    .map(
      (s) =>
        `<section id="${s.id}"><h2>${escape(s.title)}</h2>${s.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("")}</section>`,
    )
    .join("");
  writeFileSync(
    new URL(path + ".html", directory),
    document(
      policy.title,
      "/" + path,
      policy.introduction,
      `<main><div class="intro"><p class="kicker">Arcenray · Trust &amp; transparency</p><h1>${escape(policy.title)}</h1><p class="meta">Last updated ${escape(legalContact.updated)}</p><p>${escape(policy.introduction)}</p></div><nav class="contents" aria-label="On this page">${contents}</nav><article>${sections}<aside class="contact"><h2>Questions?</h2><p>${escape(legalContact.operator)}, ${escape(legalContact.country)}<br><a href="mailto:${legalContact.email}">${legalContact.email}</a></p></aside></article></main>`,
    ),
  );
}
writeFileSync(
  new URL("index.html", directory),
  document(
    "Independent film and creative collaboration",
    "/",
    "Arcenray is a platform for independent films, creative portfolios and collaboration.",
    `<main><p class="kicker">Independent film · Creative collaboration</p><h1>Find your people.<br>Make your art.</h1><div class="intro"><p>Arcenray is a platform for discovering independent short films, showcasing creative work and connecting filmmakers, crew and musicians.</p><p>The application is being prepared for launch. Our privacy policy and terms are available below.</p><nav><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></nav></div><p class="meta">Operated by ${escape(legalContact.operator)}, ${escape(legalContact.country)}. Contact <a href="mailto:${legalContact.email}">${legalContact.email}</a>.</p></main>`,
  ),
);
writeFileSync(
  new URL("404.html", directory),
  document(
    "Page not found",
    "/404",
    "This page is not available.",
    '<main><h1>Page not found.</h1><p><a href="/">Return to Arcenray</a></p></main>',
  ),
);
writeFileSync(
  new URL("_headers", directory),
  `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\n  Cache-Control: public,max-age=300\n`,
);
console.log(
  "Built public landing, privacy and terms from the canonical policy copy.",
);
