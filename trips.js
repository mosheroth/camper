/* Saved trips live in the browser. A shared link does not need that storage. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof localStorage !== "undefined") {
    const trips = api.open({
      get: () => localStorage.getItem("camper-trips"),
      set: (value) => localStorage.setItem("camper-trips", value),
    });
    trips.send = async function send(trip) {
      const url = new URL(trips.sharePath(trip), window.location.href).href;
      const payload = { title: trip.name || "טיול", text: trip.name || "טיול", url };
      if (navigator.share) {
        try {
          await navigator.share(payload);
          return { ok: true, url, shared: true };
        } catch (error) {
          if (error && error.name === "AbortError") return { ok: false, url, aborted: true };
        }
      }
      try {
        await navigator.clipboard.writeText(url);
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
      const campId = Number(input && input.campId);
      const trailIds = cleanTrails(input && input.trailIds);
      if (!Number.isFinite(campId)) return null;
      const now = new Date().toISOString();
      const id = input && input.id;
      const index = id ? listNow.findIndex((trip) => trip.id === id) : -1;
      const previous = index >= 0 ? listNow[index] : null;
      const draft = input && Object.prototype.hasOwnProperty.call(input, "draft")
        ? Boolean(input.draft)
        : previous ? Boolean(previous.draft) : false;
      const place = input && input.place
        ? cleanPlace(input.place)
        : previous && previous.place ? cleanPlace(previous.place) : cleanPlace(null);
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
      params.set("camp", String(trip.campId));
      params.set("trails", (trip.trailIds || []).join(","));
      if (trip.name) params.set("name", trip.name);
      const place = trip.place || {};
      if (place.view === "detail" || place.view === "camp") params.set("view", place.view);
      if (place.view === "detail" && place.focusId != null) params.set("focus", String(place.focusId));
      if (place.arrival && place.arrival !== 17 * 60) params.set("arrival", String(place.arrival));
      if (place.dinner != null) params.set("dinner", String(place.dinner));
      if (place.rise != null) params.set("rise", String(place.rise));
      if (place.breakfast != null) params.set("breakfast", String(place.breakfast));
      if (place.start != null) params.set("start", String(place.start));
      if (place.lunch != null) params.set("lunch", String(place.lunch));
      const hikes = Object.keys(place.hikes || {}).map((id) => `${id}:${place.hikes[id]}`).join(",");
      if (hikes) params.set("hikes", hikes);
      if (place.radius === 40) params.set("radius", "40");
      if (withId && trip.id) params.set("trip", trip.id);
      return `trip.html?${params.toString()}`;
    }

    return { list, get, save, remove, sharePath, editPath };
  }

  function valid(trip) {
    return Boolean(trip && typeof trip.id === "string" && Number.isFinite(Number(trip.campId)));
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
    const view = source.view === "detail" || source.view === "camp" ? source.view : "routes";
    const focusId = Number(source.focusId);
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
      radius: Number(source.radius) === 40 ? 40 : 20,
    };
  }

  function cleanMinute(value, fallback) {
    if (value == null || value === "") return fallback;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number >= 24 * 60) return fallback;
    return number;
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
