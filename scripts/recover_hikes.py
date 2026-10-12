"""Add hike write-ups the vehicle filter used to drop by mistake.

A walk that only mentions returning to the car, a pickup, or cavalry
(רכובים) is still a hike. Driving, bike and jeep routes stay out.
Re-running skips ids already in data/trails.json.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.classify import is_hike, plain_text  # noqa: E402
from scripts.fetch_inpa import (  # noqa: E402
    API,
    UA,
    enrich_photos,
    fetch_areas,
    fetch_json,
    normalize_trail,
)
from scripts.match import nearby_trails  # noqa: E402
from scripts.osm_routes import attach_routes  # noqa: E402

# Pages whose title is a hike recommendation, but an older wording check
# treated a car or the word רכוב inside the blurb as a driving route.
CANDIDATES = (
    366907, 295240, 295235, 147488, 120059, 113500, 112491, 111947,
    64001, 6070, 6026, 5970, 5468, 5466,
)


def hike_text(item):
    acf = item.get("acf") or {}
    title = plain_text((item.get("title") or {}).get("rendered") or "")
    facts = " ".join(
        plain_text(acf.get(key) or "")
        for key in ("icon_trip_2", "icon_trip_3", "intro_text")
    )
    return f"{title} {facts}"


def main():
    trails_path = ROOT / "data" / "trails.json"
    camps_path = ROOT / "data" / "camps.json"
    meta_path = ROOT / "data" / "meta.json"
    trails = json.loads(trails_path.read_text(encoding="utf-8"))
    have = {trail["id"] for trail in trails}
    wanted = [item_id for item_id in CANDIDATES if item_id not in have]
    if not wanted:
        print("nothing to add")
        return
    areas = fetch_areas()
    url = (
        f"{API}/trip?include={','.join(str(item_id) for item_id in wanted)}"
        f"&per_page={len(wanted)}&_fields=id,title,link,tags,trip-area,content,acf"
    )
    payload, _headers = fetch_json(url)
    fresh = []
    for item in payload:
        text = hike_text(item)
        title = plain_text((item.get("title") or {}).get("rendered") or "")
        if not is_hike(text):
            print("still a vehicle route:", item["id"], title)
            continue
        trail = normalize_trail(item, areas)
        if not trail:
            print("skipped:", item["id"], title)
            continue
        fresh.append(trail)
        print("adding", trail["id"], trail["name"])
    if not fresh:
        print("no hikes recovered")
        return
    enrich_photos(fresh)
    attach_routes(fresh, cache_path=ROOT / "data" / ".osm-cache.json")
    trails.extend(fresh)
    camps = json.loads(camps_path.read_text(encoding="utf-8"))
    for camp in camps:
        camp["nearby"] = nearby_trails(camp, trails)
    trails_path.write_text(json.dumps(trails, ensure_ascii=False, indent=2), encoding="utf-8")
    camps_path.write_text(json.dumps(camps, ensure_ascii=False, indent=2), encoding="utf-8")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["fetchedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta["counts"]["trails"] = len(trails)
    meta["counts"]["family"] = sum(1 for trail in trails if trail["family"])
    meta["counts"]["circular"] = sum(1 for trail in trails if trail["circular"] is True)
    meta["counts"]["routes"] = sum(1 for trail in trails if trail.get("routes"))
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print("trails now", len(trails))


if __name__ == "__main__":
    main()
