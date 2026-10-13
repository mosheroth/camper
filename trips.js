/* Saved trips live in the browser. A shared link does not need that storage. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof localStorage !== "undefined") {
    const trips = api.open({
      get: () => localStorage.getItem("camper-trips"),
      set: (value) => localStorage.setItem("camper-trips", value),
    });
    trips.send = async function send(trip, text) {
      const url = new URL(trips.sharePath(trip), window.location.href).href;
      const title = root.CamperPlan && root.CamperPlan.shareTitle
        ? root.CamperPlan.shareTitle(trip && trip.name)
        : String((trip && trip.name) || "").trim() || "בניתי לנו מסלול עם קמפינג";
      const body = text || `${title}\n${url}`;
      const payload = { title, text: body, url };
      if (navigator.share) {
        try {
          await navigator.share(payload);
          return { ok: true, url, shared: true };
        } catch (error) {
          if (error && error.name === "AbortError") return { ok: false, url, aborted: true };
        }
      }
      try {
        await navigator.clipboard.writeText(body);
        return { ok: true, url, copied: true };
      } catch (_error) {
        return { ok: false, url, copied: false };
      }
    };
    root.CamperTrips = trips;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function open(storage) {
    function read() {
      try {
        const parsed = JSON.parse(storage.get() || "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(valid);
      } catch (_error) {
        return [];
      }
    }

    function write(list) {
      storage.set(JSON.stringify(list));
    }

    function list() {
      return read().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }

    function get(id) {
      return list().find((trip) => trip.id === id) || null;
    }

    function save(input) {
      const listNow = read();
      const name = cleanName(input && input.name);
      const now = new Date().toISOString();
      const id = input && input.id;
      const index = id ? listNow.findIndex((trip) => trip.id === id) : -1;
      const previous = index >= 0 ? listNow[index] : null;
      const campId = input && Object.prototype.hasOwnProperty.call(input, "campId")
        ? cleanCampId(input.campId)
        : previous ? cleanCampId(previous.campId) : null;
      const trailIds = cleanTrails(input && input.trailIds);
      const draft = input && Object.prototype.hasOwnProperty.call(input, "draft")
        ? Boolean(input.draft)
        : previous ? Boolean(previous.draft) : false;
      const place = input && input.place
        ? cleanPlace(input.place)
        : previous && previous.place ? cleanPlace(previous.place) : cleanPlace(null);
      if (campId == null && !trailIds.length && !place.coffee.length && !place.visit.length) return null;
      if (previous) {
        const next = {
          ...previous,
          name,
          campId,
          trailIds,
          draft,
          place,
          updatedAt: now,
        };
        listNow[index] = next;
        write(listNow);
        return next;
      }
      const created = {
        id: uid(),
        name,
        campId,
        trailIds,
        draft,
        place,
        createdAt: now,
        updatedAt: now,
      };
      listNow.unshift(created);
      write(listNow);
      return created;
    }

    function remove(id) {
      write(read().filter((trip) => trip.id !== id));
    }

    function sharePath(trip) {
      return tripPath(trip, false);
    }

    function editPath(trip) {
      return tripPath(trip, true);
    }

    function tripPath(trip, withId) {
      const params = new URLSearchParams();
      if (trip.campId != null) params.set("camp", String(trip.campId));
      params.set("trails", (trip.trailIds || []).join(","));
      if (trip.name) params.set("name", trip.name);
      const place = trip.place || {};
      if (place.view === "detail" || place.view === "camp" || place.view === "visit" || place.view === "coffee") params.set("view", place.view);
      if (place.view === "detail" && place.focusId != null) params.set("focus", String(place.focusId));
      if ((place.view === "visit" || place.view === "coffee") && place.spot) params.set("spot", place.spot);
      if (place.arrival && place.arrival !== 17 * 60) params.set("arrival", String(place.arrival));
      if (place.dinner != null) params.set("dinner", String(place.dinner));
      if (place.rise != null) params.set("rise", String(place.rise));
      if (place.breakfast != null) params.set("breakfast", String(place.breakfast));
      if (place.start != null) params.set("start", String(place.start));
      if (place.lunch != null) params.set("lunch", String(place.lunch));
      const hikes = Object.keys(place.hikes || {}).map((id) => `${id}:${place.hikes[id]}`).join(",");
      if (hikes) params.set("hikes", hikes);
      if (place.radius === 40) params.set("radius", "40");
      if (Array.isArray(place.order) && place.order.length) {
        const text = place.order.map(String).join(",");
        const fallback = ["stay"].concat(trip.trailIds || []).join(",");
        if (text !== fallback) params.set("order", text);
      }
      if (place.from) params.set("from", place.from);
      if (place.to) params.set("to", place.to);
      if (place.back != null) params.set("back", String(place.back));
      const coffee = (place.coffee || []).join(",");
      if (coffee) params.set("coffee", coffee);
      const visit = (place.visit || []).join(",");
      if (visit) params.set("visit", visit);
      const stops = Object.keys(place.stops || {}).map((id) => `${id}:${place.stops[id]}`).join(",");
      if (stops) params.set("stops", stops);
      if (withId && trip.id) params.set("trip", trip.id);
      return `trip.html?${params.toString()}`;
    }

    return { list, get, save, remove, sharePath, editPath };
  }

  function valid(trip) {
    if (!trip || typeof trip.id !== "string") return false;
    if (trip.campId != null && !Number.isFinite(Number(trip.campId))) return false;
    const place = trip.place || {};
    const activities = (trip.trailIds && trip.trailIds.length)
      || (place.coffee && place.coffee.length)
      || (place.visit && place.visit.length);
    return trip.campId != null || Boolean(activities);
  }

  function cleanCampId(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function cleanName(name) {
    const text = String(name || "").trim().replace(/\s+/g, " ").slice(0, 80);
    return text || "טיול בלי שם";
  }

  function cleanTrails(ids) {
    const seen = new Set();
    const clean = [];
    (ids || []).forEach((id) => {
      const number = Number(id);
      if (!Number.isFinite(number) || seen.has(number)) return;
      seen.add(number);
      clean.push(number);
    });
    return clean.slice(0, 4);
  }

  function uid() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  function cleanPlace(place) {
    const source = place || {};
    const view = source.view === "detail" || source.view === "camp" || source.view === "visit" || source.view === "coffee" ? source.view : "routes";
    const focusId = Number(source.focusId);
    const from = cleanDate(source.from);
    let to = cleanDate(source.to);
    if (from && (!to || to <= from)) to = dayAfter(from);
    return {
      view,
      focusId: Number.isFinite(focusId) ? focusId : null,
      arrival: cleanMinute(source.arrival, 17 * 60),
      dinner: cleanMinute(source.dinner, null),
      rise: cleanMinute(source.rise, null),
      breakfast: cleanMinute(source.breakfast, null),
      start: cleanMinute(source.start, null),
      lunch: cleanMinute(source.lunch, null),
      hikes: cleanHikes(source.hikes),
      coffee: cleanCoffee(source.coffee),
      visit: cleanVisit(source.visit),
      spot: placeId(source.spot) ? source.spot : "",
      stops: cleanStops(source.stops),
      radius: Number(source.radius) === 40 ? 40 : 20,
      order: cleanOrder(source.order),
      from,
      to,
      back: cleanMinute(source.back, null),
    };
  }

  function cleanDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    const m = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  }

  function dayAfter(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(year, month - 1, day + 1);
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${m}-${d}`;
  }

  function cleanMinute(value, fallback) {
    if (value == null || value === "") return fallback;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number >= 24 * 60) return fallback;
    return number;
  }

  function cleanOrder(value) {
    if (!Array.isArray(value)) return null;
    const tokens = [];
    let stay = false;
    value.forEach((token) => {
      if (token === "stay") {
        if (!stay) {
          tokens.push("stay");
          stay = true;
        }
        return;
      }
      const visit = /^v:(.+)$/.exec(String(token || ""));
      if (visit && placeId(visit[1])) {
        const marker = `v:${visit[1]}`;
        if (!tokens.includes(marker)) tokens.push(marker);
        return;
      }
      const marker = /^c:(.+)$/.exec(String(token || ""));
      if (marker && placeId(marker[1])) {
        const coffee = `c:${marker[1]}`;
        if (!tokens.includes(coffee)) tokens.push(coffee);
        return;
      }
      const id = Number(token);
      if (Number.isFinite(id) && !tokens.includes(id)) tokens.push(id);
    });
    if (!stay || tokens.length < 2) return null;
    return tokens;
  }

  function placeId(id) {
    return /^(?:ct|[or])\d+$/.test(String(id || ""));
  }

  function cleanVisit(value) {
    const ids = [];
    const parts = Array.isArray(value) ? value : String(value || "").split(",");
    parts.forEach((part) => {
      const id = String(part || "").trim();
      if (placeId(id) && !ids.includes(id)) ids.push(id);
    });
    return ids.slice(0, 2);
  }

  function cleanCoffee(value) {
    const ids = [];
    const parts = Array.isArray(value) ? value : String(value || "").split(",");
    parts.forEach((part) => {
      const id = String(part || "").trim();
      if (placeId(id) && !ids.includes(id)) ids.push(id);
    });
    return ids.slice(0, 2);
  }

  function cleanStops(value) {
    const stops = {};
    if (!value || typeof value !== "object") return stops;
    Object.keys(value).forEach((id) => {
      if (!placeId(id)) return;
      const at = cleanMinute(value[id], null);
      if (at != null) stops[id] = at;
    });
    return stops;
  }

  function cleanHikes(value) {
    const hikes = {};
    if (!value || typeof value !== "object") return hikes;
    Object.keys(value).forEach((id) => {
      const trailId = Number(id);
      const at = cleanMinute(value[id], null);
      if (Number.isFinite(trailId) && at != null) hikes[trailId] = at;
    });
    return hikes;
  }

  return { open };
});
