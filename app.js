const TRAIL_COLORS = ["#a3472c", "#1d6a4f", "#1d4e89", "#8a5a00"];
const ISRAEL_BOUNDS = [[29.45, 34.22], [33.35, 35.92]];
const REGION_LABEL = {
  north: "צפון",
  center: "מרכז",
  south: "דרום",
  east: "יו״ש",
};
const HOME_AREA = {
  north: "הצפון",
  center: "המרכז",
  south: "הדרום",
  east: "יו״ש",
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
let hoverCamp = null;
let map = null;
let markerLayer = null;
let focusLayer = null;
let markersByCamp = new Map();

const CHECKS = ["family", "circular", "shade", "wet", "view", "close", "water", "toilet", "shower", "fire"];

function readFilters() {
  const data = new FormData(form);
  const filters = {
    home: data.get("home") || "",
    region: data.get("region"),
    lodging: data.get("lodging"),
    difficulty: data.get("difficulty"),
    time: data.get("time"),
    query: data.get("query") || "",
  };
  CHECKS.forEach((name) => {
    filters[name] = data.get(name) === "on";
  });
  return filters;
}

function rememberFilters() {
  const filters = readFilters();
  try {
    sessionStorage.setItem("camper-filters", JSON.stringify(filters));
    if (filters.home) localStorage.setItem("camper-home", filters.home);
    else localStorage.removeItem("camper-home");
  } catch (_error) {
    /* private mode can block storage; the form still filters this visit */
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
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

function paintLink() {
  document.querySelectorAll("#results .plan").forEach((node) => {
    node.classList.toggle("linked", hoverCamp != null && Number(node.dataset.camp) === hoverCamp);
  });
  const hot = hoverCamp != null ? hoverCamp : selectedId;
  markersByCamp.forEach((marker, campId) => {
    const on = campId === hot;
    marker.setStyle({
      radius: on ? 13 : 6,
      weight: on ? 3 : 2,
      fillOpacity: on ? 1 : 0.9,
    });
    if (on) marker.bringToFront();
  });
}

function drawMarkers() {
  if (!markerLayer) return;
  markerLayer.clearLayers();
  markersByCamp = new Map();
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
    markersByCamp.set(camp.id, marker);
    const glance = window.CamperPlan.campGlance(camp);
    const facilities = glance.facilities.map((item) => item.label).slice(0, 4).join(" · ");
    const booking = glance.bookingUrl ? "בהזמנה מראש" : "";
    marker.bindPopup(`<strong>${escapeHtml(camp.name)}</strong><br>${escapeHtml([glance.stay, booking, facilities].filter(Boolean).join(" · "))}`);
    marker.on("mouseover", () => {
      hoverCamp = camp.id;
      paintLink();
    });
    marker.on("mouseout", () => {
      hoverCamp = null;
      paintLink();
    });
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
  const glance = window.CamperPlan.campGlance(plan.camp);
  const booking = glance.bookingUrl ? "בהזמנה מראש" : "";
  pin.bindPopup(`<strong>${escapeHtml(plan.camp.name)}</strong><br>${escapeHtml([glance.stay, booking].filter(Boolean).join(" · "))}`);
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

function updateContinue() {
  const link = document.querySelector("#continue-step");
  const note = document.querySelector("#chosen-camp");
  if (!link || !note) return;
  const plan = plans.find((item) => item.camp.id === selectedId);
  if (!plan) {
    link.setAttribute("aria-disabled", "true");
    link.removeAttribute("href");
    note.textContent = "בוחרים חניון אחד.";
    return;
  }
  link.removeAttribute("aria-disabled");
  link.href = window.CamperPlan.planUrl(plan.camp.id, plan.trails.map((item) => item.trail.id));
  note.textContent = plan.camp.name;
}

function selectPlan(id, { zoom = false, reveal = false } = {}) {
  selectedId = id;
  results.querySelectorAll(".plan").forEach((node) => {
    const on = Number(node.dataset.camp) === id;
    node.classList.toggle("selected", on);
    const radio = node.querySelector("input[type=radio]");
    if (radio) radio.checked = on;
  });
  const plan = plans.find((item) => item.camp.id === id);
  updateContinue();
  if (!plan) return;
  if (reveal) {
    const card = results.querySelector(`[data-camp="${id}"]`);
    if (card) card.scrollIntoView({ block: "nearest" });
  }
  drawFocus(plan);
  if (zoom) zoomTo(plan);
  paintLink();
}

function aroundText(count) {
  if (!count) return "";
  if (count.close === 1) return "מסלול אחד בסביבה";
  if (count.close > 1) return `${count.close} מסלולים בסביבה`;
  if (count.wide === 1) return "מסלול אחד עד 40 ק״מ";
  if (count.wide > 1) return `${count.wide} מסלולים עד 40 ק״מ`;
  return "";
}

function homeLabel(minutes) {
  if (minutes == null) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `כ־${minutes} דקות מהבית`;
  const head = hours === 1 ? "כשעה" : hours === 2 ? "כשעתיים" : `כ־${hours} שעות`;
  if (!mins) return `${head} מהבית`;
  if (mins === 30) return `${head} וחצי מהבית`;
  return `${head} ו־${mins} דקות מהבית`;
}

const FACILITY_MARK = {
  water: "💧",
  toilet: "🚻",
  shower: "🚿",
  fire: "🔥",
  kitchen: "🍳",
  "family-tent": "⛺",
  caravan: "🚐",
  power: "🔌",
  cell: "📶",
};

function renderPlan(plan) {
  const { camp } = plan;
  const glance = window.CamperPlan.campGlance(camp);
  const article = el("label", camp.paid ? "plan index-card" : "plan index-card free");
  article.dataset.camp = String(camp.id);
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "camp-choice";
  radio.value = String(camp.id);
  radio.className = "camp-choice";
  if (camp.id === selectedId) {
    article.classList.add("selected");
    radio.checked = true;
  }
  if (glance.photo) {
    const img = document.createElement("img");
    img.className = "camp-photo";
    img.src = glance.photo;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    if (glance.credit) img.title = glance.credit;
    img.addEventListener("error", () => {
      img.remove();
      article.classList.add("no-photo");
    });
    article.append(img);
  } else {
    article.classList.add("no-photo");
  }
  const regions = (camp.regions || []).map((region) => REGION_LABEL[region] || region).join(" · ");
  const aroundLabel = aroundText(window.CamperPlan.aroundCount(camp));
  const fromHome = homeLabel(plan.homeMinutes);
  const copy = el("div", "index-copy");
  copy.append(el("h2", null, camp.name));
  copy.append(el("p", "meta", [regions, fromHome, glance.stay].filter(Boolean).join(" · ")));
  if (glance.bookingUrl) {
    const booking = el("p", "booking");
    booking.append(document.createTextNode("צריך להזמין מקום מראש. "));
    const book = el("a", "camp-page", "להזמנת מקום");
    book.href = glance.bookingUrl;
    book.target = "_blank";
    book.rel = "noopener noreferrer";
    booking.append(book);
    copy.append(booking);
  }
  if (glance.facilities.length) {
    const list = el("ul", "lures");
    glance.facilities.forEach((item) => {
      const row = el("li");
      const mark = FACILITY_MARK[item.id];
      if (mark) {
        const emoji = el("span", "mark", mark);
        emoji.setAttribute("aria-hidden", "true");
        row.append(emoji);
      }
      row.append(document.createTextNode(item.label));
      list.append(row);
    });
    copy.append(list);
  }
  if (glance.blurb) copy.append(el("p", "blurb", glance.blurb));
  if (glance.note) copy.append(el("p", "camp-note", glance.note));
  const quiet = glance.facts.concat(aroundLabel ? [aroundLabel] : []);
  if (quiet.length) copy.append(el("p", "fine", quiet.join(" · ")));
  const pages = el("div", "links");
  if (camp.url) {
    const more = el("a", "camp-page", "העמוד ברשות הטבע והגנים");
    more.href = camp.url;
    more.target = "_blank";
    more.rel = "noopener noreferrer";
    pages.append(more);
  }
  if (camp.tiuliUrl) {
    const more = el("a", "camp-page", "העמוד בטיולי");
    more.href = camp.tiuliUrl;
    more.target = "_blank";
    more.rel = "noopener noreferrer";
    pages.append(more);
  }
  if (pages.childNodes.length) copy.append(pages);
  article.append(radio, copy);
  radio.addEventListener("change", () => {
    if (radio.checked) selectPlan(camp.id, { zoom: true });
  });
  article.addEventListener("mouseenter", () => {
    hoverCamp = camp.id;
    paintLink();
  });
  article.addEventListener("mouseleave", () => {
    hoverCamp = null;
    paintLink();
  });
  return article;
}

function render() {
  results.replaceChildren();
  drawMarkers();
  if (!plans.length) {
    summary.textContent = "אין סופ״ש שעומד בכל הסינונים. כדאי להרחיב אזור, זמן או קושי.";
    drawFocus(null);
    updateContinue();
    const empty = el("p", "empty", "אפשר לאפס סינון ולבחור רק אזור, או לוותר על ״מעגלי״ ו״למשפחות״ יחד.");
    results.append(empty);
    return;
  }
  const homeName = HOME_AREA[readFilters().home];
  const sorted = homeName ? ` מהקרוב לבית באזור ${homeName}.` : "";
  summary.textContent = plans.length === 1
    ? `חניון אחד.${sorted}`
    : `${plans.length} חניונים.${sorted} בוחרים אחד.`;
  plans.forEach((plan) => results.append(renderPlan(plan)));
  updateContinue();
  const selected = plans.find((plan) => plan.camp.id === selectedId);
  drawFocus(selected || null);
  paintLink();
}

function apply() {
  rememberFilters();
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

const continueStep = document.querySelector("#continue-step");
if (continueStep) {
  continueStep.addEventListener("click", (event) => {
    if (continueStep.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      return;
    }
    try {
      sessionStorage.setItem("camper-filters", JSON.stringify(readFilters()));
    } catch (_error) {
      /* the next page still opens with the chosen camp */
    }
  });
}

function showReturn() {
  let href = "";
  try {
    href = sessionStorage.getItem("camper-return") || "";
  } catch (_error) {
    return;
  }
  const eyebrow = document.querySelector(".eyebrow");
  if (!eyebrow) return;
  const current = eyebrow.querySelector(".return-trip");
  if (!/^trip\.html\?camp=\d+/.test(href)) {
    if (current) {
      const separator = current.previousSibling;
      if (separator && separator.nodeType === Node.TEXT_NODE) separator.remove();
      current.remove();
    }
    return;
  }
  const anchor = current || document.createElement("a");
  anchor.className = "return-trip";
  anchor.href = href;
  anchor.textContent = "חזרה לטיול";
  if (!current) {
    eyebrow.append(document.createTextNode(" · "));
    eyebrow.append(anchor);
  }
}

window.addEventListener("pageshow", showReturn);

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
      if (filters.home && form.elements.home) form.elements.home.value = filters.home;
      else if (!Object.prototype.hasOwnProperty.call(filters, "home") && form.elements.home) {
        try {
          const stored = localStorage.getItem("camper-home");
          if (stored) form.elements.home.value = stored;
        } catch (_error) {
          /* the visit simply stays unsorted */
        }
      }
      CHECKS.forEach((name) => {
        if (form.elements[name]) form.elements[name].checked = Boolean(filters[name]);
      });
      if (typeof filters.query === "string") form.elements.query.value = filters.query;
    } else if (form.elements.home) {
      try {
        const stored = localStorage.getItem("camper-home");
        if (stored) form.elements.home.value = stored;
      } catch (_error) {
        /* the visit simply stays unsorted */
      }
    }
    apply();
  })
  .catch(() => {
    summary.textContent = "לא הצלחנו לטעון את נתוני החניונים והמסלולים.";
  });
