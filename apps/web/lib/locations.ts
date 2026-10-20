/** GeoNames city-only index. Stored values intentionally retain the existing city contract. */
export type CityRecord = [
  id: string,
  city: string,
  region: string,
  country: string,
  population: number,
  aliases: string[],
];
export type CitySuggestion = { id: string; value: string; label: string };
export function normalizeLocation(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
const preparedIndexes = new WeakMap<
  CityRecord[],
  { city: CityRecord; names: string[]; all: string }[]
>();
function prepareIndex(cities: CityRecord[]) {
  let prepared = preparedIndexes.get(cities);
  if (!prepared) {
    prepared = cities.map((city) => ({
      city,
      names: [city[1], ...city[5]].map(normalizeLocation),
      all: normalizeLocation([city[1], city[2], city[3], ...city[5]].join(" ")),
    }));
    preparedIndexes.set(cities, prepared);
  }
  return prepared;
}
export function searchCities(
  cities: CityRecord[],
  query: string,
  limit = 8,
): CitySuggestion[] {
  const needle = normalizeLocation(query).slice(0, 100);
  if (needle.length < 2) return [];
  const tokens = needle.split(/[\s,]+/).filter(Boolean);
  const matches: { city: CityRecord; score: number }[] = [];
  for (const { city, names, all } of prepareIndex(cities)) {
    if (!tokens.every((token) => all.includes(token))) continue;
    const score = names.includes(needle)
      ? 0
      : names.some((name) => name.startsWith(needle))
        ? 1
        : 2;
    matches.push({ city, score });
  }
  return matches
    .sort(
      (a, b) =>
        a.score - b.score ||
        b.city[4] - a.city[4] ||
        a.city[0].localeCompare(b.city[0]),
    )
    .slice(0, Math.max(0, Math.min(10, Math.floor(limit))))
    .map(({ city }) => ({
      id: city[0],
      value: city[1],
      label: [...new Set([city[1], city[2], city[3]].filter(Boolean))].join(
        ", ",
      ),
    }));
}

/** One successful fetch per page session; failed requests remain retryable. */
export function createCityLoader(fetcher: typeof fetch = fetch) {
  let pending: Promise<CityRecord[]> | undefined;
  return function loadCities(): Promise<CityRecord[]> {
    pending ??= fetcher("/data/cities-v1.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("City suggestions unavailable");
        return (await response.json()) as CityRecord[];
      })
      .catch((error) => {
        pending = undefined;
        throw error;
      });
    return pending;
  };
}
