"""Israeli grid helpers used when a campsite has ITM coordinates but no WGS84 pin."""

import math

# EPSG:2039 — Israel 1993 / Israeli TM Grid, GRS80.
_A = 6378137.0
_F = 1 / 298.257222101
_B = _A * (1 - _F)
_E2 = (_A * _A - _B * _B) / (_A * _A)
_EP2 = (_A * _A - _B * _B) / (_B * _B)
_LAT0 = math.radians(31.73439361111111)
_LON0 = math.radians(35.20451694444445)
_K0 = 1.0000067
_FALSE_E = 219529.584
_FALSE_N = 626907.390


def _meridional(phi):
    e2 = _E2
    e4 = e2 * e2
    e6 = e4 * e2
    aa = 1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256
    bb = 3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024
    cc = 15 * e4 / 256 + 45 * e6 / 1024
    dd = 35 * e6 / 3072
    return _A * (
        aa * phi
        - bb * math.sin(2 * phi)
        + cc * math.sin(4 * phi)
        - dd * math.sin(6 * phi)
    )


def itm_to_wgs84(easting, northing):
    """Convert ITM easting/northing (meters) to WGS84 (lat, lng) degrees."""
    e2 = _E2
    x = easting - _FALSE_E
    y = northing - _FALSE_N
    meridional = _meridional(_LAT0) + y / _K0
    mu = meridional / (_A * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
        + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
        + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
        + (1097 * e1 ** 4 / 512) * math.sin(8 * mu)
    )
    cos1 = math.cos(phi1)
    tan1 = math.tan(phi1)
    c1 = _EP2 * cos1 * cos1
    t1 = tan1 * tan1
    n1 = _A / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    r1 = _A * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    d = x / (n1 * _K0)
    lat = phi1 - (n1 * tan1 / r1) * (
        d * d / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * _EP2) * d ** 4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * _EP2 - 3 * c1 * c1) * d ** 6 / 720
    )
    lng = _LON0 + (
        d
        - (1 + 2 * t1 + c1) * d ** 3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * _EP2 + 24 * t1 * t1) * d ** 5 / 120
    ) / cos1
    return math.degrees(lat), math.degrees(lng)


def haversine_km(lat1, lng1, lat2, lng2):
    radius = 6371.0
    p1, l1, p2, l2 = map(math.radians, (lat1, lng1, lat2, lng2))
    dp = p2 - p1
    dl = l2 - l1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def region_from_lat(lat):
    """Macro region used on the paid-campsite index when the page has no region flag."""
    if lat is None:
        return None
    if lat >= 32.45:
        return "north"
    if lat >= 31.55:
        return "center"
    return "south"
