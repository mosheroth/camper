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
from scripts.fetch_inpa import API, UA, clip, coords_from_acf, fetch_json, paid_prices, title_of  # noqa: E402
from scripts.geo import haversine_km  # noqa: E402
from scripts.osm_routes import OVERPASS, specific_tokens  # noqa: E402
from scripts.photos import _from_image_dict, merge_photos, photos_from_media  # noqa: E402

CACHE = ROOT / "data" / ".osm-places-cache.json"
FACT_CACHE = ROOT / "data" / ".inpa-place-cache.json"
VISIT_BUCKETS = (
    ("Up_To_Two_Hours_s", 1.0, 2.0, "עד שעתיים"),
    ("Two_To_Four_Hours_s", 2.0, 4.0, "שעתיים עד ארבע"),
    ("Half_Day_s", 4.0, 5.0, "חצי יום"),
    ("A_Day_s", 6.0, 8.0, "יום"),
    ("Two_Days_s", 16.0, 32.0, "יומיים"),
)
_BANNER = ("באנר", "נרשמת", "הרשמה")
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


def visit_span(acf):
    """Official visit-length bucket, or empty when the page doesn't mark one."""
    acf = acf or {}
    chosen = [bucket for bucket in VISIT_BUCKETS if acf.get(bucket[0])]
    if not chosen:
        return None, None, ""
    # Several boxes ticked means the site suits more than one length.
    # The schedule uses the shortest marked visit; a longer stay is still possible.
    low, high, label = chosen[0][1], chosen[0][2], chosen[0][3]
    if len(chosen) > 1:
        label = f"{label} או יותר"
    return low, high, label


def entrance_price(rows):
    """Adult entrance price, skipping group and subscriber rows."""
    for row in rows or []:
        label = (row.get("label") or "").strip()
        if label != "מבוגר":
            continue
        match = re.search(r"(\d+(?:\.\d+)?)", str(row.get("price") or "").replace(",", ""))
        if not match:
            continue
        amount = float(match.group(1))
        return int(amount) if amount.is_integer() else amount
    return None


def entrance_paid(acf, price):
    """True, False, or None when the page doesn't say if entry costs money."""
    acf = acf or {}
    if acf.get("No_Charge_s"):
        return False
    payment = acf.get("map_filters_payment") or {}
    if payment.get("paid_f") or acf.get("Entrance_Fee_Map_s") or price is not None:
        return True
    if payment.get("not_paid_f"):
        return False
    return None


def visit_tags(acf):
    """Short labels from the official map flags, not from the article text."""
    acf = acf or {}
    what = acf.get("map_filters_what_there") or {}
    payment = acf.get("map_filters_payment") or {}
    tags = []
    if acf.get("Wild_Animals_s"):
        tags.append("חיות בר")
    if acf.get("pre_coordination_s"):
        tags.append("בתיאום מראש")
    if acf.get("accessibility_s") or acf.get("Wheelchair_Access_s") or acf.get("They_Have_Trouble_Walking_s"):
        tags.append("מונגש")
    if acf.get("Baby_Carriage_s"):
        tags.append("עגלה")
    if what.get("viewpoint_f"):
        tags.append("תצפית")
    if acf.get("water_s") or what.get("water_access_f"):
        tags.append("מים")
    if acf.get("Blossom_s") or what.get("blooming_f"):
        tags.append("פריחה")
    if acf.get("Caves_s") or what.get("caves_f"):
        tags.append("מערות")
    if acf.get("Archeology_s") or what.get("archaeology_f"):
        tags.append("ארכיאולוגיה")
    if acf.get("Easy_s"):
        tags.append("קל")
    if acf.get("Dog_s"):
        tags.append("כלבים")
    if payment.get("free_matmon_f"):
        tags.append("מטמון")
    return tags[:4]


def _banner(text):
    blob = text or ""
    return any(word in blob for word in _BANNER)


def place_photos(acf, media):
    photos = []
    seen = set()
    image = (acf or {}).get("map_images")
    if isinstance(image, dict):
        blob = " ".join(str(image.get(key) or "") for key in ("url", "alt", "title", "caption"))
        if not _banner(blob):
            _from_image_dict(photos, seen, image)
    extras = []
    for photo in photos_from_media(media):
        if _banner(f"{photo.get('src') or ''} {photo.get('credit') or ''}"):
            continue
        extras.append(photo)
    return merge_photos(photos, extras)[:6]


def visit_facts(acf, media=None):
    """Facts a visit card can show: fee, length, tags, photos, and the short map line."""
    acf = acf or {}
    prices = [
        {"label": row["label"], "price": row["price"]}
        for row in paid_prices(acf)[:6]
    ]
    price = entrance_price(prices)
    low, high, duration = visit_span(acf)
    photos = place_photos(acf, media)
    arrival = ""
    rows = acf.get("rp_info_arrive")
    if isinstance(rows, list):
        chunks = []
        for row in rows:
            if isinstance(row, dict):
                chunks.append(row.get("rp_info_arriveDesc") or "")
        arrival = clip(" ".join(chunks), 160)
    return {
        "paid": entrance_paid(acf, price),
        "priceFrom": price,
        "prices": prices,
        "hoursMin": low,
        "hoursMax": high,
        "duration": duration,
        "tags": visit_tags(acf),
        "accessible": bool(acf.get("accessibility_s") or acf.get("Wheelchair_Access_s")),
        "booking": bool(acf.get("pre_coordination_s")),
        "blurb": clip(acf.get("map_description") or "", 220),
        "arrival": arrival,
        "photos": photos,
        "image": photos[0]["src"] if photos else None,
    }


def _wp_id(place_id):
    match = re.fullmatch(r"r(\d+)", str(place_id or ""))
    return int(match.group(1)) if match else None


def load_fact_cache():
    if not FACT_CACHE.exists():
        return {}
    try:
        payload = json.loads(FACT_CACHE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def fetch_place_record(wp_id, cache):
    key = str(wp_id)
    if key in cache and isinstance(cache[key], dict) and "acf" in cache[key]:
        return cache[key]
    page, _headers = fetch_json(f"{API}/rp/{wp_id}?_fields=id,acf")
    time.sleep(0.12)
    try:
        media, _headers = fetch_json(
            f"{API}/media?parent={wp_id}&per_page=12"
            "&_fields=source_url,alt_text,caption,mime_type,media_details"
        )
    except RuntimeError:
        media = []
    time.sleep(0.12)
    record = {"acf": page.get("acf") or {}, "media": media if isinstance(media, list) else []}
    cache[key] = record
    return record


def enrich_inpa_places(places, cache):
    updated = 0
    for place in places:
        if place.get("source") != "inpa":
            continue
        wp_id = _wp_id(place.get("id"))
        if wp_id is None:
            continue
        record = fetch_place_record(wp_id, cache)
        place.update(visit_facts(record.get("acf"), record.get("media")))
        updated += 1
        if updated % 20 == 0:
            FACT_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            print(f"place facts {updated}")
    return updated


def main():
    print("fetching parks…")
    parks = fetch_parks()
    print("parks with a coordinate:", len(parks))
    print("fetching landmarks…")
    osm = drop_osm_covered_by_parks(parks, osm_places(fetch_osm_elements()))
    camps = json.loads((ROOT / "data" / "camps.json").read_text(encoding="utf-8"))
    places = near_any_camp(parks + osm, camps)
    print("reading visit facts…")
    fact_cache = load_fact_cache()
    enrich_inpa_places(places, fact_cache)
    FACT_CACHE.write_text(json.dumps(fact_cache, ensure_ascii=False), encoding="utf-8")
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


def write_places(places):
    places.sort(key=lambda place: (place["kind"], place["name"]))
    OUT.write_text(json.dumps(places, ensure_ascii=False, indent=2), encoding="utf-8")
    meta_path = ROOT / "data" / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    counts = meta.setdefault("counts", {})
    counts["places"] = len(places)
    meta["placesFetchedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    if "--facts" in sys.argv:
        loaded = json.loads(OUT.read_text(encoding="utf-8"))
        cached = load_fact_cache()
        done = enrich_inpa_places(loaded, cached)
        FACT_CACHE.write_text(json.dumps(cached, ensure_ascii=False), encoding="utf-8")
        write_places(loaded)
        paid = sum(1 for place in loaded if place.get("paid") is True)
        photographed = sum(1 for place in loaded if place.get("photos"))
        print(json.dumps({"updated": done, "paid": paid, "photographed": photographed}, ensure_ascii=False))
    else:
        main()
