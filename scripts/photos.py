"""Field photos published with a campsite or a hike on parks.org.il.

Keeps a short gallery: a display-sized image and the photographer credit.
Maps, icons and duplicates are left out.
"""

import re
from urllib.parse import urlparse

from scripts.classify import plain_text

MAX_PHOTOS = 8
_SKIP = ("מפה", "מפת", "אייקון", "logo", "icon-", ".svg", ".gif")
_SIZE_RE = re.compile(r"-\d+x\d+(?=\.[a-z]+$)", re.I)
_SCALED_RE = re.compile(r"-scaled(?=\.)", re.I)
_EDIT_RE = re.compile(r"-e\d{6,}(?=\.)", re.I)
_IMG_RE = re.compile(r"<img\b[^>]*>", re.I)
_URL_RE = re.compile(r"https://(?:www|static|writer)\.parks\.org\.il/wp-content/uploads/[^\"'\s>]+", re.I)


def image_key(url):
    path = urlparse(url or "").path
    path = _SIZE_RE.sub("", path)
    path = _SCALED_RE.sub("", path)
    path = _EDIT_RE.sub("", path)
    return path


def clean_credit(caption, alt=""):
    text = plain_text(caption)
    if len(text) < 2:
        alt_text = plain_text(alt)
        if "צילום" in alt_text:
            text = alt_text[alt_text.find("צילום"):]
        elif alt_text and len(alt_text) <= 80:
            text = alt_text
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text[:100]


def _skipped(url, credit):
    blob = f"{url} {credit}".lower()
    if any(word in blob for word in _SKIP):
        return True
    return not re.search(r"\.(jpe?g|webp|png)(?:$|\?)", url or "", re.I)


def _widest(sizes, fallback=None):
    widths = []
    if isinstance(sizes, dict):
        for key, value in sizes.items():
            if isinstance(key, str) and key.endswith("-width"):
                try:
                    widths.append(int(value))
                except (TypeError, ValueError):
                    continue
            if isinstance(value, dict) and value.get("width"):
                try:
                    widths.append(int(value["width"]))
                except (TypeError, ValueError):
                    continue
    if fallback:
        try:
            widths.append(int(fallback))
        except (TypeError, ValueError):
            pass
    return max(widths) if widths else None


def _sized_url(sizes, key):
    sized = sizes.get(key)
    if isinstance(sized, str) and sized.startswith("http"):
        try:
            width = int(sizes.get(f"{key}-width") or 0)
        except (TypeError, ValueError):
            width = 0
        return sized, width
    if isinstance(sized, dict):
        url = sized.get("source_url") or sized.get("url")
        if isinstance(url, str) and url.startswith("http"):
            try:
                width = int(sized.get("width") or 0)
            except (TypeError, ValueError):
                width = 0
            return url, width
    return None, 0


def _display_url(image):
    """Prefer a mid-size file that is still sharp. Returns (src, full)."""
    if not isinstance(image, dict):
        return None, None
    sizes = image.get("sizes") if isinstance(image.get("sizes"), dict) else {}
    src = None
    for key in ("medium_large", "large", "medium"):
        url, width = _sized_url(sizes, key)
        if url and (not width or width >= 480):
            src = url
            break
    full = image.get("url") or image.get("source_url")
    if not isinstance(full, str) or not full.startswith("http"):
        full = src
    return src or full, full or src


def add_photo(photos, seen, src, credit, width=None):
    if not src or _skipped(src, credit):
        return
    if width is not None and width < 480:
        return
    key = image_key(src)
    if not key or key in seen or len(photos) >= MAX_PHOTOS:
        return
    seen.add(key)
    photos.append({"src": src, "credit": credit})


def _from_image_dict(photos, seen, image, credit=""):
    src, _full = _display_url(image)
    if not src:
        return
    if not credit:
        credit = clean_credit(image.get("caption") or "", image.get("alt") or image.get("alt_text") or "")
    width = _widest(image.get("sizes"), image.get("width"))
    add_photo(photos, seen, src, credit, width)


def merge_photos(*groups):
    photos = []
    seen = set()
    for group in groups:
        for photo in group or []:
            add_photo(photos, seen, photo.get("src"), photo.get("credit") or "")
    return photos


def photos_from_paid(acf):
    photos = []
    seen = set()
    for slide in acf.get("rp_slider") or []:
        if not isinstance(slide, dict) or slide.get("show_slider_item") is False:
            continue
        credit = clean_credit(slide.get("credit") or "", "")
        _from_image_dict(photos, seen, slide.get("desktop_image"), credit)
    _from_image_dict(photos, seen, acf.get("map_images"))
    return photos


def photos_from_trail(acf):
    photos = []
    seen = set()
    for item in acf.get("images") or []:
        image = item.get("image") if isinstance(item, dict) else None
        _from_image_dict(photos, seen, image)
    _from_image_dict(photos, seen, acf.get("image"))
    return photos


def photos_from_media(items):
    photos = []
    seen = set()
    for item in items or []:
        if not isinstance(item, dict):
            continue
        if item.get("mime_type") not in ("image/jpeg", "image/webp", "image/png"):
            continue
        details = item.get("media_details") or {}
        image = {
            "url": item.get("source_url"),
            "sizes": details.get("sizes") or {},
            "width": details.get("width"),
            "alt": item.get("alt_text") or "",
            "caption": (item.get("caption") or {}).get("rendered") or "",
        }
        _from_image_dict(photos, seen, image)
    return photos


def photos_from_html(html):
    photos = []
    seen = set()
    for match in _IMG_RE.finditer(html or ""):
        tag = match.group(0)
        urls = []
        for raw in _URL_RE.findall(tag):
            urls.append(raw.replace("https://writer.parks.org.il", "https://www.parks.org.il").replace("https://static.parks.org.il", "https://www.parks.org.il"))
        if not urls:
            continue
        src = next((url for url in urls if not _SIZE_RE.search(urlparse(url).path)), urls[0])
        alt_match = re.search(r'alt="([^"]*)"', tag)
        alt = alt_match.group(1) if alt_match else ""
        window = (html or "")[match.end():match.end() + 400]
        caption_match = re.search(r'class="[^"]*caption[^"]*"[^>]*>(.*?)</', window, re.S)
        caption = caption_match.group(1) if caption_match else ""
        add_photo(photos, seen, src, clean_credit(caption, alt))
    return photos
