/* Weekend matching. Filters run in the browser over the scanned JSON. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.CamperPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function timeMatches(trail, time) {
    if (!time || time === "all") return true;
    const max = trail.hoursMax;
    const flags = trail.timeFlags || [];
    if (time === "h3") return max != null && max <= 3;
    if (time === "half") {
      if (max != null) return max <= 5;
      return flags.includes("half") && !flags.includes("full") && !flags.includes("multi");
    }
    if (time === "day") {
      if (max != null) return max >= 5 && max <= 10;
      return flags.includes("full");
    }
    return true;
  }

  function trailMatches(trail, filters) {
    if (filters.family && !trail.family) return false;
    if (filters.circular && trail.circular !== true) return false;
    if (filters.difficulty && filters.difficulty !== "all") {
      if (trail.difficulty !== filters.difficulty) return false;
    }
    return timeMatches(trail, filters.time);
  }

  function campMatches(camp, filters) {
    if (filters.region && filters.region !== "all") {
      if (!(camp.regions || []).includes(filters.region)) return false;
    }
    if (filters.lodging === "paid" && !camp.paid) return false;
    if (filters.lodging === "free" && camp.paid) return false;
    const facilities = new Set((camp.facilities || []).map((item) => item.id));
    if (filters.water && !facilities.has("water")) return false;
    if (filters.toilet && !facilities.has("toilet")) return false;
    return true;
  }

  function buildPlans(camps, trails, filters) {
    const byId = new Map(trails.map((trail) => [trail.id, trail]));
    const query = (filters.query || "").trim();
    const plans = [];

    camps.forEach((camp) => {
      if (!campMatches(camp, filters)) return;
      const campHit = query && camp.name.includes(query);
      const picked = [];
      (camp.nearby || []).forEach((near) => {
        const trail = byId.get(near.id);
        if (!trail || !trailMatches(trail, filters)) return;
        if (query && !campHit && !trail.name.includes(query)) return;
        picked.push({ trail, km: near.km });
      });
      if (!picked.length) return;
      picked.sort((a, b) => {
        const left = a.km == null ? 999 : a.km;
        const right = b.km == null ? 999 : b.km;
        if (left !== right) return left - right;
        return (a.trail.hoursMax || 99) - (b.trail.hoursMax || 99);
      });
      plans.push({ camp, trails: picked.slice(0, 2), km: picked[0].km });
    });

    plans.sort((a, b) => {
      const left = a.km == null ? 999 : a.km;
      const right = b.km == null ? 999 : b.km;
      if (left !== right) return left - right;
      return a.camp.name.localeCompare(b.camp.name, "he");
    });
    return plans;
  }

  function planUrl(campId, trailIds) {
    const trails = (trailIds || []).filter((id) => id != null).join(",");
    return `trip.html?camp=${encodeURIComponent(campId)}&trails=${encodeURIComponent(trails)}`;
  }

  function lengthIsUsable(trail) {
    const max = trail && (trail.kmMax == null ? trail.kmMin : trail.kmMax);
    if (max == null) return false;
    // Elevation in meters and drive times were sometimes read as kilometers.
    if (max > 25) return false;
    const hours = trail.hoursMax;
    if (hours && hours <= 16 && max / hours > 12) return false;
    return true;
  }

  function haversineKm(from, to) {
    const rad = Math.PI / 180;
    const dLat = (to.lat - from.lat) * rad;
    const dLng = (to.lng - from.lng) * rad;
    const lat1 = from.lat * rad;
    const lat2 = to.lat * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function centerOrigin(camps) {
    const points = (camps || []).filter((camp) => camp.lat != null && (camp.regions || []).includes("center"));
    if (!points.length) return null;
    return {
      lat: points.reduce((sum, camp) => sum + camp.lat, 0) / points.length,
      lng: points.reduce((sum, camp) => sum + camp.lng, 0) / points.length,
    };
  }

  function driveMinutes(camp, origin) {
    if (!camp || camp.lat == null || camp.lng == null || !origin) return null;
    const roadKm = haversineKm(camp, origin) * 1.35;
    const minutes = Math.round((roadKm / 70) * 60 / 15) * 15;
    return Math.max(15, minutes);
  }

  function walkMinutes(trail) {
    if (!trail || trail.hoursMax == null || trail.hoursMax > 16) return null;
    const min = trail.hoursMin == null ? trail.hoursMax : trail.hoursMin;
    const mid = (Number(min) + Number(trail.hoursMax)) / 2;
    if (!Number.isFinite(mid) || mid <= 0) return null;
    return Math.max(15, Math.round((mid * 60) / 15) * 15);
  }

  function minuteOf(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    if (!Number.isInteger(number)) return null;
    return ((number % 1440) + 1440) % 1440;
  }

  function normalizeOrder(order, trailIds) {
    const ids = [];
    (trailIds || []).forEach((id) => {
      const number = Number(id && id.id != null ? id.id : id);
      if (Number.isFinite(number) && !ids.includes(number)) ids.push(number);
    });
    const tokens = [];
    let stay = false;
    (Array.isArray(order) ? order : []).forEach((token) => {
      if (token === "stay") {
        if (!stay) {
          tokens.push("stay");
          stay = true;
        }
        return;
      }
      const number = Number(token);
      if (ids.includes(number) && !tokens.includes(number)) tokens.push(number);
    });
    if (!stay) tokens.unshift("stay");
    ids.forEach((id) => {
      if (!tokens.includes(id)) tokens.push(id);
    });
    return tokens;
  }

  function hikeStep(trail, { day, at, walk, back, beforeStay, lastBefore, firstOfDay }) {
    return {
      kind: "hike",
      block: `hike:${trail.id}`,
      day,
      at,
      name: trail.name,
      trailId: trail.id,
      walk,
      back,
      beforeStay: Boolean(beforeStay),
      lastBefore: Boolean(lastBefore),
      firstOfDay: Boolean(firstOfDay),
    };
  }

  function stepsBeforeStay(list, arrivalAt) {
    const walks = list.map(walkMinutes);
    if (walks.some((walk) => walk == null)) {
      return list.map((trail, index) => ({
        raw: null,
        step: hikeStep(trail, {
          day: "שישי",
          at: null,
          walk: walks[index],
          back: null,
          beforeStay: true,
          lastBefore: index === list.length - 1,
        }),
      }));
    }
    let cursor = arrivalAt - 30 - walks.reduce((sum, walk) => sum + walk, 0);
    return list.map((trail, index) => {
      const at = cursor;
      const back = at + walks[index];
      cursor = back;
      return {
        raw: at,
        step: hikeStep(trail, {
          day: "שישי",
          at: minuteOf(at),
          walk: walks[index],
          back,
          beforeStay: true,
          lastBefore: index === list.length - 1,
        }),
      };
    });
  }

  function stepsAfterStay(list, clock) {
    const start = clock.start == null ? 8 * 60 : minuteOf(clock.start);
    let cursor = start;
    let timed = true;
    const steps = list.map((trail, index) => {
      const custom = clock.hikes && clock.hikes[trail.id] != null ? minuteOf(clock.hikes[trail.id]) : null;
      const at = custom == null ? cursor : custom;
      const walk = walkMinutes(trail);
      const back = walk == null ? null : at + walk;
      if (walk == null) timed = false;
      else cursor = back;
      return hikeStep(trail, { day: "שבת", at, walk, back, firstOfDay: index === 0 });
    });
    const last = steps[steps.length - 1];
    const lunchAt = !timed || !last || last.back == null
      ? null
      : clock.lunch == null ? last.back + 30 : minuteOf(clock.lunch);
    steps.push({ kind: "lunch", block: last.block, day: "שבת", at: lunchAt });
    return steps;
  }

  function buildItinerary({ camp, trails, arrivalMinutes, origin, hours, order }) {
    const clock = hours || {};
    const arrival = minuteOf(arrivalMinutes) == null ? 17 * 60 : minuteOf(arrivalMinutes);
    const drive = driveMinutes(camp, origin);
    const byId = new Map();
    const loose = [];
    (trails || []).forEach((trail) => {
      if (trail && Number.isFinite(Number(trail.id))) byId.set(Number(trail.id), trail);
      else if (trail) loose.push(trail);
    });
    const sequence = normalizeOrder(order, [...byId.keys()]);
    const stayAt = sequence.indexOf("stay");
    const before = sequence.slice(0, stayAt).map((id) => byId.get(id)).filter(Boolean);
    const after = sequence.slice(stayAt + 1).map((id) => byId.get(id)).filter(Boolean).concat(loose);
    const dinner = clock.dinner == null ? arrival + 90 : minuteOf(clock.dinner);
    const rise = clock.rise == null ? 7 * 60 : minuteOf(clock.rise);
    const breakfast = clock.breakfast == null ? rise + 30 : minuteOf(clock.breakfast);
    const steps = [];
    if (!before.length) {
      steps.push({
        kind: "depart",
        block: "road",
        day: "שישי",
        at: drive == null ? null : minuteOf(arrival - drive),
        drive,
      });
      steps.push({ kind: "arrive", block: "road", day: "שישי", at: arrival });
    } else {
      const placed = stepsBeforeStay(before, arrival);
      const raw = placed[0].raw;
      steps.push({
        kind: "depart",
        block: "road",
        day: "שישי",
        at: drive == null || raw == null ? (drive == null ? null : minuteOf(arrival - drive)) : minuteOf(raw - drive),
        drive,
        toward: "hike",
      });
      placed.forEach((item) => steps.push(item.step));
    }
    if (before.length) steps.push({ kind: "arrive", block: "stay", day: "שישי", at: arrival, afterHike: true });
    steps.push({ kind: "dinner", block: "stay", day: "שישי", at: dinner });
    steps.push({ kind: "rise", block: "stay", day: "שבת", at: rise });
    steps.push({ kind: "breakfast", block: "stay", day: "שבת", at: breakfast });
    if (!before.length && !after.length) {
      steps.push({ kind: "need-hike", block: "stay", day: "שבת" });
      return steps;
    }
    if (after.length) steps.push(...stepsAfterStay(after, clock));
    return steps;
  }

  function retimedHours({ hours, arrival, step, next, trailIds, order }) {
    const clock = {
      dinner: hours && hours.dinner != null ? minuteOf(hours.dinner) : null,
      rise: hours && hours.rise != null ? minuteOf(hours.rise) : null,
      breakfast: hours && hours.breakfast != null ? minuteOf(hours.breakfast) : null,
      start: hours && hours.start != null ? minuteOf(hours.start) : null,
      lunch: hours && hours.lunch != null ? minuteOf(hours.lunch) : null,
      hikes: {},
    };
    Object.keys((hours && hours.hikes) || {}).forEach((id) => {
      const at = minuteOf(hours.hikes[id]);
      if (at != null) clock.hikes[id] = at;
    });
    let nextArrival = minuteOf(arrival);
    if (nextArrival == null) nextArrival = 17 * 60;
    const target = minuteOf(next);
    if (!step || step.at == null || target == null) return { arrival: nextArrival, hours: clock };
    const delta = target - step.at;
    const sequence = normalizeOrder(order, trailIds);
    const stayAt = sequence.indexOf("stay");
    const before = new Set(sequence.slice(0, stayAt));
    const after = sequence.slice(stayAt + 1);
    const shiftAfter = (from) => {
      after.slice(from).forEach((id) => {
        if (clock.hikes[id] != null) clock.hikes[id] = minuteOf(clock.hikes[id] + delta);
      });
    };
    if (step.kind === "depart" || step.kind === "arrive") nextArrival = minuteOf(nextArrival + delta);
    else if (step.kind === "hike" && before.has(step.trailId)) nextArrival = minuteOf(nextArrival + delta);
    else if (step.kind === "dinner") clock.dinner = target;
    else if (step.kind === "rise") {
      clock.rise = target;
      if (clock.breakfast != null) clock.breakfast = minuteOf(clock.breakfast + delta);
      clock.start = minuteOf((clock.start == null ? 8 * 60 : clock.start) + delta);
      shiftAfter(0);
      if (clock.lunch != null) clock.lunch = minuteOf(clock.lunch + delta);
    } else if (step.kind === "breakfast") clock.breakfast = target;
    else if (step.kind === "start" || (step.kind === "hike" && after[0] === step.trailId)) {
      clock.start = target;
      if (after[0] != null) delete clock.hikes[after[0]];
      shiftAfter(1);
      if (clock.lunch != null) clock.lunch = minuteOf(clock.lunch + delta);
    } else if (step.kind === "hike") {
      clock.hikes[step.trailId] = target;
      shiftAfter(after.indexOf(step.trailId) + 1);
      if (clock.lunch != null) clock.lunch = minuteOf(clock.lunch + delta);
    } else if (step.kind === "lunch") clock.lunch = target;
    return { arrival: nextArrival, hours: clock };
  }

  function pointKm(from, to) {
    return haversineKm({ lat: from[0], lng: from[1] }, { lat: to[0], lng: to[1] });
  }

  function lineKm(line) {
    let sum = 0;
    for (let index = 1; index < line.length; index += 1) sum += pointKm(line[index - 1], line[index]);
    return sum;
  }

  function routeScore(routeName, trailName) {
    const words = String(trailName || "").split(/[\s–—-]+/).filter((word) => word.length >= 3);
    return words.reduce((sum, word) => (String(routeName || "").includes(word) ? sum + word.length : sum), 0);
  }

  function chainLines(lines, camp) {
    const parts = lines.map((line) => line.slice()).filter((line) => line.length > 1 && lineKm(line) >= 0.25);
    if (!parts.length) return [];
    const unused = parts.slice();
    let bestIndex = 0;
    let flip = false;
    let bestDistance = Infinity;
    unused.forEach((line, index) => {
      [line[0], line[line.length - 1]].forEach((point, end) => {
        const distance = camp && camp.lat != null
          ? haversineKm(camp, { lat: point[0], lng: point[1] })
          : 0;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
          flip = end === 1;
        }
      });
    });
    let current = unused.splice(bestIndex, 1)[0];
    if (flip) current.reverse();
    const chained = current.slice();
    while (unused.length) {
      const tail = chained[chained.length - 1];
      let pick = -1;
      let reverse = false;
      let closest = 0.25;
      unused.forEach((line, index) => {
        const toStart = pointKm(tail, line[0]);
        const toEnd = pointKm(tail, line[line.length - 1]);
        if (toStart < closest) {
          closest = toStart;
          pick = index;
          reverse = false;
        }
        if (toEnd < closest) {
          closest = toEnd;
          pick = index;
          reverse = true;
        }
      });
      if (pick < 0) break;
      const next = unused.splice(pick, 1)[0];
      if (reverse) next.reverse();
      chained.push(...next.slice(1));
    }
    return chained;
  }

  function storyPath(trail, camp) {
    const routes = (trail.routes || []).map((route) => {
      const lines = (route.lines || []).filter((line) => lineKm(line) >= 0.25);
      if (!lines.length) return null;
      const anchor = lines[0][0];
      const near = camp && camp.lat != null ? haversineKm(camp, { lat: anchor[0], lng: anchor[1] }) : 0;
      return {
        lines,
        score: routeScore(route.name, trail.name),
        near,
        km: lines.reduce((sum, line) => sum + lineKm(line), 0),
      };
    }).filter(Boolean);
    if (!routes.length) return [];
    routes.sort((left, right) => right.score - left.score || left.near - right.near || right.km - left.km);
    const ranked = routes[0].score === 0 && camp
      ? routes.slice().sort((left, right) => left.near - right.near || right.km - left.km)
      : routes;
    return chainLines(ranked[0].lines, camp);
  }

  function tripStages(camp, trails, order) {
    const stages = [];
    const paths = [];
    const chosen = trails || [];
    const byId = new Map();
    const loose = [];
    chosen.forEach((trail) => {
      if (trail && Number.isFinite(Number(trail.id))) byId.set(Number(trail.id), trail);
      else if (trail) loose.push(trail);
    });
    const sequence = normalizeOrder(order, [...byId.keys()]);
    const stayAt = sequence.indexOf("stay");
    const hikesBefore = stayAt > 0;
    const hikesAfter = stayAt < sequence.length - 1 || loose.length > 0;
    let number = 1;

    function addCamp() {
      if (!camp || camp.lat == null) return;
      let text = camp.name;
      if (hikesBefore && hikesAfter) text = `${camp.name}. ישנים כאן בין המסלולים.`;
      else if (hikesBefore) text = `${camp.name}. אחרי המסלול ישנים כאן.`;
      else if (chosen.length) text = `${camp.name}. בסוף המסלול חוזרים לכאן.`;
      stages.push({
        kind: "arrive",
        n: number,
        lat: camp.lat,
        lng: camp.lng,
        title: "מגיעים לחניון לילה",
        text,
        photos: (camp.photos || []).slice(0, 2),
      });
      number += 1;
    }

    function addHike(trail) {
      const line = storyPath(trail, camp);
      const highlights = ((trail.details && trail.details.highlights) || []).slice(0, 3);
      const photos = (trail.photos || []).slice(0, 2);
      const base = { trailId: trail.id, text: trail.name, photos, highlights };
      if (!line.length) {
        if (trail.lat == null) return;
        stages.push({ ...base, kind: "depart-hike", n: number, lat: trail.lat, lng: trail.lng, title: "יוצאים לטיול" });
        number += 1;
        return;
      }
      paths.push({ trailId: trail.id, line });
      const start = line[0];
      const end = line[line.length - 1];
      const middle = line[Math.floor(line.length / 2)];
      const away = (point) => !camp || camp.lat == null || haversineKm(camp, { lat: point[0], lng: point[1] }) > 0.2;
      if (away(start)) {
        stages.push({ ...base, kind: "depart-hike", n: number, lat: start[0], lng: start[1], title: "יוצאים לטיול" });
        number += 1;
      }
      if (lineKm(line) >= 0.8 && away(middle) && pointKm(middle, start) > 0.25) {
        stages.push({ ...base, kind: "along", n: number, lat: middle[0], lng: middle[1], title: "במסלול" });
        number += 1;
      }
      if (pointKm(end, start) > 0.3 && away(end) && pointKm(end, middle) > 0.2) {
        stages.push({ ...base, kind: "far", n: number, lat: end[0], lng: end[1], title: "המשך המסלול" });
        number += 1;
      }
    }

    sequence.forEach((token) => {
      if (token === "stay") addCamp();
      else if (byId.has(token)) addHike(byId.get(token));
    });
    loose.forEach(addHike);
    return { stages, paths };
  }

  function trailLures(trail) {
    if (!trail) return [];
    const details = trail.details || {};
    const text = [trail.name, trail.blurb, details.summary, details.character]
      .concat(details.highlights || [])
      .filter(Boolean)
      .join(" ");
    const tags = [];
    if (trail.family || text.includes("משפח")) tags.push("לילדים");
    if (/חורש|מוצל|מנהרת צל|(?<![א-ת])צל(?![א-ת])/.test(text)) tags.push("מוצל");
    if (/רטוב|הליכה במים|בריכ|מעיין|מפל/.test(text)) tags.push("מסלול רטוב");
    if (/תצפית|מצפור|מרהיב/.test(text)) tags.push("נוף מהמם");
    const play = `${text} ${details.snippet || ""}`;
    if (/(?:גן|פארק) שעשועים(?! גיאולוגי)|מתקני שעשועים|מתקני משחק/.test(play)) tags.push("פארק שעשועים");
    return tags.slice(0, 4);
  }

  function nearbyChoices(camp, trails) {
    const byId = new Map((trails || []).map((trail) => [trail.id, trail]));
    return (camp.nearby || [])
      .map((near) => ({ trail: byId.get(near.id), km: near.km }))
      .filter((item) => item.trail)
      .sort((left, right) => {
        const leftKm = left.km == null ? 999 : left.km;
        const rightKm = right.km == null ? 999 : right.km;
        return leftKm - rightKm;
      });
  }

  return {
    buildPlans,
    trailMatches,
    timeMatches,
    campMatches,
    planUrl,
    nearbyChoices,
    lengthIsUsable,
    centerOrigin,
    buildItinerary,
    retimedHours,
    normalizeOrder,
    tripStages,
    trailLures,
  };
});
