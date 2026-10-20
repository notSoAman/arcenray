import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createCityLoader,
  searchCities,
  type CityRecord,
} from "./locations.ts";
const cities = JSON.parse(
  readFileSync(
    new URL("../public/data/cities-v1.json", import.meta.url),
    "utf8",
  ),
) as CityRecord[];
test("real city index resolves common aliases to canonical stored city names", () => {
  assert.equal(searchCities(cities, "Bombay")[0]?.value, "Mumbai");
  assert.equal(searchCities(cities, "Bangalore")[0]?.value, "Bengaluru");
});
test("accent-insensitive search and country disambiguation work", () => {
  assert.ok(searchCities(cities, "Sao Paulo")[0]?.label.includes("Brazil"));
  assert.ok(
    searchCities(cities, "London Canada").every((city) =>
      city.label.includes("Canada"),
    ),
  );
  assert.ok(searchCities(cities, "London Canada").length > 0);
});
test("suggestions are bounded, literal, and never require selection", () => {
  assert.deepEqual(searchCities(cities, "a"), []);
  assert.deepEqual(searchCities(cities, "%_"), []);
  assert.ok(searchCities(cities, "San", 500).length <= 10);
  assert.deepEqual(searchCities(cities, "Some tiny place not indexed"), []);
});
test("source data is valid, canonical names fit existing contract and IDs are unique", () => {
  assert.ok(cities.length > 25000);
  assert.equal(new Set(cities.map((city) => city[0])).size, cities.length);
  assert.ok(
    cities.every(
      (city) =>
        city[1].length > 0 &&
        city[1].length <= 100 &&
        city[3] &&
        Number.isFinite(city[4]),
    ),
  );
});

test("city loader shares successful requests and retries after failure", async () => {
  let requests = 0;
  const loader = createCityLoader(async () => {
    requests += 1;
    if (requests === 1) return new Response("Unavailable", { status: 503 });
    return new Response(JSON.stringify(cities.slice(0, 2)), {
      headers: { "Content-Type": "application/json" },
    });
  });
  await assert.rejects(loader(), /City suggestions unavailable/);
  const first = loader();
  const second = loader();
  assert.equal(first, second);
  assert.equal((await first).length, 2);
  await loader();
  assert.equal(requests, 2);
});
