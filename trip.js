const COLORS = ["#a3472c", "#1d6a4f", "#1d4e89", "#8a5a00", "#6b3fa0"];
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
  return {
    campId,
    trailIds,
    tripId: query.get("trip") || "",
    name: query.get("name") || "",
  };
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

function drawMap(camp, trails, extras, onAdd) {
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

  if (camp.lat != null) {
    const icon = window.L.divIcon({
      className: "camp-marker",
      html:
        '<div class="camp-pin">' +
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
    marker.bindPopup(`<strong>חניון</strong><br>${escapeHtml(camp.name)}`);
    marker.on("mouseover", () => emphasize("camp"));
    marker.on("mouseout", () => emphasize(focusedKey));
    marker.on("click", () => focusFeature("camp"));
    const campLayer = layerFor("camp");
    campLayer.bounds.push([camp.lat, camp.lng]);
    bounds.push([camp.lat, camp.lng]);
  }

  let colorIndex = 0;
  let drewLine = false;
  const drawnNames = new Set();
  trails.forEach((trail) => {
    const hadRoutes = (trail.routes || []).length > 0;
    const routes = (trail.routes || []).filter((route) => {
      const key = route.name || trail.name;
      if (drawnNames.has(key)) return false;
      drawnNames.add(key);
      return true;
    });
    const color = COLORS[(colorIndex + 1) % COLORS.length];
    colorIndex += 1;
    const key = String(trail.id);
    const entry = layerFor(key);
    if (!hadRoutes && trail.lat != null) {
      const dot = window.L.circleMarker([trail.lat, trail.lng], {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95,
      }).addTo(overlay);
      dot.bindPopup(escapeHtml(trail.name));
      follow(dot, key);
      dot.on("click", () => focusFeature(key));
      entry.dots.push(dot);
      entry.bounds.push([trail.lat, trail.lng]);
      bounds.push([trail.lat, trail.lng]);
      return;
    }
    routes.forEach((route) => {
      (route.lines || []).forEach((line) => {
        const path = window.L.polyline(line, { color, weight: 4, opacity: 0.85 }).addTo(overlay);
        follow(path, key);
        path.on("click", () => focusFeature(key));
        entry.lines.push(path);
        entry.bounds.push(...line);
        bounds.push(...line);
        drewLine = true;
      });
    });
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
    marker.on("click", () => onAdd(item.trail.id));
    entry.dots.push(marker);
    entry.bounds.push([item.trail.lat, item.trail.lng]);
    bounds.push([item.trail.lat, item.trail.lng]);
  });

  const view = { animate: false };
  if (bounds.length > 1) {
    map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 12,
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
    let radius = 20;
    let expanded = false;
    let panelMode = "routes";
    let focusId = selected[0] || null;
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
    nameInput.value = (tripId ? stored.name : query.name) || camp.name;
    deleteButton.hidden = !tripId;
    saveButton.textContent = tripId ? "שמירה" : "צור טיול";

    document.title = `${nameInput.value} — סופ״ש בטבע`;
    title.textContent = camp.name;
    const back = el("button", "text-back", "חזרה לבניית הטיול");
    back.type = "button";
    back.addEventListener("click", () => setPanel("routes"));
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

    function remember() {
      const url = new URL(window.location.href);
      url.searchParams.set("camp", String(camp.id));
      url.searchParams.set("trails", selected.join(","));
      url.searchParams.set("name", currentName());
      if (tripId) url.searchParams.set("trip", tripId);
      else url.searchParams.delete("trip");
      window.history.replaceState(null, "", url);
      if (!tripId || !window.CamperTrips) return;
      const saved = window.CamperTrips.save({
        id: tripId,
        name: currentName(),
        campId: camp.id,
        trailIds: selected,
      });
      if (!saved) saveNote.textContent = "לא הצלחנו לשמור בדפדפן הזה.";
    }

    function persistNew() {
      if (!window.CamperTrips) return null;
      const saved = window.CamperTrips.save({
        id: tripId,
        name: currentName(),
        campId: camp.id,
        trailIds: selected,
      });
      if (!saved) {
        saveNote.textContent = "לא הצלחנו לשמור בדפדפן הזה.";
        return null;
      }
      tripId = saved.id;
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
      window.setTimeout(render, 0);
    }

    function removeTrail(id) {
      const index = selected.indexOf(id);
      if (index < 0) return;
      selected.splice(index, 1);
      if (focusId === id) focusId = selected[0] || null;
      if (focusedKey === String(id)) focusedKey = focusId != null ? String(focusId) : "camp";
      window.setTimeout(render, 0);
    }

    function setPanel(mode) {
      panelMode = mode;
      if (mode === "detail" && focusId == null) focusId = selected[0] || null;
      panelBody.scrollTop = 0;
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
      render();
    }

    function spotRow(id, name, meta, swatchColor, action) {
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
      row.addEventListener("mouseenter", () => emphasize(id));
      row.addEventListener("mouseleave", () => emphasize(focusedKey));
      row.addEventListener("click", (event) => {
        if (event.target.closest("button, a")) return;
        focusFeature(id);
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter") focusFeature(id);
      });
      return row;
    }

    function renderAround() {
      const pool = choices.filter((item) => item.km == null || item.km <= radius);
      const available = pool.filter((item) => !selected.includes(item.trail.id));
      const shown = expanded ? available : available.slice(0, 6);
      around.replaceChildren();
      around.append(el("p", "board-hint", "הצבע ברשימה הוא הצבע על המפה. עומדים על שורה, והמסלול מודגש."));

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
        around.append(el("p", "fine", "עדיין אין מסלולים. בוחרים נקודה על המפה, או מוסיפים מהרשימה למטה."));
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
          render();
        });
        radii.append(button);
      });
      head.append(radii);
      around.append(head);
      shown.forEach((item) => {
        const add = el("button", "add", "להוסיף");
        add.type = "button";
        add.disabled = selected.length >= maxPicks;
        add.addEventListener("click", () => addTrail(item.trail.id));
        const facts = [item.km == null ? "" : `כ־${item.km} ק״מ מהחניון`, trailFacts(item.trail)].filter(Boolean).join(" · ");
        around.append(spotRow(item.trail.id, item.trail.name, facts, "#cfc3b4", add));
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
      action.addEventListener("click", () => (on ? removeTrail(focus.id) : addTrail(focus.id)));
      bar.append(action);
      picked.append(bar, trailSheet(focus));
    }

    function render() {
      const chosen = chosenTrails();
      const keptScroll = panelMode === "routes" ? panelBody.scrollTop : 0;
      const count = chosen.length === 1
        ? "מסלול אחד במפה"
        : chosen.length
          ? `${chosen.length} מסלולים במפה`
          : "בלי מסלול במפה";
      lead.textContent = tripId ? `${count} · שמור` : count;
      renderAround();
      renderDetail();
      applyPanel();
      if (panelMode === "routes") panelBody.scrollTop = keptScroll;
      remember();
      const extras = choices.filter((item) => !selected.includes(item.trail.id) && item.trail.lat != null && (item.km == null || item.km <= radius));
      try {
        drawMap(camp, chosen, extras, addTrail);
      } catch (error) {
        mapNote.textContent = "המפה לא התעדכנה. רשימת המסלולים כן.";
      }
      mapNote.hidden = panelMode !== "routes" || !mapNote.textContent;
    }

    saveButton.addEventListener("click", () => {
      if (!persistNew()) return;
      render();
      saveNote.textContent = "הטיול נשמר אצלך, גם אחרי רענון.";
    });
    shareButton.addEventListener("click", async () => {
      const draft = {
        name: currentName(),
        campId: camp.id,
        trailIds: selected,
      };
      const result = await window.CamperTrips.send(draft);
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
      window.location.href = "trips.html";
    });
    nameInput.addEventListener("change", () => {
      document.title = `${currentName()} — סופ״ש בטבע`;
      if (tripId) remember();
    });

    render();
  })
  .catch(() => {
    title.textContent = "לא הצלחנו לטעון את הפירוט";
  });
