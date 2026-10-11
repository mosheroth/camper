"""Attach nearby trails to a campsite for a weekend plan."""

from scripts.geo import haversine_km

MAX_KM = 40
INFER_AREA_KM = 25


def _km(camp, trail):
    if camp.get("lat") is None or trail.get("lat") is None:
        return None
    return round(
        haversine_km(camp["lat"], camp["lng"], trail["lat"], trail["lng"]),
        1,
    )


def nearby_trails(camp, trails, max_km=MAX_KM):
    """Trails within max_km, or in the same sub-area when a pin is missing."""
    camp_areas = set(camp.get("areas") or [])
    linked = {}

    def add(trail, km):
        current = linked.get(trail["id"])
        if current is None or (km is not None and (current is None or km < current)):
            linked[trail["id"]] = km

    for trail in trails:
        km = _km(camp, trail)
        share = camp_areas.intersection(trail.get("areas") or [])
        if km is not None and km <= max_km:
            add(trail, km)
        elif share and (km is None or km <= max_km):
            add(trail, km)

    inferred = set()
    trails_by_id = {trail["id"]: trail for trail in trails}
    for trail_id, km in linked.items():
        if km is not None and km <= INFER_AREA_KM:
            inferred.update(trails_by_id[trail_id].get("areas") or [])
    inferred -= camp_areas
    if inferred:
        for trail in trails:
            if trail["id"] in linked:
                continue
            if not inferred.intersection(trail.get("areas") or []):
                continue
            km = _km(camp, trail)
            if km is not None and km > max_km:
                continue
            add(trail, km)

    return [
        {"id": trail_id, "km": km}
        for trail_id, km in sorted(
            linked.items(),
            key=lambda item: (item[1] is None, item[1] if item[1] is not None else 0),
        )
    ]
