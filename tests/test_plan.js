const assert = require("assert");
const { buildPlans, planUrl } = require("../plan.js");

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

console.log(`plan filters ok (${open.length} open weekends, ${familyEasy.length} family)`);
