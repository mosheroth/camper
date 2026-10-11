"""Pull campsites and trails from the Israel Nature and Parks Authority site.

Writes data/camps.json, data/trails.json and data/meta.json for the static site.
The WordPress REST API is public; this only reads published pages.
"""

import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.classify import (  # noqa: E402
    difficulties,
    is_accessible,
    is_family,
    is_hike,
    parse_hours,
    parse_km,
    plain_text,
    primary_difficulty,
    shape,
    time_flags,
)
from scripts.geo import itm_to_wgs84, region_from_lat  # noqa: E402
from scripts.match import nearby_trails  # noqa: E402

API = "https://www.parks.org.il/wp-json/wp/v2"
UA = (
    "Mozilla/5.0 (compatible; CamperWeekendBot/0.1; +https://github.com/mosheroth/camper)"
)
PARENT_REGION = {
    4698: "north",
    4680: "center",
    4699: "south",
    4690: "east",
}
REGION_ORDER = ("east", "north", "center", "south")

# Official paid-camp page groups these sites when a coordinate is missing.
PAID_REGION_BY_ID = {
    14987: "center",  # הקסטל
}


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    last_error = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                payload = json.load(response)
                return payload, response.headers
        except urllib.error.HTTPError as error:
            if error.code == 400:
                raise
            last_error = error
        except urllib.error.URLError as error:
            last_error = error
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last_error}")


def fetch_collection(post_type, fields):
    page = 1
    items = []
    total_pages = 1
    while page <= total_pages:
        url = f"{API}/{post_type}?per_page=100&page={page}&_fields={fields}"
        payload, headers = fetch_json(url)
        items.extend(payload)
        total_pages = int(headers.get("X-WP-TotalPages") or 1)
        page += 1
        time.sleep(0.25)
    return items


def fetch_areas():
    payload, _headers = fetch_json(f"{API}/trip-area?per_page=100&_fields=id,name,parent,count")
    return {item["id"]: item for item in payload}


def title_of(item):
    raw = (item.get("title") or {}).get("rendered") or item.get("slug") or ""
    return plain_text(raw)


def image_url(value):
    if not isinstance(value, dict):
        return None
    sizes = value.get("sizes") or {}
    if isinstance(sizes, dict):
        for key in ("medium_large", "large", "medium"):
            sized = sizes.get(key)
            if isinstance(sized, str) and sized.startswith("http"):
                return sized
    url = value.get("url")
    if isinstance(url, str) and url.startswith("http"):
        return url
    return None


def first_image(acf):
    gallery = acf.get("images")
    if isinstance(gallery, list):
        for item in gallery:
            if isinstance(item, dict):
                url = image_url(item.get("image"))
                if url:
                    return url
    url = image_url(acf.get("image"))
    if url:
        return url
    url = image_url(acf.get("map_images"))
    if url:
        return url
    url = image_url(acf.get("img_free_camp"))
    if url:
        return url
    slider = acf.get("rp_slider")
    if isinstance(slider, list):
        for slide in slider:
            if isinstance(slide, dict):
                url = image_url(slide.get("desktop_image"))
                if url:
                    return url
    return None


def parse_wgs_pair(value):
    if not value or not isinstance(value, str):
        return None
    match = re.search(r"(3[0-3]\.\d+)\s*,\s*(3[4-6]\.\d+)", value)
    if not match:
        return None
    return float(match.group(1)), float(match.group(2))


def parse_float(value):
    if value is None or value is False or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def coords_from_acf(acf):
    pair = parse_wgs_pair(acf.get("Main_Entrance_Point_s") or "")
    if pair:
        return pair
    lat = parse_float(acf.get("lat_lng_waze"))
    lng = parse_float(acf.get("long_lng_waze"))
    if lat and lng and 29 < lat < 34 and 34 < lng < 36:
        return lat, lng
    easting = parse_float(acf.get("lat_lng"))
    northing = parse_float(acf.get("long_lng"))
    if easting and northing and easting > 1000 and northing > 1000:
        lat, lng = itm_to_wgs84(easting, northing)
        if 29 < lat < 34 and 34 < lng < 36:
            return round(lat, 6), round(lng, 6)
    blob = json.dumps(acf, ensure_ascii=False)
    pair = parse_wgs_pair(blob)
    if pair:
        return pair
    return None, None


def area_ids(item, acf):
    raw = list(item.get("trip-area") or [])
    extra = acf.get("trip_area")
    if isinstance(extra, list):
        raw.extend(extra)
    elif isinstance(extra, int):
        raw.append(extra)
    elif isinstance(extra, str) and extra.isdigit():
        raw.append(int(extra))
    return list(dict.fromkeys(int(value) for value in raw if str(value).isdigit() or isinstance(value, int)))


def regions_for(area_id_list, areas, lat, explicit):
    found = []
    for area_id in area_id_list:
        area = areas.get(area_id) or {}
        parent = area.get("parent") or 0
        region = PARENT_REGION.get(area_id) or PARENT_REGION.get(parent)
        if region and region not in found:
            found.append(region)
    for region in explicit:
        if region not in found:
            found.append(region)
    if not found:
        derived = region_from_lat(lat)
        if derived:
            found.append(derived)
    return [region for region in REGION_ORDER if region in found]


def child_area_names(area_id_list, areas):
    names = []
    for area_id in area_id_list:
        area = areas.get(area_id)
        if not area or area.get("parent") in (0, None):
            continue
        name = plain_text(area.get("name") or "")
        if name and name not in names:
            names.append(name)
    return names


def clip(text, limit=180):
    text = plain_text(text)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def paid_prices(acf):
    rows = []
    tables = acf.get("rp_sales_table")
    if not isinstance(tables, list):
        return rows
    for block in tables:
        if not isinstance(block, dict):
            continue
        for row in block.get("table") or []:
            if not isinstance(row, dict):
                continue
            label = plain_text(row.get("type") or "")
            price = plain_text(row.get("price") or "")
            if label and price:
                rows.append({"label": label, "price": price})
    return rows


def price_from(rows):
    """First regular adult tent price, before subscriber or extra-person rows."""
    for row in rows:
        label = row["label"]
        if "תוספת" in label or "מטמון" in label or "מנוי" in label:
            continue
        if "מבוגר" not in label:
            continue
        if "אוהל" not in label and "לינת שטח" not in label:
            continue
        match = re.search(r"(\d+(?:\.\d+)?)", row["price"].replace(",", ""))
        if not match:
            continue
        amount = float(match.group(1))
        return int(amount) if amount.is_integer() else amount
    return None


def paid_facilities(acf):
    flags = acf.get("map_filters_camping_facilities") or {}
    items = []
    if acf.get("Service_centers_s") or (acf.get("map_filters_facilities") or {}).get("restrooms_f"):
        items.append({"id": "toilet", "label": "שירותים"})
    if acf.get("Hot_water_shower_s") or flags.get("hot_wate_f"):
        items.append({"id": "shower", "label": "מקלחות"})
    if flags.get("kitchen_f") or acf.get("Gas_stove_s"):
        items.append({"id": "kitchen", "label": "מטבח שדה"})
    if (acf.get("map_filters_facilities") or {}).get("drinking_water_f") or acf.get("running_water_s"):
        items.append({"id": "water", "label": "מים"})
    if flags.get("campfire_permitted_f"):
        items.append({"id": "fire", "label": "מדורה"})
    if acf.get("family_tent_s"):
        items.append({"id": "family-tent", "label": "אוהל משפחתי"})
    if acf.get("caravan_station_s") or flags.get("caravan_f"):
        items.append({"id": "caravan", "label": "קרוואן"})
    if acf.get("electricity_s"):
        items.append({"id": "power", "label": "חשמל"})
    return items


def free_facilities(acf):
    items = []
    if acf.get("toilet"):
        items.append({"id": "toilet", "label": "שירותים"})
    if acf.get("water"):
        items.append({"id": "water", "label": "מים"})
    if acf.get("saharonim"):
        items.append({"id": "fire", "label": "סהרון למדורה"})
    if acf.get("cellular_reception"):
        items.append({"id": "cell", "label": "קליטה"})
    return items


def free_access(acf):
    if acf.get("without_access_car"):
        return "בלי גישת רכב"
    if acf.get("four_by_four_car") and not acf.get("any_car"):
        return "רכב 4×4"
    if acf.get("any_car"):
        return "רכב פרטי"
    return None


def explicit_free_regions(acf):
    found = []
    if acf.get("north"):
        found.append("north")
    if acf.get("center"):
        found.append("center")
    if acf.get("south"):
        found.append("south")
    if acf.get("judea_and_samaria"):
        found.append("east")
    return found


def places(value):
    number = parse_float(value)
    if number is None or number <= 0:
        return None
    return int(number)


def normalize_paid(item, areas):
    acf = item.get("acf") or {}
    lat, lng = coords_from_acf(acf)
    ids = area_ids(item, acf)
    explicit = []
    if item["id"] in PAID_REGION_BY_ID and lat is None:
        explicit.append(PAID_REGION_BY_ID[item["id"]])
    blurb = acf.get("map_description_buble") or ""
    if not plain_text(blurb):
        tabs = acf.get("rp_tab")
        if isinstance(tabs, list) and tabs:
            blurb = (tabs[0] or {}).get("content") or ""
    return {
        "id": item["id"],
        "name": title_of(item),
        "url": item.get("link"),
        "paid": True,
        "lat": lat,
        "lng": lng,
        "regions": regions_for(ids, areas, lat, explicit),
        "areas": [area_id for area_id in ids if (areas.get(area_id) or {}).get("parent")],
        "areaNames": child_area_names(ids, areas),
        "facilities": paid_facilities(acf),
        "access": None,
        "places": None,
        "priceFrom": price_from(paid_prices(acf)),
        "prices": paid_prices(acf)[:4],
        "blurb": clip(blurb),
        "image": first_image(acf),
    }


def normalize_free(item, areas):
    acf = item.get("acf") or {}
    lat, lng = coords_from_acf(acf)
    ids = area_ids(item, acf)
    return {
        "id": item["id"],
        "name": title_of(item),
        "url": item.get("link"),
        "paid": False,
        "lat": lat,
        "lng": lng,
        "regions": regions_for(ids, areas, lat, explicit_free_regions(acf)),
        "areas": [area_id for area_id in ids if (areas.get(area_id) or {}).get("parent")],
        "areaNames": child_area_names(ids, areas),
        "facilities": free_facilities(acf),
        "access": free_access(acf),
        "places": places(acf.get("num_of_places_to_stay")),
        "priceFrom": 0,
        "prices": [],
        "blurb": clip(acf.get("map_description") or acf.get("arrival_instructions") or ""),
        "image": first_image(acf),
    }


def normalize_trail(item, areas):
    acf = item.get("acf") or {}
    picnic = acf.get("picnic_trip") or {}
    if picnic.get("picnic_f") and not picnic.get("trip_f"):
        return None
    flags = acf.get("map_filters_nature_track") or {}
    facts = " ".join(
        plain_text(acf.get(key) or "")
        for key in ("icon_trip_2", "icon_trip_3", "intro_text")
    )
    title = title_of(item)
    if not is_hike(f"{title} {facts}"):
        return None
    family_text = " ".join(
        [
            title,
            plain_text(acf.get("intro_text") or ""),
            plain_text(acf.get("icon_trip_3") or ""),
        ]
    )
    levels = difficulties(facts + " " + title, flags)
    hours = parse_hours(facts)
    length = parse_km(facts)
    lat, lng = coords_from_acf(acf)
    ids = area_ids(item, acf)
    return {
        "id": item["id"],
        "name": title,
        "url": item.get("link"),
        "lat": lat,
        "lng": lng,
        "regions": regions_for(ids, areas, lat, []),
        "areas": [area_id for area_id in ids if (areas.get(area_id) or {}).get("parent")],
        "areaNames": child_area_names(ids, areas),
        "difficulties": levels,
        "difficulty": primary_difficulty(levels),
        "circular": shape(facts, flags),
        "hoursMin": hours[0] if hours else None,
        "hoursMax": hours[1] if hours else None,
        "kmMin": length[0] if length else None,
        "kmMax": length[1] if length else None,
        "timeFlags": time_flags(flags),
        "family": is_family(item.get("tags") or [], family_text),
        "accessible": is_accessible(facts, flags),
        "blurb": clip(acf.get("intro_text") or ""),
        "image": first_image(acf),
        "waze": plain_text(acf.get("waze_adress") or "") or None,
    }


def main():
    print("fetching areas, camps and trails…")
    areas = fetch_areas()
    paid_raw = fetch_collection(
        "camping",
        "id,title,link,acf",
    )
    free_raw = fetch_collection(
        "free_camping",
        "id,title,link,acf,trip-area",
    )
    trail_raw = fetch_collection(
        "trip",
        "id,title,link,tags,trip-area,acf",
    )
    camps = [normalize_paid(item, areas) for item in paid_raw]
    camps.extend(normalize_free(item, areas) for item in free_raw)
    trails = [trail for trail in (normalize_trail(item, areas) for item in trail_raw) if trail]
    for camp in camps:
        camp["nearby"] = nearby_trails(camp, trails)

    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "camps.json").write_text(
        json.dumps(camps, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (data_dir / "trails.json").write_text(
        json.dumps(trails, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    meta = {
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "https://www.parks.org.il",
        "counts": {
            "paid": sum(1 for camp in camps if camp["paid"]),
            "free": sum(1 for camp in camps if not camp["paid"]),
            "trails": len(trails),
            "family": sum(1 for trail in trails if trail["family"]),
            "circular": sum(1 for trail in trails if trail["circular"] is True),
        },
    }
    (data_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    missing_coords = [camp["name"] for camp in camps if camp["lat"] is None]
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    print("camps without coordinates:", len(missing_coords))
    for name in missing_coords[:12]:
        print(" -", name)


if __name__ == "__main__":
    main()
