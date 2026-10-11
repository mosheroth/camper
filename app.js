const TRAIL_COLORS = ["#a3472c", "#1d6a4f", "#1d4e89", "#8a5a00"];
const ISRAEL_BOUNDS = [[29.45, 34.22], [33.35, 35.92]];
const REGION_LABEL = {
  north: "צפון",
  center: "מרכז",
  south: "דרום",
  east: "יו״ש",
};
const DIFFICULTY_LABEL = {
  easy: "קל",
  moderate: "בינוני",
  challenging: "מאתגר",
};

const form = document.querySelector("#filters");
const summary = document.querySelector("#summary");
const results = document.querySelector("#results");
const legend = document.querySelector("#legend");
const fetched = document.querySelector("#fetched");

let camps = [];
let trails = [];
let plans = [];
let selectedId = null;
let map = null;
let markerLayer = null;
let focusLayer = null;

function readFilters() {
  const data = new FormData(form);
  return {
    region: data.get("region"),
    lodging: data.get("lodging"),
    difficulty: data.get("difficulty"),
    time: data.get("time"),
    family: data.get("family") === "on",
    circular: data.get("circular") === "on",
    water: data.get("water") === "on",
    toilet: data.get("toilet") === "on",
    query: data.get("query") || "",
  };
}

function formatHours(trail) {
  const max = trail.hoursMax;
  if (max == null) return null;
  const min = trail.hoursMin;
  const num = (value) => (Number.isInteger(value) ? String(value) : String(value));
  if (min === max) {
    if (max === 1) return "כשעה";
    return `${num(max)} שעות`;
  }
  return `${num(min)}–${num(max)} שעות`;
}

function formatKm(trail) {
  if (!window.CamperPlan.lengthIsUsable(trail)) return null;
  if (trail.kmMax == null) return null;
  if (trail.kmMin === trail.kmMax) return `${trimNum(trail.kmMax)} ק״מ`;
  return `${trimNum(trail.kmMin)}–${trimNum(trail.kmMax)} ק״מ`;
}

function trimNum(value) {
  return Number.isInteger(value) ? String(value) : String(value);
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

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function ensureMap() {
  if (map || typeof window.L === "undefined") return map;
  map = window.L.map("browse-map", { zoomControl: false, scrollWheelZoom: true });
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  window.L.control.zoom({
    position: "topleft",
    zoomInTitle: "התקרבות",
    zoomOutTitle: "התרחקות",
  }).addTo(map);
  markerLayer = window.L.layerGroup().addTo(map);
  focusLayer = window.L.layerGroup().addTo(map);
  map.fitBounds(ISRAEL_BOUNDS, { animate: false, padding: [20, 20] });
  window.addEventListener("resize", () => map.invalidateSize());
  return map;
}

function fitAll() {
  if (!map) return;
  const host = document.querySelector("#browse-map");
  if (!host || host.clientHeight < 50) return;
  map.invalidateSize({ animate: false });
  const points = plans
    .filter((plan) => plan.camp.lat != null)
    .map((plan) => [plan.camp.lat, plan.camp.lng]);
  if (!points.length) {
    map.fitBounds(ISRAEL_BOUNDS, { animate: false, padding: [20, 20] });
    return;
  }
  map.fitBounds(points, { animate: false, padding: [28, 28], maxZoom: 8 });
}

function focusPoints(plan) {
  const points = [];
  if (plan.camp.lat != null) points.push([plan.camp.lat, plan.camp.lng]);
  plan.trails.forEach(({ trail }) => {
    (trail.routes || []).forEach((route) => {
      (route.lines || []).forEach((line) => points.push(...line));
    });
    if (trail.lat != null) points.push([trail.lat, trail.lng]);
  });
  return points;
}

function zoomTo(plan) {
  if (!map) return;
  const points = focusPoints(plan);
  if (!points.length) return;
  try {
    if (points.length === 1) map.flyTo(points[0], 12, { duration: 0.55 });
    else map.flyToBounds(points, { maxZoom: 13, padding: [48, 48], duration: 0.55 });
  } catch (_error) {
    if (plan.camp.lat != null) map.flyTo([plan.camp.lat, plan.camp.lng], 12, { duration: 0.55 });
  }
}

function campPin() {
  return window.L.divIcon({
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
}

function drawMarkers() {
  if (!markerLayer) return;
  markerLayer.clearLayers();
  plans.forEach((plan) => {
    const camp = plan.camp;
    if (camp.lat == null) return;
    const paid = Boolean(camp.paid);
    const marker = window.L.circleMarker([camp.lat, camp.lng], {
      radius: 6,
      color: paid ? "#a3472c" : "#1c3f34",
      weight: 2,
      fillColor: paid ? "#c4623f" : "#2f6a52",
      fillOpacity: 0.9,
    }).addTo(markerLayer);
    marker.bindPopup(`<strong>${escapeHtml(camp.name)}</strong>`);
    marker.on("click", () => selectPlan(camp.id, { zoom: true, reveal: true }));
  });
}

function drawFocus(plan) {
  if (!focusLayer) return;
  focusLayer.clearLayers();
  legend.querySelectorAll(".legend-focus").forEach((node) => node.remove());
  if (!plan || plan.camp.lat == null) return;
  const pin = window.L.marker([plan.camp.lat, plan.camp.lng], {
    icon: campPin(),
    zIndexOffset: 800,
    title: plan.camp.name,
    alt: `חניון ${plan.camp.name}`,
  }).addTo(focusLayer);
  pin.bindPopup(`<strong>חניון</strong><br>${escapeHtml(plan.camp.name)}`);
  const seen = new Set();
  let colorIndex = 0;
  plan.trails.forEach(({ trail }) => {
    const routes = (trail.routes || []).filter((route) => {
      const key = route.name || trail.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return (route.lines || []).length > 0;
    });
    if (!routes.length && trail.lat != null) {
      const color = TRAIL_COLORS[colorIndex % TRAIL_COLORS.length];
      colorIndex += 1;
      window.L.circleMarker([trail.lat, trail.lng], {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95,
      }).addTo(focusLayer).bindPopup(escapeHtml(trail.name));
      return;
    }
    routes.forEach((route) => {
      const color = TRAIL_COLORS[colorIndex % TRAIL_COLORS.length];
      colorIndex += 1;
      (route.lines || []).forEach((line) => {
        window.L.polyline(line, { color, weight: 5, opacity: 0.9 }).addTo(focusLayer);
      });
      const item = el("li", "legend-focus", route.name || trail.name);
      const dot = el("i", "swatch");
      dot.style.background = color;
      item.prepend(dot);
      legend.append(item);
    });
  });
}

function selectPlan(id, { zoom = false, reveal = false } = {}) {
  selectedId = id;
  results.querySelectorAll(".plan").forEach((node) => {
    const on = Number(node.dataset.camp) === id;
    node.classList.toggle("selected", on);
    node.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const plan = plans.find((item) => item.camp.id === id);
  if (!plan) return;
  if (reveal) {
    const card = results.querySelector(`[data-camp="${id}"]`);
    if (card) card.scrollIntoView({ block: "nearest" });
  }
  drawFocus(plan);
  if (zoom) zoomTo(plan);
}

function renderPlan(plan) {
  const { camp } = plan;
  const article = el("article", camp.paid ? "plan" : "plan free");
  article.dataset.camp = String(camp.id);
  if (camp.id === selectedId) {
    article.classList.add("selected");
    article.setAttribute("aria-pressed", "true");
  }
  const [primary, extra] = plan.trails;

  if (camp.image) {
    const image = document.createElement("img");
    image.className = "thumb";
    image.src = camp.image;
    image.alt = "";
    image.addEventListener("error", () => {
      image.remove();
      article.classList.add("no-photo");
    });
    article.append(image);
  }

  const stay = el("div", "camp");
  const regions = (camp.regions || []).map((region) => REGION_LABEL[region] || region).join(" · ");
  const lodging = camp.paid ? "בתשלום" : "בלי תשלום";
  stay.append(el("p", "kicker", ["לינה", regions, lodging].filter(Boolean).join(" · ")));
  stay.append(el("h2", null, camp.name));
  if (camp.blurb) stay.append(el("p", "blurb", camp.blurb));

  const facts = el("ul", "facts");
  camp.facilities.forEach((item) => facts.append(el("li", null, item.label)));
  if (camp.access) facts.append(el("li", null, camp.access));
  if (camp.places) facts.append(el("li", null, `${camp.places} מקומות`));
  if (camp.paid && camp.priceFrom) facts.append(el("li", null, `מבוגר באוהל מ־${camp.priceFrom} ₪`));
  if (facts.childNodes.length) stay.append(facts);

  const stayLinks = el("div", "links");
  if (camp.url) stayLinks.append(link(camp.url, "עמוד החניון"));
  if (camp.lat != null) {
    stayLinks.append(link(`https://www.waze.com/ul?ll=${camp.lat},${camp.lng}&navigate=yes`, "ניווט לחניון"));
  }
  stay.append(stayLinks);

  const hike = el("div", "hike");
  const distance = primary.km == null ? "באותו אזור" : `כ־${primary.km} ק״מ מהחניון`;
  hike.append(el("p", "kicker", `הליכה בשבת · ${distance}`));
  hike.append(el("h3", null, primary.trail.name));
  hike.append(chips(primary.trail));
  if (primary.trail.blurb) hike.append(el("p", "blurb", primary.trail.blurb));
  const hikeLinks = el("div", "links");
  if (primary.trail.url) hikeLinks.append(link(primary.trail.url, "עמוד המסלול"));
  if (primary.trail.waze) {
    hikeLinks.append(
      link(`https://www.waze.com/ul?q=${encodeURIComponent(primary.trail.waze)}&navigate=yes`, "ניווט למסלול")
    );
  }
  hike.append(hikeLinks);
  if (extra) {
    const alt = el("p", "alt");
    alt.append(document.createTextNode("עוד מסלול באזור: "));
    if (extra.trail.url) alt.append(link(extra.trail.url, extra.trail.name));
    else alt.append(document.createTextNode(extra.trail.name));
    hike.append(alt);
  }

  const href = window.CamperPlan.planUrl(camp.id, plan.trails.map((item) => item.trail.id));
  const opener = el("a", "opener", "לפירוט");
  opener.href = href;
  opener.addEventListener("click", () => {
    sessionStorage.setItem("camper-filters", JSON.stringify(readFilters()));
  });
  const body = el("div", "plan-body");
  body.append(stay, hike);
  if (!camp.image) article.classList.add("no-photo");
  article.append(body, opener);
  article.tabIndex = 0;
  article.setAttribute("role", "button");
  if (!article.hasAttribute("aria-pressed")) article.setAttribute("aria-pressed", "false");
  article.setAttribute("aria-label", `להתמקד במפה: ${camp.name}`);
  article.addEventListener("click", (event) => {
    if (event.target.closest("a")) return;
    selectPlan(camp.id, { zoom: true });
  });
  article.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPlan(camp.id, { zoom: true });
    }
  });
  return article;
}

function chips(trail) {
  const list = el("ul", "chips");
  if (trail.difficulty) {
    const item = el("li", trail.difficulty === "challenging" ? "hard" : null, DIFFICULTY_LABEL[trail.difficulty]);
    list.append(item);
  }
  if (trail.circular === true) list.append(el("li", null, "מעגלי"));
  else if (trail.circular === "partial") list.append(el("li", null, "מעגלי חלקית"));
  else if (trail.circular === false) list.append(el("li", null, "קווי"));
  const hours = formatHours(trail);
  if (hours) list.append(el("li", null, hours));
  const length = formatKm(trail);
  if (length) list.append(el("li", null, length));
  if (trail.family) list.append(el("li", "family", "למשפחות"));
  if (trail.accessible) list.append(el("li", null, "מונגש"));
  (trail.areaNames || []).slice(0, 1).forEach((name) => list.append(el("li", null, name)));
  return list;
}

function render() {
  results.replaceChildren();
  drawMarkers();
  if (!plans.length) {
    summary.textContent = "אין סופ״ש שעומד בכל הסינונים. כדאי להרחיב אזור, זמן או קושי.";
    drawFocus(null);
    const empty = el("p", "empty", "אפשר לאפס סינון ולבחור רק אזור, או לוותר על ״מעגלי״ ו״למשפחות״ יחד.");
    results.append(empty);
    return;
  }
  summary.textContent = plans.length === 1
    ? "הצעה אחת על המפה. לחצו עליה כדי להתמקד."
    : `${plans.length} הצעות על המפה. לחצו על אחת כדי להתמקד בה.`;
  plans.forEach((plan) => results.append(renderPlan(plan)));
  const selected = plans.find((plan) => plan.camp.id === selectedId);
  drawFocus(selected || null);
}

function apply() {
  plans = window.CamperPlan.buildPlans(camps, trails, readFilters());
  if (!plans.some((plan) => plan.camp.id === selectedId)) selectedId = null;
  render();
  if (!selectedId) {
    fitAll();
    window.requestAnimationFrame(() => {
      if (!selectedId) fitAll();
    });
  }
}

form.addEventListener("input", apply);
form.addEventListener("change", apply);

ensureMap();

Promise.all([
  fetch("data/camps.json").then((response) => response.json()),
  fetch("data/trails.json").then((response) => response.json()),
  fetch("data/meta.json").then((response) => response.json()),
])
  .then(([campData, trailData, meta]) => {
    camps = campData;
    trails = trailData;
    if (meta.fetchedAt) {
      const date = new Date(meta.fetchedAt);
      fetched.dateTime = meta.fetchedAt;
      fetched.textContent = new Intl.DateTimeFormat("he-IL", { dateStyle: "long" }).format(date);
    }
    const saved = sessionStorage.getItem("camper-filters");
    if (saved) {
      let filters = null;
      try {
        filters = JSON.parse(saved);
      } catch (_error) {
        filters = null;
      }
      if (!filters) {
        apply();
        return;
      }
      ["region", "lodging", "difficulty", "time"].forEach((name) => {
        if (filters[name] && form.elements[name]) form.elements[name].value = filters[name];
      });
      ["family", "circular", "water", "toilet"].forEach((name) => {
        if (form.elements[name]) form.elements[name].checked = Boolean(filters[name]);
      });
      if (typeof filters.query === "string") form.elements.query.value = filters.query;
    }
    apply();
  })
  .catch(() => {
    summary.textContent = "לא הצלחנו לטעון את נתוני החניונים והמסלולים.";
  });
