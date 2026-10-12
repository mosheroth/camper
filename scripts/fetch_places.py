"""Collect named places around the camps: INPA parks and OpenStreetMap landmarks.

Parks and reserves come from the public parks.org.il reserve-park pages, with
the published entrance coordinate. Springs, waterfalls, viewpoints and peaks
come from OpenStreetMap nodes that already have a Hebrew name. Nothing here is
a drawn trail, and unnamed nodes are left out. OSM data is ODbL.

Writes data/places.json. Re-running is safe; the raw Overpass reply is cached
in data/.osm-places-cache.json.
"""

import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.classify import plain_text  # noqa: E402
from scripts.fetch_inpa import API, UA, coords_from_acf, title_of  # noqa: E402
from scripts.geo import haversine_km  # noqa: E402
from scripts.osm_routes import OVERPASS, specific_tokens  # noqa: E402

CACHE = ROOT / "data" / ".osm-places-cache.json"
OUT = ROOT / "data" / "places.json"
NEAR_CAMP_KM = 18
OSM_UA = "CamperWeekend/0.1 (static weekend planner; OpenStreetMap ODbL)"
_HEBREW = re.compile(r"[א-ת]")
_GENERIC = {
    "מעיין", "עין", "מצפור", "תצפית", "מצפה", "פסגה", "מפל", "הר", "גבעה",
    "שמורה", "גן", "פארק", "נקודה", "בריכה",
}
_KIND_ORDER = {
    "waterfall": 0,
    "spring": 1,
    "viewpoint": 2,
    "park": 3,
    "reserve": 4,
    "beach": 5,
    "peak": 6,
}


def hebrew_name(tags):
    """A specific Hebrew label, or None when the node is unnamed or generic."""
    tags = tags or {}
    preferred = plain_text(tags.get("name:he") or "")
    fallback = plain_text(tags.get("name") or "")
    chosen = preferred if _HEBREW.search(preferred) else fallback
    chosen = chosen.strip()
    if not _HEBREW.search(chosen) or len(chosen) < 2:
        return None
    bare = re.sub(r"^[ה]", "", chosen)
    if chosen in _GENERIC or bare in _GENERIC:
        return None
    return chosen


def osm_kind(tags):
    tags = tags or {}
    if tags.get("waterway") == "waterfall" or tags.get("natural") == "waterfall":
        return "waterfall"
    if tags.get("natural") == "spring":
        return "spring"
    if tags.get("tourism") == "viewpoint":
        return "viewpoint"
    if tags.get("natural") == "peak":
        return "peak"
    return None


def park_kind(name, acf):
    acf = acf or {}
    if acf.get("National_Park_s"):
        return "park"
    if acf.get("Beach_s") and "שמור" not in (name or ""):
        return "beach"
    return "reserve"


def _fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = json.load(response)
        return payload, response.headers


def fetch_parks():
    page = 1
    total_pages = 1
    places = []
    while page <= total_pages:
        url = f"{API}/rp?per_page=100&page={page}&_fields=id,title,link,acf"
        payload, headers = _fetch_json(url)
        total_pages = int(headers.get("X-WP-TotalPages") or 1)
        for item in payload:
            acf = item.get("acf") or {}
            if not isinstance(acf, dict):
                continue
            lat, lng = coords_from_acf(acf)
            name = title_of(item)
            if lat is None or lng is None or not name:
                continue
            if not (29.4 <= lat <= 33.4 and 34.2 <= lng <= 35.95):
                continue
            places.append({
                "id": f"r{item['id']}",
                "name": name,
                "kind": park_kind(name, acf),
                "lat": round(lat, 5),
                "lng": round(lng, 5),
                "url": item.get("link"),
                "source": "inpa",
            })
        page += 1
        time.sleep(0.2)
    return places


def fetch_osm_elements():
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    query = """
[out:json][timeout:90];
(
  node["tourism"="viewpoint"]["name"](29.45,34.22,33.40,35.95);
  node["natural"="spring"]["name"](29.45,34.22,33.40,35.95);
  node["natural"="waterfall"]["name"](29.45,34.22,33.40,35.95);
  node["waterway"="waterfall"]["name"](29.45,34.22,33.40,35.95);
  node["natural"="peak"]["name"](29.45,34.22,33.40,35.95);
);
out;
""".strip()
    request = urllib.request.Request(
        OVERPASS,
        data=query.encode("utf-8"),
        headers={"User-Agent": OSM_UA, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.load(response)
    elements = payload.get("elements") or []
    CACHE.write_text(json.dumps(elements, ensure_ascii=False), encoding="utf-8")
    return elements


def osm_places(elements):
    found = []
    for element in elements or []:
        if element.get("type") != "node":
            continue
        tags = element.get("tags") or {}
        kind = osm_kind(tags)
        name = hebrew_name(tags)
        lat = element.get("lat")
        lng = element.get("lon")
        if not kind or not name or lat is None or lng is None:
            continue
        if not (29.4 <= lat <= 33.4 and 34.2 <= lng <= 35.95):
            continue
        found.append({
            "id": f"o{element['id']}",
            "name": name,
            "kind": kind,
            "lat": round(float(lat), 5),
            "lng": round(float(lng), 5),
            "url": f"https://www.openstreetmap.org/node/{element['id']}",
            "source": "osm",
        })
    found.sort(key=lambda place: (_KIND_ORDER.get(place["kind"], 9), place["name"]))
    kept = []
    for place in found:
        if any(
            other["name"] == place["name"]
            and haversine_km(other["lat"], other["lng"], place["lat"], place["lng"]) <= 0.12
            for other in kept
        ):
            continue
        kept.append(place)
    return kept


def drop_osm_covered_by_parks(parks, osm):
    indexed = [(set(specific_tokens(park["name"])), park) for park in parks]
    kept = []
    for place in osm:
        tokens = set(specific_tokens(place["name"]))
        covered = False
        if tokens:
            for park_tokens, park in indexed:
                if not tokens.intersection(park_tokens):
                    continue
                if haversine_km(park["lat"], park["lng"], place["lat"], place["lng"]) <= 0.2:
                    covered = True
                    break
        if not covered:
            kept.append(place)
    return kept


def near_any_camp(places, camps, max_km=NEAR_CAMP_KM):
    points = [(camp["lat"], camp["lng"]) for camp in camps if camp.get("lat") is not None]
    kept = []
    for place in places:
        if any(
            haversine_km(lat, lng, place["lat"], place["lng"]) <= max_km
            for lat, lng in points
        ):
            kept.append(place)
    return kept


def main():
    print("fetching parks…")
    parks = fetch_parks()
    print("parks with a coordinate:", len(parks))
    print("fetching landmarks…")
    osm = drop_osm_covered_by_parks(parks, osm_places(fetch_osm_elements()))
    camps = json.loads((ROOT / "data" / "camps.json").read_text(encoding="utf-8"))
    places = near_any_camp(parks + osm, camps)
    places.sort(key=lambda place: (place["kind"], place["name"]))
    OUT.write_text(json.dumps(places, ensure_ascii=False, indent=2), encoding="utf-8")
    meta_path = ROOT / "data" / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    counts = meta.setdefault("counts", {})
    counts["places"] = len(places)
    meta["placesFetchedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    kinds = {}
    for place in places:
        kinds[place["kind"]] = kinds.get(place["kind"], 0) + 1
    print(json.dumps({"places": len(places), "kinds": kinds}, ensure_ascii=False))


if __name__ == "__main__":
    main()
