#!/usr/bin/env python3
"""Refresh the attributed city-only autocomplete index; no runtime API is used."""
import csv
import datetime
import io
import json
from pathlib import Path
import urllib.request
import zipfile

BASE = "https://download.geonames.org/export/dump/"
OUT = Path(__file__).resolve().parents[1] / "apps/web/public/data"


def download(name):
    request = urllib.request.Request(BASE + name, headers={"User-Agent": "Arcenray-city-index/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def main():
    countries = {}
    for row in csv.reader(io.StringIO(download("countryInfo.txt").decode()), delimiter="\t"):
        if row and not row[0].startswith("#"):
            countries[row[0]] = row[4]
    regions = {}
    for row in csv.reader(io.StringIO(download("admin1CodesASCII.txt").decode()), delimiter="\t"):
        if len(row) >= 3:
            regions[row[0]] = row[1]
    archive = zipfile.ZipFile(io.BytesIO(download("cities15000.zip")))
    records = []
    for row in csv.reader(io.StringIO(archive.read("cities15000.txt").decode()), delimiter="\t"):
        name = row[1]
        if len(name) > 100:
            continue
        aliases = list(dict.fromkeys([row[2]] + [s for s in row[3].split(",") if s.isascii() and len(s) <= 60]))
        aliases = [s for s in aliases if s and s.casefold() != name.casefold()][:12]
        records.append([row[0], name, regions.get(row[8] + "." + row[10], ""), countries.get(row[8], row[8]), int(row[14]), aliases])
    records.sort(key=lambda city: (-city[4], city[0]))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "cities-v1.json").write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n")
    metadata = {"source": "GeoNames cities15000", "source_urls": [BASE + name for name in ["cities15000.zip", "admin1CodesASCII.txt", "countryInfo.txt"]], "retrieved": datetime.date.today().isoformat(), "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/", "attribution": "Contains GeoNames data (https://www.geonames.org/), licensed under CC BY 4.0.", "records": len(records), "columns": ["id", "city", "region", "country", "population", "aliases"], "limitations": "City suggestions, not addresses or live geolocation. Coverage follows cities15000. Existing location_city fields store only the canonical city name; region/country disambiguate suggestions but are not persisted."}
    (OUT / "cities-source.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(records)} city records")


if __name__ == "__main__":
    main()
