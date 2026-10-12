const assert = require("assert");
const { buildPlans, nearbyChoices, aroundCount, planUrl, lengthIsUsable, buildItinerary, retimedHours, centerOrigin, tripStages, trailLures, comingWeekend, tripDates, moveTripDates, moveOrder, storyPath } = require("../plan.js");

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
const deerLine = storyPath(liveTrails.find((trail) => trail.id === 62558), liveCamps.find((camp) => camp.id === 16959));
assert.ok(deerLine.length > 5, "a hovered trail can be drawn from its recorded line");

console.log(`plan filters ok (${open.length} open weekends, ${familyEasy.length} family)`);
