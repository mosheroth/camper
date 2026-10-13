"""Import the published walks from teva.org.il.

The Society for the Protection of Nature lists its recommended walks at
/tracks (the trip sitemap). Only structured facts are kept: name, length,
duration, difficulty, shape, audience, the page URL, and a coordinate when
that page itself publishes one. Articles and photos are not stored. A walk
with no pin is still listed, without a made-up point. News posts, field
schools and national-trail segments are not points: those pages do not
publish a coordinate.
"""

import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

from scripts.classify import is_hike, primary_difficulty, shape
from scripts.fetch_tiuli import TEVA_BASE, _flags, _fmt_km, _hours, head_tokens, name_score
from scripts.geo import region_from_lat
from scripts.match import nearby_trails

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CACHE = DATA / ".teva-html"
SITEMAP = "https://www.teva.org.il/trip-sitemap.xml"
UA = "Mozilla/5.0 (compatible; CamperWeekendBot/0.1; +https://github.com/mosheroth/camper)"

_INFO = re.compile(
    r'<li class="([^"]+)">\s*<div class="img-wrap"></div>\s*<div class="info-wrap">\s*<span>[^<]*</span>\s*<span>(.*?)</span>',
    re.S,
)
_PIN = (
    re.compile(r"ll=([0-9]{2}\.[0-9]+)[, ]+([0-9]{2}\.[0-9]+)"),
    re.compile(r"ll\.([0-9]{2}\.[0-9]+),([0-9]{2}\.[0-9]+)"),
    re.compile(r"[?&]lat=([0-9]{2}\.[0-9]+).{0,40}?[?&](?:lon|lng)=([0-9]{2}\.[0-9]+)", re.S),
    re.compile(r"@([0-9]{2}\.[0-9]+),([0-9]{2}\.[0-9]+)"),
)
_TRACK = re.compile(r"(?<!news)/tracks/(\d+)")


def fetch_text(url, timeout=50):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                data = response.read()
                if response.headers.get("Content-Encoding", "").lower() == "gzip" or data[:2] == b"\x1f\x8b":
                    import gzip
                    data = gzip.decompress(data)
                return data.decode("utf-8", "replace")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as error:
            last = error
            time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(str(last))


def sitemap_ids(text):
    return sorted({int(match) for match in re.findall(r"/tracks/(\d+)", text)})


def _plain(value):
    text = re.sub(r"<[^>]+>", " ", html.unescape(value or ""))
    return re.sub(r"\s+", " ", text).strip()


def info_fields(page):
    fields = {}
    for kind, value in _INFO.findall(page):
        text = _plain(value)
        if text and kind not in fields:
            fields[kind] = text
    return fields


def published_pin(page):
    """The first coordinate the page itself prints, inside Israel."""
    text = unquote(html.unescape(page))
    found = []
    for pattern in _PIN:
        for match in pattern.finditer(text):
            found.append((match.start(), float(match.group(1)), float(match.group(2))))
    found.sort()
    for _at, lat, lng in found:
        if 29.4 <= lat <= 33.4 and 34.2 <= lng <= 35.95:
            return round(lat, 5), round(lng, 5)
    return None


def clean_name(title):
    name = _plain(title)
    name = re.sub(r"\s*[|–—-]\s*החברה להגנת הטבע\s*$", "", name).strip()
    shorter = re.sub(r"^מסלול טיול ב", "", name).strip()
    return shorter or name


def parse_duration(text):
    cleaned = (text or "").replace("־", "-").replace("–", "-").replace("—", "-")
    match = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)", cleaned)
    if match:
        return float(match.group(1)), float(match.group(2))
    if "שעתיים וחצי" in cleaned:
        return 2.5, 2.5
    if re.search(r"שעה וחצי", cleaned):
        return 1.5, 1.5
    if "שעתיים" in cleaned:
        return 2.0, 2.0
    if re.search(r"שעה(?!ות)", cleaned):
        return 1.0, 1.0
    match = re.search(r"(\d+(?:\.\d+)?)\s*שע", cleaned)
    if match:
        hours = float(match.group(1))
        return hours, hours
    return None, None


def parse_length(text):
    cleaned = (text or "").replace("־", "-").replace("–", "-").replace("—", "-")
    match = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*ק", cleaned)
    if match:
        return float(match.group(1)), float(match.group(2))
    match = re.search(r"(\d+(?:\.\d+)?)\s*ק", cleaned)
    if match:
        km = float(match.group(1))
        return km, km
    return None, None


def parse_levels(text):
    levels = []
    for word, level in (("מאתגר", "challenging"), ("קשה", "challenging"), ("בינונ", "moderate"), ("קל", "easy")):
        if word in (text or "") and level not in levels:
            levels.append(level)
    return levels


def page_name(page):
    """The walk's name. The document title beats a social-preview sentence."""
    title = re.search(r"<title>([^<]+)", page or "")
    social = re.search(r'property="og:title" content="([^"]+)"', page or "")
    return clean_name(title.group(1) if title else "") or clean_name(social.group(1) if social else "")


def parse_track(page, track_id):
    """Facts from one /tracks page. None when it is not a walk."""
    name = page_name(page)
    fields = info_fields(page)
    length = fields.get("trip-len") or ""
    pin = published_pin(page)
    if not name or not is_hike(name):
        return None
    if not fields and pin is None:
        return None
    hours_min, hours_max = parse_duration(fields.get("trip-dur") or "")
    km_min, km_max = parse_length(length)
    levels = parse_levels(fields.get("trip-diff") or "")
    audience = fields.get("trip-aud") or ""
    return {
        "id": int(track_id),
        "name": name,
        "url": f"https://www.teva.org.il/tracks/{int(track_id)}",
        "lat": pin[0] if pin else None,
        "lng": pin[1] if pin else None,
        "kmMin": km_min,
        "kmMax": km_max,
        "hoursMin": hours_min,
        "hoursMax": hours_max,
        "difficulty": primary_difficulty(levels),
        "difficulties": levels,
        "circular": shape(length, {}),
        "family": "משפח" in audience,
        "accessible": bool(re.search(r"מונגש|נגיש", audience)),
    }


def trail_from_teva(record):
    km_min = record.get("kmMin")
    km_max = record.get("kmMax")
    published = record.get("hoursMax")
    if published is not None:
        hours_min = record.get("hoursMin")
        hours_max = published
        estimated = False
    else:
        hours_max = _hours(km_max if km_max is not None else km_min)
        hours_min = hours_max
        estimated = hours_max is not None
    circular = record.get("circular")
    if circular is True:
        character = "סוג המסלול: מעגלי"
    elif circular is False:
        character = "סוג המסלול: קווי"
    elif circular == "partial":
        character = "סוג המסלול: מעגלי בחלקו"
    else:
        character = ""
    if km_min is None:
        stats = ""
    elif km_max is not None and km_max != km_min:
        stats = f'אורך המסלול: {_fmt_km(km_min)}–{_fmt_km(km_max)} ק"מ'
    else:
        stats = f'אורך המסלול: {_fmt_km(km_min)} ק"מ'
    region = region_from_lat(record.get("lat"))
    return {
        "id": TEVA_BASE + int(record["id"]),
        "name": record["name"],
        "url": "",
        "tiuliUrl": "",
        "tevaUrl": record["url"],
        "source": "teva",
        "lat": record.get("lat"),
        "lng": record.get("lng"),
        "regions": [region] if region else [],
        "areas": [],
        "areaNames": [],
        "difficulties": record.get("difficulties") or [],
        "difficulty": record.get("difficulty"),
        "circular": circular,
        "hoursMin": hours_min,
        "hoursMax": hours_max,
        "hoursEstimated": estimated,
        "kmMin": km_min,
        "kmMax": km_max if km_max is not None else km_min,
        "timeFlags": _flags(hours_max),
        "family": bool(record.get("family")),
        "accessible": bool(record.get("accessible")),
        "blurb": "",
        "image": None,
        "photos": [],
        "waze": None,
        "features": [],
        "details": {
            "summary": "",
            "stats": stats,
            "character": character,
            "highlights": [],
        },
        "routes": [],
    }


def _name_forms(name):
    forms = []
    for part in (name, re.split(r"\s*[:,]\s*", str(name or ""), maxsplit=1)[0]):
        if part and part not in forms:
            forms.append(part)
    return forms


def _same_walk(record, trail):
    trail_tokens = head_tokens(trail.get("name"))
    score = max(
        name_score(head_tokens(form), trail_tokens, strict=True)
        for form in _name_forms(record.get("name"))
    )
    if score < 1:
        return False
    if record.get("lat") is None or trail.get("lat") is None:
        return True
    from scripts.geo import haversine_km
    return haversine_km(record["lat"], record["lng"], trail["lat"], trail["lng"]) <= 15


def merge_teva(trails, camps, records):
    """Attach teva links to the same walk, and append the rest."""
    trails = [trail for trail in trails if int(trail.get("id") or 0) < TEVA_BASE]
    for trail in trails:
        trail.pop("tevaUrl", None)
    fresh = []
    linked = 0
    for record in records:
        match = next((trail for trail in trails if _same_walk(record, trail)), None)
        if match:
            match["tevaUrl"] = record["url"]
            if match.get("lat") is None and record.get("lat") is not None:
                match["lat"] = record["lat"]
                match["lng"] = record["lng"]
                region = region_from_lat(record["lat"])
                if region and not match.get("regions"):
                    match["regions"] = [region]
            linked += 1
            continue
        fresh.append(trail_from_teva(record))
    trails.extend(fresh)
    for camp in camps:
        camp["nearby"] = nearby_trails(camp, trails)
    return trails, camps, {"tracks": len(records), "linkedTrails": linked, "addedTrails": len(fresh)}


def linked_track_ids(page):
    """Walk ids linked from a page. News posts live at /news/tracks and are not walks."""
    return {int(match) for match in _TRACK.findall(page or "")}


def _cache_path(track_id):
    return CACHE / f"{int(track_id)}.html"


def _load_page(track_id):
    path = _cache_path(track_id)
    if path.exists() and path.stat().st_size > 1000:
        return path.read_text(encoding="utf-8")
    page = fetch_text(f"https://www.teva.org.il/tracks/{int(track_id)}")
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(page, encoding="utf-8")
    return page


def collect():
    CACHE.mkdir(parents=True, exist_ok=True)
    sitemap_path = CACHE / "trip-sitemap.xml"
    if not sitemap_path.exists() or sitemap_path.stat().st_size < 500:
        sitemap_path.write_text(fetch_text(SITEMAP), encoding="utf-8")
    ids = sitemap_ids(sitemap_path.read_text(encoding="utf-8"))
    pages = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(_load_page, track_id): track_id for track_id in ids}
        for future in as_completed(futures):
            track_id = futures[future]
            pages[track_id] = future.result()
    seen = set(pages)
    while True:
        extra = set()
        for page in pages.values():
            extra.update(linked_track_ids(page))
        missing = [track_id for track_id in sorted(extra - seen)]
        if not missing:
            break
        seen.update(missing)
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = {pool.submit(_load_page, track_id): track_id for track_id in missing}
            for future in as_completed(futures):
                pages[futures[future]] = future.result()
    records = []
    for track_id in sorted(pages):
        record = parse_track(pages[track_id], track_id)
        if record:
            records.append(record)
    return records


def _write(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    records = collect()
    trails = json.loads((DATA / "trails.json").read_text(encoding="utf-8"))
    camps = json.loads((DATA / "camps.json").read_text(encoding="utf-8"))
    trails, camps, stats = merge_teva(trails, camps, records)
    _write(DATA / "teva.json", {
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "https://www.teva.org.il/tracks",
        "tracks": records,
    })
    _write(DATA / "trails.json", trails)
    _write(DATA / "camps.json", camps)
    meta_path = DATA / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["counts"]["trails"] = len(trails)
    meta["counts"]["family"] = sum(1 for trail in trails if trail.get("family"))
    meta["counts"]["circular"] = sum(1 for trail in trails if trail.get("circular") is True)
    meta["teva"] = {"fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **stats}
    _write(meta_path, meta)
    pinned = sum(1 for record in records if record.get("lat") is not None)
    print(json.dumps({**stats, "pinned": pinned}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.exit(main())
