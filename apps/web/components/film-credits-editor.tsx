"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserApi } from "../lib/client-api";
import styles from "./film-credits.module.css";

type Credit = {
  id: string;
  display_name: string;
  role: string;
  profile_id: string | null;
  verification_state: string;
};

type Person = {
  profile_id: string;
  handle: string;
  full_name: string;
  profile_pic_key: string | null;
};

/** Mount with key={filmId} when switching drafts. RLS enforces ownership. */
export function FilmCreditsEditor({
  filmId,
  viewerId,
  editable = false,
}: {
  filmId: string;
  viewerId: string;
  editable?: boolean;
}) {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [mode, setMode] = useState<"invite" | "manual" | "self">("invite");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async () => {
    const { data, error } = await browserApi()
      .supabase.from("film_credits")
      .select("id,display_name,role,profile_id,verification_state")
      .eq("film_id", filmId)
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  }, [filmId]);
  const reload = useCallback(async () => setCredits(await load()), [load]);
  useEffect(() => {
    let active = true;
    void load()
      .then((data) => {
        if (active) setCredits(data);
      })
      .catch(() => {
        if (active) setError("Couldn’t load credits. Try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    let active = true;
    const search = query.trim().replace(/^@/, "");
    if (mode !== "invite" || selected || search.length < 2) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { data, error } = await browserApi().credits.search(search);
          if (!active) return;
          if (error) throw error;
          setPeople(
            (data ?? []).filter((person) => person.profile_id !== viewerId),
          );
        } catch {
          if (active) setSearchError("Couldn’t search people. Try again.");
        } finally {
          if (active) setSearching(false);
        }
      })();
    }, 300);
    return () => {
      clearTimeout(timer);
      active = false;
    };
  }, [query, mode, selected, viewerId]);

  async function add() {
    if (lock.current || !editable || loading) return;
    const displayName = name.trim();
    const creditRole = role.trim();
    if (
      !creditRole ||
      (mode === "invite" ? !selected : mode === "manual" && !displayName)
    ) {
      setError("Choose a collaborator or enter a name, and add their role.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const profileId =
        mode === "invite"
          ? selected!.profile_id
          : mode === "self"
            ? viewerId
            : null;
      if (
        credits.some(
          (credit) =>
            credit.role.toLowerCase() === creditRole.toLowerCase() &&
            (profileId
              ? credit.profile_id === profileId
              : !credit.profile_id &&
                credit.display_name.toLowerCase() ===
                  displayName.toLowerCase()),
        )
      ) {
        throw new Error("That person already has this role in the credits.");
      }
      let selfName = "";
      if (mode === "self") {
        const result = await browserApi()
          .supabase.from("profiles")
          .select("full_name")
          .eq("id", viewerId)
          .single();
        if (result.error || !result.data)
          throw new Error("Couldn’t load your profile. Try again.");
        selfName = result.data.full_name;
      }
      const { error } =
        mode === "invite"
          ? await browserApi().credits.invite(
              filmId,
              selected!.profile_id,
              creditRole,
            )
          : await browserApi()
              .supabase.from("film_credits")
              .insert({
                film_id: filmId,
                profile_id: profileId,
                display_name: mode === "self" ? selfName : displayName,
                role: creditRole,
              });
      if (error)
        throw new Error(
          "Couldn’t add this credit. Check the details and try again.",
        );
      await reload();
      setName("");
      setRole("");
      setQuery("");
      setSelected(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn’t save credits. Try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (lock.current || !editable) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await browserApi()
        .supabase.from("film_credits")
        .delete()
        .eq("id", id)
        .eq("film_id", filmId)
        .eq("verification_state", "pending")
        .select("id");
      if (error || !data?.length)
        throw new Error("Couldn’t remove this credit. Reload and try again.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn’t remove credit.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      className={styles.panel}
      aria-label="Film credits"
      aria-busy={busy || loading}
    >
      <h2>Film credits</h2>
      <p className={styles.muted}>
        Credit your collaborators. Registered creatives receive an invitation
        and confirm their role, even while the film is a draft. Your own and
        manually entered credits remain unverified.
      </p>
      {loading ? (
        <p role="status">Loading credits…</p>
      ) : credits.length ? (
        <ul className={styles.list}>
          {credits.map((credit) => (
            <li key={credit.id}>
              <div>
                <strong>{credit.display_name}</strong>
                <span>
                  {credit.role} ·{" "}
                  {credit.verification_state === "accepted"
                    ? "Confirmed by creative"
                    : credit.verification_state === "declined"
                      ? "Declined"
                      : credit.profile_id === viewerId
                        ? "Unverified self-credit"
                        : credit.profile_id
                          ? "Awaiting confirmation"
                          : "Unverified"}
                </span>
              </div>
              {editable && credit.verification_state === "pending" ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void remove(credit.id)}
                  aria-label={`${credit.profile_id && credit.profile_id !== viewerId ? "Cancel invitation for" : "Remove"} ${credit.display_name}, ${credit.role}`}
                >
                  {credit.profile_id && credit.profile_id !== viewerId
                    ? "Cancel invitation"
                    : "Remove"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No credits added yet.</p>
      )}
      {editable ? (
        <div className={styles.fields}>
          <div className={styles.actions} aria-label="Credit type">
            {(
              [
                ["invite", "Invite a creative"],
                ["manual", "Add someone without an account"],
                ["self", "Credit myself"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="btn btn-ghost"
                aria-pressed={mode === value}
                disabled={busy}
                onClick={() => {
                  setMode(value);
                  setSelected(null);
                  setQuery("");
                  setPeople([]);
                  setSearching(false);
                  setSearchError("");
                  setError("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "invite" ? (
            <div>
              <label>
                Find a creative by name or handle
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelected(null);
                    setPeople([]);
                    setSearchError("");
                    setSearching(
                      event.target.value.trim().replace(/^@/, "").length >= 2,
                    );
                  }}
                  maxLength={80}
                  disabled={busy}
                  autoComplete="off"
                  autoCapitalize="none"
                  placeholder="Search name or @handle"
                  aria-describedby="credit-search-hint"
                />
              </label>
              <p id="credit-search-hint" className={styles.muted}>
                Type at least two characters, then choose a person.
              </p>
              {selected ? (
                <p className={styles.selected}>
                  Invitation for <strong>{selected.full_name}</strong> @
                  {selected.handle}
                </p>
              ) : null}
              {searching ? (
                <p role="status" className={styles.muted}>
                  Searching people…
                </p>
              ) : null}
              {searchError ? (
                <p role="alert" className={styles.error}>
                  {searchError}
                </p>
              ) : null}
              {!selected &&
              !searching &&
              !searchError &&
              query.trim().replace(/^@/, "").length >= 2 &&
              !people.length ? (
                <p role="status" className={styles.muted}>
                  No matching creatives.
                </p>
              ) : null}
              {people.length ? (
                <ul className={styles.results} aria-label="Matching creatives">
                  {people.map((person) => (
                    <li key={person.profile_id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setSelected(person);
                          setQuery(`@${person.handle}`);
                          setPeople([]);
                          setSearching(false);
                        }}
                      >
                        <strong>{person.full_name}</strong>
                        <span>@{person.handle}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : mode === "manual" ? (
            <label>
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                disabled={busy}
                autoComplete="off"
              />
            </label>
          ) : (
            <p className={styles.muted}>
              Your contribution will be linked to your profile as an unverified
              self-credit.
            </p>
          )}
          <label>
            Role
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              maxLength={80}
              disabled={busy}
              placeholder="e.g. Cinematographer"
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={
              busy ||
              loading ||
              !role.trim() ||
              (mode === "invite"
                ? !selected
                : mode === "manual" && !name.trim())
            }
            onClick={() => void add()}
          >
            {busy
              ? "Saving…"
              : mode === "invite"
                ? "Send credit invitation"
                : "Add credit"}
          </button>
        </div>
      ) : null}
      {error ? (
        <div role="alert" className={styles.error}>
          {error}{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              setLoading(true);
              void reload()
                .catch(() => setError("Couldn’t load credits. Try again."))
                .finally(() => setLoading(false));
            }}
          >
            Reload credits
          </button>
        </div>
      ) : null}
    </section>
  );
}
