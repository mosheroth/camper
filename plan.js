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

  function buildItinerary({ camp, trails, arrivalMinutes, origin }) {
    const arrival = arrivalMinutes == null ? 17 * 60 : arrivalMinutes;
    const drive = driveMinutes(camp, origin);
    const steps = [
      { kind: "depart", day: "שישי", at: drive == null ? null : arrival - drive, drive },
      { kind: "arrive", day: "שישי", at: arrival },
      { kind: "dinner", day: "שישי", at: arrival + 90 },
      { kind: "rise", day: "שבת", at: 7 * 60 },
    ];
    const chosen = trails || [];
    if (!chosen.length) {
      steps.push({ kind: "need-hike", day: "שבת" });
      return steps;
    }
    let cursor = 8 * 60;
    let timed = true;
    steps.push({ kind: "start", day: "שבת", at: cursor, count: chosen.length });
    chosen.forEach((trail) => {
      const walk = walkMinutes(trail);
      const back = walk == null ? null : cursor + walk;
      steps.push({ kind: "hike", day: "שבת", at: cursor, name: trail.name, walk, back });
      if (walk == null) timed = false;
      else cursor = back;
    });
    steps.push({ kind: "lunch", day: "שבת", at: timed ? cursor + 30 : null });
    return steps;
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

  function tripStages(camp, trails) {
    const stages = [];
    const paths = [];
    const chosen = trails || [];
    if (camp && camp.lat != null) {
      stages.push({
        kind: "arrive",
        n: 1,
        lat: camp.lat,
        lng: camp.lng,
        title: "מגיעים לחניון לילה",
        text: chosen.length ? `${camp.name}. בסוף המסלול חוזרים לכאן.` : camp.name,
        photos: (camp.photos || []).slice(0, 2),
      });
    }
    let number = stages.length + 1;
    chosen.forEach((trail) => {
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
    });
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
    tripStages,
    trailLures,
  };
});
