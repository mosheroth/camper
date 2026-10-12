const COLORS = ["#a3472c", "#1d6a4f", "#1d4e89", "#8a5a00", "#6b3fa0"];
const TIME_LABEL = {
  depart: "שעת יציאה",
  arrive: "שעת הגעה",
  dinner: "שעת ארוחת ערב",
  rise: "שעת קימה",
  breakfast: "שעת ארוחת בוקר",
  start: "שעת יציאה למסלול",
  hike: "שעת המסלול",
  lunch: "שעת ארוחת צהריים",
};
const REGION_LABEL = { north: "צפון", center: "מרכז", south: "דרום", east: "יו״ש" };

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
    view: view === "detail" || view === "camp" ? view : "routes",
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
  };
}

function readOrder(value) {
  if (!value) return null;
  const tokens = [];
  value.split(",").forEach((part) => {
    if (part === "stay") tokens.push("stay");
    else {
      const id = Number(part);
      if (Number.isFinite(id)) tokens.push(id);
    }
  });
  return tokens.length ? tokens : null;
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
    if (camp.paid) node.append(el("p", null, "הלינה בהזמנה מראש. הכניסה עם כלבים אסורה."));
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

window.addEventListener("resize", () => {
  if (sharedMap) sharedMap.invalidateSize({ animate: false });
});

function emphasize(id) {
  const key = id == null ? null : String(id);
  document.querySelectorAll(".spot").forEach((node) => {
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

  function drawMap(camp, trails, extras, onAdd, order) {
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
  }
  sharedMap.stop();
  overlay.clearLayers();
  layersById = new Map();
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

  const story = window.CamperPlan.tripStages(camp, trails, order);
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
    const key = String(stage.trailId);
    const color = colorByTrail.get(stage.trailId) || COLORS[1];
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
  mapNote.textContent = drewLine
    ? ""
    : "למסלול שנבחר אין עדיין קו שביל, אז מוצגת נקודת ההתחלה.";
  emphasize(focusedKey);
  return map;
}

Promise.all([
  fetch("data/camps.json").then((response) => response.json()),
  fetch("data/trails.json").then((response) => response.json()),
])
  .then(([camps, trails]) => {
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
    let expanded = false;
    const openPreviews = new Set();
    let arrival = query.arrival;
    let order = query.order;
    let hours = {
      dinner: query.dinner,
      rise: query.rise,
      breakfast: query.breakfast,
      start: query.start,
      lunch: query.lunch,
      hikes: query.hikes,
    };
    let hereKey = null;
    let hereMarker = null;
    const origin = window.CamperPlan.centerOrigin(camps);
    let panelMode = query.view;
    let focusId = query.view === "detail" ? query.focusId : (selected[0] || null);
    if (panelMode === "detail" && (focusId == null || !byId.has(focusId))) {
      panelMode = "routes";
      focusId = selected[0] || null;
    }
    if (focusId != null) focusedKey = String(focusId);
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
        hikes: hours.hikes,
        radius,
        order: placeOrder(),
      };
    }

    function placeOrder() {
      const normal = window.CamperPlan.normalizeOrder(order, selected);
      const base = window.CamperPlan.normalizeOrder(null, selected);
      if (normal.join(",") === base.join(",")) return null;
      return normal;
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
      const reading = panelMode === "camp" || panelMode === "detail";
      around.hidden = reading;
      mapNote.hidden = reading || !mapNote.textContent;
      dossier.hidden = !reading;
      const campNode = dossier.querySelector(".camp-sheet");
      if (campNode) campNode.hidden = panelMode !== "camp";
      picked.hidden = panelMode !== "detail";
    }

    function openTrail(id) {
      focusId = id;
      focusedKey = String(id);
      panelMode = "detail";
      panelBody.scrollTop = 0;
      historyPush = true;
      render();
    }

    function spotRow(id, name, meta, swatchColor, action, onOpen) {
      const row = el("article", "spot");
      row.dataset.id = String(id);
      row.tabIndex = 0;
      const swatch = el("i", "swatch");
      swatch.style.background = swatchColor;
      const copy = el("div", "spot-copy");
      copy.append(el("h3", null, shortName(name)));
      row.title = name;
      if (meta) copy.append(el("p", "meta", meta));
      row.append(swatch, copy);
      if (action) row.append(action);
      const activate = () => (onOpen ? onOpen(id) : focusFeature(id));
      row.addEventListener("mouseenter", () => emphasize(id));
      row.addEventListener("mouseleave", () => emphasize(focusedKey));
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

    function stepCopy(step) {
      if (step.kind === "depart") {
        if (step.at == null) return "יוצאים מהבית, מאזור המרכז. אין מרחק נסיעה, אז שעת היציאה גמישה.";
        const where = step.toward === "hike" ? "לכיוון המסלול" : "לכיוון החניון";
        return `יוצאים מהבית, מאזור המרכז, ${where}. נסיעה של ${formatDuration(step.drive)} בערך.`;
      }
      if (step.kind === "arrive") {
        return step.afterHike
          ? `מגיעים ל${camp.name} אחרי המסלול. כאן ישנים.`
          : `מגיעים ל${camp.name}. כאן ישנים.`;
      }
      if (step.kind === "dinner") return "אוכלים בחניון.";
      if (step.kind === "rise") return "קמים בחניון.";
      if (step.kind === "breakfast") return "אוכלים ארוחת בוקר בחניון.";
      if (step.kind === "need-hike") return "עדיין אין מסלול. מוסיפים אחד, ושעת החזרה נכנסת ללוז.";
      if (step.kind === "hike") {
        const name = shortName(step.name);
        if (step.walk == null) return `${name}. אין משך הליכה, אז השעה גמישה.`;
        if (step.beforeStay) {
          const tail = step.lastBefore ? "אחר כך כחצי שעה עד החניון." : "אחר כך ממשיכים למסלול הבא.";
          return `${name}. הליכה של ${formatDuration(step.walk)}. ${tail}`;
        }
        const leaving = step.firstOfDay ? "יוצאים מהחניון. " : "";
        const longDay = step.back >= 15 * 60 ? " זה יום ארוך." : "";
        return `${leaving}${name}. הליכה של ${formatDuration(step.walk)}, חזרה לחניון ב־${clock(step.back)}.${longDay}`;
      }
      if (step.at == null) return "אחרי המסלול אוכלים בחניון. השעה גמישה.";
      return "אוכלים בחניון אחרי המסלול.";
    }

    function moveToken(token, direction) {
      const sequence = window.CamperPlan.normalizeOrder(order, selected);
      const index = sequence.indexOf(token);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= sequence.length) return;
      const copy = sequence.slice();
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      order = copy;
      historyPush = true;
      render();
    }

    function renderItinerary() {
      const block = el("section", "itinerary");
      const trails = selected.map((id) => byId.get(id)).filter(Boolean);
      const sequence = window.CamperPlan.normalizeOrder(order, selected);
      const steps = window.CamperPlan.buildItinerary({
        camp,
        trails,
        arrivalMinutes: arrival,
        origin,
        hours,
        order: sequence,
      });
      const depart = steps.find((step) => step.kind === "depart");
      const hikeFirst = sequence[0] !== "stay";
      block.append(el("h2", "section-label", "לוז"));
      block.append(el("p", "itinerary-lead", hikeFirst
        ? "קודם המסלול, ואחר כך לילה בחניון. יוצאים מהבית, מאזור המרכז."
        : "יוצאים מהבית, מאזור המרכז. לילה בחניון, ולמחרת המסלול."));
      block.append(timeChoices("יוצאים מהבית", [8, 12, 16], depart ? depart.at : null, (minutes) => {
        if (!depart || depart.at == null) return;
        const edited = window.CamperPlan.retimedHours({
          hours,
          arrival,
          step: depart,
          next: minutes,
          trailIds: selected,
          order: sequence,
        });
        arrival = edited.arrival;
        hours = edited.hours;
        historyPush = true;
        render();
      }));
      block.append(timeChoices("מגיעים לחניון", [15, 17, 19], arrival, (minutes) => {
        arrival = minutes;
        historyPush = true;
        render();
      }));
      const stages = window.CamperPlan.tripStages(camp, trails, sequence).stages;
      const groups = [];
      steps.forEach((step) => {
        const last = groups[groups.length - 1];
        if (last && last.id === step.block) last.steps.push(step);
        else groups.push({ id: step.block, steps: [step] });
      });
      const movable = sequence.length > 1;
      let hereIndex = 0;
      groups.forEach((group) => {
        const card = el("section", "day-block");
        const head = el("header");
        head.append(el("h3", null, blockTitle(group)));
        const token = blockToken(group.id);
        if (movable && token != null) {
          const moves = el("div", "block-moves");
          const index = sequence.indexOf(token);
          moves.append(moveButton("מוקדם", "להזיז את הבלוק מוקדם יותר", index <= 0, () => moveToken(token, -1)));
          moves.append(moveButton("מאוחר", "להזיז את הבלוק מאוחר יותר", index < 0 || index >= sequence.length - 1, () => moveToken(token, 1)));
          head.append(moves);
        }
        card.append(head);
        const list = el("ol", "timeline");
        const splitMorning = group.steps.some((step) => step.day === "שישי") && group.steps.some((step) => step.day === "שבת");
        let markedMorning = false;
        group.steps.forEach((step) => {
          if (splitMorning && !markedMorning && step.day === "שבת") {
            list.append(el("li", "day-gap", "בוקר שאחרי"));
            markedMorning = true;
          }
          list.append(stepRow(step, stages, hereIndex));
          hereIndex += 1;
        });
        card.append(list);
        block.append(card);
      });
      block.append(el("p", "fine", "אפשר לשנות כל שעה, ומה שאחריה זז איתה. את סדר הלילה והמסלולים משנים מכל בלוק."));
      return block;
    }

    function timeChoices(label, hoursOfDay, current, onPick) {
      const head = el("div", "section-head");
      head.append(el("p", "section-label", label));
      const choices = el("div", "radius");
      hoursOfDay.forEach((hour) => {
        const minutes = hour * 60;
        const button = el("button", "chip-btn", clock(minutes));
        button.type = "button";
        button.disabled = current == null;
        button.setAttribute("aria-pressed", current != null && minutes === current ? "true" : "false");
        button.addEventListener("click", () => onPick(minutes));
        choices.append(button);
      });
      head.append(choices);
      return head;
    }

    function moveButton(text, label, disabled, onClick) {
      const button = el("button", "block-move", text);
      button.type = "button";
      button.disabled = disabled;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", onClick);
      return button;
    }

    function blockTitle(group) {
      if (group.id === "road") return "בדרך";
      if (group.id === "stay") return "לילה בחניון";
      const hike = group.steps.find((step) => step.kind === "hike");
      return hike ? `המסלול · ${shortName(hike.name)}` : "המסלול";
    }

    function blockToken(id) {
      if (id === "stay") return "stay";
      if (String(id).startsWith("hike:")) {
        const token = Number(String(id).slice(5));
        return Number.isFinite(token) ? token : null;
      }
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
      }
      const when = el("time");
      when.append(el("span", null, step.day));
      if (step.at != null) {
        const input = document.createElement("input");
        input.type = "time";
        input.className = "step-time";
        input.step = 60;
        input.value = clock(step.at);
        input.setAttribute("aria-label", TIME_LABEL[step.kind] || "שעת השלב");
        input.addEventListener("click", (event) => event.stopPropagation());
        input.addEventListener("keydown", (event) => event.stopPropagation());
        input.addEventListener("change", () => {
          const [hour, minute] = input.value.split(":").map(Number);
          if (!Number.isInteger(hour) || !Number.isInteger(minute)) return;
          const edited = window.CamperPlan.retimedHours({
            hours,
            arrival,
            step,
            next: hour * 60 + minute,
            trailIds: selected,
            order,
          });
          arrival = edited.arrival;
          hours = edited.hours;
          historyPush = true;
          render();
        });
        when.append(input);
      }
      item.append(when, el("p", null, stepCopy(step)));
      const choose = () => {
        hereKey = item.dataset.here;
        paintHere(Boolean(place));
      };
      item.addEventListener("click", (event) => {
        if (event.target.closest("input")) return;
        choose();
      });
      item.addEventListener("keydown", (event) => {
        if (event.target.closest("input")) return;
        if (event.key === "Enter") choose();
      });
      return item;
    }

    function previewPhotos(trail) {
      const frames = (trail.photos || []).filter((item) => item && item.src).slice(0, 3);
      if (!frames.length && trail.image) frames.push({ src: trail.image, credit: "" });
      return frames;
    }

    function togglePreview(row) {
      const key = row.dataset.id;
      const willOpen = !openPreviews.has(key);
      openPreviews.clear();
      document.querySelectorAll(".spot.nearby").forEach((node) => {
        const on = willOpen && node === row;
        if (on) openPreviews.add(key);
        const box = node.querySelector(".preview");
        if (box) box.hidden = !on;
        node.classList.toggle("open", on);
        const fold = node.querySelector(".fold");
        if (fold) {
          fold.textContent = on ? "סגירה" : "תמונות";
          fold.setAttribute("aria-expanded", on ? "true" : "false");
        }
      });
      focusedKey = willOpen ? key : (focusId != null ? String(focusId) : "camp");
      emphasize(focusedKey);
    }

    function renderAround() {
      const pool = choices.filter((item) => item.km == null || item.km <= radius);
      const available = pool.filter((item) => !selected.includes(item.trail.id));
      const shown = expanded ? available : available.slice(0, 6);
      around.replaceChildren();
      around.append(el("p", "board-hint", "המספרים על המפה הם הסדר, והקו המקווקו הוא המעבר ביניהם. לחיצה על שורה בלוז מראה איפה אנחנו."));
      around.append(renderItinerary());

      around.append(el("h2", "section-label", "החניון"));
      const campMeta = [camp.paid ? "בתשלום" : "בלי תשלום", (camp.regions || []).map((region) => REGION_LABEL[region] || region).join(" · ")].filter(Boolean).join(" · ");
      const campInfo = el("button", "text-link", "פירוט");
      campInfo.type = "button";
      campInfo.addEventListener("click", () => {
        focusFeature("camp");
        setPanel("camp");
      });
      around.append(spotRow("camp", camp.name, campMeta, "#a3472c", campInfo));

      around.append(el("h2", "section-label", "בטיול"));
      if (!selected.length) {
        around.append(el("p", "fine", "עדיין אין מסלולים. פותחים פירוט מהרשימה למטה, ומוסיפים משם."));
      }
      selected.forEach((id, index) => {
        const item = choiceFor(id);
        if (!item.trail) return;
        const remove = el("button", "remove", "הסרה");
        remove.type = "button";
        remove.addEventListener("click", () => removeTrail(id));
        const info = el("button", "text-link", "פירוט");
        info.type = "button";
        info.addEventListener("click", () => openTrail(id));
        const facts = [item.km == null ? "" : `כ־${item.km} ק״מ מהחניון`, trailFacts(item.trail)].filter(Boolean).join(" · ");
        const row = spotRow(id, item.trail.name, facts, COLORS[(index + 1) % COLORS.length], remove);
        row.querySelector(".spot-copy").append(info);
        around.append(row);
      });
      if (selected.length >= maxPicks) {
        around.append(el("p", "fine", "אפשר עד ארבעה מסלולים. הסירו אחד כדי להוסיף אחר."));
      }

      const head = el("div", "section-head");
      const nearCount = choices.filter((item) => item.km != null && item.km <= radius).length;
      head.append(el("h2", "section-label", nearCount ? `בסביבה · ${nearCount}` : "בסביבה"));
      const radii = el("div", "radius");
      [20, 40].forEach((value) => {
        const button = el("button", "chip-btn", `${value} ק״מ`);
        button.type = "button";
        button.setAttribute("aria-pressed", value === radius ? "true" : "false");
        button.addEventListener("click", () => {
          radius = value;
          expanded = false;
          historyPush = true;
          render();
        });
        radii.append(button);
      });
      head.append(radii);
      around.append(head);
      shown.forEach((item) => {
        const info = el("button", "text-link", "פירוט");
        info.type = "button";
        info.addEventListener("click", () => openTrail(item.trail.id));
        const facts = [item.km == null ? "" : `כ־${item.km} ק״מ מהחניון`, trailFacts(item.trail)].filter(Boolean).join(" · ");
        const photos = previewPhotos(item.trail);
        let row;
        row = spotRow(item.trail.id, item.trail.name, facts, "#cfc3b4", info, () => {
          if (photos.length) togglePreview(row);
          else {
            focusedKey = String(item.trail.id);
            emphasize(focusedKey);
          }
        });
        row.classList.add("nearby");
        const tags = window.CamperPlan.trailLures(item.trail);
        if (tags.length) {
          const lures = el("ul", "lures");
          tags.forEach((tag) => lures.append(el("li", null, tag)));
          row.querySelector(".spot-copy").append(lures);
        }
        if (photos.length) {
          const open = openPreviews.has(String(item.trail.id));
          const fold = el("button", "text-link fold", open ? "סגירה" : "תמונות");
          fold.type = "button";
          fold.setAttribute("aria-expanded", open ? "true" : "false");
          fold.addEventListener("click", () => togglePreview(row));
          row.querySelector(".spot-copy").append(fold);
          const preview = el("div", "preview");
          preview.hidden = !open;
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
          row.classList.toggle("open", open);
        }
        around.append(row);
      });
      if (!shown.length) {
        around.append(el("p", "fine", "כל המסלולים בטווח הזה כבר בטיול."));
      }
      if (!expanded && available.length > shown.length) {
        const more = el("button", "chip-btn more-around", `עוד ${available.length - shown.length} בסביבה`);
        more.type = "button";
        more.addEventListener("click", () => {
          expanded = true;
          render();
        });
        around.append(more);
      }
    }

    function renderDetail() {
      picked.replaceChildren();
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
        arrivalMinutes: arrival,
        origin,
        hours,
        order,
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
        return on
          ? "המסלול בלוז של שבת. אין משך הליכה, אז שעת החזרה גמישה."
          : "אם מוסיפים לטיול, הוא נכנס לבוקר של שבת. אין משך הליכה, אז שעת החזרה גמישה.";
      }
      const meal = lunch && lunch.at != null ? ` אוכלים בחניון ב־${clock(lunch.at)}.` : "";
      const longDay = hike.back >= 15 * 60 ? " זה יום ארוך." : "";
      if (on) return `המסלול בלוז של שבת. חזרה לחניון ב־${clock(hike.back)}.${meal}${longDay}`;
      return `אם מוסיפים לטיול, חוזרים לחניון ב־${clock(hike.back)}.${meal}${longDay}`;
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
      if (draft && !saveNote.textContent) {
        saveNote.textContent = "טיוטה נשמרת בדפדפן. רענון וקישור חוזרים לנקודה הזאת.";
      }
      renderAround();
      renderDetail();
      applyPanel();
      if (panelMode === "routes") panelBody.scrollTop = keptScroll;
      const extras = choices.filter((item) => !selected.includes(item.trail.id) && item.trail.lat != null && (item.km == null || item.km <= radius));
      try {
        drawMap(camp, chosen, extras, openTrail, order);
      } catch (error) {
        mapNote.textContent = "המפה לא התעדכנה. רשימת המסלולים כן.";
      }
      mapNote.hidden = panelMode !== "routes" || !mapNote.textContent;
      paintHere(false);
    }

    function stepPlace(step, stages) {
      const campStage = stages.find((stage) => stage.kind === "arrive");
      if (step.kind === "arrive" || step.kind === "dinner" || step.kind === "rise" || step.kind === "breakfast" || step.kind === "lunch") {
        return campStage || null;
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

    saveButton.addEventListener("click", () => {
      if (!persistNew()) return;
      render();
      saveNote.textContent = "הטיול נשמר אצלך, גם אחרי רענון.";
    });
    shareButton.addEventListener("click", async () => {
      const result = await window.CamperTrips.send(editorRecord());
      if (result.aborted) return;
      if (result.copied) saveNote.textContent = "הקישור הועתק. אפשר לשלוח אותו.";
      else if (result.shared) saveNote.textContent = "אפשר לשלוח את הטיול.";
      else saveNote.textContent = `אפשר להעתיק את הקישור: ${result.url}`;
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
      if (next.name) nameInput.value = next.name;
      panelMode = next.view === "detail" && (next.focusId == null || !byId.has(next.focusId)) ? "routes" : next.view;
      if (panelMode === "detail") {
        focusId = next.focusId;
        focusedKey = String(next.focusId);
      }
      arrival = next.arrival;
      hours = {
        dinner: next.dinner,
        rise: next.rise,
        breakfast: next.breakfast,
        start: next.start,
        lunch: next.lunch,
        hikes: next.hikes,
      };
      radius = next.radius;
      order = next.order;
      tripDepth = window.history.state && window.history.state.camperTrip ? window.history.state.depth || 0 : 0;
      render();
      silenceHistory = false;
    });

    render();
  })
  .catch(() => {
    title.textContent = "לא הצלחנו לטעון את הפירוט";
  });
