/* Forecast for the trip dates. Open-Meteo, interpreted for a night outdoors. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CamperWeather = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const WEEKDAYS = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "יום ש׳"];

  function parseISODate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function isoDate(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function addDays(iso, count) {
    const date = parseISODate(iso);
    if (!date) return null;
    date.setDate(date.getDate() + count);
    return isoDate(date);
  }

  function todayIso(today) {
    return parseISODate(today) ? today : isoDate(new Date());
  }

  function dayLabel(iso) {
    const date = parseISODate(iso);
    if (!date) return "";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${WEEKDAYS[date.getDay()]} ${day}.${month}`;
  }

  function dayName(iso) {
    return dayLabel(iso).replace(/\s+\d.*$/, "");
  }

  function inDays(days) {
    const names = days.map((day) => dayName(day.iso));
    if (names.length <= 1) return names[0] || "";
    return `${names.slice(0, -1).join(", ")} ו${names[names.length - 1]}`;
  }

  function sky(code) {
    const value = Number(code);
    if (value === 0) return { emoji: "☀️", label: "בהיר" };
    if (value <= 3) return { emoji: "⛅", label: "מעונן חלקית" };
    if (value === 45 || value === 48) return { emoji: "🌫️", label: "ערפל" };
    if (value >= 51 && value <= 57) return { emoji: "🌦️", label: "טפטוף" };
    if ((value >= 61 && value <= 67) || (value >= 80 && value <= 82)) return { emoji: "🌧️", label: "גשם" };
    if ((value >= 71 && value <= 77) || value === 85 || value === 86) return { emoji: "❄️", label: "שלג" };
    if (value >= 95) return { emoji: "⛈️", label: "סופת רעמים" };
    return { emoji: "☁️", label: "מעונן" };
  }

  function round(value) {
    return Number.isFinite(Number(value)) ? Math.round(Number(value)) : null;
  }

  function datesBetween(from, to, limit) {
    const days = [];
    const cap = limit || 8;
    let cursor = from;
    while (cursor && cursor <= to && days.length < cap) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return { days, clipped: Boolean(cursor && cursor <= to) };
  }

  function coverage(from, to, today) {
    const now = todayIso(today);
    const last = addDays(now, 15);
    if (!parseISODate(from) || !parseISODate(to) || to < from) return { status: "invalid", note: "" };
    if (to < now) return { status: "past", note: "התאריכים האלה כבר עברו, אז אין תחזית." };
    if (from > last) {
      return { status: "later", note: "התחזית מגיעה רק ל־16 הימים הקרובים. כשהטיול יתקרב, הניתוח יופיע כאן." };
    }
    let start = from < now ? now : from;
    let end = to > last ? last : to;
    const notes = [];
    if (from < now) notes.push("הימים שכבר עברו לא נכללים.");
    const span = datesBetween(start, end, 8);
    if (span.clipped) {
      end = span.days[span.days.length - 1];
      notes.push("מוצגים שמונת הימים הראשונים.");
    } else if (to > last) notes.push(`התחזית מגיעה עד ${dayLabel(last)}.`);
    return { status: "ready", from: start, to: end, note: notes.join(" ") };
  }

  function forecastUrl(lat, lng, from, to) {
    const params = new URLSearchParams({
      latitude: String(Math.round(Number(lat) * 1000) / 1000),
      longitude: String(Math.round(Number(lng) * 1000) / 1000),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
        "precipitation_sum",
        "wind_speed_10m_max",
        "wind_gusts_10m_max",
        "uv_index_max",
      ].join(","),
      hourly: "precipitation_probability",
      timezone: "Asia/Jerusalem",
      start_date: from,
      end_date: to,
    });
    return `https://api.open-meteo.com/v1/forecast?${params}`;
  }

  function column(payload, name) {
    return (payload && payload.daily && payload.daily[name]) || [];
  }

  function afternoonRain(payload, iso) {
    const times = (payload.hourly && payload.hourly.time) || [];
    const probs = (payload.hourly && payload.hourly.precipitation_probability) || [];
    let morning = null;
    let afternoon = null;
    times.forEach((stamp, index) => {
      if (!String(stamp).startsWith(iso)) return;
      const hour = Number(String(stamp).slice(11, 13));
      const rain = Number(probs[index]);
      if (!Number.isFinite(rain)) return;
      if (hour >= 6 && hour < 12) morning = morning == null ? rain : Math.max(morning, rain);
      if (hour >= 12 && hour < 18) afternoon = afternoon == null ? rain : Math.max(afternoon, rain);
    });
    return morning != null && afternoon != null && afternoon >= 40 && afternoon >= morning + 15;
  }

  function dayLine(day) {
    const bits = [day.label, day.sky, `${day.low}°–${day.high}°`];
    if (day.rain != null && day.rain >= 20) bits.push(`גשם ${day.rain}%`);
    if (day.wind != null && day.wind >= 20) bits.push(`רוח ${day.wind} קמ״ש`);
    return bits.join(" · ");
  }

  function summary(days) {
    const storms = days.filter((day) => day.code >= 95);
    const heavy = days.filter((day) => (day.rain != null && day.rain >= 60) || (day.rainMm != null && day.rainMm >= 8));
    const chance = days.filter((day) => day.rain != null && day.rain >= 30);
    const wet = storms.length ? storms : heavy.length ? heavy : chance;
    const parts = [];
    if (storms.length) parts.push(`סופת רעמים ב${inDays(storms)}.`);
    else if (heavy.length) parts.push(`גשם סביר ב${inDays(heavy)}.`);
    else if (chance.length) parts.push(`סיכוי לגשם ב${inDays(chance)}.`);
    if (wet.length && wet.every((day) => day.afternoon)) {
      const rain = parts[0].replace(/\.$/, "");
      parts[0] = `${rain}, בעיקר אחרי הצהריים. עדיף ללכת בבוקר.`;
    }
    const gusty = days.filter((day) => (day.gust != null && day.gust >= 50) || (day.wind != null && day.wind >= 35));
    if (gusty.length) parts.push(`רוח חזקה ב${inDays(gusty)}, כדאי יתדות טובות לאוהל.`);
    const coldest = days.reduce((best, day) => (day.low < best.low ? day : best));
    if (coldest.low <= 8) parts.push(`לילה קר מאוד (${coldest.low}°), שק שינה חורפי.`);
    else if (coldest.low <= 12) parts.push(`לילה קר (${coldest.low}°), כדאי שק שינה חם.`);
    else if (coldest.low <= 16) parts.push(`לילה קריר (${coldest.low}°).`);
    const hottest = days.reduce((best, day) => (day.high > best.high ? day : best));
    if (hottest.high >= 35) parts.push(`חם מאוד ביום (${hottest.high}°), לצאת מוקדם עם הרבה מים.`);
    else if (hottest.high >= 31) parts.push(`חם ביום (${hottest.high}°), כדאי לסיים את ההליכה לפני הצהריים.`);
    if (days.some((day) => day.uv != null && day.uv >= 8) && hottest.high >= 28) parts.push("שמש חזקה, כדאי כובע וקרם הגנה.");
    if (!parts.length) parts.push("מזג נוח ללינה ולמסלול.");
    return parts.slice(0, 3).join(" ");
  }

  function analyze(payload) {
    const times = column(payload, "time");
    const days = [];
    times.forEach((iso, index) => {
      const low = round(column(payload, "temperature_2m_min")[index]);
      const high = round(column(payload, "temperature_2m_max")[index]);
      if (low == null || high == null) return;
      const code = Number(column(payload, "weather_code")[index]);
      const looked = sky(Number.isFinite(code) ? code : 3);
      const day = {
        iso,
        label: dayLabel(iso),
        emoji: looked.emoji,
        sky: looked.label,
        code: Number.isFinite(code) ? code : 3,
        low,
        high,
        rain: round(column(payload, "precipitation_probability_max")[index]),
        rainMm: round(column(payload, "precipitation_sum")[index]),
        wind: round(column(payload, "wind_speed_10m_max")[index]),
        gust: round(column(payload, "wind_gusts_10m_max")[index]),
        uv: round(column(payload, "uv_index_max")[index]),
        afternoon: afternoonRain(payload, iso),
      };
      day.line = dayLine(day);
      days.push(day);
    });
    if (!days.length) return { status: "empty", summary: "", days: [], share: [], note: "" };
    const text = summary(days);
    return {
      status: "ready",
      summary: text,
      days,
      share: ["מזג אוויר", ...days.map((day) => day.line), text],
      note: "",
    };
  }

  async function load(lat, lng, from, to, today, fetchImpl) {
    const ask = coverage(from, to, today);
    if (ask.status !== "ready") return { status: ask.status, note: ask.note, days: [], summary: "", share: [] };
    const response = await (fetchImpl || fetch)(forecastUrl(lat, lng, ask.from, ask.to));
    if (!response.ok) throw new Error(String(response.status));
    const report = analyze(await response.json());
    report.note = ask.note || "";
    if (report.status === "ready") return report;
    return { status: "empty", note: ask.note || "אין תחזית לתאריכים האלה.", days: [], summary: "", share: [] };
  }

  return {
    sky,
    coverage,
    forecastUrl,
    analyze,
    load,
    dayLabel,
  };
});
