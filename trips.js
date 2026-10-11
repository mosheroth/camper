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
      if (index >= 0) {
        const next = {
          ...listNow[index],
          name,
          campId,
          trailIds,
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
      const params = new URLSearchParams();
      params.set("camp", String(trip.campId));
      params.set("trails", (trip.trailIds || []).join(","));
      if (trip.name) params.set("name", trip.name);
      return `trip.html?${params.toString()}`;
    }

    function editPath(trip) {
      const params = new URLSearchParams();
      params.set("camp", String(trip.campId));
      params.set("trails", (trip.trailIds || []).join(","));
      if (trip.name) params.set("name", trip.name);
      if (trip.id) params.set("trip", trip.id);
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

  return { open };
});
