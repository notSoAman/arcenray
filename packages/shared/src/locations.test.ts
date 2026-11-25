import test from "node:test";
import assert from "node:assert/strict";

import {
  createCityLoader,
  searchCities,
  type CityRecord,
} from "@repo/shared/locations";

const cities: CityRecord[] = [
  ["city-1", "Mumbai", "Maharashtra", "India", 1000, ["Bombay"]],
  ["city-2", "Mumbai", "Ohio", "United States", 500, []],
];

function jsonResponse(records: CityRecord[]) {
  return new Response(JSON.stringify(records), {
    headers: { "Content-Type": "application/json" },
  });
}

test("city loader uses the existing web dataset by default", async () => {
  const requestedUrls: string[] = [];
  const loader = createCityLoader(async (url) => {
    requestedUrls.push(String(url));
    return jsonResponse(cities);
  });

  assert.equal((await loader())[0]?.[1], "Mumbai");
  assert.deepEqual(requestedUrls, ["/data/cities-v1.json"]);
});

test("city loader passes an explicit native absolute URL unchanged", async () => {
  const requestedUrls: string[] = [];
  const nativeUrl = "file:///data/native/cities-v1.json";
  const loader = createCityLoader(async (url) => {
    requestedUrls.push(String(url));
    return jsonResponse(cities);
  }, nativeUrl);

  assert.equal((await loader())[1]?.[1], "Mumbai");
  assert.deepEqual(requestedUrls, [nativeUrl]);
});

test("city loader shares successful requests and retries after failure", async () => {
  let requests = 0;
  const loader = createCityLoader(async () => {
    requests += 1;
    if (requests === 1) return new Response("Unavailable", { status: 503 });
    return jsonResponse(cities.slice(0, 1));
  });

  await assert.rejects(loader(), /City suggestions unavailable/);
  const first = loader();
  const second = loader();
  assert.equal(first, second);
  assert.equal((await first).length, 1);
  await loader();
  assert.equal(requests, 2);
});

test("city search keeps existing alias and population ranking", () => {
  assert.equal(searchCities(cities, "Bombay")[0]?.id, "city-1");
  assert.equal(searchCities(cities, "Mumbai")[0]?.id, "city-1");
});
