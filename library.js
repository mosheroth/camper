const ISRAEL_BOUNDS = [[29.45, 34.22], [33.35, 35.92]];
const library = document.querySelector("#library");

let camps = [];
let trails = [];
let map = null;
let markerLayer = null;
let selectedId = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function ensureMap() {
  if (map || typeof window.L === "undefined") return map;
  map = window.L.map("library-map", { zoomControl: false, scrollWheelZoom: true });
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
  map.fitBounds(ISRAEL_BOUNDS, { animate: false, padding: [20, 20] });
  window.addEventListener("resize", () => map.invalidateSize());
  return map;
}

function campById(id) {
  return camps.find((camp) => camp.id === Number(id)) || null;
}

function trailName(id) {
  const trail = trails.find((item) => item.id === Number(id));
  return trail ? trail.name : "";
}

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(date);
}

function focusTrip(trip) {
  selectedId = trip.id;
  library.querySelectorAll(".saved").forEach((node) => {
    node.classList.toggle("selected", node.dataset.trip === trip.id);
  });
  const camp = campById(trip.campId);
  if (!map || !camp || camp.lat == null) return;
  map.flyTo([camp.lat, camp.lng], 11, { duration: 0.45 });
}

function drawMarkers(trips) {
  if (!markerLayer) return;
  markerLayer.clearLayers();
  const points = [];
  trips.forEach((trip) => {
    const camp = campById(trip.campId);
    if (!camp || camp.lat == null) return;
    points.push([camp.lat, camp.lng]);
    const marker = window.L.circleMarker([camp.lat, camp.lng], {
      radius: 7,
      color: "#a3472c",
      weight: 2,
      fillColor: "#c4623f",
      fillOpacity: 0.95,
    }).addTo(markerLayer);
    marker.bindPopup(`<strong>${trip.name}</strong>`);
    marker.on("click", () => {
      focusTrip(trip);
      const card = library.querySelector(`[data-trip="${trip.id}"]`);
      if (card) card.scrollIntoView({ block: "nearest" });
    });
  });
  if (!points.length) map.fitBounds(ISRAEL_BOUNDS, { animate: false, padding: [20, 20] });
  else map.fitBounds(points, { animate: false, padding: [28, 28], maxZoom: 8 });
}

function render() {
  const trips = window.CamperTrips.list();
  library.replaceChildren();
  const count = trips.length === 1 ? "טיול אחד שמור" : `${trips.length} טיולים שמורים`;
  library.append(el("p", "summary", trips.length ? count : "עדיין אין טיולים שמורים."));
  if (!trips.length) {
    const empty = el("p", "empty");
    empty.append("יוצרים טיול ממפת הארץ, ושומרים אותו. ");
    const start = el("a", null, "ליצירת טיול");
    start.href = "index.html";
    empty.append(start);
    library.append(empty);
    drawMarkers([]);
    return;
  }
  trips.forEach((trip) => {
    const camp = campById(trip.campId);
    const card = el("article", trip.id === selectedId ? "saved selected" : "saved");
    card.dataset.trip = trip.id;
    card.append(el("h2", null, trip.name));
    const names = (trip.trailIds || []).map(trailName).filter(Boolean);
    const meta = [
      camp ? camp.name : "החניון לא נמצא בקטלוג",
      names.length ? names.join(" · ") : "בלי מסלול",
      when(trip.updatedAt),
    ].filter(Boolean).join(" · ");
    card.append(el("p", "meta", meta));
    const actions = el("div", "actions");
    const edit = el("a", null, "עריכה");
    edit.href = window.CamperTrips.editPath(trip);
    const share = el("button", "ghost", "שליחה");
    share.type = "button";
    share.addEventListener("click", async (event) => {
      event.stopPropagation();
      const result = await window.CamperTrips.send(trip);
      if (result.aborted) return;
      let status = card.querySelector(".share-note");
      if (!status) {
        status = el("p", "fine share-note");
        card.append(status);
      }
      if (result.copied) status.textContent = "הקישור הועתק. אפשר לשלוח אותו.";
      else if (result.shared) status.textContent = "אפשר לשלוח את הטיול.";
      else status.textContent = result.url;
    });
    const remove = el("button", "ghost danger", "מחיקה");
    remove.type = "button";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      if (remove.dataset.confirm !== "yes") {
        remove.dataset.confirm = "yes";
        remove.textContent = "לאשר מחיקה";
        return;
      }
      window.CamperTrips.remove(trip.id);
      if (selectedId === trip.id) selectedId = null;
      render();
    });
    actions.append(edit, share, remove);
    card.append(actions);
    card.addEventListener("click", () => focusTrip(trip));
    library.append(card);
  });
  drawMarkers(trips);
}

ensureMap();

Promise.all([
  fetch("data/camps.json").then((response) => response.json()),
  fetch("data/trails.json").then((response) => response.json()),
])
  .then(([campData, trailData]) => {
    camps = campData;
    trails = trailData;
    window.requestAnimationFrame(() => {
      if (map) map.invalidateSize();
      render();
    });
  })
  .catch(() => {
    library.replaceChildren(el("p", "summary", "לא הצלחנו לטעון את קטלוג החניונים."));
  });
