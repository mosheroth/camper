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
  };
});
