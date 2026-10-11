"""Factual sections from an INPA page: prices, hours, amenities, trail stats."""

import re

from scripts.classify import plain_text

_LI_RE = re.compile(r"<li[^>]*>(.*?)</li>", re.I | re.S)
_P_RE = re.compile(r"<p[^>]*>(.*?)</p>", re.I | re.S)


def list_items(html):
    items = []
    for raw in _LI_RE.findall(html or ""):
        text = plain_text(raw)
        if text and text not in items:
            items.append(text)
    return items


def clip_text(text, limit):
    text = plain_text(text)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def camp_sections(acf):
    sections = []
    tabs = acf.get("rp_tab")
    if not isinstance(tabs, list):
        return sections
    for tab in tabs:
        if not isinstance(tab, dict) or tab.get("tab_status") is False:
            continue
        html = tab.get("content") or ""
        items = list_items(html)[:24]
        title = plain_text(tab.get("name") or "") or "פרטים"
        text = "" if items else clip_text(html, 420)
        if items or text:
            sections.append({"title": title, "items": items, "text": text})
        if len(sections) >= 4:
            break
    return sections


def arrival_text(acf):
    chunks = []
    rows = acf.get("rp_info_arrive")
    if isinstance(rows, list):
        for row in rows:
            if isinstance(row, dict):
                chunks.append(row.get("rp_info_arriveDesc") or "")
                chunks.append(row.get("rp_info_arrive") or "")
    chunks.append(acf.get("arrival_instructions") or "")
    chunks.append(acf.get("more_info") or "")
    text = " ".join(plain_text(chunk) for chunk in chunks if plain_text(chunk))
    return clip_text(text, 500)


def hours_text(acf):
    return clip_text(acf.get("camp_open_hour") or "", 500)


def paragraphs(html):
    found = []
    for raw in _P_RE.findall(html or ""):
        text = plain_text(raw)
        if len(text) >= 40 and "חניון שלט" not in text:
            found.append(text)
    return found


def content_image(html):
    urls = re.findall(r"https://www\.parks\.org\.il/wp-content/uploads/[^\"'\s>]+", html or "")
    full = [url for url in urls if not re.search(r"-\d+x\d+\.", url)]
    if full:
        return full[0]
    return urls[0] if urls else None


def free_camp_details(content_html):
    items = []
    for item in list_items(content_html):
        if item.startswith("נ.צ"):
            continue
        items.append(item)
    items = items[:18]
    summary = clip_text(" ".join(paragraphs(content_html)[:2]), 520)
    sections = []
    if items:
        sections.append({"title": "מידע שימושי", "items": items, "text": ""})
    return {"sections": sections, "hours": "", "arrival": "", "summary": summary}


def route_snippet(html):
    text = plain_text(html)
    match = re.search(r"תיאור המסלול\s+(.{40,})", text)
    source = match.group(1) if match else text
    return clip_text(source, 420)


def trail_details(acf, content_html=""):
    highlights = list_items(acf.get("icon_trip_4") or "")[:12]
    summary = clip_text(acf.get("intro_text") or "", 520)
    snippet = route_snippet(content_html) if content_html else ""
    if snippet and snippet in summary:
        snippet = ""
    return {
        "summary": summary,
        "snippet": snippet,
        "mapSheet": plain_text(acf.get("icon_trip_1") or ""),
        "stats": plain_text(acf.get("icon_trip_2") or ""),
        "character": plain_text(acf.get("icon_trip_3") or ""),
        "highlights": highlights,
    }
