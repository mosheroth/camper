const ISRAEL_BOUNDS = [[29.45, 34.22], [33.35, 35.92]];
const PAGE = 24;
const NEAR_KM = 5;
const ROLE = {
  hike: ["טיול רגלי", "#a3472c"],
  camp: ["קמפינג", "#1c3f34"],
  place: ["נקודת עניין", "#2f6a52"],
  coffee: ["תצפית", "#6a4b16"],
  cart: ["עגלת קפה", "#8a3e2a"],
};
const KIND = {
  spring: "מעיין",
  waterfall: "מפל",
  viewpoint: "מצפור",
  peak: "פסגה",
  park: "גן לאומי",
  reserve: "שמורה",
  beach: "חוף",
  cart: "עגלת קפה",
};
const DIFFICULTY = { easy: "קלה", moderate: "בינונית", challenging: "מאתגרת" };

const results = document.querySelector("#results");
const roles = document.querySelector("#roles");
const traitsBox = document.querySelector("#traits");
const queryBox = document.querySelector("#query");

let catalog = [];
let camps = [];
const ROLE_MARK = { hike: "🥾", camp: "⛺", place: "📍", coffee: "🔭", cart: "☕" };
const TRAIT_ORDER = ["עד 3 שעות", "קל", "למשפחות", "מעגלי", "מוצל", "רטוב", "תצפית", "מעיין", "מפל", "פסגה", "גן לאומי", "שמורה", "חוף", "מים", "מערות", "מונגש", "חיות בר", "פריחה", "ארכיאולוגיה", "עגלה", "מטמון", "כלבים", "בתיאום מראש"];
const TRAIT_MARK = {
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
  "לילדים": "🧒",
  "מוצל": "🌳",
  "מסלול רטוב": "💦",
  "נוף מהמם": "🔭",
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
  "מונגש": "♿",
  "בתיאום מראש": "📅",
};
let role = "all";
let region = "all";
let near = null;
let trails = [];
let places = [];
let pickedTraits = {};
let home = "";
let limit = PAGE;
let menuFor = null;
let menuQuery = "";
let menuFocus = false;
let openKey = "";
let map = null;
let markers = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function hourPhrase(hours) {
  const whole = Math.floor(hours);
  const half = Math.abs(hours - whole - 0.5) < 0.01;
  if (half && whole === 0) return "כחצי שעה";
  const head = whole === 1 ? "כשעה" : whole === 2 ? "כשעתיים" : `כ־${whole} שעות`;
  if (half) return `${head} וחצי`;
  if (whole === hours) return head;
  return `כ־${hours} שעות`;
}

function hikeMeta(trail) {
  const bits = [];
  if (DIFFICULTY[trail.difficulty]) bits.push(DIFFICULTY[trail.difficulty]);
  if (trail.circular === true) bits.push("מעגלי");
  else if (trail.circular === "partial") bits.push("מעגלי חלקית");
  if (trail.hoursMax && trail.hoursMax <= 16) {
    const estimated = trail.hoursEstimated ? "הערכה של " : "";
    if (trail.hoursMin && trail.hoursMin !== trail.hoursMax) bits.push(`${estimated}${trail.hoursMin}–${trail.hoursMax} שעות`);
    else bits.push(`${estimated}${hourPhrase(trail.hoursMax)}`);
  }
  if (window.CamperPlan.lengthIsUsable(trail)) {
    if (trail.kmMin && trail.kmMax && trail.kmMin !== trail.kmMax) bits.push(`${trail.kmMin}–${trail.kmMax} ק״מ`);
    else bits.push(`כ־${trail.kmMax || trail.kmMin} ק״מ`);
  }
  if (trail.family) bits.push("למשפחות");
  if (trail.accessible) bits.push("מונגש");
  const area = (trail.areaNames || []).find((name) => String(name || "").trim());
  if (area) bits.push(area);
  return bits.join(" · ");
}

function clipText(text, limit) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  const head = space > limit * 0.6 ? cut.slice(0, space) : cut;
  return `${head.trim()}…`;
}

function cover(source) {
  const photo = (source.photos || []).find((item) => item && item.src);
  if (photo) return photo;
  if (source.image) return { src: source.image, credit: "" };
  return null;
}

function hikeAbout(trail) {
  const details = trail.details || {};
  const picture = cover(trail);
  const points = [];
  (details.highlights || []).forEach((item) => {
    const text = String(item || "").replace(/\s+/g, " ").trim();
    if (text && !points.includes(text)) points.push(text);
  });
  if (!points.length) {
    (trail.features || []).forEach((item) => {
      const text = String(item || "").replace(/\s+/g, " ").trim();
      if (text && text !== "מעגלי" && !points.includes(text)) points.push(text);
    });
  }
  return {
    photo: picture ? picture.src : "",
    credit: picture && picture.credit ? picture.credit : "",
    text: clipText(details.summary || trail.blurb || "", 420),
    points: points.slice(0, 8),
    aside: details.mapSheet || "",
  };
}

function placeAbout(place) {
  const picture = cover(place);
  const points = [];
  if (place.paid === true) points.push("בתשלום");
  else if (place.paid === false) points.push("בחינם");
  (place.tags || []).forEach((tag) => {
    if (tag && !points.includes(tag)) points.push(tag);
  });
  return {
    photo: picture ? picture.src : "",
    credit: picture && picture.credit ? picture.credit : "",
    text: clipText(place.blurb || "", 220),
    points: points.slice(0, 6),
    aside: "",
  };
}

function campAbout(glance) {
  return {
    photo: glance.photo || "",
    credit: glance.credit || "",
    text: clipText([glance.blurb, glance.note].filter(Boolean).join(" "), 420),
    points: glance.facilities.map((item) => item.label).concat(glance.facts).slice(0, 8),
    aside: "",
  };
}

function driveLabel(minutes) {
  if (minutes === 0) return "בלי נסיעה מהבית";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `נסיעה של כ־${minutes} דקות`;
  const head = hours === 1 ? "כשעה" : hours === 2 ? "כשעתיים" : `כ־${hours} שעות`;
  if (!mins) return `נסיעה של ${head}`;
  if (mins === 30) return `נסיעה של ${head} וחצי`;
  return `נסיעה של ${head} ו־${mins} דקות`;
}

function campMeta(camp) {
  const glance = window.CamperPlan.campGlance(camp);
  const regionName = { north: "צפון", center: "מרכז", south: "דרום", east: "יו״ש" }[(camp.regions || [])[0]] || "";
  const bits = [regionName, glance.stay, glance.bookingUrl ? "בתיאום מראש" : ""].filter(Boolean);
  const origin = home ? window.CamperPlan.regionOrigin(camps, home) : null;
  if (origin && camp.lat != null) {
    const drive = window.CamperPlan.travelMinutes(camp, origin);
    if (drive != null) bits.push(driveLabel(drive));
  }
  return bits.join(" · ");
}

function kmBetween(from, to) {
  if (!from || from.lat == null || from.lng == null || !to || to.lat == null || to.lng == null) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (to.lat - from.lat) * rad;
  const dLng = (to.lng - from.lng) * rad;
  const lat1 = from.lat * rad;
  const lat2 = to.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function circleBounds(point) {
  const spots = point.spots && point.spots.length ? point.spots : [point];
  const latPad = point.km / 111;
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  spots.forEach((spot) => {
    const lngPad = latPad / Math.max(0.2, Math.cos(spot.lat * Math.PI / 180));
    south = Math.min(south, spot.lat - latPad);
    north = Math.max(north, spot.lat + latPad);
    west = Math.min(west, spot.lng - lngPad);
    east = Math.max(east, spot.lng + lngPad);
  });
  return [[south, west], [north, east]];
}

function kmFromTrip(item) {
  if (!near || !item || item.lat == null) return Infinity;
  const spots = near.spots && near.spots.length ? near.spots : [near];
  return Math.min(...spots.map((spot) => kmBetween(spot, item)));
}

function inRegion(item) {
  if (region === "all") return true;
  if (item.role === "hike" || item.role === "camp") return (item.regions || []).includes(region);
  if (item.lat == null) return false;
  if (region === "north") return item.lat >= 32.45;
  if (region === "center") return item.lat >= 31.55 && item.lat < 32.45;
  if (region === "south") return item.lat < 31.55;
  return item.lng > 35.05 && item.lat > 31.2 && item.lat < 32.6;
}

function matchesQuery(item, text) {
  if (!text) return true;
  if (item.name.includes(text) || (item.area || "").includes(text)) return true;
  return (item.traits || []).some((trait) => trait.includes(text));
}

function chosenTraits() {
  return Object.keys(pickedTraits).filter((trait) => pickedTraits[trait]);
}

function hasTrait(item, trait) {
  const traits = item.traits || [];
  if (traits.includes(trait)) return true;
  if (trait === "רטוב" && traits.includes("מעיין")) return true;
  return false;
}

function matchesTraits(item) {
  const selected = chosenTraits();
  if (!selected.length) return true;
  return selected.every((trait) => hasTrait(item, trait));
}

function inNear(item) {
  if (!near) return true;
  return kmFromTrip(item) <= near.km;
}

function basePool() {
  const text = queryBox.value.trim();
  return catalog.filter((item) => inRegion(item) && inNear(item) && matchesQuery(item, text));
}

function pool() {
  return basePool().filter(matchesTraits);
}

function visible() {
  const text = queryBox.value.trim();
  const matched = pool().filter((item) => role === "all" || item.role === role);
  if (near) matched.sort((left, right) => kmFromTrip(left) - kmFromTrip(right));
  else matched.sort((left, right) => left.name.localeCompare(right.name, "he"));
  if (!text && role === "all" && region === "all" && !near && !chosenTraits().length) {
    return matched.filter((item) => item.role === "camp").slice(0, limit);
  }
  return matched.slice(0, limit);
}

function counts() {
  const matched = pool();
  const tally = { all: matched.length, hike: 0, camp: 0, place: 0, coffee: 0, cart: 0 };
  matched.forEach((item) => { tally[item.role] += 1; });
  if (!queryBox.value.trim() && region === "all" && !near && !chosenTraits().length) tally.all = catalog.filter((item) => item.role === "camp").length;
  return tally;
}

function ensureMap() {
  if (map || typeof window.L === "undefined") return;
  map = window.L.map("browse-map", { zoomControl: false, scrollWheelZoom: true });
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  window.L.control.zoom({ position: "topleft", zoomInTitle: "התקרבות", zoomOutTitle: "התרחקות" }).addTo(map);
  markers = window.L.layerGroup().addTo(map);
  map.fitBounds(near ? circleBounds(near) : ISRAEL_BOUNDS, { animate: false, padding: [20, 20], maxZoom: near ? 13 : 17 });
  window.addEventListener("resize", () => map.invalidateSize());
}

function drawMap(rows) {
  ensureMap();
  if (!markers) return;
  markers.clearLayers();
  const points = [];
  rows.forEach((item) => {
    if (item.lat == null) return;
    points.push([item.lat, item.lng]);
    const marker = window.L.circleMarker([item.lat, item.lng], {
      radius: openKey === item.key ? 9 : 6,
      color: "#fffaf3",
      weight: 2,
      fillColor: ROLE[item.role][1],
      fillOpacity: 1,
    }).addTo(markers);
    marker.bindTooltip(item.name, { direction: "auto", opacity: 0.95 });
    marker.on("click", () => {
      openKey = item.key;
      menuFor = null;
      render();
    });
  });
  if (near && !openKey) map.fitBounds(circleBounds(near), { padding: [28, 28], maxZoom: 13, animate: false });
  else if (points.length > 1) map.fitBounds(points, { padding: [28, 28], maxZoom: 11, animate: false });
  else if (points.length === 1) map.setView(points[0], 12, { animate: false });
}

function link(href, text) {
  const node = el("a", null, text);
  node.href = href;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  return node;
}

function placeMeta(item) {
  if (!near || item.lat == null) return item.meta;
  const away = kmFromTrip(item);
  const where = away < 0.4 ? "במקום" : `כ־${Math.max(1, Math.round(away))} ק״מ מהטיול`;
  return [where, item.meta].filter(Boolean).join(" · ");
}

function dropNear(draw) {
  near = null;
  const url = new URL(window.location.href);
  if (url.searchParams.get("into")) url.searchParams.set("wide", "1");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  if (draw) {
    limit = PAGE;
    render();
  }
}

function focusableTrips() {
  if (!window.CamperTrips) return [];
  return window.CamperTrips.list()
    .map((trip) => ({ trip, focus: focusFor(trip, camps, trails, places) }))
    .filter((entry) => entry.focus);
}

function pinTrip(id) {
  const url = new URL(window.location.href);
  if (id) {
    url.searchParams.set("into", id);
    url.searchParams.delete("wide");
  } else if (url.searchParams.get("into")) url.searchParams.set("wide", "1");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function placeControl() {
  const choices = focusableTrips();
  const onTrip = Boolean(near && choices.some((entry) => entry.trip.id === near.id));
  const wrap = el("label", onTrip ? "near-pick on" : "near-pick");
  if (onTrip) wrap.append(document.createTextNode("סביב"));
  const pick = document.createElement("select");
  pick.setAttribute("aria-label", "איפה מחפשים");
  const areas = document.createElement("optgroup");
  areas.label = "אזור";
  [["all", "כל הארץ"], ["north", "צפון"], ["center", "מרכז"], ["south", "דרום"], ["east", "יו״ש"]].forEach(([value, label]) => {
    const option = el("option", null, label);
    option.value = value;
    areas.append(option);
  });
  pick.append(areas);
  if (choices.length) {
    const trips = document.createElement("optgroup");
    trips.label = "סביב טיול";
    choices.forEach(({ trip, focus }) => {
      const option = el("option", null, focus.label);
      option.value = `trip:${trip.id}`;
      trips.append(option);
    });
    pick.append(trips);
  }
  pick.value = onTrip ? `trip:${near.id}` : region;
  pick.addEventListener("change", () => {
    if (pick.value.startsWith("trip:")) {
      const trip = window.CamperTrips.get(pick.value.slice(5));
      near = trip ? focusFor(trip, camps, trails, places) : null;
      region = "all";
      pinTrip(near ? trip.id : "");
    } else {
      region = pick.value;
      dropNear(false);
    }
    limit = PAGE;
    openKey = "";
    render();
  });
  wrap.append(pick);
  return wrap;
}

function paintTraits() {
  const present = new Set();
  basePool().filter((item) => role === "all" || item.role === role).forEach((item) => {
    (item.traits || []).forEach((trait) => present.add(trait));
  });
  Object.keys(pickedTraits).forEach((trait) => {
    if (!present.has(trait)) delete pickedTraits[trait];
  });
  const traits = TRAIT_ORDER.filter((trait) => present.has(trait));
  [...present].filter((trait) => !TRAIT_ORDER.includes(trait)).sort((left, right) => left.localeCompare(right, "he")).forEach((trait) => traits.push(trait));
  traitsBox.replaceChildren();
  traits.forEach((trait) => {
    const button = el("button", pickedTraits[trait] ? "chip on" : "chip");
    button.type = "button";
    button.setAttribute("aria-pressed", pickedTraits[trait] ? "true" : "false");
    const emoji = TRAIT_MARK[trait];
    if (emoji) {
      const mark = el("span", "mark", emoji);
      mark.setAttribute("aria-hidden", "true");
      button.append(mark);
    }
    button.append(document.createTextNode(trait));
    button.addEventListener("click", () => {
      pickedTraits[trait] = !pickedTraits[trait];
      if (!pickedTraits[trait]) delete pickedTraits[trait];
      limit = PAGE;
      openKey = "";
      render();
    });
    traitsBox.append(button);
  });
}

function nearNote() {
  const note = el("p", "fine");
  note.append(`סביב «${near.label}», עד כ־${near.km} ק״מ. `);
  const widen = el("button", "widen", "כל הארץ");
  widen.type = "button";
  widen.addEventListener("click", () => dropNear(true));
  note.append(widen);
  return note;
}

function cleanLine(value) {
  return String(value || "").replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
}

function addList(parent, items) {
  const lines = (items || []).map(cleanLine).filter(Boolean);
  if (!lines.length) return;
  const list = el("ul", "detail-list");
  lines.forEach((line) => list.append(el("li", null, line)));
  parent.append(list);
}

function chipList(parent, items) {
  const lines = (items || []).map(cleanLine).filter(Boolean);
  if (!lines.length) return;
  const list = el("ul", "chips");
  lines.forEach((point) => {
    const chip = el("li");
    if (TRAIT_MARK[point]) {
      const mark = el("span", "mark", TRAIT_MARK[point]);
      mark.setAttribute("aria-hidden", "true");
      chip.append(mark);
    }
    chip.append(document.createTextNode(point));
    list.append(chip);
  });
  parent.append(list);
}

function gallery(parent, record) {
  const frames = (record.photos || []).filter((item) => item && item.src).map((item) => ({ ...item }));
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

function recordFor(item) {
  if (item.role === "hike") return trails.find((trail) => trail.id === item.id) || null;
  if (item.role === "camp") return camps.find((camp) => camp.id === item.id) || null;
  return places.find((place) => place.id === item.id) || null;
}

function fillHike(node, trail) {
  const details = trail.details || {};
  gallery(node, trail);
  const summary = cleanLine(details.summary || trail.blurb);
  if (summary) node.append(el("p", "sheet-copy", summary));
  const character = cleanLine(details.character);
  if (character) node.append(el("p", null, character));
  const stats = cleanLine(details.stats);
  if (stats) node.append(el("p", null, stats));
  const mapSheet = cleanLine(details.mapSheet);
  if (mapSheet) node.append(el("p", "fine", mapSheet));
  const highlights = (details.highlights || []).map(cleanLine).filter(Boolean);
  if (highlights.length) {
    node.append(el("h3", null, "בדרך"));
    addList(node, highlights);
  }
  const extra = (trail.features || []).map(cleanLine).filter((feature) => feature && !highlights.includes(feature));
  chipList(node, extra);
  const snippet = cleanLine(details.snippet);
  if (snippet) {
    node.append(el("h3", null, "תקציר הדרך"));
    node.append(el("p", "sheet-copy", snippet));
  }
  (details.sections || []).forEach((part) => {
    const title = cleanLine(part.title);
    if (title) node.append(el("h3", null, title));
    const text = cleanLine(part.text);
    if (text) node.append(el("p", null, text));
    addList(node, part.items);
  });
  if (trail.routes && trail.routes.length) {
    node.append(el("h3", null, "קווים במפה"));
    addList(node, trail.routes.map((route) => route.name));
  } else if (trail.lat == null) {
    node.append(el("p", "fine", "לעמוד הזה אין נקודה מסומנת, אז המפה לא מציגה אותו."));
  } else {
    node.append(el("p", "fine", "לא נמצא קו שביל פתוח ששמו תואם למסלול הזה, אז המפה מסמנת את נקודת ההתחלה בלבד."));
  }
}

function fillCamp(node, camp) {
  const details = camp.details || {};
  gallery(node, camp);
  const summary = cleanLine(details.summary || camp.blurb);
  if (summary) node.append(el("p", "sheet-copy", summary));
  const blurb = cleanLine(camp.blurb);
  if (blurb && blurb !== summary) node.append(el("p", null, blurb));
  if (camp.places) node.append(el("p", null, `${camp.places} מקומות לינה`));
  if (camp.access) node.append(el("p", null, `גישה: ${camp.access}`));
  const facilities = (camp.facilities || []).map((item) => item && item.label).filter(Boolean);
  if (facilities.length) {
    node.append(el("h3", null, "מה יש בחניון"));
    addList(node, facilities);
  }
  (details.sections || []).forEach((part) => {
    const title = cleanLine(part.title);
    if (title) node.append(el("h3", null, title));
    const text = cleanLine(part.text);
    if (text) node.append(el("p", null, text));
    addList(node, part.items);
  });
  if (cleanLine(details.hours)) {
    node.append(el("h3", null, "שעות"));
    node.append(el("p", null, cleanLine(details.hours)));
  }
  if (cleanLine(details.arrival)) {
    node.append(el("h3", null, "איך מגיעים"));
    node.append(el("p", null, cleanLine(details.arrival)));
  }
  if (camp.paid) node.append(el("p", null, "הכניסה עם כלבים אסורה."));
}

function fillPlace(node, place) {
  gallery(node, place);
  const blurb = cleanLine(place.blurb);
  if (blurb) node.append(el("p", "sheet-copy", blurb));
  const stored = (place.tags || []).map(cleanLine).filter(Boolean);
  chipList(node, stored.length ? stored : window.CamperPlan.placeTags(place));
  const arrival = cleanLine(place.arrival);
  if (arrival) {
    node.append(el("h3", null, "איך מגיעים"));
    node.append(el("p", null, arrival));
  }
  if (place.duration) node.append(el("p", null, `משך הביקור: ${place.duration}`));
  else if (place.kind !== "viewpoint" && place.kind !== "cart") {
    const official = place.source === "inpa" || /parks\.org\.il/.test(place.url || "");
    const estimate = window.CamperPlan.shareDuration(window.CamperPlan.visitMinutes(place));
    node.append(el("p", "fine", official
      ? "משך הביקור לא מסומן בעמוד הרשות, אז הלוז שם הערכה. אפשר לשנות את השעה."
      : `אין משך רשמי, אז הלוז שם הערכה של ${estimate}. אפשר לשנות את השעה.`));
  }
}

function sheet(item) {
  const node = el("article", "search-sheet");
  node.dataset.key = item.key;
  const back = el("button", "text-back", "חזרה לחיפוש");
  back.type = "button";
  back.addEventListener("click", () => {
    openKey = "";
    render();
  });
  node.append(back);
  const kicker = el("p", "kicker");
  const kickerMark = el("span", "mark", ROLE_MARK[item.role] || "📍");
  kickerMark.setAttribute("aria-hidden", "true");
  kicker.append(kickerMark, document.createTextNode(ROLE[item.role][0]));
  node.append(kicker);
  node.append(el("h2", null, item.name));
  const meta = placeMeta(item);
  if (meta) node.append(el("p", "meta", meta));
  const record = recordFor(item);
  if (record && item.role === "hike") fillHike(node, record);
  else if (record && item.role === "camp") fillCamp(node, record);
  else if (record) fillPlace(node, record);
  if (item.booking) node.append(el("p", "booking", "צריך להזמין מקום מראש."));
  const links = el("div", "links");
  item.links.forEach((entry) => links.append(link(entry.href, entry.text)));
  if (links.childNodes.length) node.append(links);
  const add = el("button", "add", "הוספה לטיול");
  add.type = "button";
  add.addEventListener("click", (event) => {
    event.stopPropagation();
    menuFor = menuFor === item.key ? null : item.key;
    menuQuery = "";
    render();
  });
  node.append(add);
  return node;
}

function itemMark(item) {
  if (item.role === "hike") return ROLE_MARK.hike;
  if (item.role === "camp") return ROLE_MARK.camp;
  if (item.role === "coffee") return ROLE_MARK.coffee;
  if (item.role === "cart") return ROLE_MARK.cart;
  const kindName = (item.traits || []).find((trait) => ["מעיין", "מפל", "פסגה", "גן לאומי", "שמורה", "חוף"].includes(trait));
  return (kindName && TRAIT_MARK[kindName]) || ROLE_MARK.place;
}

function thumb(item) {
  const node = el("span", "hit-thumb");
  node.setAttribute("aria-hidden", "true");
  const paint = () => {
    node.textContent = itemMark(item);
    node.classList.add("empty");
  };
  if (!item.photo) {
    paint();
    return node;
  }
  const img = document.createElement("img");
  img.src = item.photo;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.addEventListener("error", () => {
    img.remove();
    paint();
  });
  node.append(img);
  return node;
}

function roleBadge(item) {
  const node = el("span", `badge ${item.role}`);
  const mark = el("span", "mark", ROLE_MARK[item.role] || "📍");
  mark.setAttribute("aria-hidden", "true");
  node.append(mark, document.createTextNode(ROLE[item.role][0]));
  return node;
}

function row(item) {
  const node = el("article", openKey === item.key ? "hit open" : "hit");
  node.dataset.key = item.key;
  node.append(thumb(item));
  const copy = el("div", "hit-copy");
  copy.append(roleBadge(item));
  copy.append(el("h2", null, item.name));
  const meta = placeMeta(item);
  if (meta) copy.append(el("p", "meta", meta));
  node.append(copy);
  const add = el("button", "add", "הוספה לטיול");
  add.type = "button";
  add.addEventListener("click", (event) => {
    event.stopPropagation();
    menuFor = menuFor === item.key ? null : item.key;
    menuQuery = "";
    render();
  });
  node.append(add);
  node.addEventListener("click", () => {
    openKey = item.key;
    menuFor = null;
    render();
    if (item.lat != null && map) map.flyTo([item.lat, item.lng], 13, { duration: 0.35 });
  });
  return node;
}

function contains(trip, item) {
  if (item.role === "camp") return Number(trip.campId) === item.id;
  if (item.role === "hike") return (trip.trailIds || []).map(Number).includes(item.id);
  const place = trip.place || {};
  const list = item.role === "coffee" ? place.coffee : place.visit;
  return (list || []).includes(item.id);
}

function nextState(trip, item, on) {
  const place = { ...(trip ? trip.place : {}) };
  let campId = trip ? trip.campId : null;
  let trailIds = trip ? (trip.trailIds || []).slice() : [];
  let coffee = (place.coffee || []).slice();
  let visit = (place.visit || []).slice();
  let note = "";
  if (item.role === "camp") campId = on ? item.id : null;
  else if (item.role === "hike") {
    if (on && !trailIds.map(Number).includes(item.id) && trailIds.length >= 4) note = "אפשר עד ארבעה מסלולים בטיול.";
    else trailIds = on ? trailIds.concat(item.id) : trailIds.filter((id) => Number(id) !== item.id);
  } else if (item.role === "coffee") {
    if (on && !coffee.includes(item.id) && coffee.length >= 2) note = "אפשר עד שתי תצפיות קפה בטיול.";
    else coffee = on ? coffee.concat(item.id) : coffee.filter((id) => id !== item.id);
  } else if (on && !visit.includes(item.id) && visit.length >= 2) note = "אפשר עד שתי נקודות עניין בטיול.";
  else visit = on ? visit.concat(item.id) : visit.filter((id) => id !== item.id);
  place.coffee = coffee;
  place.visit = visit;
  return {
    note,
    input: {
      id: trip && trip.id,
      name: trip ? trip.name : item.name,
      campId,
      trailIds,
      draft: trip ? trip.draft : true,
      place,
    },
  };
}

function applyToggle(trip, item, on) {
  const next = nextState(trip, item, on);
  if (next.note) return { note: next.note, trip: null };
  const saved = window.CamperTrips.save(next.input);
  if (!saved && trip) window.CamperTrips.remove(trip.id);
  return { note: "", trip: saved };
}

function openTrip(trip) {
  if (trip) window.location.href = window.CamperTrips.editPath(trip);
}

function menu(item, anchor) {
  const box = el("div", "add-menu");
  box.setAttribute("role", "dialog");
  box.append(el("h3", null, "הוספה לטיול"));
  const filter = document.createElement("input");
  filter.type = "search";
  filter.placeholder = "חיפוש טיול";
  filter.value = menuQuery;
  filter.addEventListener("input", () => {
    menuQuery = filter.value;
    menuFocus = true;
    render();
  });
  box.append(filter);
  const into = new URLSearchParams(window.location.search).get("into") || "";
  let trips = window.CamperTrips.list();
  if (into) trips = trips.slice().sort((left, right) => (left.id === into ? -1 : right.id === into ? 1 : 0));
  const text = menuQuery.trim();
  trips.filter((trip) => !text || trip.name.includes(text)).forEach((trip) => {
    const label = el("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = contains(trip, item);
    input.addEventListener("change", () => {
      const result = applyToggle(trip, item, input.checked);
      const status = box.querySelector(".fine");
      if (status) status.textContent = result.note;
      if (result.note) input.checked = contains(trip, item);
      else if (input.checked) openTrip(result.trip);
      else render();
    });
    const copy = el("span");
    copy.append(document.createTextNode(trip.name));
    const hasNight = trip.campId != null && Number.isFinite(Number(trip.campId));
    const detail = el("small", null, trip.id === into ? "הטיול שנפתח מעריכת הלוז" : (hasNight ? "⛺ יש לילה" : "🥾 עדיין בלי לילה"));
    copy.append(detail);
    label.append(input, copy);
    box.append(label);
  });
  const create = el("button", "fresh", "✨ טיול חדש");
  create.type = "button";
  create.addEventListener("click", () => {
    const result = applyToggle(null, item, true);
    if (result.trip) openTrip(result.trip);
    else {
      menuFor = null;
      render();
    }
  });
  box.append(create);
  box.append(el("p", "fine", ""));
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 24);
  const top = Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - 280));
  const left = Math.max(12, Math.min(rect.left - 40, window.innerWidth - width - 12));
  box.style.top = `${top}px`;
  box.style.left = `${left}px`;
  return box;
}

function render() {
  const tally = counts();
  roles.replaceChildren();
  const chipRow = el("div", "role-chips");
  [
    ["all", "הכל", ""],
    ["camp", ROLE.camp[0], ROLE_MARK.camp],
    ["hike", ROLE.hike[0], ROLE_MARK.hike],
    ["coffee", ROLE.coffee[0], ROLE_MARK.coffee],
    ["cart", ROLE.cart[0], ROLE_MARK.cart],
    ["place", ROLE.place[0], ROLE_MARK.place],
  ].forEach(([key, label, emoji]) => {
    const button = el("button", key === role ? "chip on" : "chip");
    button.type = "button";
    if (emoji) {
      const mark = el("span", "mark", emoji);
      mark.setAttribute("aria-hidden", "true");
      button.append(mark);
    }
    button.append(document.createTextNode(`${label} ${tally[key]}`));
    button.addEventListener("click", () => {
      role = key;
      limit = PAGE;
      openKey = "";
      render();
    });
    chipRow.append(button);
  });
  roles.append(chipRow);
  roles.append(placeControl());
  paintTraits();

  const rows = visible();
  const full = pool().filter((item) => role === "all" || item.role === role);
  results.replaceChildren();
  const opened = openKey ? catalog.find((item) => item.key === openKey) : null;
  const panel = results.closest(".panel");
  if (panel) panel.classList.toggle("sheet-open", Boolean(opened));
  if (near && !opened) results.append(nearNote());
  if (opened) results.append(sheet(opened));
  else if (!rows.length) {
    const missing = queryBox.value.trim()
      ? (near ? "אין תוצאה לשם הזה באזור הטיול." : "אין תוצאה לשם הזה.")
      : "אפשר לחפש שם, או לבחור סוג.";
    results.append(el("p", "empty", missing));
  } else {
    if (!near && !chosenTraits().length && !queryBox.value.trim() && role === "all" && region === "all") {
      results.append(el("p", "fine", "חניונים להתחלה. חיפוש או בחירת סוג מציגים גם מסלולים, נקודות ומצפורים."));
    }
    rows.forEach((item) => results.append(row(item)));
    if (full.length > rows.length) {
      const more = el("button", "chip", "עוד תוצאות");
      more.type = "button";
      more.addEventListener("click", () => {
        limit += PAGE;
        render();
      });
      results.append(more);
    }
  }
  const mapped = opened ? [opened] : full.filter((item) => item.lat != null).slice(0, 500);
  drawMap(mapped);
  document.querySelectorAll(".add-menu").forEach((node) => node.remove());
  if (menuFor) {
    const item = catalog.find((entry) => entry.key === menuFor);
    const anchor = results.querySelector(`[data-key="${item.key}"] .add`);
    if (item && anchor) document.body.append(menu(item, anchor));
    if (menuFocus) {
      menuFocus = false;
      const field = document.querySelector(".add-menu input");
      if (field) {
        field.focus();
        const end = field.value.length;
        if (typeof field.setSelectionRange === "function") field.setSelectionRange(end, end);
      }
    }
  }
}

function boot(campData, trailData, placeData) {
  camps = campData;
  trails = trailData;
  places = Array.isArray(placeData) ? placeData : [];
  catalog = [];
  trailData.forEach((trail) => {
    const links = [];
    if (trail.url) links.push({ href: trail.url, text: "העמוד ברשות הטבע והגנים" });
    if (trail.tiuliUrl) links.push({ href: trail.tiuliUrl, text: "העמוד בטיולי" });
    if (trail.tevaUrl) links.push({ href: trail.tevaUrl, text: "העמוד בחברה להגנת הטבע" });
    if (trail.waze) links.push({ href: `https://www.waze.com/ul?q=${encodeURIComponent(trail.waze)}&navigate=yes`, text: "ניווט לתחילת המסלול" });
    else if (trail.lat != null) links.push({ href: `https://www.waze.com/ul?ll=${trail.lat},${trail.lng}&navigate=yes`, text: "ניווט לתחילת המסלול" });
    catalog.push({
      key: `hike-${trail.id}`,
      role: "hike",
      id: trail.id,
      name: trail.name,
      lat: trail.lat,
      lng: trail.lng,
      regions: trail.regions || [],
      area: (trail.areaNames || []).join(" "),
      meta: hikeMeta(trail),
      ...hikeAbout(trail),
      booking: false,
      traits: hikeTraits(trail),
      links,
    });
  });
  campData.forEach((camp) => {
    const glance = window.CamperPlan.campGlance(camp);
    const links = [];
    if (glance.bookingUrl) links.push({ href: glance.bookingUrl, text: "להזמנת מקום" });
    if (camp.url) links.push({ href: camp.url, text: "העמוד ברשות הטבע והגנים" });
    if (camp.tiuliUrl) links.push({ href: camp.tiuliUrl, text: "העמוד בטיולי" });
    catalog.push({
      key: `camp-${camp.id}`,
      role: "camp",
      id: camp.id,
      name: camp.name,
      lat: camp.lat,
      lng: camp.lng,
      regions: camp.regions || [],
      area: (camp.areaNames || []).join(" "),
      meta: campMeta(camp),
      ...campAbout(glance),
      booking: Boolean(glance.bookingUrl),
      traits: glance.bookingUrl ? ["בתיאום מראש"] : [],
      links,
    });
  });
  places.forEach((place) => {
    if (place.lat == null || !place.name) return;
    const coffee = place.kind === "viewpoint";
    const cart = place.kind === "cart";
    const links = [];
    if (place.tiuliUrl) links.push({ href: place.tiuliUrl, text: "העמוד בטיולי" });
    if (place.wiki) links.push({ href: place.wiki, text: "הערך בוויקיפדיה" });
    if (place.site) links.push({ href: place.site, text: "האתר" });
    if (place.url) links.push({ href: place.url, text: place.url.includes("coffeetrail.co.il") ? "העמוד בקופיטרייל" : "הנקודה במפה" });
    catalog.push({
      key: `${cart ? "cart" : coffee ? "coffee" : "place"}-${place.id}`,
      role: cart ? "cart" : coffee ? "coffee" : "place",
      id: place.id,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      regions: [],
      area: "",
      meta: placeLine(place, cart ? "cart" : coffee ? "coffee" : "place"),
      ...placeAbout(place),
      booking: false,
      traits: placeTraits(place, cart ? "cart" : coffee ? "coffee" : "place"),
      links,
    });
  });
  try {
    home = localStorage.getItem("camper-home") || "";
  } catch (_error) {
    home = "";
  }
  catalog.forEach((item) => {
    if (item.role === "camp") {
      const camp = campData.find((entry) => entry.id === item.id);
      if (camp) item.meta = campMeta(camp);
    }
  });
  const params = new URLSearchParams(window.location.search);
  const preset = params.get("q") || "";
  if (preset) queryBox.value = preset;
  const into = params.get("into") || "";
  if (into && params.get("wide") !== "1" && window.CamperTrips) {
    near = focusFor(window.CamperTrips.get(into), campData, trailData, places);
  }
  render();
}

function hikeTraits(trail) {
  const traits = [];
  if (trail.hoursMax != null && trail.hoursMax <= 3) traits.push("עד 3 שעות");
  if (trail.difficulty === "easy") traits.push("קל");
  if (trail.family) traits.push("למשפחות");
  if (trail.circular === true) traits.push("מעגלי");
  if (trail.accessible) traits.push("מונגש");
  const lures = window.CamperPlan.trailLures(trail);
  if (lures.includes("מוצל")) traits.push("מוצל");
  if (lures.includes("מסלול רטוב")) traits.push("רטוב");
  if (lures.includes("נוף מהמם")) traits.push("תצפית");
  if (lures.includes("פריחה")) traits.push("פריחה");
  if (lures.includes("כלבים")) traits.push("כלבים");
  return traits;
}

function placeLine(place, roleName) {
  const bits = [];
  if (roleName === "cart") bits.push("כחצי שעה");
  else if (roleName === "coffee") bits.push("🔭 מצפור", "כחצי שעה");
  else bits.push(`${(place.kind && TRAIT_MARK[KIND[place.kind]]) || "📍"} ${KIND[place.kind] || "נקודת עניין"}`);
  if (place.paid === true) bits.push("בתשלום");
  else if (place.paid === false) bits.push("בחינם");
  if (place.duration) bits.push(place.duration);
  if (place.accessible) bits.push("מונגש");
  if (place.booking) bits.push("בתיאום מראש");
  return bits.join(" · ");
}

function placeTraits(place, roleName) {
  const traits = [];
  if (roleName === "coffee" || (place.hoursMax != null && place.hoursMax <= 3)) traits.push("עד 3 שעות");
  if (roleName === "coffee" || place.kind === "viewpoint") traits.push("תצפית");
  else if (place.kind !== "cart" && KIND[place.kind]) traits.push(KIND[place.kind]);
  if (place.accessible) traits.push("מונגש");
  if (place.booking) traits.push("בתיאום מראש");
  window.CamperPlan.placeTags(place).forEach((tag) => {
    if (!traits.includes(tag)) traits.push(tag);
  });
  return traits;
}

function focusFor(trip, campData, trailData, placeData) {
  if (!trip) return null;
  const spots = [];
  const camp = trip.campId != null ? campData.find((item) => item.id === Number(trip.campId)) : null;
  if (camp && camp.lat != null) spots.push(camp);
  (trip.trailIds || []).forEach((id) => {
    const trail = trailData.find((item) => item.id === Number(id));
    if (trail && trail.lat != null) spots.push(trail);
  });
  const places = Array.isArray(placeData) ? placeData : [];
  []
    .concat((trip.place && trip.place.coffee) || [])
    .concat((trip.place && trip.place.visit) || [])
    .forEach((id) => {
      const place = places.find((item) => item.id === id);
      if (place && place.lat != null) spots.push(place);
    });
  if (!spots.length) return null;
  const anchor = camp && camp.lat != null
    ? camp
    : {
      lat: spots.reduce((sum, spot) => sum + spot.lat, 0) / spots.length,
      lng: spots.reduce((sum, spot) => sum + spot.lng, 0) / spots.length,
    };
  const label = String(trip.name || (camp && camp.name) || "הטיול").trim();
  return {
    id: trip.id,
    lat: anchor.lat,
    lng: anchor.lng,
    km: NEAR_KM,
    spots: spots.map((spot) => ({ lat: spot.lat, lng: spot.lng })),
    label: label.length > 42 ? `${label.slice(0, 41)}…` : label,
  };
}

queryBox.addEventListener("input", () => {
  limit = PAGE;
  openKey = "";
  menuFor = null;
  render();
});
document.addEventListener("pointerdown", (event) => {
  if (!menuFor) return;
  if (event.target.closest(".add-menu, .add")) return;
  menuFor = null;
  render();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuFor) {
    menuFor = null;
    render();
  }
});

Promise.all([
  fetch("data/camps.json").then((response) => response.json()),
  fetch("data/trails.json").then((response) => response.json()),
  fetch("data/places.json").then((response) => (response.ok ? response.json() : [])).catch(() => []),
]).then(([campData, trailData, placeData]) => {
  boot(campData, trailData, placeData);
}).catch(() => {
  results.replaceChildren(el("p", "empty", "לא הצלחנו לטעון את המאגר."));
});
