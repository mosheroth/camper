"""Match an INPA hike to an OpenStreetMap trail line.

The parks site publishes the write-up, not a GPS track. A line is kept only
when a hiking relation or path shares a specific name token with the hike and
sits near its trailhead. OpenStreetMap data is ODbL.
"""

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

GENERIC = {
    "נחל", "הר", "עין", "תל", "גן", "חוף", "פארק", "יער", "מעיין", "חניון",
    "יום", "לילה", "מסלול", "טיול", "המלצה", "שמורת", "שמורה", "טבע", "לאומי",
    "לאומית", "הצעה", "משפחתי", "משפחות", "מעגלי", "נגיש", "קצר", "ארוך",
    "הליכה", "שביל", "דרך", "בשמורת", "בגן", "סובב", "מכתש", "נוף", "טבילות",
    "הרפתקה", "הפתעות", "צבעוני", "פריחת", "למיטיבי", "לכת", "קלה", "בינונית",
    "בינוני", "מאתגר", "אתגרי", "גדול", "קטן", "קטנה",
}
CLITICS = ("וה", "וב", "ול", "ומ", "וכ", "וש", "מה", "לה", "בה", "כה", "שה", "ה", "ו", "ב", "ל", "מ", "כ", "ש")
MIN_ROUTE_KM = 0.4
MAX_ROUTE_KM = 14.0

OVERPASS = "https://mapeak.com/api/interpreter"
SEARCH = "https://israelhiking.osm.org.il/api/search/"
UA = "CamperWeekend/0.1 (static weekend planner; OpenStreetMap ODbL)"
TOKEN_RE = re.compile(r"[א-ת]{3,}")


def _generic(token):
    if token in GENERIC:
        return True
    for prefix in CLITICS:
        if token.startswith(prefix) and len(token) - len(prefix) >= 2:
            if token[len(prefix):] in GENERIC:
                return True
    return False


def specific_tokens(text):
    seen = []
    for token in TOKEN_RE.findall(text or ""):
        if _generic(token) or token in seen:
            continue
        seen.append(token)
    return seen


def match_score(feature_name, trail_tokens):
    overlap = set(specific_tokens(feature_name)).intersection(trail_tokens)
    if not overlap:
        return 0
    return sum(len(token) for token in overlap)


def simplify_line(points, limit=140):
    """Drop near-duplicates and stride down to limit points. Ends stay."""
    if len(points) < 2:
        return []
    kept = [points[0]]
    for point in points[1:]:
        prev = kept[-1]
        if abs(point[0] - prev[0]) + abs(point[1] - prev[1]) >= 0.00015:
            kept.append(point)
    if kept[-1] != points[-1]:
        kept.append(points[-1])
    if len(kept) <= limit:
        return [[round(lat, 5), round(lng, 5)] for lat, lng in kept]
    stride = max(1, (len(kept) - 2) // (limit - 2))
    sampled = [kept[0]]
    sampled.extend(kept[index] for index in range(stride, len(kept) - 1, stride))
    sampled.append(kept[-1])
    return [[round(lat, 5), round(lng, 5)] for lat, lng in sampled]


def _coords(geometry):
    points = []
    for node in geometry or []:
        lat = node.get("lat")
        lng = node.get("lon")
        if lat is None or lng is None:
            continue
        points.append((lat, lng))
    return points


def route_length_km(lines):
    from scripts.geo import haversine_km

    total = 0.0
    for line in lines or []:
        for start, end in zip(line, line[1:]):
            total += haversine_km(start[0], start[1], end[0], end[1])
    return total


def keep_line(name, lines, hike_km=None):
    """A drawn line should be the day's walk, not a stub or a regional circuit."""
    label = name or ""
    if any(word in label for word in ("אופני", "ג'יפ", "ג׳יפ", "4x4", "4×4")):
        return False
    length = route_length_km(lines)
    if length < MIN_ROUTE_KM or length > MAX_ROUTE_KM:
        return False
    if hike_km and length > max(float(hike_km) * 2.5, 8):
        return False
    return True


def lines_from_element(element):
    if element.get("type") == "way":
        line = simplify_line(_coords(element.get("geometry")))
        return [line] if len(line) >= 2 else []
    lines = []
    for member in element.get("members") or []:
        if member.get("type") not in (None, "way"):
            continue
        line = simplify_line(_coords(member.get("geometry")))
        if len(line) >= 2:
            lines.append(line)
    return lines


def choose_groups(elements, trail_tokens, limit=3):
    """Group matches by name. A relation replaces the ways that share its name."""
    groups = {}
    for element in elements:
        tags = element.get("tags") or {}
        name = tags.get("name") or ""
        score = match_score(name, trail_tokens)
        if score < 3:
            continue
        kind = element.get("type")
        route = tags.get("route")
        highway = tags.get("highway")
        if kind == "relation" and route not in ("hiking", "foot"):
            continue
        if kind == "way" and highway not in ("path", "footway", "track", "via_ferrata"):
            continue
        groups.setdefault(name, []).append((score, 0 if kind == "relation" else 1, element))
    ranked = []
    for name, items in groups.items():
        best = max(item[0] for item in items)
        relations = [item[2] for item in items if item[1] == 0]
        ways = [item[2] for item in items if item[1] == 1]
        ranked.append((best, name, relations[:1] or ways))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return ranked[:limit]


def _request(url, data=None, timeout=50):
    headers = {"User-Agent": UA, "Accept": "application/json"}
    payload = data.encode("utf-8") if isinstance(data, str) else data
    request = urllib.request.Request(url, data=payload, headers=headers)
    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except Exception as error:  # noqa: BLE001 - network retry
            last_error = error
            time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(last_error)


def geocode(term):
    term = (term or "").strip()
    if len(term) < 3:
        return None
    url = SEARCH + urllib.parse.quote(term) + "?language=he"
    try:
        results = _request(url, timeout=25)
    except RuntimeError:
        return None
    if not isinstance(results, list):
        return None
    for result in results:
        location = (result or {}).get("location") or {}
        lat = location.get("lat")
        lng = location.get("lng")
        if lat is None or lng is None:
            continue
        if 29.3 <= lat <= 33.4 and 34.2 <= lng <= 35.95:
            return round(lat, 6), round(lng, 6)
    return None


def _overpass(query):
    try:
        return _request(OVERPASS, data=query, timeout=55)
    except RuntimeError:
        return None


def find_routes(lat, lng, trail_tokens, hike_km=None):
    if lat is None or not trail_tokens:
        return []
    pattern = "|".join(re.escape(token) for token in trail_tokens[:5])
    query = (
        "[out:json][timeout:25];"
        f"(relation(around:7000,{lat},{lng})[\"route\"~\"hiking|foot\"][\"name\"~\"{pattern}\"];"
        f"way(around:4500,{lat},{lng})[\"highway\"~\"path|footway|track\"][\"name\"~\"{pattern}\"];);"
        "out tags center;"
    )
    found = _overpass(query)
    if not found:
        return []
    groups = choose_groups(found.get("elements") or [], trail_tokens)
    if not groups:
        return []
    relation_ids = []
    way_ids = []
    for _score, _name, members in groups:
        for item in members:
            if item.get("type") == "relation":
                relation_ids.append(str(item["id"]))
            elif item.get("type") == "way":
                way_ids.append(str(item["id"]))
    parts = []
    if relation_ids:
        parts.append("relation(id:" + ",".join(relation_ids) + ");")
    if way_ids:
        parts.append("way(id:" + ",".join(way_ids) + ");")
    geometry = _overpass("[out:json][timeout:25];(" + "".join(parts) + ");out geom;")
    if not geometry:
        return []
    by_key = {(item.get("type"), item.get("id")): item for item in geometry.get("elements") or []}
    routes = []
    for _score, name, members in groups:
        lines = []
        for item in members:
            element = by_key.get((item.get("type"), item.get("id")))
            if element:
                lines.extend(lines_from_element(element))
        if lines and keep_line(name, lines, hike_km):
            routes.append({"name": name, "lines": lines})
    return routes


def attach_routes(trails, cache_path=None, pause=0.3):
    cache = {}
    path = Path(cache_path) if cache_path else None
    if path and path.exists():
        cache = json.loads(path.read_text(encoding="utf-8"))
    matched = 0
    for index, trail in enumerate(trails, start=1):
        key = str(trail["id"])
        cached = cache.get(key)
        hike_km = trail.get("kmMax") or trail.get("kmMin")
        if cached and "routes" in cached:
            if trail.get("lat") is None and cached.get("lat") is not None:
                trail["lat"] = cached["lat"]
                trail["lng"] = cached["lng"]
                trail["pinSource"] = "search"
            routes = [
                route for route in cached["routes"]
                if keep_line(route.get("name"), route.get("lines"), hike_km)
            ]
            trail["routes"] = routes
            cached["routes"] = routes
            matched += bool(routes)
            continue
        if trail.get("lat") is None:
            point = geocode(trail.get("waze") or " ".join(specific_tokens(trail["name"])[:3]))
            time.sleep(pause)
            if point:
                trail["lat"], trail["lng"] = point
                trail["pinSource"] = "search"
        tokens = specific_tokens(trail["name"])
        routes = []
        if trail.get("lat") is not None and tokens:
            routes = find_routes(trail["lat"], trail["lng"], tokens, hike_km)
            time.sleep(pause)
        trail["routes"] = routes
        cache[key] = {"lat": trail.get("lat"), "lng": trail.get("lng"), "routes": routes}
        matched += bool(routes)
        if index % 25 == 0 or index == len(trails):
            print(f"routes {index}/{len(trails)}, with a line: {matched}")
            if path:
                path.parent.mkdir(exist_ok=True)
                path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    if path:
        path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return matched
