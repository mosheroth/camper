const COLORS = ["#a3472c", "#1d6a4f", "#1d4e89", "#8a5a00", "#6b3fa0"];
const REGION_LABEL = { north: "צפון", center: "מרכז", south: "דרום", east: "יו״ש" };

const title = document.querySelector("#title");
const lead = document.querySelector("#lead");
const legend = document.querySelector("#legend");
const mapNote = document.querySelector("#map-note");
const dossier = document.querySelector("#dossier");

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

function photo(parent, src) {
  if (!src) return;
  const image = document.createElement("img");
  image.className = "sheet-photo";
  image.src = src;
  image.alt = "";
  image.addEventListener("error", () => image.remove());
  parent.append(image);
}

function campSheet(camp) {
  const details = camp.details || {};
  const block = section(camp.name, (node) => {
    photo(node, camp.image);
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
  if (trail.hoursMin && trail.hoursMax && trail.hoursMin !== trail.hoursMax) bits.push(`${trail.hoursMin}–${trail.hoursMax} שעות`);
  else if (trail.hoursMax) bits.push(`כ־${trail.hoursMax} שעות`);
  if (trail.kmMin && trail.kmMax && trail.kmMin !== trail.kmMax) bits.push(`${trail.kmMin}–${trail.kmMax} ק״מ`);
  else if (trail.kmMax || trail.kmMin) bits.push(`כ־${trail.kmMax || trail.kmMin} ק״מ`);
  if (trail.family) bits.push("למשפחות");
  if (trail.accessible) bits.push("מונגש");
  (trail.areaNames || []).slice(0, 1).forEach((name) => bits.push(name));
  return bits.join(" · ");
}

function trailSheet(trail) {
  const details = trail.details || {};
  return section(trail.name, (node) => {
    photo(node, trail.image);
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

function drawMap(camp, trails) {
  if (typeof window.L === "undefined") {
    mapNote.textContent = "המפה לא נטענה. אפשר עדיין לקרוא את הפירוט ולפתוח את העמודים הרשמיים.";
    return;
  }
  const map = window.L.map("map", { scrollWheelZoom: false });
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
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
    }).addTo(map);
    const safeName = String(camp.name).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
    marker.bindPopup(`<strong>חניון</strong><br>${safeName}`);
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
      }).addTo(map).bindPopup(trail.name);
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
      const group = window.L.layerGroup().addTo(map);
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
        if (visible) map.removeLayer(group);
        else group.addTo(map);
      });
      legend.append(item);
    });
  });

  if (bounds.length) {
    map.fitBounds(bounds, {
      paddingTopLeft: [48, 72],
      paddingBottomRight: [48, 36],
      maxZoom: 15,
    });
  } else {
    map.setView([31.4, 34.9], 7);
  }
  mapNote.textContent = drewLine
    ? "הסיכה עם הכיתוב חניון היא אתר הקמפינג. כל קו הוא מסלול אחר. לחיצה על שורה במקרא מסתירה את הקו."
    : "החניון מסומן. למסלולים בעמוד הזה אין עדיין קו שביל תואם, אז מסומנת נקודת ההתחלה.";
}

Promise.all([
  fetch("data/camps.json").then((response) => response.json()),
  fetch("data/trails.json").then((response) => response.json()),
])
  .then(([camps, trails]) => {
    const { campId, trailIds } = params();
    const camp = camps.find((item) => item.id === campId);
    const wanted = trailIds.length
      ? trailIds.map((id) => trails.find((item) => item.id === id)).filter(Boolean)
      : [];
    if (!camp || !wanted.length) {
      title.textContent = "הסופ״ש לא נמצא";
      lead.textContent = "אפשר לחזור לרשימה ולבחור הצעה אחרת.";
      return;
    }
    document.title = `${camp.name} — סופ״ש בטבע`;
    title.textContent = camp.name;
    lead.textContent = wanted.map((trail) => trail.name).join(" · ");
    drawMap(camp, wanted);
    dossier.append(campSheet(camp));
    wanted.forEach((trail) => dossier.append(trailSheet(trail)));
  })
  .catch(() => {
    title.textContent = "לא הצלחנו לטעון את הפירוט";
  });
