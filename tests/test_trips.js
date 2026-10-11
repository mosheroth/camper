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

trips.remove(created.id);
assert.strictEqual(trips.get(created.id), null);
assert.strictEqual(trips.list().length, 1);

const broken = open({
  get: () => "{",
  set: () => {},
});
assert.deepStrictEqual(broken.list(), []);

console.log("saved trips ok");
