"use client";

import { profileInputSchema } from "@repo/shared";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { browserApi } from "../../lib/client-api";
import type { ViewerProfile } from "../../lib/session";
import { Avatar } from "../../components/media";
import { ProfilePhotoPicker } from "../../components/profile-photo-picker";
import { roleLabels, roleOptions, type CreativeRole } from "../../lib/roles";
import { LocationInput } from "../../components/location-input";
import styles from "./settings.module.css";

export function ProfileSettings({ initial }: { initial: ViewerProfile }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [skills, setSkills] = useState(initial.skills_gear.join(", "));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || lock.current) return;
    const input = profileInputSchema.safeParse({
      full_name: draft.full_name.trim(),
      handle: draft.handle.trim().toLowerCase(),
      bio: draft.bio.trim(),
      location_city: draft.location_city?.trim() || null,
      roles: draft.roles,
      skills_gear: [
        ...new Set(
          skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ],
      onboarding_completed: saved.onboarding_completed,
    });
    setError("");
    setMessage("");
    if (!input.success) {
      setError(
        input.error.issues
          .map((i) => `${i.path.join(" ")}: ${i.message}`)
          .join(" "),
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const api = browserApi();
      const result = await api.profiles.update(input.data);
      if (result.error) {
        if (result.error.code === "23505")
          throw new Error("That handle is taken. Choose another handle.");
        throw new Error(
          "Your profile details could not be saved. Please retry.",
        );
      }
      const next = { ...saved, ...input.data };
      setSaved(next);
      setDraft(next);
      setSkills(next.skills_gear.join(", "));
      setEditing(false);
      setMessage("Profile updated.");
      void api.index("profile", saved.id).catch(() => undefined);
      router.refresh();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not save your profile. Please retry.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="profile-settings-title">
      <div className={styles.sectionHeading}>
        <h2 id="profile-settings-title">Your profile</h2>
        {!editing ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setDraft(saved);
              setSkills(saved.skills_gear.join(", "));
              setError("");
              setMessage("");
              setEditing(true);
              requestAnimationFrame(() => nameInput.current?.focus());
            }}
          >
            Edit
          </button>
        ) : null}
      </div>
      <form onSubmit={save}>
        <div className={styles.photoRow}>
          <Avatar
            picKey={saved.profile_pic_key}
            name={saved.full_name || saved.handle}
            size={88}
          />
          <span>
            {saved.full_name}
            <br />@{saved.handle}
          </span>
        </div>
        <fieldset disabled={busy} className={styles.profileFields}>
          <label className={styles.field}>
            Name
            <input
              ref={nameInput}
              value={draft.full_name}
              readOnly={!editing}
              maxLength={100}
              autoComplete="name"
              onChange={(e) =>
                setDraft({ ...draft, full_name: e.target.value })
              }
              required
            />
          </label>
          <label className={styles.field}>
            Handle
            <input
              value={draft.handle}
              readOnly={!editing}
              minLength={3}
              maxLength={32}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              pattern="[a-z0-9_]{3,32}"
              onChange={(e) =>
                setDraft({ ...draft, handle: e.target.value.toLowerCase() })
              }
              required
            />
            <span className="field-hint">
              3–32 lowercase letters, numbers or underscores. Changing this
              changes your profile link.
            </span>
          </label>
          <label className={styles.field}>
            Location
            <LocationInput
              value={draft.location_city ?? ""}
              readOnly={!editing}
              maxLength={100}
              autoComplete="address-level2"
              onValueChange={(value) =>
                setDraft({ ...draft, location_city: value })
              }
            />
          </label>
          <label className={styles.field}>
            Bio
            <textarea
              value={draft.bio}
              readOnly={!editing}
              maxLength={2000}
              rows={4}
              onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            Skills &amp; gear
            <textarea
              value={skills}
              readOnly={!editing}
              maxLength={2500}
              rows={3}
              onChange={(e) => setSkills(e.target.value)}
            />
            <span className="field-hint">
              Separate each skill or item with a comma. Up to 30 items.
            </span>
          </label>
          <div className={styles.field}>
            <span>Creative roles</span>
            <div
              className={styles.roleChoices}
              role="group"
              aria-label="Creative roles"
            >
              {roleOptions.map((role) => (
                <label key={role} className={styles.roleChoice}>
                  <input
                    type="checkbox"
                    checked={draft.roles.includes(role)}
                    disabled={!editing || busy}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        roles: e.target.checked
                          ? [...draft.roles, role]
                          : draft.roles.filter((r) => r !== role),
                      })
                    }
                  />
                  {roleLabels[role as CreativeRole]}
                </label>
              ))}
            </div>
          </div>
          {editing ? (
            <div className={styles.field}>
              <span>Profile photo</span>
              <ProfilePhotoPicker
                name={saved.full_name || saved.handle}
                picKey={saved.profile_pic_key}
                disabled={busy}
                onUploaded={(key) => {
                  setSaved((current) => ({ ...current, profile_pic_key: key }));
                  setDraft((current) => ({ ...current, profile_pic_key: key }));
                  setMessage("Profile photo updated.");
                }}
              />
            </div>
          ) : null}
        </fieldset>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <p role="status">{message}</p>
        {editing ? (
          <div className={styles.actions}>
            <button className="btn btn-accent" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setDraft(saved);
                setSkills(saved.skills_gear.join(", "));
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
