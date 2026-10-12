const assert = require("assert");
const { buildPlans, nearbyChoices, aroundCount, planUrl, lengthIsUsable, buildItinerary, retimedHours, centerOrigin, regionOrigin, tripStages, trailLures, comingWeekend, tripDates, moveTripDates, moveOrder, normalizeOrder, storyPath, nearbyList, nearbyPlaces, shareMessage, visitMinutes, visitPlaceId, placeTags, travelMinutes, onTheWay } = require("../plan.js");

const trails = [
  {
    id: 1,
    name: "מסלול משפחתי מעגלי",
    difficulties: ["easy"],
    difficulty: "easy",
    circular: true,
    hoursMin: 2,
    hoursMax: 2,
    family: true,
    timeFlags: ["half"],
  },
  {
    id: 2,
    name: "ערוץ מאתגר",
    difficulties: ["challenging"],
    difficulty: "challenging",
    circular: "partial",
    hoursMin: 5,
    hoursMax: 6,
    family: false,
    timeFlags: ["full"],
  },
  {
    id: 3,
    name: "טיול בלי זמן",
    difficulties: ["easy"],
    difficulty: "easy",
    circular: true,
    hoursMin: null,
    hoursMax: null,
    family: true,
    timeFlags: ["half"],
  },
];

const camps = [
  {
    id: 10,
    name: "חניון צפוני",
    paid: true,
    regions: ["north"],
    facilities: [{ id: "water" }, { id: "toilet" }],
    nearby: [
      { id: 1, km: 12 },
      { id: 2, km: 4 },
    ],
  },
  {
    id: 11,
    name: "חניון דרומי",
    paid: false,
    regions: ["south"],
    facilities: [{ id: "fire" }],
    nearby: [{ id: 3, km: null }],
  },
];

const base = {
  region: "all",
  lodging: "all",
  difficulty: "all",
  time: "all",
  family: false,
  circular: false,
  water: false,
  toilet: false,
  query: "",
};

const familyCircular = buildPlans(camps, trails, {
  ...base,
  family: true,
  circular: true,
  difficulty: "easy",
  time: "h3",
});
assert.strictEqual(familyCircular.length, 1);
assert.strictEqual(familyCircular[0].camp.id, 10);
assert.strictEqual(familyCircular[0].trails[0].trail.id, 1);

const south = buildPlans(camps, trails, { ...base, region: "south", time: "h3" });
assert.strictEqual(south.length, 0);

const halfUnknown = buildPlans(camps, trails, { ...base, region: "south", time: "half" });
assert.strictEqual(halfUnknown.length, 1);
assert.strictEqual(halfUnknown[0].trails[0].trail.id, 3);

const water = buildPlans(camps, trails, { ...base, water: true });
assert.ok(water.every((plan) => plan.camp.id === 10));

const named = buildPlans(camps, trails, { ...base, query: "ערוץ" });
assert.strictEqual(named.length, 1);
assert.strictEqual(named[0].trails[0].trail.id, 2);

const fs = require("fs");
const path = require("path");
const liveCamps = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/camps.json"), "utf8"));
const liveTrails = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/trails.json"), "utf8"));
const open = buildPlans(liveCamps, liveTrails, base);
assert.ok(open.length >= 15, "expected weekend plans from the scanned catalog");
open.forEach((plan) => {
  assert.ok(plan.trails.length >= 1 && plan.trails.length <= 2);
});

const familyEasy = buildPlans(liveCamps, liveTrails, {
  ...base,
  difficulty: "easy",
  family: true,
  circular: true,
  time: "half",
});
assert.ok(familyEasy.length >= 1, "expected an easy circular family weekend");
familyEasy.forEach((plan) => {
  plan.trails.forEach(({ trail }) => {
    assert.strictEqual(trail.family, true);
    assert.strictEqual(trail.circular, true);
    assert.strictEqual(trail.difficulty, "easy");
    assert.ok(trail.hoursMax == null || trail.hoursMax <= 5);
  });
});

assert.strictEqual(planUrl(10, [1, 2]), "trip.html?camp=10&trails=1%2C2");

const choices = nearbyChoices(
  { nearby: [{ id: 2, km: 5 }, { id: 1, km: 1.2 }, { id: 9, km: 3 }] },
  trails,
);
assert.deepStrictEqual(choices.map((item) => item.trail.id), [1, 2]);
assert.strictEqual(choices[0].km, 1.2);

const castel = liveCamps.find((camp) => camp.id === 14987);
const aroundCastel = nearbyChoices(castel, liveTrails).filter((item) => item.km != null && item.km <= 20);
assert.ok(aroundCastel.length >= 10, "Castel should have many trails within 20 km");
assert.strictEqual(aroundCount(castel).close, aroundCastel.length);
assert.ok(aroundCount(castel).wide >= aroundCount(castel).close);
assert.deepStrictEqual(aroundCount({ nearby: [{ km: 4 }, { km: 28 }, { km: null }] }), { close: 1, wide: 3 });
assert.deepStrictEqual(aroundCount(null), { close: 0, wide: 0 });
assert.strictEqual(lengthIsUsable({ kmMax: 40, hoursMax: 1.5 }), false);
assert.strictEqual(lengthIsUsable({ kmMax: 800, hoursMax: 2 }), false);
assert.strictEqual(lengthIsUsable({ kmMax: 6, hoursMax: 3 }), true);
assert.strictEqual(lengthIsUsable({ kmMin: 2, kmMax: 4 }), true);

const origin = { lat: 32.07, lng: 34.8 };
const lake = { name: "חניון לילה האגם", lat: 32.72, lng: 35.01 };
const twoHours = { name: "אנדרטת הנסיכים", hoursMin: 2, hoursMax: 2 };
const oneHour = { name: "נחל קצר", hoursMin: 1, hoursMax: 1 };
const evening = buildItinerary({ camp: lake, trails: [twoHours], arrivalMinutes: 17 * 60, origin });
const depart = evening.find((step) => step.kind === "depart");
const hike = evening.find((step) => step.kind === "hike");
const lunch = evening.find((step) => step.kind === "lunch");
assert.ok(depart.drive >= 60 && depart.drive <= 150);
assert.strictEqual(depart.at + depart.drive, 17 * 60);
assert.strictEqual(evening.find((step) => step.kind === "breakfast").at, 7 * 60 + 30);
assert.strictEqual(hike.at, 8 * 60);
assert.strictEqual(hike.back, 10 * 60);
assert.strictEqual(lunch.at, 10 * 60 + 30);
assert.strictEqual(evening.find((step) => step.kind === "return").fromLookout, false);

const longer = buildItinerary({
  camp: lake,
  trails: [twoHours, oneHour],
  arrivalMinutes: 17 * 60,
  origin,
});
assert.strictEqual(longer.filter((step) => step.kind === "hike")[1].back, 11 * 60);
assert.strictEqual(longer.find((step) => step.kind === "lunch").at, 11 * 60 + 30);

const openEnded = buildItinerary({
  camp: lake,
  trails: [{ name: "בלי זמן", hoursMax: null }],
  arrivalMinutes: 15 * 60,
  origin,
});
assert.strictEqual(openEnded.find((step) => step.kind === "hike").back, null);
assert.strictEqual(openEnded.find((step) => step.kind === "lunch").at, null);

const noTrail = buildItinerary({ camp: lake, trails: [], arrivalMinutes: 19 * 60, origin });
assert.ok(noTrail.some((step) => step.kind === "breakfast"));
assert.ok(noTrail.some((step) => step.kind === "need-hike"));
assert.strictEqual(noTrail.find((step) => step.kind === "arrive").at, 19 * 60);

const unplaced = buildItinerary({
  camp: { name: "בלי נקודה" },
  trails: [twoHours],
  arrivalMinutes: 17 * 60,
  origin,
});
assert.strictEqual(unplaced.find((step) => step.kind === "depart").at, null);

const early = buildItinerary({
  camp: lake,
  trails: [{ id: 5, name: "ראשון", hoursMin: 2, hoursMax: 2 }, { id: 6, name: "שני", hoursMin: 1, hoursMax: 1 }],
  arrivalMinutes: 17 * 60,
  origin,
  hours: { rise: 6 * 60, start: 7 * 60, dinner: 20 * 60, hikes: { 6: 12 * 60 } },
});
assert.strictEqual(early.find((step) => step.kind === "rise").at, 6 * 60);
assert.strictEqual(early.find((step) => step.kind === "dinner").at, 20 * 60);
assert.strictEqual(early.filter((step) => step.kind === "hike")[0].at, 7 * 60);
assert.strictEqual(early.filter((step) => step.kind === "hike")[1].at, 12 * 60);
assert.strictEqual(early.find((step) => step.kind === "lunch").at, 13 * 60 + 30);

const shifted = retimedHours({
  hours: {},
  arrival: 17 * 60,
  step: { kind: "rise", at: 7 * 60 },
  next: 6 * 60 + 30,
  trailIds: [5, 6],
});
assert.strictEqual(shifted.hours.rise, 6 * 60 + 30);
assert.strictEqual(shifted.hours.breakfast, null);
assert.strictEqual(shifted.hours.start, 7 * 60 + 30);
assert.strictEqual(shifted.arrival, 17 * 60);
const movedBreakfast = retimedHours({
  hours: { breakfast: 7 * 60 + 30 },
  arrival: 17 * 60,
  step: { kind: "breakfast", at: 7 * 60 + 30 },
  next: 8 * 60,
  trailIds: [],
});
assert.strictEqual(movedBreakfast.hours.breakfast, 8 * 60);
assert.strictEqual(movedBreakfast.hours.start, null);
const movedHike = retimedHours({
  hours: { lunch: 11 * 60 },
  arrival: 17 * 60,
  step: { kind: "hike", at: 10 * 60, trailId: 6 },
  next: 10 * 60 + 30,
  trailIds: [5, 6],
});
assert.strictEqual(movedHike.hours.hikes[6], 10 * 60 + 30);
assert.strictEqual(movedHike.hours.lunch, 11 * 60 + 30);
assert.strictEqual(movedHike.hours.start, null);
assert.strictEqual(evening.find((step) => step.kind === "depart").block, "road");
assert.strictEqual(evening.find((step) => step.kind === "arrive").block, "road");
assert.strictEqual(evening.find((step) => step.kind === "breakfast").block, "stay");
assert.strictEqual(
  evening.find((step) => step.kind === "hike").block,
  evening.find((step) => step.kind === "lunch").block,
);

const firstHike = buildItinerary({
  camp: lake,
  trails: [{ id: 5, name: "נחל קצר", hoursMin: 2, hoursMax: 2 }],
  arrivalMinutes: 17 * 60,
  origin,
  order: [5, "stay"],
});
const flippedDepart = firstHike.find((step) => step.kind === "depart");
const flippedHike = firstHike.find((step) => step.kind === "hike");
const flippedArrive = firstHike.find((step) => step.kind === "arrive");
assert.strictEqual(flippedDepart.toward, "hike");
assert.ok(firstHike.indexOf(flippedHike) < firstHike.indexOf(flippedArrive));
assert.strictEqual(flippedHike.beforeStay, true);
assert.strictEqual(flippedHike.part, "out");
assert.strictEqual(flippedArrive.block, "stay");
assert.strictEqual(flippedHike.at, 17 * 60 - 30 - 120);
assert.strictEqual(flippedDepart.at + flippedDepart.drive, flippedHike.at);
assert.strictEqual(firstHike.find((step) => step.kind === "lunch"), undefined);
assert.strictEqual(firstHike.find((step) => step.kind === "breakfast").at, 7 * 60 + 30);
const slid = retimedHours({
  hours: {},
  arrival: 17 * 60,
  step: flippedDepart,
  next: 8 * 60,
  trailIds: [5],
  order: [5, "stay"],
});
assert.strictEqual(slid.arrival, 17 * 60 + (8 * 60 - flippedDepart.at));
assert.strictEqual(slid.hours.rise, null);
const slidHike = retimedHours({
  hours: {},
  arrival: 17 * 60,
  step: flippedHike,
  next: flippedHike.at + 60,
  trailIds: [5],
  order: [5, "stay"],
});
assert.strictEqual(slidHike.arrival, 18 * 60);
assert.strictEqual(slidHike.hours.hikes[5], undefined);
const ignored = buildItinerary({
  camp: lake,
  trails: [{ id: 5, name: "נחל", hoursMin: 1, hoursMax: 1 }],
  arrivalMinutes: 17 * 60,
  origin,
  order: [99, "stay"],
});
assert.strictEqual(ignored.find((step) => step.kind === "hike").beforeStay, false);
assert.strictEqual(ignored.find((step) => step.kind === "arrive").block, "road");

const dated = buildItinerary({
  camp: lake,
  trails: [twoHours],
  arrivalMinutes: 17 * 60,
  origin,
  from: "2026-10-16",
  to: "2026-10-17",
});
assert.strictEqual(dated.find((step) => step.kind === "depart").day, "יום ו׳ 16.10");
assert.strictEqual(dated.find((step) => step.kind === "breakfast").day, "יום ש׳ 17.10");
assert.strictEqual(dated.find((step) => step.kind === "hike").day, "יום ש׳ 17.10");
const leave = dated.find((step) => step.kind === "return");
const home = dated.find((step) => step.kind === "home");
assert.strictEqual(leave.day, "יום ש׳ 17.10");
assert.strictEqual(leave.at, dated.find((step) => step.kind === "lunch").at + 30);
assert.strictEqual(home.at, leave.at + leave.drive);
assert.strictEqual(home.day, "יום ש׳ 17.10");
const later = retimedHours({
  hours: {},
  arrival: 17 * 60,
  step: leave,
  next: 15 * 60,
  trailIds: [],
});
assert.strictEqual(later.hours.back, 15 * 60);
assert.strictEqual(later.arrival, 17 * 60);
const held = buildItinerary({
  camp: lake,
  trails: [],
  arrivalMinutes: 17 * 60,
  origin,
  from: "2026-10-15",
  to: "2026-10-18",
});
assert.strictEqual(held.find((step) => step.kind === "rise").day, "יום ו׳ 16.10");
assert.strictEqual(held.find((step) => step.kind === "return").day, "יום א׳ 18.10");
assert.strictEqual(held.find((step) => step.kind === "return").at, 11 * 60);
assert.strictEqual(held.find((step) => step.kind === "return").nights, 3);
assert.deepStrictEqual(comingWeekend("2026-10-12"), { from: "2026-10-16", to: "2026-10-17" });
assert.deepStrictEqual(comingWeekend("2026-10-16"), { from: "2026-10-16", to: "2026-10-17" });
assert.deepStrictEqual(comingWeekend("2026-10-17"), { from: "2026-10-23", to: "2026-10-24" });
assert.deepStrictEqual(tripDates("2026-10-18", "2026-10-16"), { from: "2026-10-18", to: "2026-10-19", nights: 1 });
assert.deepStrictEqual(moveTripDates("2026-10-16", "2026-10-18", "2026-10-23", null), { from: "2026-10-23", to: "2026-10-25" });

const centers = centerOrigin([
  { lat: 32, lng: 34.7, regions: ["center"] },
  { lat: 32.2, lng: 34.9, regions: ["center"] },
  { lat: 33, lng: 35.5, regions: ["north"] },
]);
assert.strictEqual(centers.lat, 32.1);
assert.strictEqual(centers.lng, 34.8);

const swiss = liveTrails.find((trail) => trail.id === 62571);
const lakeCamp = liveCamps.find((camp) => camp.id === 342394);
const story = tripStages(lakeCamp, [swiss]);
assert.strictEqual(story.stages[0].title, "מגיעים לחניון לילה");
assert.strictEqual(story.stages[0].n, 1);
assert.strictEqual(story.paths.length, 1);
const lats = story.paths[0].line.map((point) => point[0]);
assert.ok(Math.max(...lats) < 32.76, "the trip line stays on the selected hike");
assert.ok(story.stages.filter((stage) => stage.trailId === 62571).every((stage) => stage.lat < 32.76));
assert.strictEqual(story.stages.find((stage) => stage.kind === "depart-hike").title, "יוצאים לטיול");
assert.strictEqual(story.stages.find((stage) => stage.kind === "far").title, "סוף המסלול");
assert.ok(story.stages.filter((stage) => stage.kind !== "arrive").length <= 3);
const pointTrail = { id: 5, name: "נחל", lat: 32.73, lng: 35.02 };
const flippedStages = tripStages(lake, [pointTrail], [5, "stay"]);
assert.strictEqual(flippedStages.stages[0].kind, "depart-hike");
assert.strictEqual(flippedStages.stages[0].n, 1);
assert.strictEqual(flippedStages.stages[flippedStages.stages.length - 1].kind, "arrive");
assert.ok(flippedStages.stages.at(-1).text.includes("אחרי המסלול"));

assert.deepStrictEqual(trailLures(swiss), ["לילדים", "מוצל", "נוף מהמם"]);
assert.deepStrictEqual(trailLures({
  name: "נחל יבש",
  blurb: "הליכה לאורך הנחל. יש מים לשתייה.",
  family: false,
  details: { highlights: ["נחל"] },
}), []);
assert.deepStrictEqual(trailLures({
  name: "הר אמיר",
  details: { snippet: "מעין גן שעשועים גיאולוגי" },
}), []);
assert.deepStrictEqual(trailLures({
  name: "נחל חרוד",
  details: { snippet: "הכולל גן שעשועים, שבילים ופרגולות" },
}), ["פארק שעשועים"]);
assert.deepStrictEqual(trailLures({
  name: "אל הירוק",
  blurb: "בעונה הנכונה הוא גם די רטוב, בדרך אל המעיין.",
}), ["מסלול רטוב"]);

const homeCamps = [
  { id: 1, name: "בית", lat: 32.1, lng: 34.8, regions: ["center"], nearby: [{ id: 1, km: 8 }] },
  { id: 2, name: "רחוק", lat: 33.2, lng: 35.6, regions: ["north"], nearby: [{ id: 1, km: 1 }] },
];
const byTrail = buildPlans(homeCamps, [trails[0]], base);
assert.deepStrictEqual(byTrail.map((plan) => plan.camp.id), [2, 1]);
assert.strictEqual(byTrail[0].homeMinutes, null);
const byHome = buildPlans(homeCamps, [trails[0]], { ...base, home: "center" });
assert.deepStrictEqual(byHome.map((plan) => plan.camp.id), [1, 2]);
assert.ok(byHome[0].homeMinutes < byHome[1].homeMinutes);

const weekend = { ...base, region: "all", lodging: "all", difficulty: "all", time: "all" };
const shaded = buildPlans(liveCamps, liveTrails, { ...weekend, shade: true });
assert.ok(shaded.length > 0 && shaded.length < open.length - 20);
shaded.forEach((plan) => plan.trails.forEach(({ trail, km }) => {
  assert.ok(trailLures(trail).includes("מוצל"));
  assert.ok(km != null && km <= 20);
}));
const wet = buildPlans(liveCamps, liveTrails, { ...weekend, wet: true });
assert.ok(wet.length > 0 && wet.length < open.length);
wet.forEach((plan) => plan.trails.forEach(({ trail, km }) => {
  assert.ok(trailLures(trail).includes("מסלול רטוב"));
  assert.ok(km != null && km <= 20);
}));
const views = buildPlans(liveCamps, liveTrails, { ...weekend, view: true });
assert.ok(views.length > 0 && views.length < open.length);
views.forEach((plan) => plan.trails.forEach(({ km }) => assert.ok(km != null && km <= 20)));
const beside = buildPlans(liveCamps, liveTrails, { ...weekend, close: true });
assert.ok(beside.length > 0 && beside.length < open.length);
beside.forEach((plan) => plan.trails.forEach(({ km }) => assert.ok(km <= 5)));
const showers = buildPlans(liveCamps, liveTrails, { ...weekend, shower: true });
assert.ok(showers.length >= 1 && showers.length < open.length);
showers.forEach((plan) => assert.ok(plan.camp.facilities.some((item) => item.id === "shower")));
const fires = buildPlans(liveCamps, liveTrails, { ...weekend, fire: true });
assert.ok(fires.length >= 1 && fires.length < open.length);
const fromCenter = buildPlans(liveCamps, liveTrails, { ...weekend, home: "center" });
assert.ok(fromCenter[0].homeMinutes <= fromCenter.at(-1).homeMinutes);
assert.notStrictEqual(fromCenter[0].camp.id, 14987);

assert.deepStrictEqual(moveOrder(["stay", 1, 2], [1, 2], "stay", 1, true), [1, "stay", 2]);
assert.deepStrictEqual(moveOrder(["stay", 1, 2], [1, 2], 2, 1, false), ["stay", 2, 1]);
assert.deepStrictEqual(moveOrder([1, "stay"], [1], 1, "stay", true), ["stay", 1]);
assert.strictEqual(moveOrder(["stay", 1], [1], "stay", 1, false), null);
assert.strictEqual(moveOrder(["stay", 1], [1], 9, "stay", true), null);
const nearItems = [
  { km: 4, trail: { id: 1, name: "רחוק קל", difficulty: "easy", hoursMax: 5, family: false, circular: false } },
  { km: 1, trail: { id: 2, name: "קרוב ארוך", difficulty: "challenging", hoursMax: 6, family: true, circular: true } },
  { km: 2, trail: { id: 3, name: "קצר", difficulty: "moderate", hoursMax: 2, family: false, circular: true } },
];
assert.deepStrictEqual(nearbyList(nearItems, {}, "near").map((item) => item.trail.id), [2, 3, 1]);
assert.deepStrictEqual(nearbyList(nearItems, {}, "short").map((item) => item.trail.id), [3, 1, 2]);
assert.deepStrictEqual(nearbyList(nearItems, {}, "easy").map((item) => item.trail.id), [1, 3, 2]);
assert.deepStrictEqual(nearbyList(nearItems, { family: true }, "near").map((item) => item.trail.id), [2]);
assert.deepStrictEqual(nearbyList(nearItems, { time: "h3" }, "near").map((item) => item.trail.id), [3]);
const placeCamp = { id: 1, name: "חניון", lat: 32, lng: 35 };
const placeSpots = [
  { id: "a", name: "א", kind: "spring", lat: 32.01, lng: 35 },
  { id: "b", name: "ב", kind: "spring", lat: 32.02, lng: 35 },
  { id: "c", name: "ג", kind: "spring", lat: 32.03, lng: 35 },
  { id: "d", name: "ד", kind: "spring", lat: 32.04, lng: 35 },
  { id: "e", name: "ה", kind: "viewpoint", lat: 32.05, lng: 35 },
  { id: "far", name: "רחוק", kind: "peak", lat: 32.3, lng: 35 },
  { id: "same", name: "חניון", kind: "park", lat: 32, lng: 35 },
];
assert.deepStrictEqual(
  nearbyPlaces(placeCamp, placeSpots, { maxKm: 15, perKind: 3 }).map((item) => item.place.id),
  ["a", "b", "c", "e", "d"],
);
assert.deepStrictEqual(
  nearbyPlaces(placeCamp, placeSpots, { maxKm: 15, kind: "spring" }).map((item) => item.place.id),
  ["a", "b", "c", "d"],
);
assert.ok(nearbyPlaces(placeCamp, placeSpots, { maxKm: 15 }).every((item) => item.km <= 15));
const livePlaces = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/places.json"), "utf8"));
const carmelPlaces = nearbyPlaces(
  liveCamps.find((camp) => camp.id === 16959),
  livePlaces,
  { maxKm: 15, varied: false },
);
assert.ok(carmelPlaces.some((item) => item.place.kind === "spring" && item.place.source === "osm"));
assert.ok(carmelPlaces.some((item) => item.place.source === "inpa" && item.km < 1));
assert.ok(liveTrails.some((trail) => trail.id === 295240));
const deerLine = storyPath(liveTrails.find((trail) => trail.id === 62558), liveCamps.find((camp) => camp.id === 16959));
assert.ok(deerLine.length > 5, "a hovered trail can be drawn from its recorded line");

const shared = shareMessage({
  name: "סופ״ש בכרמל",
  camp: {
    id: 1,
    name: "חניון לילה הקסטל",
    url: "https://www.parks.org.il/camp",
    lat: 31.8,
    lng: 35.1,
    regions: ["center"],
  },
  trails: [{
    id: 9,
    name: "עין חמד – מסלול קצר",
    url: "https://www.parks.org.il/trail",
    hoursMin: 2,
    hoursMax: 2,
    lat: 31.8,
    lng: 35.11,
  }],
  arrivalMinutes: 17 * 60,
  origin: { lat: 32.1, lng: 34.8 },
  from: "2026-10-16",
  to: "2026-10-17",
  url: "https://example.com/trip.html?camp=1",
});
assert.ok(shared.startsWith("בניתי לנו מסלול עם קמפינג\n"));
assert.ok(shared.includes("סופ״ש בכרמל"));
assert.ok(shared.includes("חניון לילה הקסטל\nhttps://www.parks.org.il/camp"));
assert.ok(shared.includes("לוז"));
assert.ok(shared.includes("17:00  מגיעים לחניון"));
assert.ok(shared.includes("עין חמד\nhttps://www.parks.org.il/trail") || shared.includes("עין חמד · הליכה כשעתיים\nhttps://www.parks.org.il/trail"));
assert.ok(shared.includes("הטיול במפה: https://example.com/trip.html?camp=1"));
assert.ok(shared.indexOf("https://www.parks.org.il/camp") < shared.indexOf("לוז"));

const lookout = { id: "o9", name: "מצפור הר ברך", lat: 32.73, lng: 35.02, url: "https://www.openstreetmap.org/node/9" };
const cup = buildItinerary({
  camp: lake,
  trails: [],
  coffees: [lookout],
  arrivalMinutes: 17 * 60,
  origin,
});
const coffeeStop = cup.find((step) => step.kind === "coffee");
assert.strictEqual(coffeeStop.at, 8 * 60);
assert.strictEqual(coffeeStop.back, 8 * 60 + 30);
assert.strictEqual(coffeeStop.block, "coffee:o9");
assert.strictEqual(cup.find((step) => step.kind === "lunch").at, 9 * 60);
assert.strictEqual(cup.find((step) => step.kind === "return").fromLookout, true);
assert.ok(!cup.some((step) => step.kind === "need-hike"));
const earlyCup = buildItinerary({
  camp: lake,
  trails: [],
  coffees: [lookout],
  arrivalMinutes: 17 * 60,
  origin,
  order: ["c:o9", "stay"],
});
assert.strictEqual(earlyCup.find((step) => step.kind === "coffee").travel, 15);
assert.strictEqual(earlyCup.find((step) => step.kind === "coffee").at, 16 * 60 + 15);
assert.strictEqual(earlyCup.find((step) => step.kind === "depart").toward, "coffee");
const withHike = buildItinerary({
  camp: lake,
  trails: [{ id: 5, name: "נחל", hoursMin: 1, hoursMax: 1 }],
  coffees: [lookout],
  arrivalMinutes: 17 * 60,
  origin,
});
assert.strictEqual(withHike.find((step) => step.kind === "hike").at, 8 * 60);
assert.strictEqual(withHike.find((step) => step.kind === "coffee").at, 9 * 60);
assert.strictEqual(withHike.find((step) => step.kind === "lunch").at, 10 * 60);
assert.deepStrictEqual(normalizeOrder(["c:o1", "stay", "c:o2"], [], ["o1"]), ["c:o1", "stay"]);
assert.deepStrictEqual(normalizeOrder(["stay", "c:o3"], []), ["stay", "c:o3"]);
assert.deepStrictEqual(moveOrder(["stay", "c:o1", 2], [2], "c:o1", "stay", false), ["c:o1", "stay", 2]);
assert.deepStrictEqual(moveOrder(null, [2], "v:r9", "stay", false, [], ["r9"]), ["v:r9", "stay", 2]);
assert.deepStrictEqual(moveOrder(null, [2], "c:o1", 2, false, ["o1"], []), ["stay", "c:o1", 2]);
assert.deepStrictEqual(moveOrder(null, [2], 2, "stay", false, ["o1"], ["r9"]), [2, "stay", "v:r9", "c:o1"]);
const movedCup = retimedHours({
  hours: {},
  arrival: 17 * 60,
  step: coffeeStop,
  next: 8 * 60 + 30,
  trailIds: [],
  coffeeIds: ["o9"],
});
assert.strictEqual(movedCup.hours.start, 8 * 60 + 30);
assert.strictEqual(movedCup.hours.coffeeAt.o9, undefined);
const coffeeStages = tripStages(lake, [], ["stay", "c:o9"], [lookout]);
assert.strictEqual(coffeeStages.stages.find((stage) => stage.kind === "coffee").title, "תצפית לקפה");
assert.strictEqual(coffeeStages.stages.find((stage) => stage.kind === "coffee").lat, 32.73);
const sharedCup = shareMessage({
  camp: lake,
  trails: [],
  coffees: [lookout],
  arrivalMinutes: 17 * 60,
  origin,
  from: "2026-10-16",
  to: "2026-10-17",
});
assert.ok(sharedCup.includes("08:00  תצפית לקפה · מצפור הר ברך"));
assert.ok(sharedCup.includes("https://www.openstreetmap.org/node/9"));

const haiBar = {
  id: "r1877",
  name: "שמורת טבע חי בר בכרמל",
  lat: 32.75,
  lng: 35.01,
  url: "https://www.parks.org.il/reserve-park/hai-bar/",
  hoursMin: null,
  hoursMax: null,
};
const visitDay = buildItinerary({
  camp: lake,
  trails: [],
  visits: [haiBar],
  arrivalMinutes: 17 * 60,
  origin,
});
const visit = visitDay.find((step) => step.kind === "visit");
assert.strictEqual(visit.at, 8 * 60);
assert.strictEqual(visit.walk, 90);
assert.strictEqual(visit.back, 9 * 60 + 30);
assert.strictEqual(visit.estimated, true);
assert.strictEqual(visitDay.find((step) => step.kind === "lunch").at, 10 * 60);
assert.strictEqual(visitDay.find((step) => step.kind === "lunch").afterOfficial, true);
assert.ok(!visitDay.some((step) => step.kind === "need-hike"));
const markedVisit = {
  id: "r9",
  name: "גן לאומי",
  lat: 32.7,
  lng: 35,
  hoursMin: 1,
  hoursMax: 2,
  duration: "עד שעתיים",
  url: "https://www.parks.org.il/reserve-park/example/",
};
assert.strictEqual(visitMinutes(markedVisit), 90);
const timedVisit = buildItinerary({
  camp: lake,
  trails: [],
  visits: [markedVisit],
  arrivalMinutes: 17 * 60,
  origin,
});
assert.strictEqual(timedVisit.find((step) => step.kind === "visit").estimated, false);
assert.deepStrictEqual(normalizeOrder(["v:r9", "stay", "c:o1"], [], ["o1"], ["r9"]), ["v:r9", "stay", "c:o1"]);
assert.deepStrictEqual(normalizeOrder(["stay"], [], [], ["r9"]), ["stay", "v:r9"]);
assert.strictEqual(visitPlaceId("v:o5"), "o5");
assert.deepStrictEqual(normalizeOrder(["stay"], [], [], ["o5"]), ["stay", "v:o5"]);
assert.strictEqual(visitMinutes({ kind: "spring", name: "עין אלון" }), 45);
assert.strictEqual(visitMinutes({ kind: "waterfall", name: "מפל" }), 60);
assert.strictEqual(visitMinutes({ kind: "peak", name: "הר" }), 30);
assert.deepStrictEqual(placeTags({ kind: "spring", name: "עין אלון" }), ["מים"]);
assert.deepStrictEqual(placeTags({ kind: "peak", name: "הר", tags: ["מונגש"] }), ["מונגש", "תצפית"]);
assert.deepStrictEqual(placeTags({ kind: "spring", name: "מערת הנחל" }), ["מים", "מערות"]);
const springDay = buildItinerary({
  camp: lake,
  trails: [],
  visits: [{ id: "o5", name: "עין אלון", kind: "spring", lat: 32.75, lng: 35.02, url: "https://www.openstreetmap.org/node/5" }],
  arrivalMinutes: 17 * 60,
  origin,
});
const springStop = springDay.find((step) => step.kind === "visit");
assert.strictEqual(springStop.walk, 45);
assert.strictEqual(springStop.official, false);
assert.strictEqual(springStop.estimated, true);
assert.strictEqual(springDay.find((step) => step.kind === "lunch").afterOfficial, false);
const sharedVisit = shareMessage({
  camp: lake,
  trails: [],
  visits: [haiBar],
  arrivalMinutes: 17 * 60,
  origin,
  from: "2026-10-16",
  to: "2026-10-17",
});
assert.ok(sharedVisit.startsWith("בניתי לנו מסלול עם קמפינג"));
assert.ok(sharedVisit.includes("08:00  ביקור · שמורת טבע חי בר בכרמל · כשעה וחצי"));
assert.ok(sharedVisit.includes(haiBar.url));
const visitStages = tripStages(lake, [], ["stay", "v:r1877"], [], [haiBar]);
assert.strictEqual(visitStages.stages.find((stage) => stage.kind === "visit").title, "ביקור");

assert.strictEqual(travelMinutes(lake, null), null);
assert.strictEqual(travelMinutes(lake, lake), 0);
const nearbyStop = { lat: 32.75, lng: 35.02 };
assert.strictEqual(travelMinutes(lake, nearbyStop), 15);
const legDay = buildItinerary({
  camp: lake,
  trails: [{ id: 5, name: "רכס קרוב", hoursMin: 2, hoursMax: 2, lat: nearbyStop.lat, lng: nearbyStop.lng }],
  arrivalMinutes: 17 * 60,
  origin,
  order: [5, "stay"],
});
const legHike = legDay.find((step) => step.kind === "hike");
assert.strictEqual(legHike.travel, 15);
assert.strictEqual(legHike.at, 17 * 60 - 15 - 120);
const secondStop = { lat: 32.9, lng: 35.2 };
const between = travelMinutes(nearbyStop, secondStop);
const twoStops = buildItinerary({
  camp: lake,
  trails: [
    { id: 5, name: "ראשון", hoursMin: 1, hoursMax: 1, lat: nearbyStop.lat, lng: nearbyStop.lng },
    { id: 6, name: "שני", hoursMin: 1, hoursMax: 1, lat: secondStop.lat, lng: secondStop.lng },
  ],
  arrivalMinutes: 17 * 60,
  origin,
});
const stopHikes = twoStops.filter((step) => step.kind === "hike");
assert.strictEqual(stopHikes[0].at, 8 * 60);
assert.ok(stopHikes[0].inbound > 0);
assert.strictEqual(stopHikes[0].travel, between);
assert.strictEqual(stopHikes[1].at, stopHikes[0].back + between);
const sharedLeg = shareMessage({
  camp: lake,
  trails: [{ id: 5, name: "רכס קרוב", hoursMin: 2, hoursMax: 2, lat: nearbyStop.lat, lng: nearbyStop.lng }],
  arrivalMinutes: 17 * 60,
  origin,
  order: [5, "stay"],
  from: "2026-10-16",
  to: "2026-10-17",
});
assert.ok(sharedLeg.includes("נסיעה של כ־15 דקות"));

const wayHome = { lat: 32, lng: 35 };
const wayCamp = { lat: 32.18, lng: 35 };
const onApproach = { lat: 32.09, lng: 35.02 };
const pastCamp = { lat: 32.27, lng: 35 };
const farSide = { lat: 32.09, lng: 35.12 };
assert.strictEqual(onTheWay(wayHome, wayCamp, onApproach), true);
assert.strictEqual(onTheWay(wayHome, wayCamp, pastCamp), false);
assert.strictEqual(onTheWay(wayHome, wayCamp, farSide), false);
assert.strictEqual(onTheWay(wayHome, wayCamp, wayCamp), false);
assert.strictEqual(onTheWay(wayHome, wayCamp, { lat: 31.9, lng: 35 }), false);
assert.strictEqual(onTheWay(null, wayCamp, onApproach), null);
assert.strictEqual(onTheWay(wayHome, wayCamp, { name: "בלי מיקום" }), null);
assert.strictEqual(onTheWay(wayHome, { lat: 32.02, lng: 35 }, onApproach), null);

const carmelCamp = liveCamps.find((item) => item.id === 16959);
const northHome = regionOrigin(liveCamps, "north");
const namedPlace = (name) => livePlaces.find((item) => item.name === name);
assert.strictEqual(onTheWay(northHome, carmelCamp, namedPlace("שמורת טבע חי בר בכרמל")), true);
assert.strictEqual(onTheWay(northHome, carmelCamp, namedPlace("עין אלון")), true);
assert.strictEqual(onTheWay(northHome, carmelCamp, namedPlace("עין קדם")), false);
assert.strictEqual(onTheWay(northHome, carmelCamp, namedPlace("פארק הכרמל")), false);

console.log(`plan filters ok (${open.length} open weekends, ${familyEasy.length} family)`);
