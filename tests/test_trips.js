const assert = require("assert");
const { open } = require("../trips.js");

function memory() {
  let value = "";
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
}

const trips = open(memory());
assert.deepStrictEqual(trips.list(), []);

const created = trips.save({ name: "  סופ״ש בקסטל  ", campId: 14987, trailIds: [5532, 5532, "113447", 1, 2, 3] });
assert.ok(created.id);
assert.strictEqual(created.draft, false);
assert.strictEqual(created.place.view, "routes");
assert.strictEqual(created.place.dinner, null);
assert.strictEqual(created.place.rise, null);
assert.strictEqual(created.name, "סופ״ש בקסטל");
assert.strictEqual(created.campId, 14987);
assert.deepStrictEqual(created.trailIds, [5532, 113447, 1, 2]);
assert.strictEqual(trips.list().length, 1);

const updated = trips.save({ id: created.id, name: "קסטל ועין חמד", campId: 14987, trailIds: [5532] });
assert.strictEqual(updated.id, created.id);
assert.strictEqual(updated.name, "קסטל ועין חמד");
assert.deepStrictEqual(updated.trailIds, [5532]);
assert.strictEqual(trips.list().length, 1);
assert.strictEqual(updated.createdAt, created.createdAt);

const other = trips.save({ name: "", campId: 10, trailIds: [] });
assert.strictEqual(other.name, "טיול בלי שם");
assert.strictEqual(trips.list()[0].id, other.id);

assert.strictEqual(trips.save({ name: "בלי חניון", trailIds: [] }), null);
assert.strictEqual(trips.get(created.id).name, "קסטל ועין חמד");

const path = trips.sharePath(updated);
assert.ok(path.startsWith("trip.html?"));
assert.ok(path.includes("camp=14987"));
assert.ok(path.includes("trails=5532"));
assert.ok(path.includes("name="));
assert.ok(!path.includes("trip="));
assert.ok(trips.editPath(updated).includes(`trip=${created.id}`));

const draft = trips.save({
  name: "טיוטה",
  campId: 1,
  trailIds: [5],
  draft: true,
  place: { view: "detail", focusId: 5, arrival: 15 * 60, radius: 40 },
});
assert.strictEqual(draft.draft, true);
assert.strictEqual(draft.place.focusId, 5);
assert.strictEqual(draft.place.arrival, 900);
const sharedDraft = trips.sharePath(draft);
assert.ok(sharedDraft.includes("view=detail"));
assert.ok(sharedDraft.includes("focus=5"));
assert.ok(sharedDraft.includes("arrival=900"));
assert.ok(sharedDraft.includes("radius=40"));
assert.ok(!sharedDraft.includes("trip="));
assert.ok(trips.editPath(draft).includes(`trip=${draft.id}`));
assert.ok(trips.editPath(draft).includes("view=detail"));
const kept = trips.save({ id: draft.id, name: "טיוטה", campId: 1, trailIds: [5] });
assert.strictEqual(kept.draft, true);
assert.strictEqual(kept.place.view, "detail");
const committed = trips.save({ id: draft.id, name: "שמור", campId: 1, trailIds: [5], draft: false });
assert.strictEqual(committed.draft, false);
assert.ok(!trips.sharePath({ campId: 3, trailIds: [1], name: "רגיל" }).includes("view="));
const timed = trips.save({
  name: "שעות",
  campId: 4,
  trailIds: [9],
  place: { arrival: 16 * 60 + 20, dinner: 19 * 60 + 30, rise: 6 * 60 + 30, hikes: { 9: 8 * 60 } },
});
assert.strictEqual(timed.place.arrival, 980);
assert.strictEqual(timed.place.dinner, 19 * 60 + 30);
assert.strictEqual(timed.place.hikes[9], 8 * 60);
const timedPath = trips.sharePath(timed);
assert.ok(timedPath.includes("arrival=980"));
assert.ok(timedPath.includes("dinner=1170"));
assert.ok(timedPath.includes("rise=390"));
assert.ok(timedPath.includes("hikes=9%3A480") || timedPath.includes("hikes=9:480"));
const ordered = trips.save({
  name: "סדר",
  campId: 8,
  trailIds: [3, 4],
  place: { order: [4, "stay", 3, 3, "nope"] },
});
assert.deepStrictEqual(ordered.place.order, [4, "stay", 3]);
const orderedPath = trips.sharePath(ordered);
assert.ok(orderedPath.includes("order=4%2Cstay%2C3") || orderedPath.includes("order=4,stay,3"));
assert.ok(!trips.sharePath({
  campId: 8,
  trailIds: [3],
  name: "רגיל",
  place: { order: ["stay", 3] },
}).includes("order="));
const datedTrip = trips.save({
  name: "תאריכים",
  campId: 9,
  trailIds: [],
  place: { from: "2026-10-16", to: "2026-10-18", back: 11 * 60 },
});
assert.strictEqual(datedTrip.place.from, "2026-10-16");
assert.strictEqual(datedTrip.place.to, "2026-10-18");
assert.strictEqual(datedTrip.place.back, 11 * 60);
const datedPath = trips.sharePath(datedTrip);
assert.ok(datedPath.includes("from=2026-10-16"));
assert.ok(datedPath.includes("to=2026-10-18"));
assert.ok(datedPath.includes("back=660"));
const cupped = trips.save({
  name: "קפה",
  campId: 9,
  trailIds: [],
  place: {
    coffee: ["o12", "nope", "o12", "o13", "o14"],
    stops: { o12: 8 * 60 + 15, bad: 10 },
    order: ["c:o12", "stay", "c:o99"],
    view: "coffee",
    spot: "o12",
  },
});
assert.deepStrictEqual(cupped.place.coffee, ["o12", "o13"]);
assert.strictEqual(cupped.place.view, "coffee");
assert.strictEqual(cupped.place.spot, "o12");
assert.deepStrictEqual(cupped.place.stops, { o12: 8 * 60 + 15 });
assert.deepStrictEqual(cupped.place.order, ["c:o12", "stay", "c:o99"]);
const cuppedPath = trips.sharePath(cupped);
assert.ok(cuppedPath.includes("view=coffee"));
assert.ok(cuppedPath.includes("spot=o12"));
assert.ok(cuppedPath.includes("coffee=o12%2Co13") || cuppedPath.includes("coffee=o12,o13"));
assert.ok(cuppedPath.includes("stops=o12%3A495") || cuppedPath.includes("stops=o12:495"));
const hosted = trips.save({
  name: "ביקור",
  campId: 9,
  trailIds: [],
  place: {
    visit: ["r1877", "nope", "r1877", "r2", "r3"],
    spot: "r1877",
    view: "visit",
    stops: { r1877: 9 * 60, o12: 8 * 60 },
    order: ["stay", "v:r1877", "v:r99"],
  },
});
assert.deepStrictEqual(hosted.place.visit, ["r1877", "r2"]);
assert.strictEqual(hosted.place.spot, "r1877");
assert.strictEqual(hosted.place.view, "visit");
assert.deepStrictEqual(hosted.place.stops, { r1877: 9 * 60, o12: 8 * 60 });
assert.deepStrictEqual(hosted.place.order, ["stay", "v:r1877", "v:r99"]);
const hostedPath = trips.sharePath(hosted);
assert.ok(hostedPath.includes("visit=r1877%2Cr2") || hostedPath.includes("visit=r1877,r2"));
assert.ok(hostedPath.includes("spot=r1877"));
const springStop = trips.save({
  name: "מעיין",
  campId: 9,
  trailIds: [],
  place: {
    visit: ["o5", "nope", "o5"],
    view: "visit",
    spot: "o5",
    order: ["stay", "v:o5"],
  },
});
assert.deepStrictEqual(springStop.place.visit, ["o5"]);
assert.strictEqual(springStop.place.spot, "o5");
assert.deepStrictEqual(springStop.place.order, ["stay", "v:o5"]);
assert.ok(trips.sharePath(springStop).includes("visit=o5"));
const swapped = trips.save({
  name: "הפוך",
  campId: 9,
  trailIds: [],
  place: { from: "2026-10-18", to: "2026-10-16" },
});
assert.strictEqual(swapped.place.from, "2026-10-18");
assert.strictEqual(swapped.place.to, "2026-10-19");

trips.remove(created.id);
assert.strictEqual(trips.get(created.id), null);
assert.strictEqual(trips.list().length, 9);

const broken = open({
  get: () => "{",
  set: () => {},
});
assert.deepStrictEqual(broken.list(), []);

console.log("saved trips ok");
