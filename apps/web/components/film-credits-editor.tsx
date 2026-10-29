"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserApi } from "../lib/client-api";
import styles from "./film-credits.module.css";

type Credit = {
  id: string;
  display_name: string;
  role: string;
  profile_id: string | null;
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
  const [mode, setMode] = useState<"registered" | "manual" | "self">(
    "registered",
  );
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
      .select("id,display_name,role,profile_id")
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
    if (mode !== "registered" || selected || search.length < 2) return;
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
      (mode === "registered" ? !selected : mode === "manual" && !displayName)
    ) {
      setError("Choose a collaborator or enter a name, and add their role.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const profileId =
        mode === "registered"
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
      const { error } = await browserApi()
        .supabase.from("film_credits")
        .insert({
          film_id: filmId,
          profile_id: profileId,
          display_name:
            mode === "registered"
              ? selected!.full_name.trim() || selected!.handle
              : mode === "self"
                ? selfName
                : displayName,
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
        Add the people and roles that helped make this film.
      </p>
      {loading ? (
        <p role="status">Loading credits…</p>
      ) : credits.length ? (
        <ul className={styles.list}>
          {credits.map((credit) => (
            <li key={credit.id}>
              <div>
                <strong>{credit.display_name}</strong>
                <span>{credit.role}</span>
              </div>
              {editable ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void remove(credit.id)}
                  aria-label={`Remove ${credit.display_name}, ${credit.role}`}
                >
                  Remove
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
                ["registered", "Add a registered creative"],
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
          {mode === "registered" ? (
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
                Type at least two characters, then choose a person. Credits are
                added to the film and their profile immediately.
              </p>
              {selected ? (
                <p className={styles.selected}>
                  Credit <strong>{selected.full_name}</strong> @
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
              Your profile will appear in this film’s credits under this role.
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
              (mode === "registered"
                ? !selected
                : mode === "manual" && !name.trim())
            }
            onClick={() => void add()}
          >
            {busy
              ? "Saving…"
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
