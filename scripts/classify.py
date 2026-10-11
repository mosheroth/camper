"""Classify an INPA trail blurb into family / time / difficulty / shape."""

import html
import re

# "טיול עם משפחות" is an editorial tag. "מתאים למשפחות" is also applied to
# hard routes, so the word itself has to appear before that tag counts.
FAMILY_TAG_IDS = {976}

_HEB_NUMBERS = (
    ("שעתיים", 2),
    ("שמונה", 8),
    ("שלוש", 3),
    ("ארבע", 4),
    ("חמש", 5),
    ("שבע", 7),
    ("תשע", 9),
    ("עשר", 10),
    ("שש", 6),
    ("שעה", 1),
)

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")
_HEB_LETTER = "א-ת"


def plain_text(value):
    text = _TAG_RE.sub(" ", value or "")
    text = html.unescape(text).replace("\xa0", " ").replace("־", " ")
    return _WS_RE.sub(" ", text).strip()


def _section(text, label, stop_labels):
    match = re.search(rf"{label}\s*:?\s*(.+)", text)
    if not match:
        return ""
    chunk = match.group(1)
    stop = "|".join(stop_labels)
    return re.split(stop, chunk, maxsplit=1)[0].strip()


def _number_span(chunk):
    nums = [float(n) for n in _NUMBER_RE.findall(chunk)]
    heb = [value for word, value in _HEB_NUMBERS if word in chunk]
    if nums:
        return min(nums), max(nums)
    if heb:
        return float(min(heb)), float(max(heb))
    return None


def parse_hours(text):
    """Return (hours_min, hours_max) from a duration sentence, or None."""
    chunk = _section(text, "משך המסלול", ["אורך המסלול", "סוג המסלול", "אופי", "מוקדי"])
    source = chunk or text
    span = _number_span(source)
    if span:
        return span
    if "חצי יום" in source:
        return 4.0, 5.0
    if "יום מלא" in source or "יום שלם" in source:
        return 6.0, 9.0
    return None


def parse_km(text):
    chunk = _section(text, "אורך המסלול", ["משך המסלול", "סוג המסלול", "אופי", "מוקדי"])
    source = chunk or ""
    if not source:
        return None
    if re.search(r"קילומטר אחד|כקילומטר(?!\s*\d)", source):
        nums = _NUMBER_RE.findall(source)
        if not nums:
            return 1.0, 1.0
    span = _number_span(source)
    return span


def difficulties(text, flags):
    """Difficulty labels found in the blurb, else the official map flags."""
    cleaned = re.sub(r"לא\s+קש[הה]", " ", text)
    cleaned = re.sub(r"לא\s+מאתגר\S*", " ", cleaned)
    cleaned = re.sub(r"לא\s+אתגרי\S*", " ", cleaned)
    found = []
    if re.search(r"מ(?:י)?טיבי לכת|מאתגר|אתגרי|(?:^|[^\u0590-\u05FF])קש[הה](?:[^\u0590-\u05FF]|$)", cleaned):
        found.append("challenging")
    if "בינוני" in cleaned:
        found.append("moderate")
    if re.search(rf"(?:^|[^{_HEB_LETTER}])קל(?:[^{_HEB_LETTER}]|$)", cleaned) or "קלה" in cleaned:
        found.append("easy")
    if found:
        return found
    flags = flags or {}
    from_flags = []
    if flags.get("challenging_f"):
        from_flags.append("challenging")
    if flags.get("moderate_f"):
        from_flags.append("moderate")
    if flags.get("easy_f"):
        from_flags.append("easy")
    return from_flags


def primary_difficulty(levels):
    for level in ("challenging", "moderate", "easy"):
        if level in levels:
            return level
    return None


def shape(text, flags):
    """True circular, False linear, 'partial', or None when the page doesn't say."""
    if re.search(r"מעגלי\s+בחלקו|בחלקו\s+מעגלי|חצי\s+מעגלי", text):
        return "partial"
    if "מעגלי" in text:
        return True
    if re.search(rf"(?:^|[^{_HEB_LETTER}])קווי(?:[^{_HEB_LETTER}]|$)", text):
        return False
    flags = flags or {}
    if flags.get("circular_f"):
        return True
    if flags.get("linear_f"):
        return False
    return None


def is_family(tags, text):
    if "משפח" in (text or ""):
        return True
    return bool(FAMILY_TAG_IDS.intersection(tags or ()))


_NOT_HIKE = re.compile(
    r"אופני|ג['׳]יפ|רכוב|4\s*[xX×]\s*4"
    r"|(?:^|[^\u0590-\u05FF])(?:ברכב|לרכב)(?:[^\u0590-\u05FF]|$)"
)


def is_hike(text):
    """False for bike, jeep and driving routes published in the same index."""
    return _NOT_HIKE.search(text or "") is None


def is_accessible(text, flags):
    flags = flags or {}
    if flags.get("accessible_f"):
        return True
    return bool(re.search(r"מונגש|נגיש", text or ""))


def time_flags(flags):
    flags = flags or {}
    found = []
    if flags.get("half_day_f"):
        found.append("half")
    if flags.get("full_day_f"):
        found.append("full")
    if flags.get("multi_day_f"):
        found.append("multi")
    return found
