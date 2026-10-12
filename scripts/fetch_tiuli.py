"""Merge factual records from tiuli.com into the INPA catalog.

The live site blocks this environment, so pages are read from the Wayback
Machine. Only structured facts are kept: name, coordinate, length, difficulty,
shape, region, feature chips, and the canonical URL. Articles, comments, and
photos are not stored.
"""

import gzip
import sys
import html
import io
import json
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit

import zstandard

from scripts.classify import primary_difficulty
from scripts.geo import haversine_km, region_from_lat
from scripts.match import nearby_trails

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CACHE = DATA / ".tiuli-html"
TIULI_BASE = 8_000_000
UA = "Mozilla/5.0 (compatible; CamperWeekendBot/0.1; +https://github.com/mosheroth/camper)"
SITEMAPS = ("tracks", "camping", "points-of-interest", "attractions")

_TOKEN = re.compile(r"[א-ת]{2,}")
_STOP = {
    "מסלול", "טיול", "מעגלי", "קווי", "שמורת", "טבע", "גן", "לאומי",
    "בישראל", "שביל", "הליכה", "קצר", "ארוך", "ישראל", "שמורה", "פארק",
}
_BIKE = re.compile(r"אופני|לדווש|ג['׳]יפ|4\s*[xX×]\s*4")
_GENERIC = {
    "נחל", "נחלי", "הר", "הרי", "עין", "תל", "חורבה", "חורבת", "מערת", "מערה",
    "יער", "חוף", "גן", "פארק", "שמורה", "נחלים", "מבצר", "חניון", "לילה",
}
_KM = re.compile(r"(\d+(?:\.\d+)?)")
_DIFF_WORD = (
    ("מאתגר", "challenging"),
    ("קשה", "challenging"),
    ("בינוני", "moderate"),
    ("קל", "easy"),
)


def wayback(url):
    parts = urlsplit(unquote(url.strip()))
    path = quote(parts.path, safe="/")
    clean = urlunsplit((parts.scheme or "https", parts.netloc, path, parts.query, ""))
    return "https://web.archive.org/web/202610id_/" + clean


def decode_body(data, encoding):
    enc = (encoding or "").lower()
    if data[:2] == b"\x1f\x8b" or "gzip" in enc:
        data = gzip.decompress(data)
    elif data[:4] == b"\x28\xb5\x2f\xfd" or "zstd" in enc:
        data = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(data)).read()
    return data.decode("utf-8", "replace")


def fetch_text(url, timeout=70):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept-Encoding": "gzip"},
    )
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return decode_body(response.read(), response.headers.get("Content-Encoding"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as error:
            last = error
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(str(last))


def tokens(name):
    found = []
    for token in _TOKEN.findall(str(name or "").replace("־", " ")):
        if token in _STOP:
            continue
        if token.startswith("ה") and len(token) > 3:
            token = token[1:]
            if token in _STOP:
                continue
        if token.endswith("י") and len(token) > 3:
            token = token[:-1]
        found.append(token)
    return set(found)


_REGION_WORD = {
    "כרמל", "גליל", "ירושלים", "נגב", "גולן", "שומרון", "יהודה", "מירון",
    "כנרת", "מדבר", "שרון", "ערבה", "שפלה",
}


def head_tokens(name):
    head = re.split(
        r"\s*[–—]\s*|\s+-\s+(?=טיול|המלצה|הצעה|מסלול)|\s*[-:]\s*(?=המלצה|הצעה|מסלול)",
        str(name or ""),
        maxsplit=1,
    )[0]
    return tokens(head)


def name_score(left, right, strict=False):
    """1 when the names are the same place.

    strict compares the union, so an extra place word ("חוות משמר")
    keeps a shorter neighbor ("פארק הכרמל") from taking the match.
    """
    if not left or not right:
        return 0
    left_specific = left - _GENERIC
    right_specific = right - _GENERIC
    shared = left_specific & right_specific
    if not shared or shared <= _REGION_WORD:
        return 0
    if strict:
        return len(shared) / len(left_specific | right_specific)
    shorter = left_specific if len(left_specific) <= len(right_specific) else right_specific
    if not shorter:
        return 0
    return len(shared) / len(shorter)


def _jsonld(page):
    found = []
    for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        try:
            data = json.loads(html.unescape(raw))
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if not isinstance(item, dict):
                continue
            found.append(item)
            graph = item.get("@graph")
            if isinstance(graph, list):
                found.extend(entry for entry in graph if isinstance(entry, dict))
    return found


def _coords(item):
    geo = item.get("geo") or {}
    if not isinstance(geo, dict):
        return None
    try:
        lat = float(geo.get("latitude"))
        lng = float(geo.get("longitude"))
    except (TypeError, ValueError):
        return None
    return lat, lng


def _in_israel(lat, lng):
    return lat is not None and 29.4 <= lat <= 33.4 and 34.2 <= lng <= 35.95


def _fallback_coords(page):
    match = re.search(r"ll=(-?\d+\.\d+),(-?\d+\.\d+)", page)
    if not match:
        match = re.search(
            r'data-lat="(-?\d+\.\d+)"[^>]{0,80}data-lng="(-?\d+\.\d+)"',
            page,
        )
    if not match:
        return None
    lat, lng = float(match.group(1)), float(match.group(2))
    if not _in_israel(lat, lng):
        return None
    return lat, lng


def breadcrumbs(page):
    nav = re.search(r'class="breadcrumb"(.*?)</ul>', page, re.S)
    if not nav:
        return []
    names = []
    for raw in re.findall(r'itemprop="name">([^<]+)', nav.group(1)):
        names.append(re.sub(r"\s+", " ", html.unescape(raw)).strip())
    return names


def feature_labels(page):
    labels = []
    for raw in re.findall(r"\?features=\d+\"[^>]*>\s*<span[^>]*>\s*</span>\s*([^<]{1,40})", page):
        label = re.sub(r"\s+", " ", html.unescape(raw)).strip(" \n\r\t|")
        if 2 <= len(label) <= 28 and "http" not in label and label not in labels:
            labels.append(label)
    return labels


def difficulty_line(page):
    match = re.search(r"רמת קושי</span>\s*</div>\s*<span>([^<]+)</span>", page)
    if not match:
        return ""
    return re.sub(r"\s+", " ", html.unescape(match.group(1))).strip()


def parse_length(line):
    numbers = [float(value) for value in _KM.findall(line or "")]
    # A difficulty sentence can contain a year. Keep values that can be a walk.
    numbers = [value for value in numbers if 0.2 <= value <= 80]
    if not numbers:
        return None, None
    return min(numbers), max(numbers)


def parse_levels(line):
    found = []
    for word, level in _DIFF_WORD:
        if word in (line or "") and level not in found:
            found.append(level)
    return found


def region_for(crumbs, lat):
    text = " ".join(crumbs)
    if any(word in text for word in ("שומרון", "יהודה ושומרון", "בקעת הירדן")):
        return "east"
    if "ים המלח" in text or "מדבר יהודה" in text:
        if lat is not None and lat < 31.5:
            return "south"
        return "east"
    if any(word in text for word in ("גליל", "גולן", "כנרת", "כרמל", "חיפה", "חרמון")):
        return "north"
    if any(word in text for word in ("נגב", "אילת", "ערבה", "מכתש")):
        return "south"
    top = crumbs[2] if len(crumbs) > 2 else ""
    for key, region in (("צפון", "north"), ("מרכז", "center"), ("דרום", "south"), ("ירושלים", "center")):
        if key in top:
            return region
    return region_from_lat(lat)


def _shape(features, name):
    text = " ".join(features)
    if "מעגלי בחלקו" in text or "חצי מעגלי" in text:
        return "partial"
    if "מעגלי" in features or any(label == "מעגלי" for label in features):
        return True
    if "קווי" in features:
        return False
    title = name or ""
    if "לא מעגלי" in title:
        return False
    if "מעגלי" in title:
        return True
    return None


def is_walking(name, features):
    """A chip that says the walk is also rideable is still a walk."""
    if _BIKE.search(name or ""):
        return False
    for label in features or []:
        if re.search(r"4\s*[xX×]\s*4|ג['׳]יפ", label):
            return False
        if "אופני" in label and not label.startswith("מתאים ל"):
            return False
    return True


def _record_id(url):
    parts = [part for part in urlsplit(unquote(url)).path.split("/") if part]
    if len(parts) < 2 or not parts[1].isdigit():
        return None
    return int(parts[1])


def _fmt_km(value):
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.1f}".rstrip("0").rstrip(".")


def parse_page(page, kind):
    """Facts from one tiuli HTML page. Returns None when the page has no pin."""
    blocks = _jsonld(page)
    wanted = {
        "tracks": {"TouristAttraction"},
        "camping": {"Campground", "TouristAttraction", "LodgingBusiness"},
        "points-of-interest": {"TouristAttraction", "Place"},
        "attractions": {"TouristAttraction", "Place"},
    }[kind]
    chosen = None
    point = None
    for block in blocks:
        if block.get("@type") not in wanted:
            continue
        chosen = block
        point = _coords(block)
        if point:
            break
    if chosen is None and kind in {"points-of-interest", "attractions"}:
        return None
    point = point or _fallback_coords(page)
    lat = lng = None
    if point and _in_israel(*point):
        lat, lng = round(point[0], 5), round(point[1], 5)
    name = ""
    url = ""
    if chosen:
        name = re.sub(r"\s+", " ", str(chosen.get("name") or "")).strip()
        url = str(chosen.get("url") or chosen.get("@id") or "")
    if not url:
        meta = re.search(r'<meta property="og:url" content="([^"]+)"', page)
        url = html.unescape(meta.group(1)) if meta else ""
    if not name:
        heading = re.search(r"<h1[^>]*>\s*([^<]+)", page)
        name = html.unescape(heading.group(1)).strip() if heading else ""
    record_id = _record_id(url)
    if record_id is None or not name:
        return None
    if not url.startswith("https://www.tiuli.com/"):
        return None
    crumbs = breadcrumbs(page)
    features = feature_labels(page)
    line = difficulty_line(page)
    km_min, km_max = parse_length(line)
    levels = parse_levels(line)
    if not levels and any("למיטיבי לכת" in label for label in features):
        levels = ["challenging"]
    area = crumbs[-2] if len(crumbs) >= 2 else ""
    if area in {name, "מסלולי טיול", "אתר למטייל בישראל (טיולי)"}:
        area = crumbs[-3] if len(crumbs) >= 3 else ""
    return {
        "id": record_id,
        "name": name,
        "url": url.split("?")[0],
        "lat": lat,
        "lng": lng,
        "region": region_for(crumbs, lat),
        "area": area,
        "difficulty": primary_difficulty(levels),
        "difficulties": levels,
        "kmMin": km_min,
        "kmMax": km_max,
        "circular": _shape(features, name),
        "family": any("משפח" in label for label in features),
        "accessible": any("נגיש" in label or "מונגש" in label for label in features),
        "features": features,
        "hike": is_walking(name, features),
    }


def _hours(km):
    if km is None or km <= 0 or km > 30:
        return None
    return max(0.5, round((km / 2.0) * 2) / 2)


def _flags(hours):
    if hours is None:
        return []
    if hours <= 5:
        return ["half"]
    if hours <= 10:
        return ["full"]
    return ["multi"]


def trail_from_tiuli(record):
    km_min = record.get("kmMin")
    km_max = record.get("kmMax")
    hours = _hours(km_max if km_max is not None else km_min)
    features = record.get("features") or []
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
    area = record.get("area") or ""
    return {
        "id": TIULI_BASE + int(record["id"]),
        "name": record["name"],
        "url": "",
        "tiuliUrl": record["url"],
        "source": "tiuli",
        "lat": record["lat"],
        "lng": record["lng"],
        "regions": [record["region"]] if record.get("region") else [],
        "areas": [],
        "areaNames": [area] if area else [],
        "difficulties": record.get("difficulties") or [],
        "difficulty": record.get("difficulty"),
        "circular": circular,
        "hoursMin": hours,
        "hoursMax": hours,
        "hoursEstimated": hours is not None,
        "kmMin": km_min,
        "kmMax": km_max if km_max is not None else km_min,
        "timeFlags": _flags(hours),
        "family": bool(record.get("family")),
        "accessible": bool(record.get("accessible")),
        "blurb": "",
        "image": None,
        "photos": [],
        "waze": None,
        "features": features,
        "details": {
            "summary": "",
            "stats": stats,
            "character": character,
            "highlights": features[:8],
        },
        "routes": [],
    }


def _pair_links(records, targets, max_km, min_score, require_coords=True, strict=False):
    """Greedy one-to-one links from tiuli ids to target ids."""
    prepared = []
    for target in targets:
        if target.get("lat") is None:
            continue
        prepared.append((target, head_tokens(target.get("name"))))
    pairs = []
    for record in records:
        if require_coords and record.get("lat") is None:
            continue
        own = head_tokens(record.get("name"))
        for target, theirs in prepared:
            if record.get("lat") is None:
                km = None
            else:
                km = haversine_km(record["lat"], record["lng"], target["lat"], target["lng"])
                if km > max_km:
                    continue
            score = name_score(own, theirs, strict=strict)
            if score < min_score:
                continue
            pairs.append((score, -(km if km is not None else 999), record["id"], target["id"]))
    pairs.sort(reverse=True)
    used_records = set()
    used_targets = set()
    links = {}
    for _score, _km, record_id, target_id in pairs:
        if record_id in used_records or target_id in used_targets:
            continue
        used_records.add(record_id)
        used_targets.add(target_id)
        links[record_id] = target_id
    return links


def _dedupe(records):
    kept = []
    ordered = sorted(
        records,
        key=lambda record: (
            -(len(record.get("features") or [])),
            record.get("kmMax") is None,
        ),
    )
    for record in ordered:
        own = head_tokens(record["name"])
        duplicate = False
        for other in kept:
            if haversine_km(record["lat"], record["lng"], other["lat"], other["lng"]) > 0.8:
                continue
            if name_score(own, head_tokens(other["name"])) >= 0.55:
                duplicate = True
                break
        if not duplicate:
            kept.append(record)
    return kept


def _unique(rows):
    best = {}
    for row in rows:
        current = best.get(row["id"])
        if current is None:
            best[row["id"]] = row
            continue
        current_pin = current.get("lat") is not None
        row_pin = row.get("lat") is not None
        if row_pin and not current_pin:
            best[row["id"]] = row
        elif row_pin == current_pin and len(row.get("features") or []) > len(current.get("features") or []):
            best[row["id"]] = row
    return sorted(best.values(), key=lambda row: row["id"])


def _prefixed(rows, prefix):
    prefixed = []
    for row in rows:
        item = dict(row)
        item["id"] = f"{prefix}:{row['id']}"
        prefixed.append(item)
    return prefixed


def merge_catalog(trails, camps, places, payload):
    """Attach tiuli links and append hikes that are not already in the catalog."""
    trails = [trail for trail in trails if int(trail.get("id") or 0) < TIULI_BASE]
    for trail in trails:
        trail.pop("tiuliUrl", None)
        trail.pop("features", None)
        trail.pop("hoursEstimated", None)
    for camp in camps:
        camp.pop("tiuliUrl", None)
    for place in places:
        place.pop("tiuliUrl", None)

    track_rows = [
        row for row in _unique(payload.get("tracks") or [])
        if row.get("hike") and row.get("lat") is not None and row.get("name")
    ]
    linked = _pair_links(track_rows, trails, max_km=10, min_score=0.67)
    by_trail = {trail["id"]: trail for trail in trails}
    by_record = {row["id"]: row for row in track_rows}
    for record_id, trail_id in linked.items():
        record = by_record[record_id]
        trail = by_trail[trail_id]
        trail["tiuliUrl"] = record["url"]
        if record.get("features"):
            trail["features"] = record["features"]
    fresh = _dedupe([by_record[row["id"]] for row in track_rows if row["id"] not in linked])
    trails.extend(trail_from_tiuli(row) for row in fresh)

    camping_rows = _unique(payload.get("camping") or [])
    camp_links = _pair_links(camping_rows, camps, max_km=8, min_score=0.67, strict=True)
    # A page with no pin can still be the same camp when the names nearly match.
    unpinned = [row for row in camping_rows if row.get("lat") is None and row["id"] not in camp_links]
    name_links = _pair_links(unpinned, camps, max_km=0, min_score=0.75, require_coords=False, strict=True)
    taken = set(camp_links.values())
    for record_id, camp_id in list(name_links.items()):
        if camp_id in taken:
            del name_links[record_id]
        else:
            taken.add(camp_id)
    camp_links.update(name_links)
    camps_by_id = {camp["id"]: camp for camp in camps}
    camping_by_id = {row["id"]: row for row in camping_rows}
    for record_id, camp_id in camp_links.items():
        camps_by_id[camp_id]["tiuliUrl"] = camping_by_id[record_id]["url"]

    points = _prefixed(_unique(payload.get("points") or []), "p")
    points.extend(_prefixed(_unique(payload.get("attractions") or []), "a"))
    place_links = _pair_links(points, places, max_km=3, min_score=0.67, strict=True)
    places_by_id = {place["id"]: place for place in places}
    points_by_id = {row["id"]: row for row in points}
    for record_id, place_id in place_links.items():
        places_by_id[place_id]["tiuliUrl"] = points_by_id[record_id]["url"]

    for camp in camps:
        camp["nearby"] = nearby_trails(camp, trails)
    stats = {
        "tracks": len(track_rows),
        "linkedTrails": len(linked),
        "addedTrails": len(fresh),
        "linkedCamps": len(camp_links),
        "linkedPlaces": len(place_links),
    }
    return trails, camps, places, stats


def _sitemap_locs(name):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.xml"
    if not path.exists() or path.stat().st_size < 1000:
        text = fetch_text(wayback(f"https://www.tiuli.com/sitemaps/{name}.xml"))
        path.write_text(text, encoding="utf-8")
    text = path.read_text(encoding="utf-8")
    return re.findall(r"<loc>(.*?)</loc>", text)


def _slug_candidates(locs, targets, min_score):
    prepared = [(target, tokens(target.get("name"))) for target in targets]
    chosen = []
    for loc in locs:
        slug = unquote(loc).split("/")[-1].replace("-", " ")
        own = tokens(slug)
        if any(name_score(own, theirs) >= min_score for _target, theirs in prepared):
            chosen.append(html.unescape(loc))
    return chosen


def _cache_path(kind, url):
    record_id = _record_id(url) or 0
    return CACHE / f"{kind}-{record_id}.html"


def _load_cached(path):
    if not path.exists() or path.stat().st_size < 8000:
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    if "latitude" in text or "<h1" in text or "Campground" in text:
        return text
    return ""


def _download_one(kind, url):
    path = _cache_path(kind, url)
    cached = _load_cached(path)
    if cached:
        return url, cached
    text = fetch_text(wayback(url))
    if "latitude" in text or "<h1" in text or "Campground" in text:
        path.write_text(text, encoding="utf-8")
    return url, text


def collect(camps, places):
    jobs = [( "tracks", loc) for loc in _sitemap_locs("tracks")]
    jobs.extend(("camping", loc) for loc in _slug_candidates(_sitemap_locs("camping"), camps, 0.34))
    jobs.extend(("points-of-interest", loc) for loc in _slug_candidates(_sitemap_locs("points-of-interest"), places, 0.4))
    jobs.extend(("attractions", loc) for loc in _slug_candidates(_sitemap_locs("attractions"), places, 0.45))
    print(f"downloading {len(jobs)} tiuli pages")
    pages = []
    done = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(_download_one, kind, url) for kind, url in jobs]
        kinds = {url: kind for kind, url in jobs}
        for future in as_completed(futures):
            done += 1
            try:
                url, text = future.result()
            except Exception as error:  # noqa: BLE001 — keep going when one snapshot fails
                print("skip", error)
                continue
            pages.append((kinds[url], text))
            if done % 25 == 0 or done == len(futures):
                print(f"pages {done}/{len(futures)}")
    grouped = {"tracks": [], "camping": [], "points-of-interest": [], "attractions": []}
    for kind, text in pages:
        record = parse_page(text, kind if kind != "points-of-interest" else "points-of-interest")
        if record:
            grouped[kind].append(record)
    grouped = {key: _unique(rows) for key, rows in grouped.items()}
    return {
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "https://www.tiuli.com",
        "via": "https://web.archive.org",
        "tracks": grouped["tracks"],
        "camping": grouped["camping"],
        "points": grouped["points-of-interest"],
        "attractions": grouped["attractions"],
    }


def rebuild_from_cache():
    grouped = {kind: [] for kind in ("tracks", "camping", "points-of-interest", "attractions")}
    for path in CACHE.glob("*.html"):
        kind = next((name for name in grouped if path.name.startswith(name + "-")), "")
        if not kind:
            continue
        record = parse_page(path.read_text(encoding="utf-8", errors="replace"), kind)
        if record:
            grouped[kind].append(record)
    grouped = {key: _unique(rows) for key, rows in grouped.items()}
    return {
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "https://www.tiuli.com",
        "via": "https://web.archive.org",
        "tracks": grouped["tracks"],
        "camping": grouped["camping"],
        "points": grouped["points-of-interest"],
        "attractions": grouped["attractions"],
    }


def retry_missing_tracks():
    missing = []
    for loc in _sitemap_locs("tracks"):
        url = html.unescape(loc)
        if not _load_cached(_cache_path("tracks", url)):
            missing.append(url)
    print(f"retrying {len(missing)} track pages")
    for index, url in enumerate(missing, start=1):
        try:
            _download_one("tracks", url)
        except Exception as error:  # noqa: BLE001 — one blocked snapshot should not stop the rest
            print("skip", error)
        if index % 10 == 0:
            print(f"retried {index}/{len(missing)}")
        time.sleep(0.4)


def apply_saved(trails, camps, places=None):
    """Re-apply data/tiuli.json without downloading. Places are updated when passed."""
    path = DATA / "tiuli.json"
    if not path.exists():
        return trails, camps, places, {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    own_places = places is None
    if own_places:
        places = []
    trails, camps, places, stats = merge_catalog(trails, camps, places, payload)
    return trails, camps, places, stats


def _write(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    camps = json.loads((DATA / "camps.json").read_text(encoding="utf-8"))
    trails = json.loads((DATA / "trails.json").read_text(encoding="utf-8"))
    places = json.loads((DATA / "places.json").read_text(encoding="utf-8"))
    payload = collect(camps, places)
    _write(DATA / "tiuli.json", payload)
    trails, camps, places, stats = merge_catalog(trails, camps, places, payload)
    _write(DATA / "trails.json", trails)
    _write(DATA / "camps.json", camps)
    _write(DATA / "places.json", places)
    meta_path = DATA / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    meta["counts"] = meta.get("counts") or {}
    meta["counts"]["trails"] = len(trails)
    meta["counts"]["family"] = sum(1 for trail in trails if trail.get("family"))
    meta["counts"]["circular"] = sum(1 for trail in trails if trail.get("circular") is True)
    meta["tiuli"] = {"fetchedAt": payload["fetchedAt"], **stats}
    _write(meta_path, meta)
    print(json.dumps(meta["tiuli"], ensure_ascii=False, indent=2))


def rebuild():
    payload = rebuild_from_cache()
    _write(DATA / "tiuli.json", payload)
    camps = json.loads((DATA / "camps.json").read_text(encoding="utf-8"))
    trails = json.loads((DATA / "trails.json").read_text(encoding="utf-8"))
    places = json.loads((DATA / "places.json").read_text(encoding="utf-8"))
    trails, camps, places, stats = merge_catalog(trails, camps, places, payload)
    _write(DATA / "trails.json", trails)
    _write(DATA / "camps.json", camps)
    _write(DATA / "places.json", places)
    meta_path = DATA / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["counts"]["trails"] = len(trails)
    meta["counts"]["family"] = sum(1 for trail in trails if trail.get("family"))
    meta["counts"]["circular"] = sum(1 for trail in trails if trail.get("circular") is True)
    meta["tiuli"] = {"fetchedAt": payload["fetchedAt"], **stats}
    _write(meta_path, meta)
    print(json.dumps(meta["tiuli"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "rebuild":
        rebuild()
    else:
        main()
