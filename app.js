const PAGE_SIZE = 12;
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
const moreWrap = document.querySelector("#more-wrap");
const moreButton = document.querySelector("#more");
const fetched = document.querySelector("#fetched");

let camps = [];
let trails = [];
let plans = [];
let shown = PAGE_SIZE;

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

function renderPlan(plan) {
  const { camp } = plan;
  const article = el("article", camp.paid ? "plan" : "plan free");
  const [primary, extra] = plan.trails;

  if (camp.image) {
    const image = document.createElement("img");
    image.className = "thumb";
    image.src = camp.image;
    image.alt = "";
    image.addEventListener("error", () => image.remove());
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

  const opener = el("p", "opener", "למפה ולפירוט");
  const body = el("div", "plan-body");
  body.append(stay, hike);
  article.append(body, opener);
  const href = window.CamperPlan.planUrl(camp.id, plan.trails.map((item) => item.trail.id));
  article.tabIndex = 0;
  article.setAttribute("role", "link");
  article.setAttribute("aria-label", `לפתוח את הסופ״ש: ${camp.name}`);
  const open = () => {
    sessionStorage.setItem("camper-filters", JSON.stringify(readFilters()));
    window.location.href = href;
  };
  article.addEventListener("click", (event) => {
    if (event.target.closest("a")) return;
    open();
  });
  article.addEventListener("keydown", (event) => {
    if (event.key === "Enter") open();
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
  const visible = plans.slice(0, shown);
  if (!plans.length) {
    summary.textContent = "אין סופ״ש שעומד בכל הסינונים. כדאי להרחיב אזור, זמן או קושי.";
    moreWrap.hidden = true;
    const empty = el("p", "empty", "אפשר לאפס סינון ולבחור רק אזור, או לוותר על ״מעגלי״ ו״למשפחות״ יחד.");
    results.append(empty);
    return;
  }
  const count = plans.length === 1
    ? "הצעה אחת לסופ״ש. לחצו על השורה למפה ולפירוט."
    : `${plans.length} הצעות לסופ״ש. לחצו על שורה למפה ולפירוט.`;
  summary.textContent = count;
  visible.forEach((plan) => results.append(renderPlan(plan)));
  moreWrap.hidden = shown >= plans.length;
}

function apply() {
  plans = window.CamperPlan.buildPlans(camps, trails, readFilters());
  shown = PAGE_SIZE;
  render();
}

form.addEventListener("input", apply);
form.addEventListener("change", apply);
moreButton.addEventListener("click", () => {
  shown += PAGE_SIZE;
  render();
});

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
      if (!filters) return apply();
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
