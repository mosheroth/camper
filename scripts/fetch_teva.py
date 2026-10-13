"""Import the published walks from teva.org.il.

The Society for the Protection of Nature lists its recommended walks at
/tracks (the trip sitemap). Only structured facts are kept: name, length,
duration, difficulty, shape, audience, the page URL, and a coordinate when
that page itself publishes one. The article text is not stored. Photos the
page itself publishes are kept as image URLs, the same shape as the rest of
the catalog. A walk with no pin is still listed, without a made-up point.
News posts, field schools and national-trail segments are not points: those
pages do not publish a coordinate.
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
from urllib.parse import unquote, urlparse

from scripts.classify import is_hike, primary_difficulty, shape
from scripts.fetch_tiuli import TEVA_BASE, _flags, _fmt_km, _hours, head_tokens, name_score
from scripts.geo import region_from_lat
from scripts.match import nearby_trails
from scripts.photos import MAX_PHOTOS, clean_credit, image_key

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
_IMG_TAG = re.compile(r"<img\b[^>]*>", re.I)
_URL_ATTR = re.compile(r'(?:src|data-lazy-src|data-src|data-orig-src)\s*=\s*["\']([^"\']+)["\']', re.I)
_SRCSET = re.compile(r'srcset\s*=\s*["\']([^"\']+)["\']', re.I)
_OG_IMAGE = re.compile(r'<meta\b[^>]*property=["\']og:image["\'][^>]*>', re.I)
_META_CONTENT = re.compile(r'content=["\']([^"\']+)["\']', re.I)
_CLASS_ATTR = re.compile(r'class=["\']([^"\']*)["\']', re.I)
_ALT_ATTR = re.compile(r'alt=["\']([^"\']*)["\']', re.I)
_WIDTH_ATTR = re.compile(r'\bwidth\s*=\s*["\']?(\d+)', re.I)
_HEIGHT_ATTR = re.compile(r'\bheight\s*=\s*["\']?(\d+)', re.I)
_FILE_WIDTH = re.compile(r'-(\d+)x\d+(?=\.[a-z0-9]+$)', re.I)
_UPLOAD = re.compile(r"^https://www\.teva\.org\.il/(?:app/uploads|wp-content/uploads)/", re.I)
_CHROME = re.compile(r"logo|icon|sprite|favicon|pixel|spacer|emoji|tracking|beacon", re.I)
_CHROME_CLASS = re.compile(r"logo|icon|sprite|share|brand|emoji|avatar", re.I)
_PHOTO_EXT = re.compile(r"\.(jpe?g|png|webp)$", re.I)
_CUT_SECTION = (
    re.compile(r'<section\b[^>]*class="[^"]*\bshare\b', re.I),
    re.compile(r'<section\b[^>]*class="[^"]*news-carousel', re.I),
    re.compile(r'<section\b[^>]*class="[^"]*join-section', re.I),
)


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


def _article_html(page):
    """The track body, without the share bar, the news carousel, or the footer."""
    text = page or ""
    start = text.find("<main")
    if start < 0:
        start = 0
    end = text.find("<footer", start)
    if end < 0:
        end = len(text)
    chunk = text[start:end]
    cut = len(chunk)
    for pattern in _CUT_SECTION:
        match = pattern.search(chunk)
        if match:
            cut = min(cut, match.start())
    return chunk[:cut]


def _photo_url(raw):
    url = html.unescape(raw or "").strip()
    if not url or url.startswith("data:"):
        return ""
    if url.startswith("//"):
        url = "https:" + url
    elif url.startswith("/"):
        url = "https://www.teva.org.il" + url
    url = url.split("#", 1)[0].split("?", 1)[0]
    if not _UPLOAD.match(url):
        return ""
    path = unquote(urlparse(url).path)
    if not _PHOTO_EXT.search(path):
        return ""
    if _CHROME.search(path):
        return ""
    if any(word in path for word in ("מפה", "מפת")):
        return ""
    return url


def _photo_score(url, width):
    """Prefer a sharp mid-size file over a thumbnail or a huge original."""
    named = _FILE_WIDTH.search(urlparse(url).path)
    if named:
        width = int(named.group(1))
    if width is not None and width < 160:
        return None
    if width is None:
        return 1100
    if width < 480:
        return width
    return 3000 - abs(width - 1200)


def page_photos(page):
    """Photos this track page publishes: the social image and the article pictures.

    Icons, logos, sprites, maps, and the news carousel are left out.
    """
    found = {}

    def consider(url, credit, width, height, pos):
        url = _photo_url(url)
        if not url:
            return
        if width and height and width < 160 and height < 160:
            return
        score = _photo_score(url, width)
        if score is None:
            return
        key = image_key(url)
        if not key:
            return
        credit = clean_credit(credit or "")
        current = found.get(key)
        if current is None:
            found[key] = {"src": url, "credit": credit, "score": score, "pos": pos}
            return
        if score > current["score"]:
            current["src"] = url
            current["score"] = score
        if credit and not current["credit"]:
            current["credit"] = credit
        if pos < current["pos"]:
            current["pos"] = pos

    for match in _OG_IMAGE.finditer(page or ""):
        content = _META_CONTENT.search(match.group(0))
        if content:
            consider(content.group(1), "", None, None, -1)

    article = _article_html(page)
    for match in _IMG_TAG.finditer(article):
        tag = match.group(0)
        kind = _CLASS_ATTR.search(tag)
        if kind and _CHROME_CLASS.search(kind.group(1)):
            continue
        width_match = _WIDTH_ATTR.search(tag)
        height_match = _HEIGHT_ATTR.search(tag)
        width = int(width_match.group(1)) if width_match else None
        height = int(height_match.group(1)) if height_match else None
        alt = _ALT_ATTR.search(tag)
        window = article[match.end():match.end() + 600]
        caption = re.search(r"<figcaption[^>]*>(.*?)</figcaption>", window, re.S)
        credit = caption.group(1) if caption else (alt.group(1) if alt else "")
        urls = [(raw, width) for raw in _URL_ATTR.findall(tag)]
        srcset = _SRCSET.search(tag)
        if srcset:
            for part in srcset.group(1).split(","):
                bits = part.strip().split()
                if not bits:
                    continue
                declared = None
                if len(bits) > 1 and bits[-1].endswith("w") and bits[-1][:-1].isdigit():
                    declared = int(bits[-1][:-1])
                urls.append((bits[0], declared))
        for raw, declared in urls:
            consider(raw, credit, declared, height if declared in (None, width) else None, match.start())
    for match in re.finditer(r'<a\b[^>]*class="[^"]*gallery[^"]*"[^>]*>', article, re.I):
        href = re.search(r'href=["\']([^"\']+)["\']', match.group(0))
        if href:
            consider(href.group(1), "", None, None, match.start())

    ranked = sorted(found.values(), key=lambda item: item["pos"])
    return [{"src": item["src"], "credit": item["credit"]} for item in ranked[:MAX_PHOTOS]]


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
        "photos": page_photos(page),
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
    photos = record.get("photos") or []
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
        "image": photos[0]["src"] if photos else None,
        "photos": photos,
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
            photos = record.get("photos") or []
            if photos and not match.get("photos"):
                match["photos"] = photos
                if not match.get("image"):
                    match["image"] = photos[0]["src"]
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
