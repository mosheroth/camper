const COLORS = ["#a3472c", "#1d6a4f", "#1d4e89", "#8a5a00", "#6b3fa0"];
const REGION_LABEL = { north: "צפון", center: "מרכז", south: "דרום", east: "יו״ש" };

const title = document.querySelector("#title");
const lead = document.querySelector("#lead");
const legend = document.querySelector("#legend");
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
  return { campId, trailIds };
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
  return block;
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

function drawMap(camp, trails, extras, onAdd) {
  if (typeof window.L === "undefined") {
    mapNote.textContent = "המפה לא נטענה. אפשר עדיין לקרוא את הפירוט ולפתוח את העמודים הרשמיים.";
    return null;
  }
  if (!sharedMap) {
    sharedMap = window.L.map("map", { scrollWheelZoom: false });
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(sharedMap);
    overlay = window.L.layerGroup().addTo(sharedMap);
  }
  sharedMap.stop();
  overlay.clearLayers();
  legend.replaceChildren();
  const map = sharedMap;
  const bounds = [];

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
    bounds.push([camp.lat, camp.lng]);
    const item = el("li", "key", `חניון · ${camp.name}`);
    const dot = el("i", "swatch camp-swatch");
    item.prepend(dot);
    legend.append(item);
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
    if (!hadRoutes && trail.lat != null) {
      const color = COLORS[colorIndex % COLORS.length];
      colorIndex += 1;
      window.L.circleMarker([trail.lat, trail.lng], {
        radius: 6,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.9,
      }).addTo(overlay).bindPopup(trail.name);
      bounds.push([trail.lat, trail.lng]);
      const item = el("li", "key", "נקודת התחלה");
      item.title = trail.name;
      const dot = el("i", "swatch");
      dot.style.background = color;
      item.prepend(dot);
      legend.append(item);
      return;
    }
    routes.forEach((route) => {
      const color = COLORS[colorIndex % COLORS.length];
      colorIndex += 1;
      const group = window.L.layerGroup().addTo(overlay);
      (route.lines || []).forEach((line) => {
        window.L.polyline(line, { color, weight: 5, opacity: 0.9 }).addTo(group);
        bounds.push(...line);
        drewLine = true;
      });
      const label = route.name || trail.name;
      const item = el("li", null, label);
      item.title = trail.name;
      const dot = el("i", "swatch");
      dot.style.background = color;
      item.prepend(dot);
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.addEventListener("click", () => {
        const visible = item.classList.toggle("off");
        if (visible) overlay.removeLayer(group);
        else group.addTo(overlay);
      });
      legend.append(item);
    });
  });

  (extras || []).forEach((item) => {
    if (item.trail.lat == null) return;
    const marker = window.L.circleMarker([item.trail.lat, item.trail.lng], {
      radius: 6,
      color: "#6d6256",
      weight: 2,
      fillColor: "#fffaf3",
      fillOpacity: 1,
    }).addTo(overlay);
    const distance = item.km == null ? "" : `<br>כ־${item.km} ק״מ מהחניון`;
    marker.bindPopup(`${escapeHtml(item.trail.name)}${distance}`);
    marker.on("click", () => onAdd(item.trail.id));
  });

  const view = { animate: false };
  if (bounds.length > 1) {
    map.fitBounds(bounds, {
      paddingTopLeft: [48, 72],
      paddingBottomRight: [48, 36],
      maxZoom: 14,
      ...view,
    });
  } else if (camp.lat != null) {
    map.setView([camp.lat, camp.lng], 11, view);
  } else {
    map.setView([31.4, 34.9], 7, view);
  }
  const pickedNote = drewLine
    ? "הסיכה עם הכיתוב חניון היא אתר הקמפינג. כל קו צבעוני הוא מסלול שנבחר."
    : "החניון מסומן. למסלולים שנבחרו אין עדיין קו שביל תואם.";
  const extraNote = extras && extras.length
    ? " הנקודות הקטנות הן מסלולים בסביבה, ולחיצה עליהן מוסיפה אותם לסופ״ש."
    : "";
  mapNote.textContent = pickedNote + extraNote;
  return map;
}

Promise.all([
  fetch("data/camps.json").then((response) => response.json()),
  fetch("data/trails.json").then((response) => response.json()),
])
  .then(([camps, trails]) => {
    const { campId, trailIds } = params();
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
    const maxPicks = 4;
    const around = document.querySelector("#around");
    const picked = el("div", "picked");

    document.title = `${camp.name} — סופ״ש בטבע`;
    title.textContent = camp.name;
    dossier.append(campSheet(camp));
    dossier.append(picked);

    function chosenTrails() {
      return selected.map((id) => byId.get(id)).filter(Boolean);
    }

    function remember() {
      const url = new URL(window.location.href);
      url.searchParams.set("camp", String(camp.id));
      url.searchParams.set("trails", selected.join(","));
      window.history.replaceState(null, "", url);
    }

    function addTrail(id) {
      if (selected.includes(id) || selected.length >= maxPicks || !byId.has(id)) return;
      selected.push(id);
      window.setTimeout(render, 0);
    }

    function removeTrail(id) {
      const index = selected.indexOf(id);
      if (index < 0) return;
      selected.splice(index, 1);
      window.setTimeout(render, 0);
    }

    function renderAround() {
      const pool = choices.filter((item) => item.km == null || item.km <= radius);
      const shown = expanded ? pool : pool.slice(0, 8);
      around.hidden = false;
      around.replaceChildren();
      around.append(el("h2", null, "להרכיב את הסופ״ש"));
      const nearCount = choices.filter((item) => item.km != null && item.km <= radius).length;
      around.append(el("p", "around-lead", nearCount
        ? `${nearCount} מסלולים במרחק של עד ${radius} ק״מ מהחניון. מה שמסומן עולה למפה.`
        : "אין מסלולים בטווח הזה. אפשר להרחיב את המרחק."));
      const radii = el("div", "radius");
      [20, 40].forEach((value) => {
        const button = el("button", "chip-btn", value === 20 ? "עד 20 ק״מ" : "עד 40 ק״מ");
        button.type = "button";
        button.setAttribute("aria-pressed", value === radius ? "true" : "false");
        button.addEventListener("click", () => {
          radius = value;
          expanded = false;
          render();
        });
        radii.append(button);
      });
      around.append(radii);
      if (selected.length >= maxPicks) {
        around.append(el("p", "fine", "אפשר עד ארבעה מסלולים במפה. הסירו אחד כדי להוסיף אחר."));
      }
      const ordered = [
        ...selected.map((id) => choices.find((item) => item.trail.id === id) || { trail: byId.get(id), km: null }).filter((item) => item.trail),
        ...shown.filter((item) => !selected.includes(item.trail.id)),
      ];
      ordered.forEach((item) => {
        const on = selected.includes(item.trail.id);
        const row = el("article", on ? "choice on" : "choice");
        const heading = el("h3", null, item.trail.name);
        const facts = [item.km == null ? "" : `כ־${item.km} ק״מ מהחניון`, trailFacts(item.trail)].filter(Boolean).join(" · ");
        row.append(heading, el("p", "meta", facts));
        const button = el("button", on ? "remove" : null, on ? "הסרה" : "להוסיף");
        button.type = "button";
        button.disabled = !on && selected.length >= maxPicks;
        button.addEventListener("click", () => (on ? removeTrail(item.trail.id) : addTrail(item.trail.id)));
        row.append(button);
        around.append(row);
      });
      if (!expanded && pool.length > shown.length) {
        const more = el("button", "chip-btn more-around", `עוד ${pool.length - shown.length} מסלולים בסביבה`);
        more.type = "button";
        more.addEventListener("click", () => {
          expanded = true;
          render();
        });
        around.append(more);
      }
    }

    function render() {
      const chosen = chosenTrails();
      lead.textContent = chosen.length
        ? chosen.map((trail) => trail.name).join(" · ")
        : "בחרו מסלולים מסביב לחניון והם יופיעו במפה.";
      picked.replaceChildren();
      chosen.forEach((trail) => picked.append(trailSheet(trail)));
      renderAround();
      remember();
      const extras = choices.filter((item) => !selected.includes(item.trail.id) && item.trail.lat != null && (item.km == null || item.km <= radius));
      try {
        drawMap(camp, chosen, extras, addTrail);
      } catch (error) {
        mapNote.textContent = "המפה לא התעדכנה. רשימת המסלולים כן.";
      }
    }

    render();
  })
  .catch(() => {
    title.textContent = "לא הצלחנו לטעון את הפירוט";
  });
