const library = document.querySelector("#library");
const COVERS = ["a", "b", "c"];

let camps = [];
let trails = [];
let places = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function campById(id) {
  return camps.find((camp) => camp.id === Number(id)) || null;
}

function trailName(id) {
  const trail = trails.find((item) => item.id === Number(id));
  return trail ? trail.name : "";
}

function placeName(id) {
  const place = places.find((item) => item.id === id);
  return place ? place.name : "";
}

function dateRange(place) {
  if (!place || !place.from || !place.to) return "";
  const show = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
  return `${show(place.from)}–${show(place.to)}`;
}

function shareText(trip) {
  const camp = campById(trip.campId);
  if (!camp) return `${trip.name}\n${new URL(window.CamperTrips.sharePath(trip), window.location.href).href}`;
  const chosen = (trip.trailIds || [])
    .map((id) => trails.find((item) => item.id === Number(id)))
    .filter(Boolean);
  const place = trip.place || {};
  const coffees = (place.coffee || []).map((id) => places.find((item) => item.id === id)).filter((item) => item && item.lat != null);
  const visits = (place.visit || []).map((id) => places.find((item) => item.id === id)).filter((item) => item && item.lat != null);
  let home = "center";
  try {
    const saved = localStorage.getItem("camper-home");
    if (saved) home = saved;
  } catch (_error) {
    /* the departure stays the center of the country */
  }
  const origin = window.CamperPlan.regionOrigin(camps, home) || window.CamperPlan.centerOrigin(camps);
  const url = new URL(window.CamperTrips.sharePath(trip), window.location.href).href;
  return window.CamperPlan.shareMessage({
    name: trip.name,
    camp,
    trails: chosen,
    coffees,
    visits,
    arrivalMinutes: place.arrival,
    origin,
    hours: {
      dinner: place.dinner,
      rise: place.rise,
      breakfast: place.breakfast,
      start: place.start,
      lunch: place.lunch,
      back: place.back,
      hikes: place.hikes,
      coffeeAt: place.stops,
      visitAt: place.stops,
    },
    order: place.order,
    from: place.from,
    to: place.to,
    url,
  });
}

function coverClass(id) {
  const total = [...String(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return COVERS[total % COVERS.length];
}

function render() {
  const trips = window.CamperTrips.list();
  library.replaceChildren();
  if (!trips.length) {
    const empty = el("p", "empty");
    empty.append("עדיין אין טיולים. מוסיפים פעילות מהחיפוש. ");
    const start = el("a", null, "לחיפוש");
    start.href = "index.html";
    empty.append(start);
    library.append(empty);
    return;
  }
  const grid = el("div", "albums");
  trips.forEach((trip) => {
    const camp = campById(trip.campId);
    const card = el("article", "album");
    const cover = el("div", `cover ${coverClass(trip.id)}`, camp ? (camp.areaNames && camp.areaNames[0]) || "לילה" : "בלי לילה");
    card.append(cover);
    card.append(el("h2", null, trip.name));
    const names = (trip.trailIds || []).map(trailName).filter(Boolean);
    const extras = ((trip.place && trip.place.visit) || []).map(placeName)
      .concat(((trip.place && trip.place.coffee) || []).map(placeName))
      .filter(Boolean);
    const meta = [
      dateRange(trip.place),
      camp ? camp.name : "עדיין בלי לילה",
      names.concat(extras).slice(0, 2).join(" · "),
      trip.draft ? "טיוטה" : "שמור",
    ].filter(Boolean).join(" · ");
    card.append(el("p", null, meta));
    const actions = el("div", "actions");
    const edit = el("a", null, "עריכת לוז");
    edit.href = window.CamperTrips.editPath(trip);
    const share = el("button", "ghost", "שליחה");
    share.type = "button";
    share.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const result = await window.CamperTrips.send(trip, shareText(trip));
      if (result.aborted) return;
      let status = card.querySelector(".share-note");
      if (!status) {
        status = el("p", "fine share-note");
        card.append(status);
      }
      if (result.copied) status.textContent = "ההודעה הועתקה, עם הלוז והקישורים.";
      else if (result.shared) status.textContent = "אפשר לשלוח את הטיול.";
      else status.textContent = "לא הצלחנו להעתיק את ההודעה.";
    });
    const remove = el("button", "ghost danger", "מחיקה");
    remove.type = "button";
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (remove.dataset.confirm !== "yes") {
        remove.dataset.confirm = "yes";
        remove.textContent = "לאשר מחיקה";
        return;
      }
      window.CamperTrips.remove(trip.id);
      render();
    });
    actions.append(edit, share, remove);
    card.append(actions);
    card.addEventListener("click", () => {
      window.location.href = window.CamperTrips.editPath(trip);
    });
    grid.append(card);
  });
  library.append(grid);
}

Promise.all([
  fetch("data/camps.json").then((response) => response.json()),
  fetch("data/trails.json").then((response) => response.json()),
  fetch("data/places.json").then((response) => (response.ok ? response.json() : [])).catch(() => []),
]).then(([campData, trailData, placeData]) => {
  camps = campData;
  trails = trailData;
  places = Array.isArray(placeData) ? placeData : [];
  render();
}).catch(() => {
  library.replaceChildren(el("p", "summary", "לא הצלחנו לטעון את קטלוג החניונים."));
});
