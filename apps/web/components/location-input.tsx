"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type InputHTMLAttributes,
} from "react";
import {
  createCityLoader,
  searchCities,
  type CityRecord,
} from "../lib/locations";
import styles from "./location-input.module.css";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value" | "defaultValue"
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};
const loadCities = createCityLoader();

export function LocationInput({
  value,
  defaultValue = "",
  onValueChange,
  readOnly,
  disabled,
  id,
  ...props
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-suggestions`;
  const [internal, setInternal] = useState(defaultValue);
  const text = value ?? internal;
  const [cities, setCities] = useState<CityRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const suggestions = useMemo(() => searchCities(cities, text), [cities, text]);
  const expanded = open && !readOnly && !disabled && text.trim().length >= 2;
  useEffect(() => {
    if (!expanded || cities.length) return;
    let cancelled = false;
    loadCities()
      .then((data) => {
        if (!cancelled) setCities(data);
      })
      .catch(() => {
        if (!cancelled)
          setStatus("Suggestions unavailable. You can still type your city.");
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, cities.length]);
  function change(next: string) {
    setInternal(next);
    onValueChange?.(next);
    setActive(-1);
  }
  function select(index: number) {
    const choice = suggestions[index];
    if (choice) {
      change(choice.value);
      setOpen(false);
    }
  }
  return (
    <div
      className={styles.root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <input
        {...props}
        id={inputId}
        value={text}
        readOnly={readOnly}
        disabled={disabled}
        maxLength={props.maxLength ?? 100}
        autoComplete="off"
        role={readOnly ? undefined : "combobox"}
        aria-autocomplete={readOnly ? undefined : "list"}
        aria-expanded={readOnly ? undefined : expanded}
        aria-controls={readOnly ? undefined : listId}
        aria-activedescendant={
          expanded && active >= 0 && suggestions[active]
            ? `${listId}-${active}`
            : undefined
        }
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          change(event.target.value);
          setOpen(true);
          setStatus("");
        }}
        onKeyDown={(event) => {
          if (readOnly || disabled) return;
          if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (suggestions.length)
              setActive((current) =>
                event.key === "ArrowDown"
                  ? (current + 1) % suggestions.length
                  : (current <= 0 ? suggestions.length : current) - 1,
              );
          }
          if (event.key === "Enter" && expanded && active >= 0) {
            event.preventDefault();
            select(active);
          }
        }}
      />
      {expanded ? (
        <div className={styles.popup}>
          <ul
            id={listId}
            role="listbox"
            aria-label="City suggestions"
            className={styles.list}
          >
            {suggestions.map((city, index) => (
              <li
                key={city.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? styles.active : undefined}
                onPointerDown={(event) => {
                  event.preventDefault();
                  select(index);
                }}
                onPointerMove={() => setActive(index)}
              >
                {city.label}
              </li>
            ))}
          </ul>
          <span className={styles.hint} role="status">
            {status ||
              (cities.length
                ? suggestions.length
                  ? "Choose a city or keep your own entry."
                  : "No matching city. You can enter it manually."
                : "Loading city suggestions…")}
          </span>
          <a
            className={styles.attribution}
            href="https://www.geonames.org/"
            target="_blank"
            rel="noreferrer"
          >
            City data: GeoNames · CC BY 4.0
          </a>
        </div>
      ) : null}
    </div>
  );
}
