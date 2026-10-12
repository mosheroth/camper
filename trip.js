const COLORS = ["#a3472c", "#1d6a4f", "#1d4e89", "#8a5a00", "#6b3fa0"];
const PLACE_KIND = {
  spring: "מעיין",
  waterfall: "מפל",
  viewpoint: "מצפור",
  peak: "פסגה",
  park: "גן לאומי",
  reserve: "שמורה",
  beach: "חוף",
};
const PLACE_MARK = {
  spring: "💧",
  waterfall: "💦",
  viewpoint: "🔭",
  peak: "⛰️",
  park: "🏞️",
  reserve: "🌿",
  beach: "🏖️",
};
const CATALOG_ROLE = {
  hike: ["🥾", "טיול"],
  place: ["📍", "נקודת עניין"],
  coffee: ["☕", "מקום לקפה"],
};
const TRAIT_ORDER = ["עד 3 שעות", "קל", "למשפחות", "מעגלי", "מוצל", "רטוב", "תצפית", "מעיין", "מפל", "פסגה", "גן לאומי", "שמורה", "חוף", "מים", "מערות", "מונגש", "חיות בר", "פריחה", "ארכיאולוגיה", "עגלה", "מטמון", "כלבים", "בתיאום מראש"];
const TAG_MARK = {
  "לילדים": "🧒",
  "מוצל": "🌳",
  "מסלול רטוב": "💦",
  "נוף מהמם": "🔭",
  "פארק שעשועים": "🎢",
  "מונגש": "♿",
  "בתיאום מראש": "📅",
  "תצפית": "🔭",
  "חיות בר": "🦌",
  "מים": "💧",
  "ארכיאולוגיה": "🏺",
  "פריחה": "🌸",
  "עגלה": "🛒",
  "מטמון": "💎",
  "קל": "🙂",
  "מערות": "🕳️",
  "כלבים": "🐕",
};
const TRAIT_MARK = Object.assign({
  "עד 3 שעות": "⏱️",
  "למשפחות": "👨‍👩‍👧",
  "מעגלי": "🔁",
  "רטוב": "💦",
  "מעיין": "💧",
  "מפל": "💦",
  "פסגה": "⛰️",
  "גן לאומי": "🏞️",
  "שמורה": "🌿",
  "חוף": "🏖️",
}, TAG_MARK);
const PLACE_COLOR = {
  spring: "#1d6a8a",
  waterfall: "#0b6e8a",
  viewpoint: "#8a5a00",
  peak: "#4d5a32",
  park: "#1d6a4f",
  reserve: "#1d6a4f",
  beach: "#1d4e89",
};
const TIME_LABEL = {
  depart: "שעת יציאה",
  arrive: "שעת הגעה",
  dinner: "שעת ארוחת ערב",
  rise: "שעת קימה",
  breakfast: "שעת ארוחת בוקר",
  start: "שעת יציאה למסלול",
  hike: "שעת המסלול",
  coffee: "שעת התצפית",
  visit: "שעת הביקור",
  lunch: "שעת ארוחת צהריים",
  return: "שעת יציאה הביתה",
  home: "שעת הגעה הביתה",
};
const REGION_LABEL = { north: "צפון", center: "מרכז", south: "דרום", east: "יו״ש" };
const HOME_PLACE = {
  north: "אזור הצפון",
  center: "אזור המרכז",
  south: "אזור הדרום",
  east: "אזור יו״ש",
};

function savedHome() {
  try {
    const saved = localStorage.getItem("camper-home");
    if (REGION_LABEL[saved]) return saved;
  } catch (_error) {
    /* the trip stays on the center departure */
  }
  return "center";
}

const title = document.querySelector("#title");
const lead = document.querySelector("#lead");
const mapNote = document.querySelector("#map-note");
const dossier = document.querySelector("#dossier");

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function decorate(node, emoji, text) {
  if (emoji) {
    const mark = el("span", "mark", emoji);
    mark.setAttribute("aria-hidden", "true");
    node.append(mark);
  }
  if (text) node.append(document.createTextNode(text));
  return node;
}

function tagItem(tag) {
  return decorate(el("li"), TAG_MARK[tag], tag);
}

function kindLabel(kind, fallback) {
  const name = PLACE_KIND[kind] || fallback || "";
  if (!name) return "";
  return PLACE_MARK[kind] ? `${PLACE_MARK[kind]} ${name}` : name;
}

function placeOpenerLabel(place) {
  const photos = (place.photos && place.photos.length) || place.image;
  if (photos && (place.wiki || place.site)) return "פירוט";
  if (photos) return "תמונות";
  if (place.wiki) return "הערך";
  if (place.site) return "האתר";
  return "פירוט";
}

function link(href, text) {
  const node = el("a", null, text);
  node.href = href;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  return node;
}

function params() {
  const query = new URLSearchParams(window.location.search);
  const campId = Number(query.get("camp"));
  const trailIds = (query.get("trails") || "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const radius = Number(query.get("radius"));
  const focus = Number(query.get("focus"));
  const view = query.get("view");
  const hikes = {};
  (query.get("hikes") || "").split(",").forEach((part) => {
    const [id, minutes] = part.split(":");
    const trailId = Number(id);
    const at = readMinute(minutes);
    if (Number.isInteger(trailId) && at != null) hikes[trailId] = at;
  });
  return {
    campId,
    trailIds,
    tripId: query.get("trip") || "",
    name: query.get("name") || "",
    view: view === "detail" || view === "camp" || view === "visit" || view === "coffee" ? view : "routes",
    focusId: Number.isFinite(focus) ? focus : null,
    arrival: query.has("arrival") && readMinute(query.get("arrival")) != null ? readMinute(query.get("arrival")) : 17 * 60,
    dinner: readMinute(query.get("dinner")),
    rise: readMinute(query.get("rise")),
    breakfast: readMinute(query.get("breakfast")),
    start: readMinute(query.get("start")),
    lunch: readMinute(query.get("lunch")),
    hikes,
    radius: radius === 40 ? 40 : 20,
    order: readOrder(query.get("order")),
    from: readDate(query.get("from")),
    to: readDate(query.get("to")),
    back: readMinute(query.get("back")),
    coffee: readCoffee(query.get("coffee")),
    visit: readVisit(query.get("visit")),
    spot: /^[or]\d+$/.test(query.get("spot") || "") ? query.get("spot") : "",
    stops: readStops(query.get("stops")),
  };
}

function readDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : null;
}

function readOrder(value) {
  if (!value) return null;
  const tokens = [];
  value.split(",").forEach((part) => {
    if (part === "stay") {
      tokens.push("stay");
      return;
    }
    const visitId = window.CamperPlan.visitPlaceId(part);
    if (visitId) {
      tokens.push(window.CamperPlan.visitToken(visitId));
      return;
    }
    const placeId = window.CamperPlan.coffeePlaceId(part);
    if (placeId) {
      tokens.push(window.CamperPlan.coffeeToken(placeId));
      return;
    }
    const id = Number(part);
    if (Number.isFinite(id)) tokens.push(id);
  });
  return tokens.length ? tokens : null;
}

function readVisit(value) {
  const ids = [];
  String(value || "").split(",").forEach((part) => {
    const id = part.trim();
    if (/^[or]\d+$/.test(id) && !ids.includes(id)) ids.push(id);
  });
  return ids.slice(0, 2);
}

function splitStops(stops, visitIds) {
  const visits = new Set(visitIds || []);
  const coffeeAt = {};
  const visitAt = {};
  Object.keys(stops || {}).forEach((id) => {
    if (visits.has(id) || String(id).startsWith("r")) visitAt[id] = stops[id];
    else coffeeAt[id] = stops[id];
  });
  return { coffeeAt, visitAt };
}

function readCoffee(value) {
  const ids = [];
  String(value || "").split(",").forEach((part) => {
    const id = part.trim();
    if (/^[or]\d+$/.test(id) && !ids.includes(id)) ids.push(id);
  });
  return ids.slice(0, 2);
}

function readStops(value) {
  const stops = {};
  String(value || "").split(",").forEach((part) => {
    const [id, minutes] = part.split(":");
    const at = readMinute(minutes);
    if (/^[or]\d+$/.test(id || "") && at != null) stops[id] = at;
  });
  return stops;
}

function readMinute(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number >= 24 * 60) return null;
  return number;
}

function section(heading, bodyBuilder) {
  const block = el("section", "sheet");
  block.append(el("h2", null, heading));
  bodyBuilder(block);
  return block;
}

function addList(parent, items) {
  if (!items || !items.length) return;
  const list = el("ul", "detail-list");
  items.forEach((item) => list.append(el("li", null, item)));
  parent.append(list);
}

function gallery(parent, record) {
  const frames = (record.photos || []).filter((item) => item && item.src);
  if (!frames.length && record.image) frames.push({ src: record.image, credit: "" });
  if (!frames.length) return;

  const block = el("figure", "gallery");
  const stage = el("div", "gallery-stage");
  const image = document.createElement("img");
  const meta = el("div", "gallery-meta");
  const credit = el("span", null, "");
  const count = el("span", "count", "");
  meta.append(credit, count);
  stage.append(image);
  block.append(stage, meta);

  let index = 0;
  const thumbButtons = [];

  function show(nextIndex) {
    const alive = frames.filter((item) => !item.failed);
    if (!alive.length) {
      block.remove();
      return;
    }
    index = (nextIndex + frames.length) % frames.length;
    if (frames[index].failed) {
      show(nextIndex + 1);
      return;
    }
    const frame = frames[index];
    image.src = frame.src;
    image.alt = frame.credit || "תמונה מהשטח";
    credit.textContent = frame.credit || "";
    const position = alive.indexOf(frame) + 1;
    count.textContent = alive.length > 1 ? `${position} מתוך ${alive.length}` : "";
    meta.hidden = !credit.textContent && !count.textContent;
    thumbButtons.forEach((button, buttonIndex) => {
      button.hidden = Boolean(frames[buttonIndex].failed);
      button.setAttribute("aria-current", buttonIndex === index ? "true" : "false");
    });
  }

  image.addEventListener("error", () => {
    if (frames[index]) frames[index].failed = true;
    show(index + 1);
  });

  if (frames.length > 1) {
    const previous = el("button", "gallery-nav prev", "‹");
    previous.type = "button";
    previous.setAttribute("aria-label", "התמונה הקודמת");
    const next = el("button", "gallery-nav next", "›");
    next.type = "button";
    next.setAttribute("aria-label", "התמונה הבאה");
    previous.addEventListener("click", () => show(index - 1));
    next.addEventListener("click", () => show(index + 1));
    image.addEventListener("click", () => show(index + 1));
    stage.tabIndex = 0;
    stage.setAttribute("aria-label", "גלריית תמונות מהשטח");
    stage.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") show(index + 1);
      if (event.key === "ArrowRight") show(index - 1);
    });
    stage.append(previous, next);
    block.classList.add("has-nav");

    const thumbs = el("div", "thumbs");
    frames.forEach((frame, frameIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", frame.credit || `תמונה ${frameIndex + 1}`);
      const thumb = document.createElement("img");
      thumb.src = frame.src;
      thumb.alt = "";
      thumb.addEventListener("error", () => button.remove());
      button.append(thumb);
      button.addEventListener("click", () => show(frameIndex));
      thumbs.append(button);
      thumbButtons.push(button);
    });
    block.append(thumbs);
  }

  parent.append(block);
  show(0);
}

function campSheet(camp) {
  const details = camp.details || {};
  const block = section(camp.name, (node) => {
    gallery(node, camp);
    const regions = (camp.regions || []).map((region) => REGION_LABEL[region] || region).join(" · ");
    const areas = (camp.areaNames || []).slice(0, 2).join(" · ");
    node.append(el("p", "kicker", [camp.paid ? "חניון בתשלום" : "חניון בלי תשלום", regions, areas].filter(Boolean).join(" · ")));
    if (details.summary) node.append(el("p", null, details.summary));
    else if (camp.blurb) node.append(el("p", null, camp.blurb));
    if (camp.places) node.append(el("p", null, `${camp.places} מקומות לינה`));
    if (camp.access) node.append(el("p", null, `גישה: ${camp.access}`));
    if (camp.facilities.length) {
      node.append(el("h3", null, "מה יש בחניון"));
      addList(node, camp.facilities.map((item) => item.label));
    }
    (details.sections || []).forEach((part) => {
      node.append(el("h3", null, part.title));
      if (part.text) node.append(el("p", null, part.text));
      addList(node, part.items);
    });
    if (details.hours) {
      node.append(el("h3", null, "שעות"));
      node.append(el("p", null, details.hours));
    }
    if (details.arrival) {
      node.append(el("h3", null, "איך מגיעים"));
      node.append(el("p", null, details.arrival));
    }
    if (camp.prices && camp.prices.length) {
      node.append(el("h3", null, "מחירון"));
      const table = el("table", "prices");
      camp.prices.forEach((row) => {
        const tr = document.createElement("tr");
        tr.append(el("td", null, row.label), el("td", null, row.price));
        table.append(tr);
      });
      node.append(table);
      node.append(el("p", "fine", "המחיר הראשון למבוגר באוהל פרטי, לפני הנחות מנוי. יש לאמת במחירון העדכני."));
    }
    if (camp.bookingUrl) {
      const booking = el("p", null, "צריך להזמין מקום מראש. ");
      booking.append(link(camp.bookingUrl, "להזמנת מקום"));
      node.append(booking);
    }
    if (camp.paid) node.append(el("p", null, "הכניסה עם כלבים אסורה."));
    const links = el("div", "links");
    if (camp.url) links.append(link(camp.url, "העמוד המלא ברשות הטבע והגנים"));
    if (camp.lat != null) {
      links.append(link(`https://www.waze.com/ul?ll=${camp.lat},${camp.lng}&navigate=yes`, "ניווט לחניון"));
    }
    node.append(links);
  });
  block.classList.add("camp-sheet");
  return block;
}

function shortName(name) {
  const cut = String(name).split(/\s+[–—-]\s+/)[0].trim();
  return cut.length > 34 ? `${cut.slice(0, 32)}…` : cut;
}

function visitFact(place) {
  if (!place) return "";
  const bits = [];
  if (place.paid === true) bits.push("בתשלום");
  else if (place.paid === false) bits.push("בחינם");
  if (place.duration) bits.push(place.duration);
  else bits.push(`הערכה ${window.CamperPlan.shareDuration(window.CamperPlan.visitMinutes(place))}`);
  return bits.join(" · ");
}

function trailFacts(trail) {
  const bits = [];
  const difficulty = { easy: "קלה", moderate: "בינונית", challenging: "מאתגרת" };
  if (trail.difficulty) bits.push(difficulty[trail.difficulty]);
  if (trail.circular === true) bits.push("מעגלי");
  else if (trail.circular === "partial") bits.push("מעגלי חלקית");
  else if (trail.circular === false) bits.push("קווי");
  if (trail.hoursMax && trail.hoursMax <= 16) {
    if (trail.hoursMin && trail.hoursMin !== trail.hoursMax) bits.push(`${trail.hoursMin}–${trail.hoursMax} שעות`);
    else bits.push(`כ־${trail.hoursMax} שעות`);
  }
  if (window.CamperPlan.lengthIsUsable(trail)) {
    if (trail.kmMin && trail.kmMax && trail.kmMin !== trail.kmMax) bits.push(`${trail.kmMin}–${trail.kmMax} ק״מ`);
    else bits.push(`כ־${trail.kmMax || trail.kmMin} ק״מ`);
  }
  if (trail.family) bits.push("למשפחות");
  if (trail.accessible) bits.push("מונגש");
  (trail.areaNames || []).slice(0, 1).forEach((name) => bits.push(name));
  return bits.join(" · ");
}

function visitSheet(place, km, way) {
  const kind = kindLabel(place.kind, "ביקור");
  return section(place.name, (node) => {
    gallery(node, place);
    const bits = [kind];
    if (way) bits.push(way);
    if (km != null) bits.push(km < 0.4 ? "במקום" : `כ־${km} ק״מ מהחניון`);
    if (place.paid === true) bits.push(place.priceFrom != null ? `בתשלום, מ־${place.priceFrom} ₪ למבוגר` : "בתשלום");
    else if (place.paid === false) bits.push("בחינם");
    const officialPlace = place.source === "inpa" || /parks\.org\.il/.test(place.url || "");
    if (place.duration) bits.push(`משך הביקור: ${place.duration}`);
    else bits.push(`${officialPlace ? "הערכת ביקור" : "הערכת עצירה"}: ${window.CamperPlan.shareDuration(window.CamperPlan.visitMinutes(place))}`);
    if (place.accessible) bits.push("מונגש");
    if (place.booking) bits.push("בתיאום מראש");
    node.append(el("p", "kicker", bits.join(" · ")));
    if (place.blurb) node.append(el("p", null, place.blurb));
    const tags = window.CamperPlan.placeTags(place);
    if (tags.length) {
      const lures = el("ul", "lures");
      tags.forEach((tag) => lures.append(tagItem(tag)));
      node.append(lures);
    }
    if (place.prices && place.prices.length) {
      node.append(el("h3", null, "דמי כניסה"));
      const table = el("table", "prices");
      place.prices.forEach((row) => {
        const tr = document.createElement("tr");
        tr.append(el("td", null, row.label), el("td", null, row.price));
        table.append(tr);
      });
      node.append(table);
      node.append(el("p", "fine", "המחיר למבוגר לפי המחירון שפורסם. יש לאמת במחירון העדכני."));
    }
    if (place.arrival) node.append(el("p", null, place.arrival));
    if (!place.duration && (place.source === "inpa" || /parks\.org\.il/.test(place.url || ""))) {
      node.append(el("p", "fine", "משך הביקור לא מסומן בעמוד הרשות, אז הלוז שם הערכה. אפשר לשנות את השעה."));
    } else if (!place.duration) {
      node.append(el("p", "fine", `אין משך רשמי, אז הלוז שם הערכה של ${window.CamperPlan.shareDuration(window.CamperPlan.visitMinutes(place))}. אפשר לשנות את השעה.`));
    }
    const links = el("div", "links");
    if (place.wiki) links.append(link(place.wiki, "הערך בוויקיפדיה"));
    if (place.site) links.append(link(place.site, "האתר"));
    if (place.url) links.append(link(place.url, officialPlace ? "העמוד המלא ברשות הטבע והגנים" : "הנקודה במפה"));
    if (place.lat != null) {
      links.append(link(`https://www.waze.com/ul?ll=${place.lat},${place.lng}&navigate=yes`, officialPlace ? "ניווט לכניסה" : "ניווט לנקודה"));
    }
    node.append(links);
  });
}

function coffeeSheet(place, km, way) {
  const photos = (place.photos || []).filter((item) => item && item.src);
  return section(place.name, (node) => {
    gallery(node, place);
    const bits = ["מצפור"];
    if (way) bits.push(way);
    if (km != null) bits.push(km < 0.4 ? "במקום" : `כ־${km} ק״מ מהחניון`);
    bits.push("כחצי שעה");
    node.append(el("p", "kicker", bits.join(" · ")));
    node.append(el("p", null, "עצירה של כחצי שעה בלוז, ליד המצפור."));
    if (!photos.length && !place.image && !place.wiki && !place.site) {
      node.append(el("p", "fine", "אין תמונה או ערך שמסומנים על הנקודה."));
    }
    const links = el("div", "links");
    if (place.wiki) links.append(link(place.wiki, "הערך בוויקיפדיה"));
    if (place.site) links.append(link(place.site, "האתר"));
    if (place.url) links.append(link(place.url, "הנקודה במפה"));
    if (place.lat != null) {
      links.append(link(`https://www.waze.com/ul?ll=${place.lat},${place.lng}&navigate=yes`, "ניווט למצפור"));
    }
    if (links.childNodes.length) node.append(links);
  });
}

function trailSheet(trail) {
  const details = trail.details || {};
  return section(trail.name, (node) => {
    gallery(node, trail);
    const facts = trailFacts(trail);
    node.append(el("p", "kicker", facts ? `מסלול הליכה · ${facts}` : "מסלול הליכה"));
    if (details.summary) node.append(el("p", null, details.summary));
    if (details.character) node.append(el("p", null, details.character));
    if (details.stats) node.append(el("p", null, details.stats));
    if (details.mapSheet) node.append(el("p", null, details.mapSheet));
    if (details.highlights && details.highlights.length) {
      node.append(el("h3", null, "בדרך"));
      addList(node, details.highlights);
    }
    if (details.snippet) {
      node.append(el("h3", null, "תקציר הדרך"));
      node.append(el("p", null, details.snippet));
    }
    if (trail.routes && trail.routes.length) {
      node.append(el("h3", null, "קווים במפה"));
      addList(node, trail.routes.map((route) => route.name).filter(Boolean));
    } else {
      node.append(el("p", "fine", "לא נמצא קו שביל פתוח ששמו תואם למסלול הזה, אז המפה מסמנת את נקודת ההתחלה בלבד."));
    }
    const links = el("div", "links");
    if (trail.url) links.append(link(trail.url, "העמוד המלא ברשות הטבע והגנים"));
    if (trail.waze) {
      links.append(link(`https://www.waze.com/ul?q=${encodeURIComponent(trail.waze)}&navigate=yes`, "ניווט לתחילת המסלול"));
    }
    node.append(links);
  });
}

let sharedMap = null;
let overlay = null;
let layersById = new Map();
let focusedKey = null;
let tripView = null;
let previewLine = null;
let previewing = false;
let previewKey = null;
let placeMarks = new Map();

window.addEventListener("resize", () => {
  if (sharedMap) sharedMap.invalidateSize({ animate: false });
});

function emphasize(id) {
  const key = id == null ? null : String(id);
  document.querySelectorAll(".spot, .day-block").forEach((node) => {
    node.classList.toggle("linked", key != null && node.dataset.id === key);
  });
  layersById.forEach((entry, entryKey) => {
    const on = entryKey === key;
    entry.lines.forEach((line) => {
      line.setStyle({ weight: on ? 8 : 4, opacity: on ? 1 : 0.7 });
      if (on) line.bringToFront();
    });
    entry.dots.forEach((dot) => {
      dot.setStyle({
        radius: on ? 11 : 6,
        weight: on ? 3 : 2,
        fillOpacity: on ? 1 : 0.85,
      });
      if (on) dot.bringToFront();
    });
  });
  placeMarks.forEach((marker, markerKey) => {
    const on = markerKey === key;
    marker.setStyle({ radius: on ? 9 : 5, weight: on ? 3 : 2, fillOpacity: 1 });
    if (on) marker.bringToFront();
  });
  const pin = document.querySelector(".camp-marker");
  if (pin) pin.classList.toggle("pin-hot", key === "camp");
}

function focusFeature(id) {
  focusedKey = id == null ? null : String(id);
  emphasize(focusedKey);
  const entry = focusedKey && layersById.get(focusedKey);
  if (!entry || !sharedMap || !entry.bounds.length) return;
  if (entry.bounds.length === 1) sharedMap.flyTo(entry.bounds[0], 13, { duration: 0.45 });
  else sharedMap.flyToBounds(entry.bounds, { padding: [40, 40], maxZoom: 14, duration: 0.45 });
  const row = document.querySelector(`.spot[data-id="${focusedKey}"]`);
  if (row) row.scrollIntoView({ block: "nearest" });
}

function clearPreviewLine() {
  if (previewLine) {
    previewLine.remove();
    previewLine = null;
  }
}

function rememberTrip() {
  if (!sharedMap) return;
  const center = sharedMap.getCenter();
  tripView = { lat: center.lat, lng: center.lng, zoom: sharedMap.getZoom() };
}

function showTrip() {
  clearPreviewLine();
  previewKey = null;
  const moved = previewing;
  previewing = false;
  emphasize(focusedKey);
  if (!moved || !sharedMap || !tripView) return;
  sharedMap.stop();
  sharedMap.flyTo([tripView.lat, tripView.lng], tripView.zoom, { duration: 0.3 });
}

  // Leaflet chooses left/right from the map center, then a long label can still
  // cross the map's edge. Nudge it back inside the map box on the screen.
  function keepTipInside(event) {
    const map = event.target;
    const tip = event.tooltip && event.tooltip.getElement();
    if (!tip || !map) return;
    const pad = 8;
    const mapBox = map.getContainer().getBoundingClientRect();
    if (mapBox.width < 40 || mapBox.height < 40) return;
    const room = Math.max(120, mapBox.width - pad * 2);
    tip.style.maxWidth = "";
    tip.style.whiteSpace = "";
    const before = tip.getBoundingClientRect();
    if (before.width > room) {
      tip.style.maxWidth = `${Math.floor(room)}px`;
      tip.style.whiteSpace = "normal";
    }
    const box = tip.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    const shrink = before.width - box.width;
    if (tip.classList.contains("leaflet-tooltip-left")) dx += shrink;
    else if (tip.classList.contains("leaflet-tooltip-top") || tip.classList.contains("leaflet-tooltip-bottom")) dx += shrink / 2;
    const grown = box.height - before.height;
    if (tip.classList.contains("leaflet-tooltip-left") || tip.classList.contains("leaflet-tooltip-right")) dy -= grown / 2;
    else if (tip.classList.contains("leaflet-tooltip-top")) dy -= grown;
    const left = box.left + dx;
    const right = box.right + dx;
    const top = box.top + dy;
    const bottom = box.bottom + dy;
    if (right - left > mapBox.width - pad * 2) dx += mapBox.left + pad - left;
    else if (left < mapBox.left + pad) dx += mapBox.left + pad - left;
    else if (right > mapBox.right - pad) dx += mapBox.right - pad - right;
    if (bottom - top > mapBox.height - pad * 2) dy += mapBox.top + pad - top;
    else if (top < mapBox.top + pad) dy += mapBox.top + pad - top;
    else if (bottom > mapBox.bottom - pad) dy += mapBox.bottom - pad - bottom;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const pos = window.L.DomUtil.getPosition(tip);
    window.L.DomUtil.setPosition(tip, pos.add([dx, dy]));
  }

  function drawMap(camp, trails, extras, onAdd, order, placeSpots, coffeePlaces, visitPlaces, home, onPlace) {
  if (typeof window.L === "undefined") {
    mapNote.textContent = "המפה לא נטענה. אפשר עדיין לקרוא את הפירוט ולפתוח את העמודים הרשמיים.";
    return null;
  }
  if (!sharedMap) {
    sharedMap = window.L.map("map", { scrollWheelZoom: true });
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(sharedMap);
    overlay = window.L.layerGroup().addTo(sharedMap);
    // Clamp after Leaflet positions the label, including a later zoom or font load.
    if (!window.L.Tooltip.prototype._camperClamped) {
      const placeTip = window.L.Tooltip.prototype._setPosition;
      window.L.Tooltip.prototype._setPosition = function (pos) {
        placeTip.call(this, pos);
        keepTipInside({ target: this._map, tooltip: this });
      };
      window.L.Tooltip.prototype._camperClamped = true;
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        const tip = document.querySelector(".leaflet-tooltip");
        if (!tip || !sharedMap) return;
        sharedMap.eachLayer((layer) => {
          if (!layer.isTooltipOpen || !layer.isTooltipOpen()) return;
          const open = layer.getTooltip && layer.getTooltip();
          if (open) open.update();
        });
      });
    }
  }
  clearPreviewLine();
  previewing = false;
  previewKey = null;
  sharedMap.stop();
  overlay.clearLayers();
  layersById = new Map();
  placeMarks = new Map();
  sharedMap.invalidateSize({ animate: false });
  const map = sharedMap;
  const bounds = [];
  const storyBounds = [];

  function layerFor(key) {
    let entry = layersById.get(key);
    if (!entry) {
      entry = { lines: [], dots: [], bounds: [] };
      layersById.set(key, entry);
    }
    return entry;
  }

  function follow(layer, key) {
    layer.on("mouseover", () => emphasize(key));
    layer.on("mouseout", () => emphasize(focusedKey));
  }

  const story = window.CamperPlan.tripStages(camp, trails, order, coffeePlaces, visitPlaces);
  const colorByTrail = new Map();
  trails.forEach((trail, index) => {
    colorByTrail.set(trail.id, COLORS[(index + 1) % COLORS.length]);
  });

  function stageCard(stage) {
    const photos = (stage.photos || []).map((photo) => (
      `<img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.credit || stage.title)}">`
    )).join("");
    const places = (stage.highlights || []).join(" · ");
    return (
      `<div class="stage-card"><strong>${stage.n}. ${escapeHtml(stage.title)}</strong>` +
      `<p>${escapeHtml(stage.text)}</p>` +
      (places ? `<p class="stage-places">בדרך: ${escapeHtml(places)}</p>` : "") +
      (photos ? `<div class="stage-photos">${photos}</div>` : "") +
      "</div>"
    );
  }

  function bindStage(marker, stage, key) {
    marker.bindTooltip(stageCard(stage), {
      direction: "auto",
      opacity: 1,
      className: "stage-tip",
      offset: [0, -8],
    });
    marker.on("mouseover", () => emphasize(key));
    marker.on("mouseout", () => emphasize(focusedKey));
  }

  if (camp.lat != null) {
    const arrive = story.stages.find((stage) => stage.kind === "arrive");
    const icon = window.L.divIcon({
      className: "camp-marker",
      html:
        '<div class="camp-pin">' +
        `<span class="stage-badge">${arrive ? arrive.n : 1}</span>` +
        '<span class="camp-pin-tag">חניון</span>' +
        '<svg viewBox="0 0 36 46" width="36" height="46" aria-hidden="true">' +
        '<path d="M18 44.5C18 44.5 33 27.2 33 16.2A15 15 0 1 0 3 16.2C3 27.2 18 44.5 18 44.5Z" fill="#a3472c" stroke="#fffaf3" stroke-width="2.4"/>' +
        '<path d="M11 22.2 18 13.2 25 22.2Z" fill="none" stroke="#fffaf3" stroke-width="1.8" stroke-linejoin="round"/>' +
        '<path d="M18 13.6V22" stroke="#fffaf3" stroke-width="1.4"/>' +
        "</svg></div>",
      iconSize: [36, 46],
      iconAnchor: [18, 44],
      popupAnchor: [0, -40],
    });
    const marker = window.L.marker([camp.lat, camp.lng], {
      icon,
      zIndexOffset: 800,
      title: camp.name,
      alt: `חניון ${camp.name}`,
    }).addTo(overlay);
    if (arrive) bindStage(marker, arrive, "camp");
    marker.on("click", () => focusFeature("camp"));
    const campLayer = layerFor("camp");
    campLayer.bounds.push([camp.lat, camp.lng]);
    bounds.push([camp.lat, camp.lng]);
    storyBounds.push([camp.lat, camp.lng]);
  }

  const hops = story.stages.filter((stage) => stage.lat != null).map((stage) => [stage.lat, stage.lng]);
  if (hops.length > 1) {
    const campPoint = camp.lat == null ? null : [camp.lat, camp.lng];
    const last = hops[hops.length - 1];
    const transfer = campPoint && (last[0] !== campPoint[0] || last[1] !== campPoint[1])
      ? hops.concat([campPoint])
      : hops;
    window.L.polyline(transfer, {
      color: "#5c4a3a",
      weight: 3,
      opacity: 0.85,
      dashArray: "8 8",
      interactive: false,
    }).addTo(overlay);
  }

  let drewLine = false;
  story.paths.forEach((path) => {
    const key = String(path.trailId);
    const color = colorByTrail.get(path.trailId) || COLORS[1];
    const entry = layerFor(key);
    const line = window.L.polyline(path.line, { color, weight: 5, opacity: 0.9 }).addTo(overlay);
    follow(line, key);
    line.on("click", () => focusFeature(key));
    entry.lines.push(line);
    entry.bounds.push(...path.line);
    bounds.push(...path.line);
    storyBounds.push(...path.line);
    drewLine = true;
  });
  story.stages.forEach((stage) => {
    if (stage.kind === "arrive") return;
    const key = stage.kind === "coffee" || stage.kind === "visit" ? `place-${stage.placeId}` : String(stage.trailId);
    const color = stage.kind === "coffee"
      ? PLACE_COLOR.viewpoint
      : stage.kind === "visit"
        ? (PLACE_COLOR[stage.placeKind] || PLACE_COLOR.park)
        : (colorByTrail.get(stage.trailId) || COLORS[1]);
    const marker = window.L.marker([stage.lat, stage.lng], {
      icon: window.L.divIcon({
        className: "stage-marker",
        html: `<div class="stage-num" style="background:${color}">${stage.n}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      zIndexOffset: 700,
      title: `${stage.n}. ${stage.title}`,
      keyboard: false,
    }).addTo(overlay);
    bindStage(marker, stage, key);
    marker.on("click", () => focusFeature(key));
    bounds.push([stage.lat, stage.lng]);
    storyBounds.push([stage.lat, stage.lng]);
  });

  (extras || []).forEach((item) => {
    if (item.trail.lat == null) return;
    const key = String(item.trail.id);
    const entry = layerFor(key);
    const marker = window.L.circleMarker([item.trail.lat, item.trail.lng], {
      radius: 6,
      color: "#6d6256",
      weight: 2,
      fillColor: "#fffaf3",
      fillOpacity: 1,
    }).addTo(overlay);
    const distance = item.km == null ? "" : `<br>כ־${item.km} ק״מ מהחניון`;
    marker.bindPopup(`${escapeHtml(item.trail.name)}${distance}`);
    follow(marker, key);
    marker.on("click", () => window.setTimeout(() => onAdd(item.trail.id), 0));
    entry.dots.push(marker);
    entry.bounds.push([item.trail.lat, item.trail.lng]);
    bounds.push([item.trail.lat, item.trail.lng]);
  });

  (placeSpots || []).forEach((item) => {
    const place = item.place;
    if (!place || place.lat == null) return;
    const key = `place-${place.id}`;
    const color = PLACE_COLOR[place.kind] || "#6d6256";
    const marker = window.L.circleMarker([place.lat, place.lng], {
      radius: 5,
      color,
      weight: 2,
      fillColor: "#fffaf3",
      fillOpacity: 1,
    }).addTo(overlay);
    const kind = PLACE_KIND[place.kind] || "";
    const where = item.km != null && item.km < 0.4 ? "במקום" : `כ־${item.km} ק״מ`;
    const way = window.CamperPlan.onTheWay(home, camp, place);
    const route = way == null ? "" : way ? " · בדרך מהבית" : " · לא בדרך";
    marker.bindTooltip(`${place.name} · ${kind} · ${where}${route}`, { direction: "auto", opacity: 0.95 });
    marker.on("mouseover", () => emphasize(key));
    marker.on("mouseout", () => emphasize(focusedKey));
    marker.on("click", () => {
      focusedKey = key;
      emphasize(key);
      if (onPlace) onPlace(place);
    });
    placeMarks.set(key, marker);
  });

  const view = { animate: false };
  const framed = storyBounds.length > 1 ? storyBounds : bounds;
  if (framed.length > 1) {
    map.fitBounds(framed, {
      padding: [48, 48],
      maxZoom: 14,
      ...view,
    });
  } else if (camp.lat != null) {
    map.setView([camp.lat, camp.lng], 11, view);
  } else {
    map.setView([31.4, 34.9], 7, view);
  }
  rememberTrip();
  mapNote.textContent = drewLine
    ? ""
    : "למסלול שנבחר אין עדיין קו שביל, אז מוצגת נקודת ההתחלה.";
  emphasize(focusedKey);
  return map;
}

Promise.all([
  fetch("data/camps.json").then((response) => response.json()),
  fetch("data/trails.json").then((response) => response.json()),
  fetch("data/places.json").then((response) => (response.ok ? response.json() : [])).catch(() => []),
])
  .then(([camps, trails, placeCatalog]) => {
    const query = params();
    const { campId, trailIds } = query;
    const camp = camps.find((item) => item.id === campId);
    if (!camp) {
      title.textContent = "הסופ״ש לא נמצא";
      lead.textContent = "אפשר לחזור לרשימה ולבחור הצעה אחרת.";
      return;
    }
    const byId = new Map(trails.map((trail) => [trail.id, trail]));
    const selected = trailIds.filter((id) => byId.has(id));
    const choices = window.CamperPlan.nearbyChoices(camp, trails);
    let radius = query.radius;
    let catalogExpanded = false;
    let catalogQuery = "";
    let catalogRole = "all";
    let catalogTraits = {};
    let focusCatalogSearch = false;
    const places = Array.isArray(placeCatalog) ? placeCatalog : [];
    const placeById = new Map(places.map((place) => [`place-${place.id}`, place]));
    const coffeeNear = new Map(
      window.CamperPlan.nearbyPlaces(camp, places, { maxKm: 15, kind: "viewpoint", varied: false })
        .map((item) => [item.place.id, item]),
    );
    const selectedCoffee = query.coffee.filter((id) => coffeeNear.has(id)).slice(0, 2);
    const visitNear = new Map(
      window.CamperPlan.nearbyPlaces(camp, places, { maxKm: 15, varied: false })
        .filter((item) => item.place.kind !== "viewpoint")
        .map((item) => [item.place.id, item]),
    );
    const selectedVisits = query.visit.filter((id) => visitNear.has(id)).slice(0, 2);
    let revealCoffee = null;
    let focusPlace = (query.view === "visit" && visitNear.has(query.spot))
      || (query.view === "coffee" && coffeeNear.has(query.spot))
      ? query.spot
      : "";
    let arrival = query.arrival;
    let order = query.order;
    const opened = window.CamperPlan.tripDates(query.from, query.to);
    let fromDate = opened.from;
    let toDate = opened.to;
    const openedStops = splitStops(query.stops, query.visit);
    let hours = {
      dinner: query.dinner,
      rise: query.rise,
      breakfast: query.breakfast,
      start: query.start,
      lunch: query.lunch,
      back: query.back,
      hikes: query.hikes,
      coffeeAt: openedStops.coffeeAt,
      visitAt: openedStops.visitAt,
    };
    let hereKey = null;
    let hereMarker = null;
    let previewTimer = null;
    const home = savedHome();
    const origin = window.CamperPlan.regionOrigin(camps, home) || window.CamperPlan.centerOrigin(camps);
    const homePlace = HOME_PLACE[home];

    function wayPhrase(place) {
      const answer = window.CamperPlan.onTheWay(origin, camp, place);
      if (answer == null) return "";
      return answer ? "בדרך מהבית" : "לא בדרך";
    }

    function markWay(row, place) {
      const phrase = wayPhrase(place);
      if (!phrase) return;
      const meta = row.querySelector(".meta");
      if (!meta) return;
      const mark = el("span", phrase === "בדרך מהבית" ? "on-way" : "off-way", phrase);
      if (meta.firstChild) meta.insertBefore(document.createTextNode(" · "), meta.firstChild);
      meta.insertBefore(mark, meta.firstChild);
    }
    let panelMode = query.view === "visit" || query.view === "coffee" ? (focusPlace ? query.view : "routes") : query.view;
    let focusId = query.view === "detail" ? query.focusId : (selected[0] || null);
    if (panelMode === "detail" && (focusId == null || !byId.has(focusId))) {
      panelMode = "routes";
      focusId = selected[0] || null;
    }
    if (panelMode === "visit" || panelMode === "coffee") focusedKey = `place-${focusPlace}`;
    else if (focusId != null) focusedKey = String(focusId);
    const maxPicks = 4;
    const around = document.querySelector("#around");
    const panelBody = document.querySelector("#panel-body");
    const picked = el("div", "picked");
    picked.id = "picked";
    const nameInput = document.querySelector("#trip-name");
    const saveButton = document.querySelector("#save-trip");
    const shareButton = document.querySelector("#share-trip");
    const deleteButton = document.querySelector("#delete-trip");
    const saveNote = document.querySelector("#save-note");
    const stored = query.tripId && window.CamperTrips ? window.CamperTrips.get(query.tripId) : null;
    let tripId = stored && Number(stored.campId) === camp.id ? stored.id : null;
    let draft = tripId ? Boolean(stored.draft) : true;
    if (!tripId && window.CamperTrips) {
      const key = selected.join(",");
      const existing = window.CamperTrips.list().find((trip) => (
        trip.draft && Number(trip.campId) === camp.id && (trip.trailIds || []).join(",") === key
      ));
      if (existing) {
        tripId = existing.id;
        draft = true;
        if (!query.name && existing.name) nameInput.value = existing.name;
      }
    }
    if (!nameInput.value) nameInput.value = query.name || (tripId && stored ? stored.name : "") || camp.name;
    deleteButton.hidden = !tripId;
    saveButton.textContent = tripId && !draft ? "שמירה" : "צור טיול";
    let historyPush = false;
    let silenceHistory = false;
    let tripDepth = window.history.state && window.history.state.camperTrip ? window.history.state.depth || 0 : 0;

    document.title = `${nameInput.value} — סופ״ש בטבע`;
    title.textContent = camp.name;
    const back = el("button", "text-back", "חזרה לבניית הטיול");
    back.type = "button";
    back.addEventListener("click", () => {
      if (panelMode === "routes") return;
      if (tripDepth > 0) {
        window.history.back();
        return;
      }
      panelMode = "routes";
      historyPush = true;
      render();
    });
    dossier.append(back, campSheet(camp), picked);

    function chosenTrails() {
      return selected.map((id) => byId.get(id)).filter(Boolean);
    }

    function choiceFor(id) {
      return choices.find((item) => item.trail.id === id) || { trail: byId.get(id), km: null };
    }

    function currentName() {
      return nameInput.value.trim() || camp.name;
    }

    function currentPlace() {
      return {
        view: panelMode,
        focusId: panelMode === "detail" ? focusId : null,
        arrival,
        dinner: hours.dinner,
        rise: hours.rise,
        breakfast: hours.breakfast,
        start: hours.start,
        lunch: hours.lunch,
        back: hours.back,
        hikes: hours.hikes,
        coffee: selectedCoffee.slice(),
        visit: selectedVisits.slice(),
        spot: panelMode === "visit" || panelMode === "coffee" ? focusPlace : "",
        stops: Object.assign({}, hours.coffeeAt, hours.visitAt),
        radius,
        order: placeOrder(),
        from: fromDate,
        to: toDate,
      };
    }

    function placeOrder() {
      const normal = window.CamperPlan.normalizeOrder(order, selected, selectedCoffee, selectedVisits);
      const base = window.CamperPlan.normalizeOrder(null, selected, selectedCoffee, selectedVisits);
      if (normal.join(",") === base.join(",")) return null;
      return normal;
    }

    function chosenCoffees() {
      return selectedCoffee.map((id) => {
        const item = coffeeNear.get(id);
        return item ? item.place : null;
      }).filter(Boolean);
    }

    function chosenVisits() {
      return selectedVisits.map((id) => {
        const item = visitNear.get(id);
        return item ? item.place : null;
      }).filter(Boolean);
    }

    function addVisit(id) {
      if (selectedVisits.includes(id) || selectedVisits.length >= 2 || !visitNear.has(id)) return;
      selectedVisits.push(id);
      focusedKey = `place-${id}`;
      revealCoffee = `place-${id}`;
      historyPush = true;
      window.setTimeout(render, 0);
    }

    function removeVisit(id) {
      const index = selectedVisits.indexOf(id);
      if (index < 0) return;
      selectedVisits.splice(index, 1);
      if (hours.visitAt) delete hours.visitAt[id];
      if (focusPlace === id) focusPlace = "";
      if (focusedKey === `place-${id}`) focusedKey = focusId != null ? String(focusId) : "camp";
      historyPush = true;
      window.setTimeout(render, 0);
    }

    function addCoffee(id) {
      if (selectedCoffee.includes(id) || selectedCoffee.length >= 2 || !coffeeNear.has(id)) return;
      selectedCoffee.push(id);
      focusedKey = `place-${id}`;
      revealCoffee = `place-${id}`;
      historyPush = true;
      window.setTimeout(render, 0);
    }

    function removeCoffee(id) {
      const index = selectedCoffee.indexOf(id);
      if (index < 0) return;
      selectedCoffee.splice(index, 1);
      if (hours.coffeeAt) delete hours.coffeeAt[id];
      if (focusedKey === `place-${id}`) focusedKey = focusId != null ? String(focusId) : "camp";
      historyPush = true;
      window.setTimeout(render, 0);
    }

    function editorRecord() {
      return {
        id: tripId || undefined,
        name: currentName(),
        campId: camp.id,
        trailIds: selected,
        draft,
        place: currentPlace(),
      };
    }

    function remember(push) {
      if (!window.CamperTrips) return;
      const saved = window.CamperTrips.save(editorRecord());
      if (!saved) {
        saveNote.textContent = "לא הצלחנו לשמור בדפדפן הזה.";
        return;
      }
      tripId = saved.id;
      draft = Boolean(saved.draft);
      deleteButton.hidden = false;
      const url = new URL(window.CamperTrips.editPath(saved), window.location.href);
      try {
        sessionStorage.setItem("camper-return", `trip.html${url.search}`);
      } catch (_error) {
        /* private mode can block storage; the address bar still holds the point */
      }
      if (silenceHistory) return;
      const same = `${url.pathname}${url.search}` === `${window.location.pathname}${window.location.search}`;
      if (push && !same) {
        tripDepth += 1;
        window.history.pushState({ camperTrip: true, depth: tripDepth }, "", url);
      } else {
        window.history.replaceState({ camperTrip: true, depth: tripDepth }, "", url);
      }
    }

    function persistNew() {
      if (!window.CamperTrips) return null;
      const saved = window.CamperTrips.save({
        ...editorRecord(),
        id: tripId,
        draft: false,
      });
      if (!saved) {
        saveNote.textContent = "לא הצלחנו לשמור בדפדפן הזה.";
        return null;
      }
      tripId = saved.id;
      draft = false;
      nameInput.value = saved.name;
      deleteButton.hidden = false;
      saveButton.textContent = "שמירה";
      document.title = `${saved.name} — סופ״ש בטבע`;
      return saved;
    }

    function addTrail(id) {
      if (selected.includes(id) || selected.length >= maxPicks || !byId.has(id)) return;
      selected.push(id);
      focusId = id;
      focusedKey = String(id);
      historyPush = true;
      window.setTimeout(render, 0);
    }

    function removeTrail(id) {
      const index = selected.indexOf(id);
      if (index < 0) return;
      selected.splice(index, 1);
      if (focusId === id) focusId = selected[0] || null;
      if (focusedKey === String(id)) focusedKey = focusId != null ? String(focusId) : "camp";
      historyPush = true;
      window.setTimeout(render, 0);
    }

    function setPanel(mode) {
      panelMode = mode;
      if (mode === "detail" && focusId == null) focusId = selected[0] || null;
      panelBody.scrollTop = 0;
      historyPush = true;
      render();
    }

    function applyPanel() {
      const reading = panelMode === "camp" || panelMode === "detail" || panelMode === "visit" || panelMode === "coffee";
      around.hidden = reading;
      mapNote.hidden = reading || !mapNote.textContent;
      dossier.hidden = !reading;
      const campNode = dossier.querySelector(".camp-sheet");
      if (campNode) campNode.hidden = panelMode !== "camp";
      picked.hidden = panelMode !== "detail" && panelMode !== "visit" && panelMode !== "coffee";
    }

    function openMappedPlace(place) {
      if (!place || place.id == null) return;
      if (place.kind === "viewpoint") {
        if (!coffeeNear.has(place.id)) return;
        openCoffee(place.id);
        return;
      }
      if (!visitNear.has(place.id)) return;
      openVisit(place.id);
    }

    function openVisit(id) {
      if (!visitNear.has(id)) return;
      focusPlace = id;
      focusedKey = `place-${id}`;
      panelMode = "visit";
      panelBody.scrollTop = 0;
      historyPush = true;
      render();
    }

    function openCoffee(id) {
      if (!coffeeNear.has(id)) return;
      focusPlace = id;
      focusedKey = `place-${id}`;
      panelMode = "coffee";
      panelBody.scrollTop = 0;
      historyPush = true;
      render();
    }

    function openTrail(id) {
      focusId = id;
      focusedKey = String(id);
      panelMode = "detail";
      panelBody.scrollTop = 0;
      historyPush = true;
      render();
    }

    function showTrail(id) {
      const key = id == null ? null : String(id);
      if (!key || !sharedMap) return;
      if (previewKey === key && previewing) {
        emphasize(key);
        return;
      }
      clearPreviewLine();
      emphasize(key);
      const entry = layersById.get(key);
      let points = entry && entry.bounds.length ? entry.bounds.slice() : [];
      const trail = key === "camp" ? null : byId.get(Number(key));
      if (trail && !(entry && entry.lines.length)) {
        const line = window.CamperPlan.storyPath(trail, camp);
        if (line.length > 1) {
          previewLine = window.L.featureGroup([
            window.L.polyline(line, { color: "#fffaf3", weight: 10, opacity: 0.95, interactive: false }),
            window.L.polyline(line, { color: "#a3472c", weight: 5, opacity: 1, interactive: false }),
          ]).addTo(sharedMap);
          previewLine.bringToFront();
          points = line;
        }
      }
      if (!points.length) {
        previewKey = key;
        return;
      }
      previewKey = key;
      previewing = true;
      sharedMap.stop();
      if (points.length === 1) sharedMap.flyTo(points[0], 14, { duration: 0.3 });
      else sharedMap.flyToBounds(points, { padding: [48, 48], maxZoom: 15, duration: 0.3 });
    }

    function showPlace(id) {
      const key = String(id);
      if (!sharedMap) return;
      if (previewKey === key && previewing) {
        emphasize(key);
        return;
      }
      clearPreviewLine();
      emphasize(key);
      const marker = placeMarks.get(key);
      const place = placeById.get(key);
      const point = marker
        ? marker.getLatLng()
        : (place && place.lat != null ? [place.lat, place.lng] : null);
      if (!point) {
        previewKey = key;
        return;
      }
      previewKey = key;
      previewing = true;
      sharedMap.stop();
      const latlng = point.lat != null ? [point.lat, point.lng] : point;
      sharedMap.flyTo(latlng, 15, { duration: 0.3 });
    }

    function holdPlace(id) {
      showPlace(id);
      previewing = false;
      previewKey = null;
      focusedKey = String(id);
      emphasize(focusedKey);
    }

    function spotRow(id, name, meta, swatchColor, action, onOpen, onPreview, emoji) {
      const row = el("article", "spot");
      row.dataset.id = String(id);
      row.tabIndex = 0;
      const swatch = el("i", "swatch");
      swatch.style.background = swatchColor;
      const copy = el("div", "spot-copy");
      copy.append(decorate(el("h3"), emoji, shortName(name)));
      row.title = name;
      if (meta) copy.append(el("p", "meta", meta));
      row.append(swatch, copy);
      if (action) row.append(action);
      const activate = () => (onOpen ? onOpen(id) : focusFeature(id));
      const preview = () => {
        if (previewTimer) {
          window.clearTimeout(previewTimer);
          previewTimer = null;
        }
        if (onPreview) onPreview(id);
        else showTrail(id);
      };
      row.addEventListener("mouseenter", preview);
      row.addEventListener("mouseleave", () => {
        previewTimer = window.setTimeout(() => {
          previewTimer = null;
          if (previewKey !== String(id)) return;
          showTrip();
        }, 60);
      });
      row.addEventListener("click", (event) => {
        if (event.target.closest("button, a")) return;
        activate();
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter") activate();
      });
      return row;
    }

    function clock(minutes) {
      const day = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
      const hours = Math.floor(day / 60);
      const mins = day % 60;
      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }

    function formatDuration(minutes) {
      const rounded = Math.max(15, Math.round(minutes / 15) * 15);
      const hours = Math.floor(rounded / 60);
      const mins = rounded % 60;
      if (!hours) return `כ־${rounded} דקות`;
      const head = hours === 1 ? "כשעה" : hours === 2 ? "כשעתיים" : `כ־${hours} שעות`;
      if (!mins) return head;
      if (mins === 30) return `${head} וחצי`;
      return `${head} ו־${mins} דקות`;
    }

    function legCopy(minutes) {
      if (minutes === 0) return "בלי נסיעה";
      return `נסיעה של ${formatDuration(minutes)}`;
    }

    function stepCopy(step) {
      if (step.kind === "depart") {
        if (step.at == null) return `יוצאים מהבית, מ${homePlace}. אין מרחק נסיעה, אז שעת היציאה גמישה.`;
        const where = step.toward === "hike" ? "לכיוון המסלול" : step.toward === "visit" ? (step.towardOfficial ? "לכיוון הביקור" : "לכיוון נקודת העניין") : step.toward === "coffee" ? "לכיוון התצפית" : "לכיוון החניון";
        return `יוצאים מהבית, מ${homePlace}, ${where}. נסיעה של ${formatDuration(step.drive)} בערך.`;
      }
      if (step.kind === "arrive") {
        if (step.afterHike) return `מגיעים ל${camp.name} אחרי המסלול. כאן ישנים.`;
        if (step.afterVisit) return `מגיעים ל${camp.name} אחרי ${step.afterOfficial ? "הביקור" : "העצירה"}. כאן ישנים.`;
        return `מגיעים ל${camp.name}. כאן ישנים.`;
      }
      if (step.kind === "dinner") return "אוכלים בחניון.";
      if (step.kind === "rise") return "קמים בחניון.";
      if (step.kind === "breakfast") return "אוכלים ארוחת בוקר בחניון.";
      if (step.kind === "need-hike") return "עדיין אין מסלול. מוסיפים אחד, ושעת החזרה נכנסת ללוז.";
      if (step.kind === "visit") {
        const name = shortName(step.name);
        const length = formatDuration(step.walk);
        const noun = step.official ? "ביקור" : "עצירה";
        const official = step.duration ? ` בעמוד הרשות: ${step.duration}.` : "";
        const estimate = step.estimated
          ? (step.official ? " זו הערכה, משך הביקור לא מסומן בעמוד." : " זו הערכה.")
          : official;
        if (step.beforeStay) {
          const tail = step.lastBefore ? "אחר כך ממשיכים לחניון." : "אחר כך ממשיכים.";
          return `${name}. ${noun} של ${length}.${estimate} ${tail}`;
        }
        const leaving = step.firstOfDay ? "יוצאים מהחניון. " : "";
        const back = step.back == null ? "" : ` חזרה לחניון ב־${clock(step.back)}.`;
        const longDay = step.back != null && step.back >= 15 * 60 ? " זה יום ארוך." : "";
        return `${leaving}${name}. ${noun} של ${length}.${estimate}${back}${longDay}`;
      }
      if (step.kind === "coffee") {
        const name = shortName(step.name);
        if (step.beforeStay) {
          const tail = step.lastBefore ? "אחר כך ממשיכים לחניון." : "אחר כך ממשיכים.";
          return `${name}. תצפית לקפה, כחצי שעה. ${tail}`;
        }
        const leaving = step.firstOfDay ? "יוצאים מהחניון. " : "";
        return `${leaving}${name}. תצפית לקפה, כחצי שעה.`;
      }
      if (step.kind === "hike") {
        const name = shortName(step.name);
        if (step.walk == null) return `${name}. אין משך הליכה, אז השעה גמישה.`;
        if (step.beforeStay) {
          const tail = step.lastBefore ? "אחר כך ממשיכים לחניון." : "אחר כך ממשיכים למסלול הבא.";
          return `${name}. הליכה של ${formatDuration(step.walk)}. ${tail}`;
        }
        const leaving = step.firstOfDay ? "יוצאים מהחניון. " : "";
        const longDay = step.back >= 15 * 60 ? " זה יום ארוך." : "";
        return `${leaving}${name}. הליכה של ${formatDuration(step.walk)}, חזרה לחניון ב־${clock(step.back)}.${longDay}`;
      }
      if (step.kind === "return") {
        const ride = step.drive == null ? "" : ` נסיעה של ${formatDuration(step.drive)} בערך.`;
        if (step.nights > 1) {
          const extra = step.nights - 1;
          const stay = extra === 1 ? "נשארים בחניון עוד לילה אחד לפני החזרה." : `נשארים בחניון עוד ${extra} לילות לפני החזרה.`;
          return `יוצאים מהחניון הביתה. ${stay}${ride}`;
        }
        const head = step.fromLookout ? "אחרי התצפית יוצאים הביתה." : "יוצאים מהחניון הביתה.";
        return `${head}${ride}`;
      }
      if (step.kind === "home") return `מגיעים הביתה, ל${homePlace}.`;
      if (step.kind === "lunch" && step.afterVisit) {
        const noun = step.afterOfficial ? "הביקור" : "העצירה";
        return step.at == null
          ? `אחרי ${noun} אוכלים בחניון. השעה גמישה.`
          : `אחרי ${noun} אוכלים בחניון.`;
      }
      if (step.kind === "lunch" && step.afterCoffee) {
        return step.at == null
          ? "אחרי התצפית אוכלים. השעה גמישה."
          : "אחרי התצפית אוכלים.";
      }
      if (step.at == null) return "אחרי המסלול אוכלים בחניון. השעה גמישה.";
      return "אוכלים בחניון אחרי המסלול.";
    }

    let dragToken = null;

    function applyOrder(next) {
      if (!next) return;
      order = next;
      historyPush = true;
      render();
    }

    function moveToken(token, direction) {
      const sequence = window.CamperPlan.normalizeOrder(order, selected, selectedCoffee, selectedVisits);
      const index = sequence.indexOf(token);
      const target = sequence[index + direction];
      if (target == null) return;
      applyOrder(window.CamperPlan.moveOrder(order, selected, token, target, direction > 0, selectedCoffee, selectedVisits));
    }

    function tokenFromMark(value) {
      if (value === "stay" || /^[cv]:[or]\d+$/.test(value)) return value;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }

    function clearDropMarks() {
      document.querySelectorAll(".day-block.drop-before, .day-block.drop-after").forEach((node) => {
        node.classList.remove("drop-before", "drop-after");
      });
    }

    function renderItinerary() {
      const block = el("section", "itinerary");
      const trails = selected.map((id) => byId.get(id)).filter(Boolean);
      const sequence = window.CamperPlan.normalizeOrder(order, selected, selectedCoffee, selectedVisits);
      const coffees = chosenCoffees();
      const visits = chosenVisits();
      const steps = window.CamperPlan.buildItinerary({
        camp,
        trails,
        coffees,
        visits,
        arrivalMinutes: arrival,
        origin,
        hours,
        order: sequence,
        from: fromDate,
        to: toDate,
      });
      const depart = steps.find((step) => step.kind === "depart");
      const hikeFirst = sequence[0] !== "stay";
      block.append(decorate(el("h2", "section-label"), "🗓️", "לוז"));
      const morning = selected.length
        ? "ולמחרת המסלול."
        : visits.length
          ? "ולמחרת הביקור."
          : coffees.length
            ? "ולמחרת תצפית לקפה."
            : "ולמחרת המסלול.";
      block.append(el("p", "itinerary-lead", hikeFirst
        ? `קודם המסלול, ואחר כך לילה בחניון. יוצאים מהבית, מ${homePlace}.`
        : `יוצאים מהבית, מ${homePlace}. לילה בחניון, ${morning}`));
      block.append(dateFields());
      const times = el("div", "trip-dates");
      times.append(timeField("יוצאים מהבית", depart ? depart.at : null, (minutes) => {
        if (!depart || depart.at == null) return;
        const edited = window.CamperPlan.retimedHours({
          hours,
          arrival,
          step: depart,
          next: minutes,
          trailIds: selected,
          coffeeIds: selectedCoffee,
          visitIds: selectedVisits,
          order: sequence,
        });
        arrival = edited.arrival;
        hours = edited.hours;
        historyPush = true;
        render();
      }));
      times.append(timeField("מגיעים לחניון", arrival, (minutes) => {
        arrival = minutes;
        historyPush = true;
        render();
      }));
      block.append(times);
      const stages = window.CamperPlan.tripStages(camp, trails, sequence, coffees, visits).stages;
      const groups = [];
      steps.forEach((step) => {
        const last = groups[groups.length - 1];
        if (last && last.id === step.block) last.steps.push(step);
        else groups.push({ id: step.block, steps: [step] });
      });
      const movable = sequence.length > 1;
      let hereIndex = 0;
      let pendingLeg = null;
      block.addEventListener("dragenter", (event) => {
        if (dragToken == null) return;
        event.preventDefault();
      });
      block.addEventListener("dragover", (event) => {
        if (dragToken == null) return;
        const card = event.target.closest(".day-block.can-drag");
        const leg = event.target.closest(".block-leg");
        clearDropMarks();
        if (card && card.dataset.token !== String(dragToken)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const after = event.clientY > card.getBoundingClientRect().top + card.offsetHeight / 2;
          card.classList.toggle("drop-before", !after);
          card.classList.toggle("drop-after", after);
          return;
        }
        if (leg && leg.dataset.before && leg.dataset.before !== String(dragToken)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const next = [...block.querySelectorAll(".day-block")].find((node) => node.dataset.token === leg.dataset.before);
          if (next) next.classList.add("drop-before");
          return;
        }
        event.preventDefault();
      });
      block.addEventListener("drop", (event) => {
        if (dragToken == null) return;
        event.preventDefault();
        const moving = dragToken;
        const card = event.target.closest(".day-block.can-drag");
        const leg = event.target.closest(".block-leg");
        let onto = null;
        let after = false;
        if (card && card.dataset.token !== String(moving)) {
          onto = tokenFromMark(card.dataset.token);
          after = card.classList.contains("drop-after");
        } else if (leg && leg.dataset.before && leg.dataset.before !== String(moving)) {
          onto = tokenFromMark(leg.dataset.before);
        }
        clearDropMarks();
        if (onto == null) return;
        applyOrder(window.CamperPlan.moveOrder(order, selected, moving, onto, after, selectedCoffee, selectedVisits));
      });
      groups.forEach((group) => {
        const inbound = group.steps.find((step) => step.inbound != null);
        if (inbound) pendingLeg = inbound.inbound;
        let leg = null;
        if (pendingLeg != null) {
          leg = decorate(el("p", "block-leg"), "🚗", legCopy(pendingLeg));
          block.append(leg);
          pendingLeg = null;
        }
        const card = el("section", "day-block");
        const head = el("header");
        const titled = blockTitle(group);
        const heading = decorate(el("h3"), titled[0], titled[1]);
        const coffeeStep = group.steps.find((step) => step.kind === "coffee");
        const visitStep = group.steps.find((step) => step.kind === "visit");
        const openStep = coffeeStep
          ? () => openCoffee(coffeeStep.placeId)
          : visitStep
            ? () => openVisit(visitStep.placeId)
            : null;
        if (openStep) {
          heading.classList.add("can-open");
          heading.tabIndex = 0;
          heading.setAttribute("role", "button");
          heading.addEventListener("click", (event) => {
            event.stopPropagation();
            openStep();
          });
          heading.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openStep();
          });
        }
        head.append(heading);
        const token = blockToken(group.id);
        if (movable && token != null) {
          const moves = el("div", "block-moves");
          const index = sequence.indexOf(token);
          moves.append(moveButton(true, "להזיז את הבלוק למעלה", index <= 0, () => moveToken(token, -1)));
          moves.append(moveButton(false, "להזיז את הבלוק למטה", index < 0 || index >= sequence.length - 1, () => moveToken(token, 1)));
          head.append(moves);
          card.classList.add("can-drag");
          card.draggable = true;
          card.dataset.token = String(token);
          if (leg) leg.dataset.before = String(token);
          card.addEventListener("pointerdown", (event) => {
            card.dataset.hold = event.target.closest("button, input, a, textarea, select, h3.can-open") ? "no" : "yes";
          });
          card.addEventListener("dragstart", (event) => {
            if (card.dataset.hold === "no") {
              event.preventDefault();
              return;
            }
            dragToken = token;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(token));
            card.classList.add("dragging");
          });
          card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            window.setTimeout(() => {
              dragToken = null;
              clearDropMarks();
            }, 0);
          });
        }
        card.append(head);
        const identity = blockIdentity(group);
        if (identity) {
          card.append(identity);
          card.dataset.id = identity.dataset.id;
          card.addEventListener("mouseenter", () => {
            if (previewTimer) {
              window.clearTimeout(previewTimer);
              previewTimer = null;
            }
            if (String(identity.dataset.id).startsWith("place-")) showPlace(identity.dataset.id);
            else showTrail(identity.dataset.id);
          });
          card.addEventListener("mouseleave", () => {
            previewTimer = window.setTimeout(() => {
              previewTimer = null;
              if (previewKey !== String(identity.dataset.id)) return;
              showTrip();
            }, 60);
          });
        }
        const list = el("ol", "timeline");
        const splitMorning = group.steps.some((step) => step.part === "out") && group.steps.some((step) => step.part === "next");
        let markedMorning = false;
        group.steps.forEach((step) => {
          if (splitMorning && !markedMorning && step.part === "next") {
            list.append(el("li", "day-gap", "בוקר שאחרי"));
            markedMorning = true;
          }
          list.append(stepRow(step, stages, hereIndex));
          hereIndex += 1;
        });
        card.append(list);
        block.append(card);
        const outbound = [...group.steps].reverse().find((step) => step.travel != null);
        if (outbound) pendingLeg = outbound.travel;
      });
      block.append(el("p", "fine", movable
        ? "גוררים בלוק כדי לשנות את הסדר. שינוי היציאה שומר על אורך הטיול, ושינוי שעה מזיז את מה שאחריה."
        : "אפשר לקבוע תאריך יציאה וחזרה. שינוי היציאה שומר על אורך הטיול, ושינוי שעה מזיז את מה שאחריה."));
      return block;
    }

    function dateFields() {
      const row = el("div", "trip-dates");
      row.append(dateField("יציאה", fromDate, (value) => {
        const next = window.CamperPlan.moveTripDates(fromDate, toDate, value, null);
        fromDate = next.from;
        toDate = next.to;
        historyPush = true;
        render();
      }));
      row.append(dateField("חזרה", toDate, (value) => {
        const next = window.CamperPlan.moveTripDates(fromDate, toDate, null, value);
        fromDate = next.from;
        toDate = next.to;
        historyPush = true;
        render();
      }, addIso(fromDate, 1)));
      return row;
    }

    function dateField(label, value, onChange, min) {
      const wrap = el("label", "date-field");
      wrap.append(el("span", null, label));
      const input = document.createElement("input");
      input.type = "date";
      input.value = value;
      input.required = true;
      if (min) input.min = min;
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.value)) {
          render();
          return;
        }
        onChange(input.value);
      });
      wrap.append(input);
      return wrap;
    }

    function addIso(iso, count) {
      const [year, month, day] = iso.split("-").map(Number);
      const date = new Date(year, month - 1, day + count);
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${date.getFullYear()}-${m}-${d}`;
    }

    function timeControl(current, onPick, className) {
      const button = el("button", className ? `time-value ${className}` : "time-value");
      button.type = "button";
      button.disabled = current == null;
      button.textContent = current == null ? "—" : clock(current);
      if (current == null) return button;
      const start = ((current % 1440) + 1440) % 1440;
      let hour = Math.floor(start / 60);
      let minute = Math.round((start % 60) / 5) * 5;
      if (minute === 60) {
        minute = 0;
        hour = (hour + 1) % 24;
      }
      let touched = false;
      const panel = el("div", "time-panel");
      panel.hidden = true;
      const hours = el("div", "time-col");
      hours.setAttribute("aria-label", "שעה");
      const minutes = el("div", "time-col");
      minutes.setAttribute("aria-label", "דקות");
      for (let value = 0; value < 24; value += 1) hours.append(timeOption("hour", value));
      for (let value = 0; value < 60; value += 5) minutes.append(timeOption("minute", value));
      panel.append(hours, minutes);

      function timeOption(kind, value) {
        const option = el("button", "time-option", String(value).padStart(2, "0"));
        option.type = "button";
        option.dataset[kind] = String(value);
        option.addEventListener("click", (event) => {
          event.stopPropagation();
          if (kind === "hour") hour = value;
          else minute = value;
          touched = true;
          button.textContent = clock(hour * 60 + minute);
          paint();
          if (kind === "minute") close(true);
        });
        return option;
      }

      function paint() {
        hours.querySelectorAll("button").forEach((option) => {
          option.setAttribute("aria-selected", option.dataset.hour === String(hour) ? "true" : "false");
        });
        minutes.querySelectorAll("button").forEach((option) => {
          option.setAttribute("aria-selected", option.dataset.minute === String(minute) ? "true" : "false");
        });
      }

      function place() {
        const box = button.getBoundingClientRect();
        const height = 220;
        const top = box.bottom + 6 + height > window.innerHeight && box.top > height + 6
          ? box.top - height - 6
          : box.bottom + 6;
        panel.style.top = `${Math.max(8, top)}px`;
        panel.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - 132))}px`;
      }

      function onDoc(event) {
        if (panel.contains(event.target) || button.contains(event.target)) return;
        close(true);
      }

      function open() {
        paint();
        panel.hidden = false;
        document.body.append(panel);
        place();
        button.setAttribute("aria-expanded", "true");
        document.addEventListener("pointerdown", onDoc);
        panel.querySelectorAll("[aria-selected=true]").forEach((option) => {
          option.scrollIntoView({ block: "center" });
        });
      }

      function close(commit) {
        document.removeEventListener("pointerdown", onDoc);
        panel.remove();
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        if (commit && touched) onPick(hour * 60 + minute);
      }

      button.setAttribute("aria-haspopup", "listbox");
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (panel.isConnected) close(true);
        else open();
      });
      paint();
      return button;
    }

    function timeField(label, current, onPick) {
      const wrap = el("label", "date-field");
      wrap.append(el("span", null, label));
      wrap.append(timeControl(current, onPick));
      return wrap;
    }

    function arrowIcon(up) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", up ? "M3.5 10.5 8 6l4.5 4.5" : "M3.5 5.5 8 10l4.5-4.5");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.8");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.append(path);
      return svg;
    }

    function moveButton(up, label, disabled, onClick) {
      const button = el("button", "block-move");
      button.type = "button";
      button.disabled = disabled;
      button.setAttribute("aria-label", label);
      button.append(arrowIcon(up));
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick();
      });
      return button;
    }

    function blockIdentity(group) {
      const token = blockToken(group.id);
      let id = null;
      let meta = "";
      let color = "";
      if (group.id === "stay") {
        id = "camp";
        color = "#a3472c";
        meta = [camp.paid ? "בתשלום" : "בלי תשלום", camp.bookingUrl ? "בהזמנה מראש" : "", (camp.regions || []).map((region) => REGION_LABEL[region] || region).join(" · ")].filter(Boolean).join(" · ");
      } else if (typeof token === "string" && token.startsWith("v:")) {
        const placeId = window.CamperPlan.visitPlaceId(token);
        const item = placeId ? visitNear.get(placeId) : null;
        if (!item) return null;
        id = `place-${placeId}`;
        color = PLACE_COLOR[item.place.kind] || PLACE_COLOR.park;
        meta = [item.km < 0.4 ? "במקום" : `כ־${item.km} ק״מ מהחניון`, visitFact(item.place)].filter(Boolean).join(" · ");
      } else if (typeof token === "string" && token.startsWith("c:")) {
        const placeId = window.CamperPlan.coffeePlaceId(token);
        const item = placeId ? coffeeNear.get(placeId) : null;
        if (!item) return null;
        id = `place-${placeId}`;
        color = PLACE_COLOR.viewpoint;
        meta = [item.km < 0.4 ? "במקום" : `כ־${item.km} ק״מ מהחניון`, "כחצי שעה"].join(" · ");
      } else if (typeof token === "number") {
        const item = choiceFor(token);
        if (!item.trail) return null;
        id = String(token);
        color = COLORS[(selected.indexOf(token) + 1) % COLORS.length];
        meta = [item.km == null ? "" : `כ־${item.km} ק״מ מהחניון`, trailFacts(item.trail)].filter(Boolean).join(" · ");
      }
      if (id == null) return null;
      const bar = el("div", "block-identity");
      const swatch = el("i", "swatch");
      swatch.style.background = color;
      const actions = el("div", "block-actions");
      const placeId = id.startsWith("place-") ? id.slice(6) : "";
      const visiting = typeof token === "string" && token.startsWith("v:");
      if (placeId && visiting) {
        const info = el("button", "text-link", "פירוט");
        info.type = "button";
        info.addEventListener("click", (event) => {
          event.stopPropagation();
          openVisit(placeId);
        });
        actions.append(info);
        const place = visitNear.get(placeId) && visitNear.get(placeId).place;
        if (place && place.url) {
          const officialPlace = place.source === "inpa" || /parks\.org\.il/.test(place.url || "");
          const source = link(place.url, officialPlace ? "באתר הרשות" : "במפה");
          source.className = "text-link";
          actions.append(source);
        }
        const remove = el("button", "remove", "הסרה");
        remove.type = "button";
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          removeVisit(placeId);
        });
        actions.append(remove);
      } else if (placeId) {
        const place = coffeeNear.get(placeId) && coffeeNear.get(placeId).place;
        const info = el("button", "text-link", place ? placeOpenerLabel(place) : "פירוט");
        info.type = "button";
        info.addEventListener("click", (event) => {
          event.stopPropagation();
          openCoffee(placeId);
        });
        actions.append(info);
        if (place && place.url) {
          const source = link(place.url, "במפה");
          source.className = "text-link";
          actions.append(source);
        }
        const remove = el("button", "remove", "הסרה");
        remove.type = "button";
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          removeCoffee(placeId);
        });
        actions.append(remove);
      } else {
        const info = el("button", "text-link", "פירוט");
        info.type = "button";
        info.addEventListener("click", (event) => {
          event.stopPropagation();
          if (id === "camp") {
            focusFeature("camp");
            setPanel("camp");
          } else openTrail(Number(id));
        });
        actions.append(info);
        if (id !== "camp") {
          const remove = el("button", "remove", "הסרה");
          remove.type = "button";
          remove.addEventListener("click", (event) => {
            event.stopPropagation();
            removeTrail(Number(id));
          });
          actions.append(remove);
        }
      }
      bar.append(swatch, el("p", "meta", meta), actions);
      bar.dataset.id = id;
      return bar;
    }

    function blockTitle(group) {
      if (group.id === "road") return ["🚗", "בדרך"];
      if (group.id === "stay") return ["⛺", "לילה בחניון"];
      if (group.id === "return") return ["🏠", "חזרה הביתה"];
      const visit = group.steps.find((step) => step.kind === "visit");
      if (visit) {
        const item = visitNear.get(visit.placeId);
        const label = item && item.place.source !== "inpa"
          ? (PLACE_KIND[item.place.kind] || "נקודת עניין")
          : "ביקור";
        return [(item && PLACE_MARK[item.place.kind]) || "🏞️", `${label} · ${shortName(visit.name)}`];
      }
      const coffee = group.steps.find((step) => step.kind === "coffee");
      if (coffee) return ["☕", `תצפית לקפה · ${shortName(coffee.name)}`];
      const hike = group.steps.find((step) => step.kind === "hike");
      return ["🥾", hike ? `המסלול · ${shortName(hike.name)}` : "המסלול"];
    }

    function blockToken(id) {
      if (id === "stay") return "stay";
      if (String(id).startsWith("hike:")) {
        const token = Number(String(id).slice(5));
        return Number.isFinite(token) ? token : null;
      }
      if (String(id).startsWith("coffee:")) return window.CamperPlan.coffeeToken(String(id).slice(7));
      if (String(id).startsWith("visit:")) return window.CamperPlan.visitToken(String(id).slice(6));
      return null;
    }

    function stepRow(step, stages, index) {
      const item = el("li");
      const place = stepPlace(step, stages);
      item.dataset.here = String(index);
      item.tabIndex = 0;
      if (place) {
        item.dataset.lat = String(place.lat);
        item.dataset.lng = String(place.lng);
      } else if (step.kind === "depart") {
        item.title = "היציאה מהבית לא מסומנת על המפה הזאת.";
      } else if (step.kind === "home") {
        item.title = "ההגעה הביתה לא מסומנת על המפה הזאת.";
      }
      const when = el("time");
      when.append(el("span", null, step.day));
      if (step.at != null) {
        const input = timeControl(step.at, (next) => {
          const edited = window.CamperPlan.retimedHours({
            hours,
            arrival,
            step,
            next,
            trailIds: selected,
            coffeeIds: selectedCoffee,
            visitIds: selectedVisits,
            order,
          });
          arrival = edited.arrival;
          hours = edited.hours;
          historyPush = true;
          render();
        }, "step-time");
        input.setAttribute("aria-label", TIME_LABEL[step.kind] || "שעת השלב");
        when.append(input);
      }
      item.append(when, el("p", null, stepCopy(step)));
      const choose = () => {
        hereKey = item.dataset.here;
        paintHere(Boolean(place));
      };
      item.addEventListener("click", (event) => {
        if (event.target.closest("input, .time-value, .time-panel")) return;
        choose();
      });
      item.addEventListener("keydown", (event) => {
        if (event.target.closest("input, .time-value, .time-panel")) return;
        if (event.key === "Enter") choose();
      });
      return item;
    }

    function previewPhotos(trail) {
      const frames = (trail.photos || []).filter((item) => item && item.src).slice(0, 3);
      if (!frames.length && trail.image) frames.push({ src: trail.image, credit: "" });
      return frames;
    }

    function appendPlaceMedia(row, place) {
      const photos = previewPhotos(place);
      if (photos.length) {
        const preview = el("div", "preview");
        const grid = el("div", "preview-photos");
        photos.forEach((photo) => {
          const img = document.createElement("img");
          img.src = photo.src;
          img.alt = photo.credit || place.name;
          if (photo.credit) img.title = photo.credit;
          img.addEventListener("error", () => img.remove());
          grid.append(img);
        });
        preview.append(grid);
        row.append(preview);
      }
      const copy = row.querySelector(".spot-copy");
      if (!copy) return;
      if (place.site) {
        const site = link(place.site, "באתר");
        site.className = "text-link";
        copy.append(site);
      } else if (place.wiki) {
        const article = link(place.wiki, "בערך");
        article.className = "text-link";
        copy.append(article);
      }
      if (!place.url) return;
      const source = link(place.url, place.source === "osm" ? "במפה" : "באתר הרשות");
      source.className = "text-link";
      copy.append(source);
    }

    function hikeTraits(trail) {
      const traits = [];
      if (trail.hoursMax != null && trail.hoursMax <= 3) traits.push("עד 3 שעות");
      if (trail.difficulty === "easy") traits.push("קל");
      if (trail.family) traits.push("למשפחות");
      if (trail.circular === true) traits.push("מעגלי");
      const lures = window.CamperPlan.trailLures(trail);
      if (lures.includes("מוצל")) traits.push("מוצל");
      if (lures.includes("מסלול רטוב")) traits.push("רטוב");
      if (lures.includes("נוף מהמם")) traits.push("תצפית");
      return traits;
    }

    function placeTraitList(place, role) {
      const traits = [];
      if (role === "coffee") traits.push("עד 3 שעות");
      else if (place.hoursMax != null && place.hoursMax <= 3) traits.push("עד 3 שעות");
      if (role === "coffee" || place.kind === "viewpoint") traits.push("תצפית");
      else if (PLACE_KIND[place.kind]) traits.push(PLACE_KIND[place.kind]);
      window.CamperPlan.placeTags(place).forEach((tag) => {
        if (!traits.includes(tag)) traits.push(tag);
      });
      return traits;
    }

    function catalogSource() {
      const items = [];
      choices.filter((item) => item.km == null || item.km <= radius).forEach((item) => {
        items.push({
          role: "hike",
          id: item.trail.id,
          key: String(item.trail.id),
          name: item.trail.name,
          km: item.km,
          traits: hikeTraits(item.trail),
          trail: item.trail,
        });
      });
      window.CamperPlan.nearbyPlaces(camp, places, { maxKm: 15, varied: false })
        .filter((item) => item.place.kind !== "viewpoint")
        .forEach((item) => {
          items.push({
            role: "place",
            id: item.place.id,
            key: `place-${item.place.id}`,
            name: item.place.name,
            km: item.km,
            traits: placeTraitList(item.place, "place"),
            place: item.place,
          });
        });
      [...coffeeNear.values()].forEach((item) => {
        items.push({
          role: "coffee",
          id: item.place.id,
          key: `place-${item.place.id}`,
          name: item.place.name,
          km: item.km,
          traits: placeTraitList(item.place, "coffee"),
          place: item.place,
        });
      });
      return items;
    }

    function catalogFiltered() {
      const queryText = catalogQuery.trim();
      const source = catalogSource();
      const inRole = catalogRole === "all" ? source : source.filter((item) => item.role === catalogRole);
      const present = new Set();
      inRole.forEach((item) => item.traits.forEach((trait) => present.add(trait)));
      Object.keys(catalogTraits).forEach((trait) => {
        if (!present.has(trait)) delete catalogTraits[trait];
      });
      const traitsOn = Object.keys(catalogTraits).filter((trait) => catalogTraits[trait]);
      const matches = (item) => {
        if (traitsOn.some((trait) => !item.traits.includes(trait))) return false;
        if (!queryText) return true;
        const hay = [item.name, CATALOG_ROLE[item.role][1]].concat(item.traits).join(" ");
        return hay.includes(queryText);
      };
      const pool = source.filter(matches);
      const filtered = (catalogRole === "all" ? pool : pool.filter((item) => item.role === catalogRole))
        .sort((left, right) => {
          const leftKm = left.km == null ? 999 : left.km;
          const rightKm = right.km == null ? 999 : right.km;
          if (leftKm !== rightKm) return leftKm - rightKm;
          return String(left.name).localeCompare(String(right.name), "he");
        });
      const counts = { all: pool.length, hike: 0, place: 0, coffee: 0 };
      pool.forEach((item) => { counts[item.role] += 1; });
      const traits = TRAIT_ORDER.filter((trait) => present.has(trait));
      [...present].filter((trait) => !TRAIT_ORDER.includes(trait)).sort((left, right) => left.localeCompare(right, "he")).forEach((trait) => traits.push(trait));
      return { filtered, counts, traits };
    }

    function renderCatalogRow(parent, item) {
      const [emoji, label] = CATALOG_ROLE[item.role];
      let action;
      let onOpen;
      let meta = "";
      let color = "#cfc3b4";
      if (item.role === "hike") {
        const on = selected.includes(item.id);
        action = el("button", on ? "remove" : "add", on ? "הסרה" : "הוספה");
        action.type = "button";
        action.disabled = !on && selected.length >= maxPicks;
        action.addEventListener("click", () => (on ? removeTrail(item.id) : addTrail(item.id)));
        onOpen = () => openTrail(item.id);
        meta = [item.km == null ? "" : `כ־${item.km} ק״מ מהחניון`, trailFacts(item.trail)].filter(Boolean).join(" · ");
      } else if (item.role === "coffee") {
        const on = selectedCoffee.includes(item.id);
        action = el("button", on ? "remove" : "add", on ? "הסרה" : "הוספה");
        action.type = "button";
        action.disabled = !on && selectedCoffee.length >= 2;
        action.addEventListener("click", () => (on ? removeCoffee(item.id) : addCoffee(item.id)));
        onOpen = () => openCoffee(item.id);
        meta = [item.km < 0.4 ? "במקום" : `כ־${item.km} ק״מ מהחניון`, "כחצי שעה"].join(" · ");
        color = PLACE_COLOR.viewpoint;
      } else {
        const on = selectedVisits.includes(item.id);
        action = el("button", on ? "remove" : "add", on ? "הסרה" : "הוספה");
        action.type = "button";
        action.disabled = !on && selectedVisits.length >= 2;
        action.addEventListener("click", () => (on ? removeVisit(item.id) : addVisit(item.id)));
        onOpen = () => openVisit(item.id);
        const where = item.km < 0.4 ? "במקום" : `כ־${item.km} ק״מ`;
        const kind = PLACE_KIND[item.place.kind] || "";
        const fee = item.place.paid === true ? "בתשלום" : item.place.paid === false ? "בחינם" : "";
        const length = item.place.duration || `הערכה ${window.CamperPlan.shareDuration(window.CamperPlan.visitMinutes(item.place))}`;
        meta = [kind, where, fee, length].filter(Boolean).join(" · ");
        color = PLACE_COLOR[item.place.kind] || "#6d6256";
      }
      const row = spotRow(
        item.key,
        item.name,
        meta,
        color,
        action,
        onOpen,
        item.role === "hike" ? null : showPlace,
        "",
      );
      row.classList.add(item.role === "hike" ? "nearby" : item.role);
      const badge = el("p", `role role-${item.role}`);
      decorate(badge, emoji, label);
      row.querySelector(".spot-copy").prepend(badge);
      if (item.role === "hike") {
        const tags = window.CamperPlan.trailLures(item.trail);
        if (tags.length) {
          const lures = el("ul", "lures");
          tags.forEach((tag) => lures.append(tagItem(tag)));
          row.querySelector(".spot-copy").append(lures);
        }
        const photos = previewPhotos(item.trail);
        if (photos.length) {
          const preview = el("div", "preview");
          const grid = el("div", "preview-photos");
          photos.forEach((photo) => {
            const img = document.createElement("img");
            img.src = photo.src;
            img.alt = photo.credit || item.trail.name;
            if (photo.credit) img.title = photo.credit;
            img.addEventListener("error", () => img.remove());
            grid.append(img);
          });
          preview.append(grid);
          row.append(preview);
        }
      } else {
        const tags = window.CamperPlan.placeTags(item.place).filter((tag) => tag !== "תצפית" || item.role !== "coffee");
        if (tags.length) {
          const lures = el("ul", "lures");
          tags.forEach((tag) => lures.append(tagItem(tag)));
          row.querySelector(".spot-copy").append(lures);
        }
        appendPlaceMedia(row, item.place);
        markWay(row, item.place);
      }
      parent.append(row);
    }

    function renderCatalog(parent) {
      const { filtered, counts, traits } = catalogFiltered();
      const tools = el("div", "catalog-tools");
      tools.append(el("p", "fine", "טיול, נקודת עניין או מקום לקפה, באותה רשימה. כל שורה מסומנת מה היא."));
      const search = el("label", "place-search");
      search.append(el("span", null, "חיפוש"));
      const queryBox = document.createElement("input");
      queryBox.type = "search";
      queryBox.id = "catalog-search";
      queryBox.value = catalogQuery;
      queryBox.placeholder = "שם, סוג או תגית";
      queryBox.setAttribute("aria-label", "חיפוש ברשימה");
      queryBox.addEventListener("input", () => {
        catalogQuery = queryBox.value;
        catalogExpanded = false;
        focusCatalogSearch = true;
        render();
      });
      search.append(queryBox);
      tools.append(search);
      const roles = el("div", "near-filters");
      roles.setAttribute("role", "group");
      roles.setAttribute("aria-label", "סוג");
      [["all", "הכל", ""]].concat(Object.keys(CATALOG_ROLE).map((key) => [key, CATALOG_ROLE[key][1], CATALOG_ROLE[key][0]])).forEach(([key, text, emoji]) => {
        const button = el("button", "chip-btn");
        decorate(button, emoji, text);
        button.type = "button";
        button.append(el("span", "count", String(counts[key])));
        button.setAttribute("aria-pressed", catalogRole === key ? "true" : "false");
        button.addEventListener("click", () => {
          catalogRole = key;
          catalogExpanded = false;
          render();
        });
        roles.append(button);
      });
      const radii = el("div", "radius");
      [20, 40].forEach((value) => {
        const button = el("button", "chip-btn", `מסלולים עד ${value} ק״מ`);
        button.type = "button";
        button.setAttribute("aria-pressed", value === radius ? "true" : "false");
        button.addEventListener("click", () => {
          radius = value;
          catalogExpanded = false;
          historyPush = true;
          render();
        });
        radii.append(button);
      });
      roles.append(radii);
      tools.append(roles);
      parent.append(tools);
      if (traits.length) {
        const filters = el("div", "near-filters catalog-traits");
        filters.setAttribute("role", "group");
        filters.setAttribute("aria-label", "סינון");
        traits.forEach((trait) => {
          const button = el("button", "chip-btn");
          decorate(button, TRAIT_MARK[trait], trait);
          button.type = "button";
          button.setAttribute("aria-pressed", catalogTraits[trait] ? "true" : "false");
          button.addEventListener("click", () => {
            catalogTraits[trait] = !catalogTraits[trait];
            catalogExpanded = false;
            render();
          });
          filters.append(button);
        });
        parent.append(filters);
      }
      parent.append(el("p", "fine", "נקודות עניין ומקומות לקפה עד 15 ק״מ מהחניון. המסלולים לפי הטווח למעלה. עומדים על שורה והמפה קופצת אליה."));
      if (selected.length >= maxPicks) parent.append(el("p", "fine", "אפשר עד ארבעה טיולים. הסירו אחד כדי להוסיף אחר."));
      if (selectedVisits.length >= 2) parent.append(el("p", "fine", "אפשר עד שתי נקודות עניין. הסירו אחת כדי להוסיף אחרת."));
      if (selectedCoffee.length >= 2) parent.append(el("p", "fine", "אפשר עד שני מקומות לקפה. הסירו אחד כדי להוסיף אחר."));
      if (window.CamperPlan.onTheWay(origin, camp, camp) != null) {
        parent.append(el("p", "fine", "«בדרך מהבית» הוא על הגישה מאזור הבית לחניון, לפני ההגעה ובלי סטייה של יותר מכמה קילומטרים. זו הערכת מרחק, לא כביש."));
      }
      const shown = catalogExpanded ? filtered.slice(0, 24) : filtered.slice(0, 8);
      shown.forEach((item) => renderCatalogRow(parent, item));
      if (!shown.length) {
        parent.append(el("p", "fine", catalogQuery.trim() || Object.values(catalogTraits).some(Boolean)
          ? "אין פה משהו שמתאים לחיפוש."
          : "אין מסלולים או נקודות בטווח הזה."));
      }
      const cap = Math.min(filtered.length, 24);
      if (catalogExpanded && filtered.length > shown.length) {
        parent.append(el("p", "fine", `מוצגות ${shown.length} הקרובות מתוך ${filtered.length}.`));
      }
      if (!catalogExpanded && cap > shown.length) {
        const more = el("button", "chip-btn more-around", `עוד ${cap - shown.length} בסביבה`);
        more.type = "button";
        more.addEventListener("click", () => {
          catalogExpanded = true;
          render();
        });
        parent.append(more);
      }
    }

    function renderAround() {
      around.replaceChildren();
      around.append(el("p", "board-hint", "המספרים על המפה הם הסדר, והקו המקווקו הוא המעבר ביניהם. לחיצה על שורה בלוז מראה איפה אנחנו."));
      around.append(renderItinerary());
      renderCatalog(around);
    }

    function renderDetail() {
      picked.replaceChildren();
      if (panelMode === "coffee") {
        const item = coffeeNear.get(focusPlace);
        if (!item) {
          picked.append(el("p", "around-lead", "המצפור לא נמצא בטווח של החניון."));
          return;
        }
        const on = selectedCoffee.includes(focusPlace);
        const bar = el("div", "detail-bar");
        const back = el("button", "text-link", "חזרה לבניית הטיול");
        back.type = "button";
        back.addEventListener("click", () => setPanel("routes"));
        const action = el("button", on ? "remove" : "add", on ? "הסרה מהטיול" : "להוסיף לטיול");
        action.type = "button";
        action.disabled = !on && selectedCoffee.length >= 2;
        action.addEventListener("click", () => {
          panelMode = "routes";
          if (on) removeCoffee(focusPlace);
          else addCoffee(focusPlace);
        });
        bar.append(back, action);
        picked.append(
          bar,
          el("p", "add-effect", on ? "התצפית בלוז, כחצי שעה." : "אם מוסיפים לטיול, נכנסת עצירה של כחצי שעה."),
          coffeeSheet(item.place, item.km, wayPhrase(item.place)),
        );
        return;
      }
      if (panelMode === "visit") {
        const item = visitNear.get(focusPlace);
        if (!item) {
          picked.append(el("p", "around-lead", "המקום לא נמצא בטווח של החניון."));
          return;
        }
        const on = selectedVisits.includes(focusPlace);
        const bar = el("div", "detail-bar");
        const back = el("button", "text-link", "חזרה לבניית הטיול");
        back.type = "button";
        back.addEventListener("click", () => setPanel("routes"));
        const action = el("button", on ? "remove" : "add", on ? "הסרה מהטיול" : "להוסיף לטיול");
        action.type = "button";
        action.disabled = !on && selectedVisits.length >= 2;
        action.addEventListener("click", () => {
          panelMode = "routes";
          if (on) removeVisit(focusPlace);
          else addVisit(focusPlace);
        });
        bar.append(back, action);
        const minutes = window.CamperPlan.visitMinutes(item.place);
        const officialPlace = item.place.source === "inpa" || /parks\.org\.il/.test(item.place.url || "");
        const when = window.CamperPlan.visitIsEstimate(item.place)
          ? (officialPlace
            ? `הערכה של ${window.CamperPlan.shareDuration(minutes)} נכנסת ללוז. משך הביקור לא מסומן בעמוד.`
            : `הערכה של ${window.CamperPlan.shareDuration(minutes)} נכנסת ללוז.`)
          : `הביקור נכנס ללוז לפי הסימון בעמוד: ${item.place.duration}.`;
        const lead = officialPlace ? "הביקור" : "העצירה";
        picked.append(bar, el("p", "add-effect", on ? `${lead} בלוז. ${when}` : `אם מוסיפים לטיול, ${when}`), visitSheet(item.place, item.km, wayPhrase(item.place)));
        return;
      }
      const focus = focusId != null ? byId.get(focusId) : null;
      if (!focus) {
        picked.append(el("p", "around-lead", "לחצו על שם של מסלול כדי לקרוא עליו בלי לעזוב את המפה."));
        return;
      }
      const bar = el("div", "detail-bar");
      const on = selected.includes(focus.id);
      selected.forEach((id) => {
        const trail = byId.get(id);
        if (!trail) return;
        const chip = el("button", "chip-btn", shortName(trail.name));
        chip.type = "button";
        chip.title = trail.name;
        chip.setAttribute("aria-pressed", id === focus.id ? "true" : "false");
        chip.addEventListener("click", () => openTrail(id));
        bar.append(chip);
      });
      if (!on) {
        const chip = el("button", "chip-btn", shortName(focus.name));
        chip.type = "button";
        chip.setAttribute("aria-pressed", "true");
        bar.append(chip);
      }
      const action = el("button", on ? "remove" : "add", on ? "הסרה מהטיול" : "להוסיף לטיול");
      action.type = "button";
      action.disabled = !on && selected.length >= maxPicks;
      action.addEventListener("click", () => {
        panelMode = "routes";
        if (on) removeTrail(focus.id);
        else addTrail(focus.id);
      });
      bar.append(action);
      const effect = el("p", "add-effect", scheduleEffect(focus, on));
      picked.append(bar, effect, trailSheet(focus));
    }

    function scheduleEffect(trail, on) {
      if (!on && selected.length >= maxPicks) {
        return "אפשר עד ארבעה מסלולים. מסירים אחד מהטיול כדי להוסיף את זה.";
      }
      const current = selected.map((id) => byId.get(id)).filter(Boolean);
      const steps = window.CamperPlan.buildItinerary({
        camp,
        trails: on ? current : current.concat(trail),
        coffees: chosenCoffees(),
        visits: chosenVisits(),
        arrivalMinutes: arrival,
        origin,
        hours,
        order,
        from: fromDate,
        to: toDate,
      });
      const hike = steps.find((step) => step.kind === "hike" && step.trailId === trail.id);
      const lunch = steps.find((step) => step.kind === "lunch");
      if (hike && hike.beforeStay) {
        const arrive = steps.find((step) => step.kind === "arrive");
        const when = arrive ? ` מגיעים לחניון ב־${clock(arrive.at)}.` : "";
        return on
          ? `המסלול ביום ההגעה, לפני הלילה בחניון.${when}`
          : `אם מוסיפים לטיול, הוא נכנס ליום ההגעה.${when}`;
      }
      if (!hike || hike.walk == null) {
        const when = hike && hike.day ? hike.day : "למחרת";
        return on
          ? `המסלול בלוז של ${when}. אין משך הליכה, אז שעת החזרה גמישה.`
          : `אם מוסיפים לטיול, הוא נכנס ללוז של ${when}. אין משך הליכה, אז שעת החזרה גמישה.`;
      }
      const meal = lunch && lunch.at != null ? ` אוכלים בחניון ב־${clock(lunch.at)}.` : "";
      const longDay = hike.back >= 15 * 60 ? " זה יום ארוך." : "";
      const when = hike.day || "למחרת";
      if (on) return `המסלול בלוז של ${when}. חזרה לחניון ב־${clock(hike.back)}.${meal}${longDay}`;
      return `אם מוסיפים לטיול, הוא נכנס ללוז של ${when}. חזרה לחניון ב־${clock(hike.back)}.${meal}${longDay}`;
    }

    function render() {
      const push = historyPush;
      historyPush = false;
      remember(push && !silenceHistory);
      const chosen = chosenTrails();
      const keptScroll = panelMode === "routes" ? panelBody.scrollTop : 0;
      const count = chosen.length === 1
        ? "מסלול אחד במפה"
        : chosen.length
          ? `${chosen.length} מסלולים במפה`
          : "בלי מסלול במפה";
      lead.textContent = tripId ? `${count}${draft ? " · טיוטה" : " · שמור"}` : count;
      saveButton.textContent = tripId && !draft ? "שמירה" : "צור טיול";
      renderAround();
      renderDetail();
      applyPanel();
      if (panelMode === "routes") panelBody.scrollTop = keptScroll;
      if (focusCatalogSearch && panelMode === "routes") {
        const box = document.querySelector("#catalog-search");
        if (box) {
          box.focus();
          const end = box.value.length;
          if (typeof box.setSelectionRange === "function") box.setSelectionRange(end, end);
        }
        focusCatalogSearch = false;
      }
      if (revealCoffee && panelMode === "routes") {
        const card = document.querySelector(`.day-block[data-id="${revealCoffee}"]`);
        if (card) card.scrollIntoView({ block: "nearest" });
        revealCoffee = null;
      }
      const listed = catalogFiltered().filtered;
      const extras = listed
        .filter((item) => item.role === "hike" && !selected.includes(item.id) && item.trail.lat != null)
        .map((item) => ({ trail: item.trail, km: item.km }));
      try {
        const placeSpots = listed
          .filter((item) => item.role !== "hike" && item.place && item.place.lat != null)
          .slice(0, 24)
          .map((item) => ({ place: item.place, km: item.km }));
        drawMap(camp, chosen, extras, openTrail, order, placeSpots, chosenCoffees(), chosenVisits(), origin, openMappedPlace);
      } catch (error) {
        mapNote.textContent = "המפה לא התעדכנה. רשימת המסלולים כן.";
      }
      mapNote.hidden = panelMode !== "routes" || !mapNote.textContent;
      paintHere(false);
    }

    function stepPlace(step, stages) {
      const campStage = stages.find((stage) => stage.kind === "arrive");
      if (step.kind === "arrive" || step.kind === "dinner" || step.kind === "rise" || step.kind === "breakfast" || step.kind === "lunch" || step.kind === "return") {
        return campStage || null;
      }
      if (step.kind === "coffee") {
        return stages.find((stage) => stage.kind === "coffee" && stage.placeId === step.placeId) || null;
      }
      if (step.kind === "visit") {
        return stages.find((stage) => stage.kind === "visit" && stage.placeId === step.placeId) || null;
      }
      if (step.kind === "start" || step.kind === "hike") {
        const named = step.name
          ? stages.find((stage) => stage.text === step.name && stage.kind === "depart-hike")
            || stages.find((stage) => stage.text === step.name)
          : null;
        return named || stages.find((stage) => stage.kind === "depart-hike") || campStage || null;
      }
      return null;
    }

    function paintHere(fly) {
      document.querySelectorAll(".timeline li").forEach((node) => {
        node.classList.toggle("here", node.dataset.here === hereKey);
      });
      const row = hereKey == null ? null : document.querySelector(`.timeline li[data-here="${hereKey}"]`);
      if (!row || !row.dataset.lat || !sharedMap) {
        if (hereMarker && sharedMap) sharedMap.removeLayer(hereMarker);
        hereMarker = null;
        return;
      }
      const latlng = [Number(row.dataset.lat), Number(row.dataset.lng)];
      const icon = window.L.divIcon({
        className: "here-marker",
        html: '<div class="here-pin"><span>איפה אנחנו</span><i></i></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      if (!hereMarker) {
        hereMarker = window.L.marker(latlng, { icon, zIndexOffset: 1100, interactive: false }).addTo(sharedMap);
      } else {
        hereMarker.setLatLng(latlng);
        hereMarker.setIcon(icon);
      }
      if (fly) sharedMap.flyTo(latlng, Math.max(sharedMap.getZoom(), 15), { duration: 0.4 });
    }

    const menuButton = document.querySelector("#trip-menu");
    const menuPanel = document.querySelector("#trip-menu-panel");

    function closeTripMenu() {
      if (!menuPanel || menuPanel.hidden) return;
      menuPanel.hidden = true;
      menuButton.setAttribute("aria-expanded", "false");
      if (deleteButton.dataset.confirm === "yes") {
        deleteButton.dataset.confirm = "";
        deleteButton.textContent = "מחיקה";
      }
      if (menuPanel.contains(document.activeElement)) menuButton.focus();
    }

    function openTripMenu() {
      menuPanel.hidden = false;
      menuButton.setAttribute("aria-expanded", "true");
      const first = menuPanel.querySelector("button:not([hidden])");
      if (first) first.focus();
    }

    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (menuPanel.hidden) openTripMenu();
      else closeTripMenu();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!menuPanel || menuPanel.hidden) return;
      if (menuPanel.contains(event.target) || menuButton.contains(event.target)) return;
      closeTripMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeTripMenu();
    });

    saveButton.addEventListener("click", () => {
      if (!persistNew()) return;
      closeTripMenu();
      render();
      saveNote.textContent = "הטיול נשמר אצלך, גם אחרי רענון.";
    });
    shareButton.addEventListener("click", async () => {
      closeTripMenu();
      const record = editorRecord();
      const url = new URL(window.CamperTrips.sharePath(record), window.location.href).href;
      const text = window.CamperPlan.shareMessage({
        name: record.name,
        camp,
        trails: selected.map((id) => byId.get(id)).filter(Boolean),
        coffees: chosenCoffees(),
        visits: chosenVisits(),
        arrivalMinutes: arrival,
        origin,
        hours,
        order,
        from: fromDate,
        to: toDate,
        url,
      });
      const result = await window.CamperTrips.send(record, text);
      if (result.aborted) return;
      if (result.copied) saveNote.textContent = "ההודעה הועתקה, עם הלוז והקישורים.";
      else if (result.shared) saveNote.textContent = "אפשר לשלוח את הטיול.";
      else saveNote.textContent = text;
    });
    deleteButton.addEventListener("click", () => {
      if (!tripId) return;
      if (deleteButton.dataset.confirm !== "yes") {
        deleteButton.dataset.confirm = "yes";
        deleteButton.textContent = "לאשר מחיקה";
        return;
      }
      window.CamperTrips.remove(tripId);
      try {
        sessionStorage.removeItem("camper-return");
      } catch (_error) {
        /* the trip is already gone from the list */
      }
      window.location.href = "trips.html";
    });
    nameInput.addEventListener("change", () => {
      document.title = `${currentName()} — סופ״ש בטבע`;
      remember(false);
    });
    window.addEventListener("popstate", () => {
      const next = params();
      if (next.campId !== camp.id) return;
      silenceHistory = true;
      historyPush = false;
      selected.splice(0, selected.length, ...next.trailIds.filter((id) => byId.has(id)).slice(0, maxPicks));
      selectedCoffee.splice(0, selectedCoffee.length, ...next.coffee.filter((id) => coffeeNear.has(id)).slice(0, 2));
      selectedVisits.splice(0, selectedVisits.length, ...next.visit.filter((id) => visitNear.has(id)).slice(0, 2));
      if (next.name) nameInput.value = next.name;
      focusPlace = (next.view === "visit" && visitNear.has(next.spot))
        || (next.view === "coffee" && coffeeNear.has(next.spot))
        ? next.spot
        : "";
      panelMode = next.view === "visit" || next.view === "coffee"
        ? (focusPlace ? next.view : "routes")
        : (next.view === "detail" && (next.focusId == null || !byId.has(next.focusId)) ? "routes" : next.view);
      if (panelMode === "detail") {
        focusId = next.focusId;
        focusedKey = String(next.focusId);
      } else if (panelMode === "visit" || panelMode === "coffee") {
        focusedKey = `place-${focusPlace}`;
      }
      arrival = next.arrival;
      hours = {
        dinner: next.dinner,
        rise: next.rise,
        breakfast: next.breakfast,
        start: next.start,
        lunch: next.lunch,
        back: next.back,
        hikes: next.hikes,
        coffeeAt: splitStops(next.stops, next.visit).coffeeAt,
        visitAt: splitStops(next.stops, next.visit).visitAt,
      };
      radius = next.radius;
      order = next.order;
      const dates = window.CamperPlan.tripDates(next.from, next.to);
      fromDate = dates.from;
      toDate = dates.to;
      tripDepth = window.history.state && window.history.state.camperTrip ? window.history.state.depth || 0 : 0;
      render();
      silenceHistory = false;
    });

    render();
  })
  .catch(() => {
    title.textContent = "לא הצלחנו לטעון את הפירוט";
  });
