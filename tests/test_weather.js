const assert = require("assert");
const { analyze, coverage, forecastUrl, load } = require("../weather.js");

const friday = [];
const probs = [];
for (let hour = 0; hour < 24; hour += 1) {
  friday.push(`2026-10-16T${String(hour).padStart(2, "0")}:00`);
  if (hour >= 6 && hour < 12) probs.push(20);
  else if (hour >= 12 && hour < 18) probs.push(70);
  else probs.push(10);
}
friday.push("2026-10-17T12:00");
probs.push(5);

const storm = analyze({
  daily: {
    time: ["2026-10-16", "2026-10-17"],
    weather_code: [95, 1],
    temperature_2m_max: [22.4, 32.2],
    temperature_2m_min: [9.2, 15.4],
    precipitation_probability_max: [66, 10],
    precipitation_sum: [12.2, 0],
    wind_speed_10m_max: [36.2, 11],
    wind_gusts_10m_max: [55, 18],
    uv_index_max: [3, 9],
  },
  hourly: { time: friday, precipitation_probability: probs },
});

assert.strictEqual(storm.days.length, 2);
assert.strictEqual(storm.days[0].emoji, "⛈️");
assert.strictEqual(storm.days[0].low, 9);
assert.strictEqual(storm.days[0].high, 22);
assert.ok(storm.days[0].afternoon);
assert.ok(storm.summary.includes("סופת רעמים ביום ו׳"));
assert.ok(storm.summary.includes("אחרי הצהריים"));
assert.ok(storm.summary.includes("רוח חזקה"));
assert.ok(storm.summary.includes("שק שינה חם"));
assert.ok(storm.days[0].line.includes("גשם 66%"));
assert.ok(storm.days[0].line.includes("רוח 36 קמ״ש"));
assert.ok(!storm.days[1].line.includes("גשם"));
assert.deepStrictEqual(storm.share.slice(0, 2), ["מזג אוויר", storm.days[0].line]);

const mild = analyze({
  daily: {
    time: ["2026-10-16"],
    weather_code: [0],
    temperature_2m_max: [26],
    temperature_2m_min: [18],
    precipitation_probability_max: [5],
    precipitation_sum: [0],
    wind_speed_10m_max: [12],
    wind_gusts_10m_max: [20],
    uv_index_max: [5],
  },
});
assert.strictEqual(mild.summary, "מזג נוח ללינה ולמסלול.");
assert.ok(mild.days[0].line.includes("בהיר"));
assert.ok(!mild.days[0].line.includes("גשם"));

assert.strictEqual(coverage("2026-10-01", "2026-10-02", "2026-10-13").status, "past");
assert.strictEqual(coverage("2026-11-20", "2026-11-21", "2026-10-13").status, "later");
const started = coverage("2026-10-10", "2026-10-17", "2026-10-13");
assert.strictEqual(started.status, "ready");
assert.strictEqual(started.from, "2026-10-13");
assert.strictEqual(started.to, "2026-10-17");
assert.ok(started.note.includes("כבר עברו"));
const far = coverage("2026-10-20", "2026-11-05", "2026-10-13");
assert.strictEqual(far.to, "2026-10-27");
assert.ok(far.note.includes("שמונת"));
const edge = coverage("2026-10-26", "2026-11-02", "2026-10-13");
assert.strictEqual(edge.to, "2026-10-28");
assert.ok(edge.note.includes("28.10"));

const url = forecastUrl(32.74552, 34.9704, "2026-10-16", "2026-10-17");
assert.ok(url.startsWith("https://api.open-meteo.com/v1/forecast?"));
assert.ok(url.includes("latitude=32.746"));
assert.ok(url.includes("longitude=34.97"));
assert.ok(url.includes("timezone=Asia%2FJerusalem"));
assert.ok(url.includes("start_date=2026-10-16"));
assert.ok(url.includes("end_date=2026-10-17"));

load(32.7, 35, "2026-10-01", "2026-10-02", "2026-10-13", async () => {
  throw new Error("should not fetch a past trip");
}).then((report) => {
  assert.strictEqual(report.status, "past");
  console.log("weather ok");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
