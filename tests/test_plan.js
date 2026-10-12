const assert = require("assert");
const { buildPlans, nearbyChoices, planUrl, lengthIsUsable, buildItinerary, retimedHours, centerOrigin, tripStages, trailLures } = require("../plan.js");

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
assert.ok(story.stages.filter((stage) => stage.kind !== "arrive").length <= 3);

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

console.log(`plan filters ok (${open.length} open weekends, ${familyEasy.length} family)`);
