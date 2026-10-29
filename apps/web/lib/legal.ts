/** Public policy copy shared by the web pages and the public policy export. */
export const legalContact = {
  operator: "Aman Singh Choudhary",
  country: "India",
  email: "office@arcenray.com",
  updated: "21 October 2026",
};

export type LegalPolicy = {
  title: string;
  introduction: string;
  sections: { id: string; title: string; paragraphs: string[] }[];
};

export const privacyPolicy: LegalPolicy = {
  title: "Privacy Policy",
  introduction:
    "This policy explains how Arcenray handles information when you browse films, create a profile, publish work or connect with other creatives. Arcenray is operated by Aman Singh Choudhary, based in India. You can browse public content without creating an account.",
  sections: [
    {
      id: "information",
      title: "1. Information we handle",
      paragraphs: [
        "Account information includes your authentication provider identifier, email address and account details needed to sign you in. Clerk manages authentication. If you choose Google sign-in, Clerk receives the basic identity information you authorize, such as your name, email address and profile image. We do not request access to your Gmail messages, Google Drive files, contacts or calendar for sign-in.",
        "Information you provide includes your profile name, handle, creative roles, city, biography, skills, profile picture, films, discovery clips, posters and film credits. We also store messages you send, reports and support requests.",
        "When you use discovery features, we may store account-linked preferences and interactions such as likes, saves, more/less feedback and meaningful watch events. Our infrastructure providers process technical information such as IP addresses, browser information, request times and error logs to deliver and secure the service.",
      ],
    },
    {
      id: "purpose",
      title: "2. How information is used",
      paragraphs: [
        "We use information to authenticate accounts, show profiles and films, deliver messages, manage uploads and storage limits, provide search and recommendations, respond to requests and maintain service security. We also use reports and limited audit records to investigate abuse, manage takedowns and enforce our terms.",
        "Search uses text and machine-generated numerical representations of film and profile descriptions. Recommendations use preferences and relevant interactions. These representations support discovery; private message contents are not used to train recommendation models. Google sign-in information is used for account access and identity, not advertising or training AI models.",
      ],
    },
    {
      id: "visibility",
      title: "3. Public and private information",
      paragraphs: [
        "Completed public profiles, published films, discovery clips, posters and visible film credits can be viewed by people who are not signed in and may be indexed by search engines. Do not put private contact information or confidential material in public fields. Other people may copy material they can view.",
        "Drafts, private conversations, personal recommendation preferences and reports are not public browsing content. Messages are accessible to the conversation participants through the application; they are not end-to-end encrypted. Access by the operator or service providers is limited to operating the service, responding to support or safety issues, or meeting legal obligations.",
      ],
    },
    {
      id: "providers",
      title: "4. Service providers and disclosures",
      paragraphs: [
        "We use Clerk for authentication, Supabase for the database, realtime features and server-side operations, and Cloudflare for media storage and delivery and website infrastructure. These providers process information needed to perform their services, and processing may occur outside your country. Each provider also has its own applicable privacy terms.",
        "If you play an embedded YouTube or Vimeo film, your browser connects to that provider, which may receive your IP address, device information and playback activity and apply its own cookies and privacy policy. Information is also disclosed when you choose to publish content or message another user, or when reasonably necessary to meet a legal obligation or protect people and the service.",
        "We do not sell personal information or use Google user data for advertising. Our use of information received through Google sign-in is limited to the purposes described in this policy and subject to the applicable Google API Services User Data Policy.",
      ],
    },
    {
      id: "storage",
      title: "5. Cookies and browser storage",
      paragraphs: [
        "Arcenray and Clerk use cookies or equivalent session storage to maintain sign-in and security. Browser storage can also retain interface preferences and non-secret upload checkpoints so an interrupted upload can resume. Removing browser storage may sign you out or remove local resume information. External players may use their own storage when loaded.",
      ],
    },
    {
      id: "retention",
      title: "6. Retention and account deletion",
      paragraphs: [
        "We retain account information and content while needed to provide the service and for the security, support and legal purposes described here. Retention depends on the type of record, whether an account or content has been deleted, outstanding reports and applicable obligations; not all information disappears immediately when an account is closed.",
        "You can request account deletion through account settings or contact us. The deletion process removes your public profile and films from browsing and queues removal of associated media and authentication records. Removal may take additional time because of processing retries, cached copies and backups. A minimal revoked-identity record may be retained to prevent an old session from recreating a deleted account. Limited safety, request and legal records may be retained where necessary. Copies independently saved by others are outside our control.",
      ],
    },
    {
      id: "choices",
      title: "7. Your choices and requests",
      paragraphs: [
        `You can edit your profile, manage published work and change available discovery preferences in the application. Contact ${legalContact.email} to request access to, correction, export or deletion of your information, raise a privacy concern or ask about a pending deletion. We may need to verify your identity before acting on a request. Rights and exceptions depend on the laws that apply to you.`,
        "You can also remove Arcenray's Google connection through your Google Account settings. Revoking that connection does not by itself delete your Arcenray profile or previously published content; use our account-deletion process for that.",
      ],
    },
    {
      id: "security",
      title: "8. Security and updates",
      paragraphs: [
        "We use access controls, authenticated operations and other safeguards to protect information. No internet service can guarantee absolute security. Do not share passwords or verification codes, and contact us if you suspect unauthorized access. If you are not legally able to consent to the processing needed for an account, contact us before creating one.",
        `We may update this policy as the service changes. We will show the updated date and provide additional notice or request consent where required. Contact the operator at ${legalContact.email} with questions about this policy.`,
      ],
    },
  ],
};

export const termsOfService: LegalPolicy = {
  title: "Terms of Service",
  introduction: `These terms govern your use of Arcenray, a platform for discovering independent films, showcasing creative work and connecting with collaborators. Arcenray is operated by Aman Singh Choudhary, based in India. Contact: ${legalContact.email}. By using the service, you agree to these terms.`,
  sections: [
    {
      id: "accounts",
      title: "1. Using Arcenray",
      paragraphs: [
        "You may browse public films and profiles without an account. Publishing, messaging and other account features require sign-in. Provide accurate account information, keep your credentials secure and use the service only if you can lawfully agree to these terms. If applicable law requires a parent or guardian's permission, obtain it before creating an account.",
        "You are responsible for activity you authorize through your account. Do not impersonate another person, sell access to accounts or try to access another user's private information. Tell us promptly if your account is compromised.",
      ],
    },
    {
      id: "ownership",
      title: "2. Your work and our permission to display it",
      paragraphs: [
        "You retain ownership of the films, music, images, text and other material you submit. Upload or link only material you are entitled to share, including the necessary music, performance, likeness and other permissions. You must have permission to upload a discovery clip or poster even when the full film is hosted elsewhere.",
        "By submitting content, you grant Arcenray a non-exclusive permission to store, copy, deliver and display it as needed to operate the features you choose, including public discovery, search, playback and sharing within the service. This permission does not transfer ownership or allow us to sell your film. It ends when the relevant content is removed, except for the limited processing, backup, safety and legal retention described in the Privacy Policy.",
        "Public viewing does not give other users ownership or permission to download, reproduce, redistribute or commercially exploit your work. Users must obtain the rights holder's permission unless the law independently permits the use. Do not claim another person's work as your own.",
      ],
    },
    {
      id: "conduct",
      title: "3. Community and acceptable use",
      paragraphs: [
        "Do not post unlawful content, exploitative material, credible threats, targeted harassment, scams or content that infringes copyright, privacy or other rights. Do not expose another person's confidential information, send spam, manipulate engagement or use the service to exploit or harm others.",
        "Do not bypass authentication, moderation decisions, rate limits or storage quotas; probe for unauthorized data; distribute malware; or interfere with service availability. Automated access must respect our access controls and applicable law. Storage, file-format and upload limits are shown in the product and may change.",
      ],
    },
    {
      id: "collaboration",
      title: "4. Messages, credits and collaboration",
      paragraphs: [
        "You choose whom to contact and what to share. Arcenray does not guarantee the identity, qualifications, availability or conduct of another user, and film credits are listed as supplied by the filmmaker rather than independently certified by Arcenray.",
        "You and your collaborators are responsible for your own agreements, permissions, payment arrangements and disputes. Arcenray is not a party to those agreements. The current service does not provide an in-app payment or escrow system.",
      ],
    },
    {
      id: "reports",
      title: "5. Reports, takedowns and account restrictions",
      paragraphs: [
        `Use the available report controls or email ${legalContact.email} to report abuse, copyright infringement or a privacy issue. Include the relevant film or profile URL, explain the issue and provide enough information to assess your authority and request. Do not send passwords or verification codes.`,
        "We may restrict content or accounts to investigate a report, enforce these terms, protect users or comply with law. We may preserve limited records for those purposes. If you believe a restriction was mistaken, contact the same address with the relevant URL and an explanation so the decision can be reviewed.",
      ],
    },
    {
      id: "external",
      title: "6. External films and services",
      paragraphs: [
        "Embedded films and external links are provided through third parties such as YouTube and Vimeo. Their terms, privacy practices, availability, advertising and playback restrictions apply. Arcenray does not guarantee that an external film will remain available or that every player will provide identical controls.",
        "Our Privacy Policy explains how account information, public content, messages and service activity are handled. Please read it before using account features.",
      ],
    },
    {
      id: "availability",
      title: "7. Availability, changes and responsibility",
      paragraphs: [
        "Arcenray is an evolving service. Features may change, be interrupted or become unavailable. Keep your own original copies of creative work; Arcenray is not your sole backup. We do not promise a particular audience size, recommendation outcome, collaboration or uninterrupted access.",
        "You are responsible for your use of the service and the content you submit. Nothing in these terms excludes a right, remedy or responsibility that cannot lawfully be excluded. These terms do not impose arbitration or remove protections that apply under mandatory law.",
      ],
    },
    {
      id: "ending",
      title: "8. Leaving the service and changes to these terms",
      paragraphs: [
        "You can stop using Arcenray at any time and request account deletion through settings or by contacting us. Removal and limited retention are described in the Privacy Policy. Restrictions may also be applied for serious or repeated violations of these terms.",
        `We may update these terms as the service develops. We will publish the revised text and updated date and provide further notice where required. Contact Aman Singh Choudhary at ${legalContact.email} with questions or concerns.`,
      ],
    },
  ],
};
