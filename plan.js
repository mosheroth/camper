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
    if (filters.shade || filters.wet || filters.view) {
      const lures = trailLures(trail);
      if (filters.shade && !lures.includes("מוצל")) return false;
      if (filters.wet && !lures.includes("מסלול רטוב")) return false;
      if (filters.view && !lures.includes("נוף מהמם")) return false;
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
    if (filters.shower && !facilities.has("shower")) return false;
    if (filters.fire && !facilities.has("fire")) return false;
    return true;
  }

  function buildPlans(camps, trails, filters) {
    const byId = new Map(trails.map((trail) => [trail.id, trail]));
    const query = (filters.query || "").trim();
    const origin = regionOrigin(camps, filters.home);
    const plans = [];

    camps.forEach((camp) => {
      if (!campMatches(camp, filters)) return;
      const campHit = query && camp.name.includes(query);
      const picked = [];
      (camp.nearby || []).forEach((near) => {
        const trail = byId.get(near.id);
        if (!trail || !trailMatches(trail, filters)) return;
        if ((filters.shade || filters.wet || filters.view) && !(near.km != null && near.km <= 20)) return;
        if (filters.close && !(near.km != null && near.km <= 5)) return;
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
      plans.push({
        camp,
        trails: picked.slice(0, 2),
        km: picked[0].km,
        homeMinutes: origin ? driveMinutes(camp, origin) : null,
      });
    });

    plans.sort((a, b) => {
      if (origin) {
        const left = a.homeMinutes == null ? 9999 : a.homeMinutes;
        const right = b.homeMinutes == null ? 9999 : b.homeMinutes;
        if (left !== right) return left - right;
      } else {
        const left = a.km == null ? 999 : a.km;
        const right = b.km == null ? 999 : b.km;
        if (left !== right) return left - right;
      }
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

  function regionOrigin(camps, region) {
    if (!region || region === "all") return null;
    const points = (camps || []).filter((camp) => camp.lat != null && (camp.regions || []).includes(region));
    if (!points.length) return null;
    return {
      lat: points.reduce((sum, camp) => sum + camp.lat, 0) / points.length,
      lng: points.reduce((sum, camp) => sum + camp.lng, 0) / points.length,
    };
  }

  function centerOrigin(camps) {
    return regionOrigin(camps, "center");
  }

  function travelMinutes(from, to) {
    if (!from || from.lat == null || from.lng == null || !to || to.lat == null || to.lng == null) return null;
    const km = haversineKm(from, to);
    if (!Number.isFinite(km)) return null;
    if (km < 0.4) return 0;
    const minutes = Math.round((km * 1.35 / 70) * 60 / 15) * 15;
    return Math.max(15, minutes);
  }

  function driveMinutes(camp, origin) {
    const minutes = travelMinutes(camp, origin);
    if (minutes == null) return null;
    return Math.max(15, minutes);
  }

  // Straight-line approach from the chosen home region to the camp.
  // True only while the point is still before the camp and the extra length stays small.
  function onTheWay(home, camp, point) {
    if (!home || home.lat == null || home.lng == null) return null;
    if (!camp || camp.lat == null || camp.lng == null) return null;
    if (!point || point.lat == null || point.lng == null) return null;
    const trip = haversineKm(home, camp);
    if (!Number.isFinite(trip) || trip < 5) return null;
    const toPoint = haversineKm(home, point);
    const toCamp = haversineKm(point, camp);
    if (!Number.isFinite(toPoint) || !Number.isFinite(toCamp)) return null;
    const along = (trip * trip + toPoint * toPoint - toCamp * toCamp) / (2 * trip);
    const remaining = trip - along;
    const detour = toPoint + toCamp - trip;
    if (along < 0 || remaining < 0.8 || detour > 5) return false;
    return true;
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

  const COFFEE_MINUTES = 30;
  const VISIT_ESTIMATE = 90;

  function coffeeToken(id) {
    return `c:${id}`;
  }

  function coffeePlaceId(token) {
    const match = /^c:([or]\d+)$/.exec(String(token || ""));
    return match ? match[1] : null;
  }

  function visitToken(id) {
    return `v:${id}`;
  }

  function visitPlaceId(token) {
    const match = /^v:(r\d+)$/.exec(String(token || ""));
    return match ? match[1] : null;
  }

  function visitMinutes(place) {
    const walked = walkMinutes(place);
    if (walked != null) return walked;
    if (place && Number(place.hoursMax) > 16) return 8 * 60;
    return VISIT_ESTIMATE;
  }

  function visitIsEstimate(place) {
    return !place || place.hoursMax == null;
  }

  function coffeeIdsOf(places) {
    const ids = [];
    (places || []).forEach((place) => {
      const id = String(place && place.id != null ? place.id : place || "");
      if (/^[or]\d+$/.test(id) && !ids.includes(id)) ids.push(id);
    });
    return ids;
  }

  function normalizeOrder(order, trailIds, coffeeIds, visitIds) {
    const ids = [];
    (trailIds || []).forEach((id) => {
      const number = Number(id && id.id != null ? id.id : id);
      if (Number.isFinite(number) && !ids.includes(number)) ids.push(number);
    });
    const listed = Array.isArray(coffeeIds);
    const coffees = listed ? coffeeIdsOf(coffeeIds) : [];
    const visitsListed = Array.isArray(visitIds);
    const visits = visitsListed ? coffeeIdsOf(visitIds).filter((id) => id.startsWith("r")) : [];
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
      const visitId = visitPlaceId(token);
      if (visitId) {
        if (visitsListed && !visits.includes(visitId)) return;
        const marker = visitToken(visitId);
        if (!tokens.includes(marker)) tokens.push(marker);
        return;
      }
      const placeId = coffeePlaceId(token);
      if (placeId) {
        if (listed && !coffees.includes(placeId)) return;
        const marker = coffeeToken(placeId);
        if (!tokens.includes(marker)) tokens.push(marker);
        return;
      }
      const number = Number(token);
      if (ids.includes(number) && !tokens.includes(number)) tokens.push(number);
    });
    if (!stay) tokens.unshift("stay");
    ids.forEach((id) => {
      if (!tokens.includes(id)) tokens.push(id);
    });
    visits.forEach((id) => {
      const marker = visitToken(id);
      if (!tokens.includes(marker)) tokens.push(marker);
    });
    coffees.forEach((id) => {
      const marker = coffeeToken(id);
      if (!tokens.includes(marker)) tokens.push(marker);
    });
    return tokens;
  }

  function moveOrder(order, trailIds, token, target, after) {
    const sequence = normalizeOrder(order, trailIds);
    const asToken = (value) => {
      if (value === "stay") return "stay";
      const visitId = visitPlaceId(value);
      if (visitId) {
        const marker = visitToken(visitId);
        return sequence.includes(marker) ? marker : null;
      }
      const placeId = coffeePlaceId(value);
      if (placeId) {
        const marker = coffeeToken(placeId);
        return sequence.includes(marker) ? marker : null;
      }
      const number = Number(value);
      return sequence.includes(number) ? number : null;
    };
    const moving = asToken(token);
    const onto = asToken(target);
    const from = sequence.indexOf(moving);
    if (moving == null || onto == null || from < 0 || moving === onto) return null;
    const copy = sequence.slice();
    const [item] = copy.splice(from, 1);
    let to = copy.indexOf(onto);
    if (to < 0) return null;
    if (after) to += 1;
    copy.splice(to, 0, item);
    if (copy.every((entry, index) => entry === sequence[index])) return null;
    return copy;
  }

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

  function daySpan(from, to) {
    const start = parseISODate(from);
    const end = parseISODate(to);
    if (!start || !end) return null;
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  }

  function dayLabel(iso) {
    const date = parseISODate(iso);
    if (!date) return "";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${WEEKDAYS[date.getDay()]} ${day}.${month}`;
  }

  function comingWeekend(today) {
    const start = parseISODate(today) ? today : isoDate(new Date());
    const untilFriday = (5 - parseISODate(start).getDay() + 7) % 7;
    const from = addDays(start, untilFriday);
    return { from, to: addDays(from, 1) };
  }

  function tripDates(from, to, today) {
    const weekend = comingWeekend(today);
    const start = parseISODate(from) ? from : weekend.from;
    let end = parseISODate(to) ? to : addDays(start, 1);
    if (daySpan(start, end) < 1) end = addDays(start, 1);
    return { from: start, to: end, nights: daySpan(start, end) };
  }

  function moveTripDates(from, to, nextFrom, nextTo, today) {
    const current = tripDates(from, to, today);
    if (nextFrom) {
      const start = parseISODate(nextFrom) ? nextFrom : current.from;
      return { from: start, to: addDays(start, Math.max(1, current.nights)) };
    }
    if (nextTo) {
      let end = parseISODate(nextTo) ? nextTo : current.to;
      if (daySpan(current.from, end) < 1) end = addDays(current.from, 1);
      return { from: current.from, to: end };
    }
    return { from: current.from, to: current.to };
  }

  function withLeg(step, { travel, inbound }) {
    if (travel) step.travel = travel;
    if (inbound) step.inbound = inbound;
    return step;
  }

  function hikeStep(trail, options) {
    const { part, at, walk, back, beforeStay, lastBefore, firstOfDay } = options;
    return withLeg({
      kind: "hike",
      block: `hike:${trail.id}`,
      part,
      at,
      name: trail.name,
      trailId: trail.id,
      walk,
      back,
      beforeStay: Boolean(beforeStay),
      lastBefore: Boolean(lastBefore),
      firstOfDay: Boolean(firstOfDay),
    }, options);
  }

  function coffeeStep(place, options) {
    const { part, at, back, beforeStay, lastBefore, firstOfDay } = options;
    return withLeg({
      kind: "coffee",
      block: `coffee:${place.id}`,
      part,
      at,
      name: place.name,
      placeId: String(place.id),
      url: place.url || "",
      lat: place.lat,
      lng: place.lng,
      walk: COFFEE_MINUTES,
      back,
      beforeStay: Boolean(beforeStay),
      lastBefore: Boolean(lastBefore),
      firstOfDay: Boolean(firstOfDay),
    }, options);
  }

  function visitStep(place, options) {
    const { part, at, back, beforeStay, lastBefore, firstOfDay } = options;
    return withLeg({
      kind: "visit",
      block: `visit:${place.id}`,
      part,
      at,
      name: place.name,
      placeId: String(place.id),
      url: place.url || "",
      lat: place.lat,
      lng: place.lng,
      walk: visitMinutes(place),
      back,
      estimated: visitIsEstimate(place),
      duration: place.duration || "",
      beforeStay: Boolean(beforeStay),
      lastBefore: Boolean(lastBefore),
      firstOfDay: Boolean(firstOfDay),
    }, options);
  }

  function pointOf(activity) {
    if (!activity) return null;
    const source = activity.type === "hike" ? activity.trail : activity.place;
    if (!source || source.lat == null || source.lng == null) return null;
    return { lat: source.lat, lng: source.lng };
  }

  function hopMinutes(from, to, fallback) {
    const known = travelMinutes(from, to);
    return known == null ? fallback : known;
  }

  function activityMinutes(activity) {
    if (activity.type === "coffee") return COFFEE_MINUTES;
    if (activity.type === "visit") return visitMinutes(activity.place);
    return walkMinutes(activity.trail);
  }

  function activityStep(activity, options) {
    if (activity.type === "coffee") return coffeeStep(activity.place, options);
    if (activity.type === "visit") return visitStep(activity.place, options);
    return hikeStep(activity.trail, options);
  }

  function stepsBeforeStay(list, arrivalAt, camp) {
    const walks = list.map(activityMinutes);
    const campPoint = camp && camp.lat != null ? camp : null;
    const hops = list.map((activity, index) => {
      const next = index === list.length - 1 ? campPoint : pointOf(list[index + 1]);
      return hopMinutes(pointOf(activity), next, index === list.length - 1 ? 30 : 0);
    });
    if (walks.some((walk) => walk == null)) {
      return list.map((activity, index) => ({
        raw: null,
        step: activityStep(activity, {
          part: "out",
          at: null,
          walk: walks[index],
          back: null,
          travel: hops[index] || null,
          beforeStay: true,
          lastBefore: index === list.length - 1,
        }),
      }));
    }
    let cursor = arrivalAt - hops.reduce((sum, hop) => sum + hop, 0) - walks.reduce((sum, walk) => sum + walk, 0);
    return list.map((activity, index) => {
      const at = cursor;
      const back = at + walks[index];
      cursor = back + hops[index];
      return {
        raw: at,
        step: activityStep(activity, {
          part: "out",
          at: minuteOf(at),
          walk: walks[index],
          back,
          travel: hops[index] || null,
          beforeStay: true,
          lastBefore: index === list.length - 1,
        }),
      };
    });
  }

  function stepsAfterStay(list, clock) {
    const start = clock.start == null ? 8 * 60 : minuteOf(clock.start);
    const times = clock.coffeeAt || {};
    const visitTimes = clock.visitAt || {};
    let cursor = start;
    let timed = true;
    const campPoint = clock.place && clock.place.lat != null ? clock.place : null;
    const steps = list.map((activity, index) => {
      let custom = null;
      if (activity.type === "coffee") {
        custom = times[activity.place.id] != null ? minuteOf(times[activity.place.id]) : null;
      } else if (activity.type === "visit") {
        custom = visitTimes[activity.place.id] != null ? minuteOf(visitTimes[activity.place.id]) : null;
      } else if (clock.hikes && clock.hikes[activity.trail.id] != null) {
        custom = minuteOf(clock.hikes[activity.trail.id]);
      }
      const here = pointOf(activity);
      const inbound = index === 0 ? hopMinutes(campPoint, here, 0) : 0;
      const next = index === list.length - 1 ? null : pointOf(list[index + 1]);
      const travel = next ? hopMinutes(here, next, 0) : 0;
      const at = custom == null ? cursor : custom;
      const walk = activityMinutes(activity);
      const back = walk == null ? null : at + walk;
      if (walk == null) timed = false;
      else cursor = back + travel;
      return activityStep(activity, {
        part: "next",
        at,
        walk,
        back,
        inbound: inbound || null,
        travel: travel || null,
        firstOfDay: index === 0,
      });
    });
    const last = steps[steps.length - 1];
    const lunchAt = !timed || !last || last.back == null
      ? null
      : clock.lunch == null ? last.back + 30 : minuteOf(clock.lunch);
    steps.push({
      kind: "lunch",
      block: last.block,
      part: "next",
      at: lunchAt,
      afterCoffee: last.kind === "coffee",
      afterVisit: last.kind === "visit",
    });
    return steps;
  }

  function defaultReturnAt(steps, nights) {
    if (nights > 1) return 11 * 60;
    let end = null;
    steps.forEach((step) => {
      if (step.part !== "next") return;
      const point = (step.kind === "hike" || step.kind === "visit" || step.kind === "coffee") && step.back != null
        ? step.back
        : step.kind === "lunch" && step.at != null
          ? step.at
          : null;
      if (point == null) return;
      end = end == null ? point : Math.max(end, point);
    });
    return end == null ? 16 * 60 : end + 30;
  }

  function stampDays(steps, dates) {
    const labels = {
      out: dayLabel(dates.from),
      next: dayLabel(addDays(dates.from, 1)),
      back: dayLabel(dates.to),
    };
    steps.forEach((step) => {
      step.day = step.pastMidnight ? dayLabel(addDays(dates.to, 1)) : (labels[step.part] || labels.out);
    });
    return steps;
  }

  function coffeeMap(places) {
    const byId = new Map();
    (places || []).forEach((place) => {
      const id = String(place && place.id != null ? place.id : "");
      if (/^[or]\d+$/.test(id) && place.lat != null && place.lng != null) byId.set(id, place);
    });
    return byId;
  }

  function activityFor(token, trailsById, placesById) {
    const visitId = visitPlaceId(token);
    if (visitId && placesById.has(visitId)) return { type: "visit", place: placesById.get(visitId) };
    const placeId = coffeePlaceId(token);
    if (placeId && placesById.has(placeId)) return { type: "coffee", place: placesById.get(placeId) };
    if (trailsById.has(token)) return { type: "hike", trail: trailsById.get(token) };
    return null;
  }

  function buildItinerary({ camp, trails, coffees, visits, arrivalMinutes, origin, hours, order, from, to, today }) {
    const clock = hours || {};
    const arrival = minuteOf(arrivalMinutes) == null ? 17 * 60 : minuteOf(arrivalMinutes);
    const drive = driveMinutes(camp, origin);
    const byId = new Map();
    const loose = [];
    (trails || []).forEach((trail) => {
      if (trail && Number.isFinite(Number(trail.id))) byId.set(Number(trail.id), trail);
      else if (trail) loose.push(trail);
    });
    const placesById = coffeeMap([].concat(coffees || [], visits || []));
    const visitIds = coffeeIdsOf(visits).filter((id) => String(id).startsWith("r"));
    const sequence = normalizeOrder(order, [...byId.keys()], coffeeIdsOf(coffees), visitIds);
    const stayAt = sequence.indexOf("stay");
    const before = sequence.slice(0, stayAt).map((token) => activityFor(token, byId, placesById)).filter(Boolean);
    const after = sequence.slice(stayAt + 1).map((token) => activityFor(token, byId, placesById)).filter(Boolean)
      .concat(loose.map((trail) => ({ type: "hike", trail })));
    const dinner = clock.dinner == null ? arrival + 90 : minuteOf(clock.dinner);
    const rise = clock.rise == null ? 7 * 60 : minuteOf(clock.rise);
    const breakfast = clock.breakfast == null ? rise + 30 : minuteOf(clock.breakfast);
    const steps = [];
    if (!before.length) {
      steps.push({
        kind: "depart",
        block: "road",
        part: "out",
        at: drive == null ? null : minuteOf(arrival - drive),
        drive,
      });
      steps.push({ kind: "arrive", block: "road", part: "out", at: arrival });
    } else {
      const placed = stepsBeforeStay(before, arrival, camp);
      const raw = placed[0].raw;
      steps.push({
        kind: "depart",
        block: "road",
        part: "out",
        at: drive == null || raw == null ? (drive == null ? null : minuteOf(arrival - drive)) : minuteOf(raw - drive),
        drive,
        toward: before.some((item) => item.type === "hike")
          ? "hike"
          : before.some((item) => item.type === "visit")
            ? "visit"
            : "coffee",
      });
      placed.forEach((item) => steps.push(item.step));
    }
    if (before.length) {
      steps.push({
        kind: "arrive",
        block: "stay",
        part: "out",
        at: arrival,
        afterHike: before.some((item) => item.type === "hike"),
        afterVisit: !before.some((item) => item.type === "hike") && before.some((item) => item.type === "visit"),
      });
    }
    steps.push({ kind: "dinner", block: "stay", part: "out", at: dinner });
    steps.push({ kind: "rise", block: "stay", part: "next", at: rise });
    steps.push({ kind: "breakfast", block: "stay", part: "next", at: breakfast });
    if (!before.length && !after.length) steps.push({ kind: "need-hike", block: "stay", part: "next" });
    if (after.length) steps.push(...stepsAfterStay(after, { ...clock, place: camp }));
    const dates = tripDates(from, to, today);
    const leave = clock.back == null ? defaultReturnAt(steps, dates.nights) : minuteOf(clock.back);
    steps.push({
      kind: "return",
      block: "return",
      part: "back",
      at: leave,
      drive,
      nights: dates.nights,
    });
    if (drive != null) {
      const homeAt = leave + drive;
      steps.push({
        kind: "home",
        block: "return",
        part: "back",
        at: minuteOf(homeAt),
        drive,
        pastMidnight: homeAt >= 24 * 60,
      });
    }
    return stampDays(steps, dates);
  }

  function retimedHours({ hours, arrival, step, next, trailIds, order, coffeeIds, visitIds }) {
    const clock = {
      dinner: hours && hours.dinner != null ? minuteOf(hours.dinner) : null,
      rise: hours && hours.rise != null ? minuteOf(hours.rise) : null,
      breakfast: hours && hours.breakfast != null ? minuteOf(hours.breakfast) : null,
      start: hours && hours.start != null ? minuteOf(hours.start) : null,
      lunch: hours && hours.lunch != null ? minuteOf(hours.lunch) : null,
      back: hours && hours.back != null ? minuteOf(hours.back) : null,
      hikes: {},
      coffeeAt: {},
      visitAt: {},
    };
    Object.keys((hours && hours.hikes) || {}).forEach((id) => {
      const at = minuteOf(hours.hikes[id]);
      if (at != null) clock.hikes[id] = at;
    });
    Object.keys((hours && hours.coffeeAt) || {}).forEach((id) => {
      const at = minuteOf(hours.coffeeAt[id]);
      if (/^[or]\d+$/.test(id) && at != null) clock.coffeeAt[id] = at;
    });
    Object.keys((hours && hours.visitAt) || {}).forEach((id) => {
      const at = minuteOf(hours.visitAt[id]);
      if (/^r\d+$/.test(id) && at != null) clock.visitAt[id] = at;
    });
    let nextArrival = minuteOf(arrival);
    if (nextArrival == null) nextArrival = 17 * 60;
    const target = minuteOf(next);
    if (!step || step.at == null || target == null) return { arrival: nextArrival, hours: clock };
    const delta = target - step.at;
    const sequence = normalizeOrder(order, trailIds, coffeeIds, visitIds);
    const stayAt = sequence.indexOf("stay");
    const before = new Set(sequence.slice(0, stayAt));
    const after = sequence.slice(stayAt + 1);
    const shiftAfter = (from) => {
      after.slice(from).forEach((token) => {
        if (typeof token === "number" && clock.hikes[token] != null) {
          clock.hikes[token] = minuteOf(clock.hikes[token] + delta);
        }
        const placeId = coffeePlaceId(token);
        if (placeId && clock.coffeeAt[placeId] != null) {
          clock.coffeeAt[placeId] = minuteOf(clock.coffeeAt[placeId] + delta);
        }
        const visitId = visitPlaceId(token);
        if (visitId && clock.visitAt[visitId] != null) {
          clock.visitAt[visitId] = minuteOf(clock.visitAt[visitId] + delta);
        }
      });
    };
    if (step.kind === "depart" || step.kind === "arrive") nextArrival = minuteOf(nextArrival + delta);
    else if (step.kind === "hike" && before.has(step.trailId)) nextArrival = minuteOf(nextArrival + delta);
    else if (step.kind === "coffee" && before.has(coffeeToken(step.placeId))) nextArrival = minuteOf(nextArrival + delta);
    else if (step.kind === "visit" && before.has(visitToken(step.placeId))) nextArrival = minuteOf(nextArrival + delta);
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
    } else if (step.kind === "coffee" && after[0] === coffeeToken(step.placeId)) {
      clock.start = target;
      delete clock.coffeeAt[step.placeId];
      shiftAfter(1);
      if (clock.lunch != null) clock.lunch = minuteOf(clock.lunch + delta);
    } else if (step.kind === "coffee") {
      clock.coffeeAt[step.placeId] = target;
      shiftAfter(after.indexOf(coffeeToken(step.placeId)) + 1);
      if (clock.lunch != null) clock.lunch = minuteOf(clock.lunch + delta);
    } else if (step.kind === "visit" && after[0] === visitToken(step.placeId)) {
      clock.start = target;
      delete clock.visitAt[step.placeId];
      shiftAfter(1);
      if (clock.lunch != null) clock.lunch = minuteOf(clock.lunch + delta);
    } else if (step.kind === "visit") {
      clock.visitAt[step.placeId] = target;
      shiftAfter(after.indexOf(visitToken(step.placeId)) + 1);
      if (clock.lunch != null) clock.lunch = minuteOf(clock.lunch + delta);
    } else if (step.kind === "lunch") clock.lunch = target;
    else if (step.kind === "return") clock.back = target;
    else if (step.kind === "home") clock.back = minuteOf(target - (step.drive || 0));
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

  function tripStages(camp, trails, order, coffees, visits) {
    const stages = [];
    const paths = [];
    const chosen = trails || [];
    const byId = new Map();
    const loose = [];
    chosen.forEach((trail) => {
      if (trail && Number.isFinite(Number(trail.id))) byId.set(Number(trail.id), trail);
      else if (trail) loose.push(trail);
    });
    const placesById = coffeeMap([].concat(coffees || [], visits || []));
    const visitIds = coffeeIdsOf(visits).filter((id) => String(id).startsWith("r"));
    const sequence = normalizeOrder(order, [...byId.keys()], coffeeIdsOf(coffees), visitIds);
    const stayAt = sequence.indexOf("stay");
    const hikesBefore = sequence.slice(0, stayAt).some((token) => byId.has(token));
    const hikesAfter = sequence.slice(stayAt + 1).some((token) => byId.has(token)) || loose.length > 0;
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
        stages.push({ ...base, kind: "far", n: number, lat: end[0], lng: end[1], title: "סוף המסלול" });
        number += 1;
      }
    }

    function addCoffee(place) {
      if (place.lat == null) return;
      stages.push({
        kind: "coffee",
        n: number,
        lat: place.lat,
        lng: place.lng,
        title: "תצפית לקפה",
        text: place.name,
        placeId: String(place.id),
        photos: (place.photos || []).slice(0, 2),
        highlights: [],
      });
      number += 1;
    }

    function addVisit(place) {
      if (place.lat == null) return;
      stages.push({
        kind: "visit",
        n: number,
        lat: place.lat,
        lng: place.lng,
        title: "ביקור",
        text: place.name,
        placeId: String(place.id),
        placeKind: place.kind || "park",
        photos: (place.photos || []).slice(0, 2),
        highlights: (place.tags || []).slice(0, 3),
      });
      number += 1;
    }

    sequence.forEach((token) => {
      const visitId = visitPlaceId(token);
      const placeId = coffeePlaceId(token);
      if (token === "stay") addCamp();
      else if (visitId && placesById.has(visitId)) addVisit(placesById.get(visitId));
      else if (placeId && placesById.has(placeId)) addCoffee(placesById.get(placeId));
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

  function aroundCount(camp) {
    const nearby = (camp && camp.nearby) || [];
    const close = nearby.filter((near) => near.km != null && near.km <= 20).length;
    return { close, wide: nearby.length };
  }

  function nearbyPlaces(camp, places, options) {
    const settings = options || {};
    const maxKm = settings.maxKm == null ? 15 : settings.maxKm;
    const kind = settings.kind && settings.kind !== "all" ? settings.kind : "";
    const varied = settings.varied !== false && !kind;
    const perKind = settings.perKind == null ? 3 : settings.perKind;
    if (!camp || camp.lat == null || camp.lng == null) return [];
    const matched = [];
    (places || []).forEach((place) => {
      if (!place || place.lat == null || place.lng == null) return;
      if (kind && place.kind !== kind) return;
      if (place.name && camp.name && place.name === camp.name) return;
      const km = haversineKm(camp, place);
      if (!Number.isFinite(km) || km > maxKm) return;
      matched.push({ place, km: Math.round(km * 10) / 10 });
    });
    matched.sort((left, right) => {
      if (left.km !== right.km) return left.km - right.km;
      return String(left.place.name).localeCompare(String(right.place.name), "he");
    });
    if (!varied) return matched;
    const picked = [];
    const skipped = [];
    const counts = {};
    matched.forEach((item) => {
      const count = counts[item.place.kind] || 0;
      if (count >= perKind) skipped.push(item);
      else {
        counts[item.place.kind] = count + 1;
        picked.push(item);
      }
    });
    return picked.concat(skipped);
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

  function nearbyList(items, filters, sort) {
    const matched = (items || []).filter((item) => item && item.trail && trailMatches(item.trail, filters || {}));
    const rank = { easy: 0, moderate: 1, challenging: 2 };
    matched.sort((left, right) => {
      if (sort === "short") {
        const leftHours = left.trail.hoursMax == null ? 99 : left.trail.hoursMax;
        const rightHours = right.trail.hoursMax == null ? 99 : right.trail.hoursMax;
        if (leftHours !== rightHours) return leftHours - rightHours;
      } else if (sort === "easy") {
        const leftRank = rank[left.trail.difficulty] == null ? 9 : rank[left.trail.difficulty];
        const rightRank = rank[right.trail.difficulty] == null ? 9 : rank[right.trail.difficulty];
        if (leftRank !== rightRank) return leftRank - rightRank;
      }
      const leftKm = left.km == null ? 999 : left.km;
      const rightKm = right.km == null ? 999 : right.km;
      if (leftKm !== rightKm) return leftKm - rightKm;
      return String(left.trail.name).localeCompare(String(right.trail.name), "he");
    });
    return matched;
  }

  function shareClock(minutes) {
    if (minutes == null) return "";
    const day = ((minutes % 1440) + 1440) % 1440;
    const hour = Math.floor(day / 60);
    const mins = day % 60;
    return `${String(hour).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  function shareDuration(minutes) {
    const rounded = Math.max(15, Math.round(minutes / 15) * 15);
    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;
    if (!hours) return `כ־${rounded} דקות`;
    const head = hours === 1 ? "כשעה" : hours === 2 ? "כשעתיים" : `כ־${hours} שעות`;
    if (!mins) return head;
    if (mins === 30) return `${head} וחצי`;
    return `${head} ו־${mins} דקות`;
  }

  function shareWhat(step) {
    if (step.kind === "depart") return "יוצאים מהבית";
    if (step.kind === "arrive") return "מגיעים לחניון";
    if (step.kind === "dinner") return "ארוחת ערב בחניון";
    if (step.kind === "rise") return "קימה בחניון";
    if (step.kind === "breakfast") return "ארוחת בוקר בחניון";
    if (step.kind === "lunch") return "ארוחת צהריים בחניון";
    if (step.kind === "return") return "יוצאים הביתה";
    if (step.kind === "home") return "מגיעים הביתה";
    if (step.kind === "hike") {
      const name = String(step.name || "מסלול").split(/\s+[–—-]\s+/)[0].trim();
      if (step.walk == null) return name;
      return `${name} · הליכה ${shareDuration(step.walk)}`;
    }
    if (step.kind === "coffee") {
      const name = String(step.name || "מצפור").split(/\s+[–—-]\s+/)[0].trim();
      return `תצפית לקפה · ${name}`;
    }
    if (step.kind === "visit") {
      const name = String(step.name || "ביקור").split(/\s+[–—-]\s+/)[0].trim();
      if (step.walk == null) return `ביקור · ${name}`;
      return `ביקור · ${name} · ${shareDuration(step.walk)}`;
    }
    return "";
  }

  function shareMessage(options) {
    const settings = options || {};
    const camp = settings.camp || {};
    const trails = settings.trails || [];
    const coffees = settings.coffees || [];
    const visits = settings.visits || [];
    const steps = buildItinerary({
      camp,
      trails,
      coffees,
      visits,
      arrivalMinutes: settings.arrivalMinutes,
      origin: settings.origin,
      hours: settings.hours,
      order: settings.order,
      from: settings.from,
      to: settings.to,
    });
    const lines = ["בניתי לנו מסלול עם קמפינג"];
    const name = String(settings.name || "").trim();
    if (name && name !== "טיול בלי שם" && name !== camp.name) lines.push(name);
    const dates = tripDates(settings.from, settings.to);
    lines.push(`${dayLabel(dates.from)} עד ${dayLabel(dates.to)}`);
    lines.push("");
    lines.push(camp.name || "החניון");
    if (camp.url) lines.push(camp.url);
    lines.push("");
    lines.push("לוז");
    const byTrail = new Map(trails.map((trail) => [trail.id, trail]));
    let currentDay = "";
    steps.forEach((step) => {
      if (step.kind === "need-hike") {
        lines.push("עדיין אין מסלול");
        return;
      }
      const what = shareWhat(step);
      if (!what) return;
      if (step.day && step.day !== currentDay) {
        currentDay = step.day;
        lines.push("");
        lines.push(currentDay);
      }
      if (step.inbound) lines.push(`נסיעה של ${shareDuration(step.inbound)}`);
      const time = shareClock(step.at);
      lines.push(time ? `${time}  ${what}` : what);
      if (step.kind === "hike") {
        const trail = byTrail.get(step.trailId);
        if (trail && trail.url) lines.push(trail.url);
      }
      if (step.kind === "coffee" && step.url) lines.push(step.url);
      if (step.kind === "visit" && step.url) lines.push(step.url);
      if (step.travel) lines.push(`נסיעה של ${shareDuration(step.travel)}`);
    });
    if (settings.url) {
      lines.push("");
      lines.push(`הטיול במפה: ${settings.url}`);
    }
    return lines.join("\n");
  }

  return {
    buildPlans,
    trailMatches,
    timeMatches,
    campMatches,
    planUrl,
    nearbyChoices,
    nearbyPlaces,
    nearbyList,
    aroundCount,
    lengthIsUsable,
    regionOrigin,
    centerOrigin,
    buildItinerary,
    retimedHours,
    normalizeOrder,
    moveOrder,
    coffeeToken,
    coffeePlaceId,
    visitToken,
    visitPlaceId,
    visitMinutes,
    visitIsEstimate,
    travelMinutes,
    onTheWay,
    shareDuration,
    comingWeekend,
    tripDates,
    moveTripDates,
    tripStages,
    storyPath,
    trailLures,
    shareMessage,
  };
});
