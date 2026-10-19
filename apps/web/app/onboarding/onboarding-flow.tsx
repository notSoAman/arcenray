"use client";

import { createArcenrayClient, profileInputSchema } from "@repo/shared";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Lockup } from "../../components/brand";
import { SignOutButton } from "../../components/sign-out-button";
import { createClient } from "../../lib/supabase/client";
import { roleLabels, roleOptions, type CreativeRole } from "../../lib/roles";
import styles from "./onboarding.module.css";
import { onboardingChoices, validOnboardingChoices } from "./preferences";

type Initial = {
  roles: CreativeRole[];
  full_name: string;
  handle: string;
  location_city: string;
  bio: string;
  skills_gear: string[];
};

type FieldErrors = Partial<
  Record<
    "full_name" | "handle" | "location_city" | "bio" | "skills_gear",
    string
  >
>;

const BIO_MAX = 2000;
const SKILLS_MAX = 30;

function suggestHandle(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

export function OnboardingFlow({
  userId,
  email,
  initial,
  mode = "onboarding",
  signupHandleProvided = false,
}: {
  userId: string;
  email: string | null;
  initial: Initial;
  mode?: "onboarding" | "edit";
  signupHandleProvided?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [roles, setRoles] = useState<CreativeRole[]>(initial.roles);
  const [fullName, setFullName] = useState(initial.full_name);
  const [handle, setHandle] = useState(initial.handle);
  const [handleTouched, setHandleTouched] = useState(initial.handle !== "");
  const [city, setCity] = useState(initial.location_city);
  const [bio, setBio] = useState(initial.bio);
  const [skills, setSkills] = useState<string[]>(initial.skills_gear);
  const [skillDraft, setSkillDraft] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [rolesError, setRolesError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const saveLock = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new step's heading so keyboard and screen-reader users land in context.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  function toggleRole(role: CreativeRole) {
    setRolesError(false);
    setRoles((current) =>
      current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role],
    );
  }

  function continueToDetails() {
    if (roles.length === 0) {
      setRolesError(true);
      return;
    }
    setStep(2);
  }

  function addSkill(raw: string) {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.slice(0, 80));
    if (parts.length === 0) return;
    setSkills((current) => {
      const next = [...current];
      for (const part of parts) {
        if (next.length >= SKILLS_MAX) break;
        if (!next.some((s) => s.toLowerCase() === part.toLowerCase()))
          next.push(part);
      }
      return next;
    });
    setSkillDraft("");
  }

  function onSkillKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addSkill(skillDraft);
    } else if (
      event.key === "Backspace" &&
      skillDraft === "" &&
      skills.length > 0
    ) {
      setSkills((current) => current.slice(0, -1));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current) return;
    const pendingSkills = skillDraft.trim()
      ? [...skills, skillDraft.trim().slice(0, 80)]
      : skills;
    const input = {
      handle: handle.trim().toLowerCase(),
      full_name: fullName.trim(),
      bio: bio.trim(),
      roles,
      location_city: city.trim() ? city.trim() : null,
      skills_gear: pendingSkills.slice(0, SKILLS_MAX),
      onboarding_completed: true,
    };

    const parsed = profileInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "full_name")
          next.full_name = "Add the name you work under.";
        if (key === "handle")
          next.handle = "Use 3–32 lowercase letters, numbers or underscores.";
        if (key === "location_city")
          next.location_city = "Keep the city under 100 characters.";
        if (key === "bio")
          next.bio = `Keep your bio under ${BIO_MAX} characters.`;
        if (key === "skills_gear")
          next.skills_gear = "Each skill must be 1–80 characters.";
        if (key === "roles") setStep(1);
      }
      if (!parsed.error.issues.some((issue) => issue.path[0] === "roles"))
        setStep(2);
      setErrors(next);
      return;
    }

    setErrors({});
    setSaveError(null);
    if (mode === "onboarding" && step === 2) {
      setStep(3);
      return;
    }
    if (mode === "onboarding" && !validOnboardingChoices(choices)) {
      setSaveError("Choose exactly three references to continue.");
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      const api = createArcenrayClient(createClient());
      const { error } = await api.profiles.update({
        ...parsed.data,
        onboarding_completed: mode === "edit",
      });
      if (error) {
        setSaving(false);
        if (error.code === "23505") {
          setStep(2);
          setErrors({
            handle: `@${input.handle} is taken. Try another handle.`,
          });
        } else if (error.code === "23514") {
          setStep(2);
          setErrors({
            handle: "Use 3–32 lowercase letters, numbers or underscores.",
          });
        } else {
          setSaveError(
            "We couldn't save your profile. Your answers are still here — try again.",
          );
        }
        return;
      }
      if (mode === "onboarding") {
        const preferenceReply = await api.supabase.rpc(
          "set_onboarding_preferences",
          { p_choices: choices },
        );
        if (preferenceReply.error) throw preferenceReply.error;
        const completionReply = await api.profiles.update({
          ...parsed.data,
          onboarding_completed: true,
        });
        if (completionReply.error) throw completionReply.error;
      }
      // Search indexing runs in the background; a failure must not block entering the app.
      void api.index("profile", userId).catch(() => undefined);
      router.replace(mode === "edit" ? `/u/${input.handle}` : "/home");
      router.refresh();
    } catch {
      setSaving(false);
      setSaveError(
        "We couldn't reach arcenray. Check your connection and try again.",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <span className={styles.glow} aria-hidden="true" />
      <header className={styles.top}>
        <Lockup href={mode === "edit" ? "/home" : "/onboarding"} />
        <div className={styles.topEnd}>
          {email ? <span className={styles.email}>{email}</span> : null}
          <SignOutButton className={styles.quiet} />
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.progressRow}>
          {step > 1 ? (
            <button
              type="button"
              className={styles.back}
              onClick={() => {
                if (!saving) setStep(step === 3 ? 2 : 1);
              }}
              disabled={saving}
              aria-label={
                step === 3 ? "Back to profile details" : "Back to roles"
              }
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          ) : null}
          <span className={styles.stepLabel}>
            Step {step} of {mode === "edit" ? 2 : 3}
          </span>
        </div>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="Profile setup"
          aria-valuemin={1}
          aria-valuemax={mode === "edit" ? 2 : 3}
          aria-valuenow={step}
        >
          <span
            style={{ width: `${(step / (mode === "edit" ? 2 : 3)) * 100}%` }}
          />
        </div>

        {step === 1 ? (
          <section className={styles.step} aria-labelledby="step-title">
            <h1
              id="step-title"
              ref={headingRef}
              tabIndex={-1}
              className={styles.title}
            >
              What do you make?
            </h1>
            <p className={styles.lede}>
              Choose everything that fits. This shapes who you meet.
            </p>
            <div
              className={styles.chips}
              role="group"
              aria-label="Your creative roles"
            >
              {roleOptions.map((role) => {
                const on = roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    className={styles.chip}
                    aria-pressed={on}
                    onClick={() => toggleRole(role)}
                  >
                    {roleLabels[role]}
                  </button>
                );
              })}
            </div>
            {rolesError ? (
              <p className="field-error" role="alert">
                Pick at least one role to continue.
              </p>
            ) : null}
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={continueToDetails}
              >
                Continue · {roles.length} selected
              </button>
            </div>
          </section>
        ) : step === 2 ? (
          <section className={styles.step} aria-labelledby="step-title">
            <h1
              id="step-title"
              ref={headingRef}
              tabIndex={-1}
              className={styles.title}
            >
              Tell people who you are.
            </h1>
            <p className={styles.lede}>
              This is how filmmakers will find you. You can change it later.
            </p>

            <form className={styles.form} onSubmit={onSubmit} noValidate>
              <div className={styles.row}>
                <div className="field">
                  <label className="field-label" htmlFor="full_name">
                    Name
                  </label>
                  <input
                    id="full_name"
                    className="input"
                    autoComplete="name"
                    value={fullName}
                    maxLength={100}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (!handleTouched)
                        setHandle(suggestHandle(e.target.value));
                    }}
                    aria-invalid={errors.full_name ? true : undefined}
                    aria-describedby={
                      errors.full_name ? "full_name-error" : undefined
                    }
                    required
                  />
                  {errors.full_name ? (
                    <span id="full_name-error" className="field-error">
                      {errors.full_name}
                    </span>
                  ) : null}
                </div>

                {mode === "onboarding" &&
                signupHandleProvided &&
                !errors.handle ? (
                  <div className="field">
                    <span className="field-label">Your handle</span>
                    <p>@{handle}</p>
                    <span className="field-hint">
                      From your sign-up username. You can edit your public
                      handle later in Settings.
                    </span>
                  </div>
                ) : (
                  <div className="field">
                    <label className="field-label" htmlFor="handle">
                      Handle
                    </label>
                    <div className={styles.prefixed}>
                      <span aria-hidden="true">@</span>
                      <input
                        id="handle"
                        className="input"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={handle}
                        maxLength={32}
                        onChange={(e) => {
                          setHandleTouched(true);
                          setHandle(
                            e.target.value.toLowerCase().replace(/\s+/g, "_"),
                          );
                        }}
                        aria-invalid={errors.handle ? true : undefined}
                        aria-describedby={
                          errors.handle
                            ? "handle-error handle-hint"
                            : "handle-hint"
                        }
                        required
                      />
                    </div>
                    <span id="handle-hint" className="field-hint">
                      Lowercase letters, numbers and underscores.
                    </span>
                    {errors.handle ? (
                      <span id="handle-error" className="field-error">
                        {errors.handle}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="city">
                  City <span className={styles.optional}>optional</span>
                </label>
                <input
                  id="city"
                  className="input"
                  autoComplete="address-level2"
                  placeholder="e.g. Bengaluru"
                  value={city}
                  maxLength={100}
                  onChange={(e) => setCity(e.target.value)}
                  aria-invalid={errors.location_city ? true : undefined}
                  aria-describedby="city-hint"
                />
                <span id="city-hint" className="field-hint">
                  {errors.location_city ??
                    "Helps people nearby find you for shoots."}
                </span>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="bio">
                  Bio <span className={styles.optional}>optional</span>
                </label>
                <textarea
                  id="bio"
                  className="input"
                  placeholder="What you're working on, the films you love, what you're looking for."
                  value={bio}
                  maxLength={BIO_MAX}
                  onChange={(e) => setBio(e.target.value)}
                  aria-invalid={errors.bio ? true : undefined}
                  aria-describedby="bio-count"
                />
                <span id="bio-count" className="field-hint">
                  {errors.bio ?? `${bio.length} / ${BIO_MAX}`}
                </span>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="skills">
                  Skills &amp; gear{" "}
                  <span className={styles.optional}>optional</span>
                </label>
                <div className={styles.tagInput}>
                  {skills.map((skill) => (
                    <span key={skill} className={styles.tag}>
                      {skill}
                      <button
                        type="button"
                        onClick={() =>
                          setSkills((current) =>
                            current.filter((s) => s !== skill),
                          )
                        }
                        aria-label={`Remove ${skill}`}
                      >
                        <svg
                          aria-hidden="true"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                        >
                          <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  <input
                    id="skills"
                    value={skillDraft}
                    placeholder={
                      skills.length
                        ? "Add another"
                        : "e.g. Sony FX3, DaVinci Resolve, Steadicam"
                    }
                    onChange={(e) => setSkillDraft(e.target.value)}
                    onKeyDown={onSkillKey}
                    onBlur={() => addSkill(skillDraft)}
                    disabled={skills.length >= SKILLS_MAX}
                    aria-describedby="skills-hint"
                  />
                </div>
                <span id="skills-hint" className="field-hint">
                  {errors.skills_gear ??
                    "Press Enter or comma to add each one."}
                </span>
              </div>

              <div aria-live="assertive">
                {saveError ? (
                  <div className="notice notice-error" role="alert">
                    {saveError}
                  </div>
                ) : null}
              </div>

              <div className={styles.actions}>
                <button
                  type="submit"
                  className="btn btn-accent btn-block"
                  disabled={saving}
                >
                  {saving
                    ? "Saving your profile…"
                    : mode === "edit"
                      ? "Save profile"
                      : "Continue to your taste"}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <section className={styles.step} aria-labelledby="step-title">
            <h1
              id="step-title"
              ref={headingRef}
              tabIndex={-1}
              className={styles.title}
            >
              What draws you in?
            </h1>
            <p className={styles.lede}>
              Choose three cinematic references. Start with what you love; your
              taste can grow as you explore.
            </p>
            <form className={styles.form} onSubmit={onSubmit}>
              <div
                className={styles.vibeGrid}
                role="group"
                aria-label="Choose three cinematic references"
              >
                {onboardingChoices.map((choice, index) => {
                  const selected = choices.includes(choice.id);
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      className={styles.vibeCard}
                      data-tone={choice.color}
                      aria-pressed={selected}
                      disabled={saving || (!selected && choices.length === 3)}
                      onClick={() => {
                        setSaveError(null);
                        setChoices((current) =>
                          current.includes(choice.id)
                            ? current.filter((id) => id !== choice.id)
                            : current.length < 3
                              ? [...current, choice.id]
                              : current,
                        );
                      }}
                    >
                      <span className={styles.vibeNumber} aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                        {selected ? " ✓" : ""}
                      </span>
                      <strong>{choice.label}</strong>
                      <span>{choice.detail}</span>
                    </button>
                  );
                })}
              </div>
              <p role="status" className={styles.lede}>
                {choices.length} of 3 selected.{" "}
                {choices.length === 3
                  ? "Deselect a card to change your choices."
                  : "Choose what feels like you."}
              </p>
              <p className="field-hint">
                These are starting preferences, not a test. You can explore
                immediately even while film recommendations are still building.
              </p>
              {saveError ? (
                <div className="notice notice-error" role="alert">
                  {saveError} Your choices are still here.
                </div>
              ) : null}
              <button
                type="submit"
                className="btn btn-accent btn-block"
                disabled={saving || choices.length !== 3}
              >
                {saving ? "Saving your profile…" : "Enter arcenray."}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
