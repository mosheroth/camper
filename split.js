/* Drag the bar between the list and the map. The map starts at half the width. */
(function () {
  const workspace = document.querySelector(".workspace");
  const splitter = document.querySelector(".splitter");
  if (!workspace || !splitter) return;

  const key = "camper-map-share";
  const narrow = window.matchMedia("(max-width: 800px)");
  const minPanel = 280;
  const minMap = 240;
  let desired = 0.5;
  let dragging = false;
  let applying = false;

  try {
    const saved = Number(localStorage.getItem(key));
    if (saved >= 0.28 && saved <= 0.78) desired = saved;
  } catch (_error) {
    /* the default half stays in effect */
  }

  function usable() {
    const style = getComputedStyle(workspace);
    const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    return Math.max(0, workspace.clientWidth - pad - splitter.offsetWidth);
  }

  function widths(total) {
    if (total <= minPanel + minMap) return { map: Math.round(total / 2), panel: total - Math.round(total / 2) };
    const map = Math.max(minMap, Math.min(total - minPanel, Math.round(total * desired)));
    return { map, panel: total - map };
  }

  function apply(notify) {
    if (narrow.matches) {
      workspace.style.removeProperty("--panel-size");
      workspace.style.removeProperty("--map-size");
      return;
    }
    const total = usable();
    const size = widths(total);
    applying = true;
    workspace.style.setProperty("--panel-size", size.panel + "px");
    workspace.style.setProperty("--map-size", size.map + "px");
    splitter.setAttribute("aria-valuenow", String(Math.round((size.map / Math.max(total, 1)) * 100)));
    if (notify) window.dispatchEvent(new Event("resize"));
    applying = false;
  }

  function remember() {
    try {
      localStorage.setItem(key, String(Math.round(desired * 1000) / 1000));
    } catch (_error) {
      /* the size still holds until the tab closes */
    }
  }

  splitter.addEventListener("pointerdown", (event) => {
    if (narrow.matches || event.button !== 0) return;
    dragging = true;
    splitter.classList.add("dragging");
    document.body.classList.add("splitting");
    try {
      splitter.setPointerCapture(event.pointerId);
    } catch (_error) {
      /* the move events are still listened for on the bar */
    }
    event.preventDefault();
  });

  splitter.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const style = getComputedStyle(workspace);
    const left = workspace.getBoundingClientRect().left + parseFloat(style.paddingLeft);
    const total = usable();
    if (!total) return;
    desired = Math.min(0.78, Math.max(0.28, (event.clientX - left) / total));
    apply(true);
  });

  function stop() {
    if (!dragging) return;
    dragging = false;
    desired = Math.min(0.78, Math.max(0.28, desired));
    splitter.classList.remove("dragging");
    document.body.classList.remove("splitting");
    remember();
    apply(true);
  }

  splitter.addEventListener("pointerup", stop);
  splitter.addEventListener("pointercancel", stop);
  splitter.addEventListener("keydown", (event) => {
    if (narrow.matches) return;
    const step = event.shiftKey ? 0.08 : 0.02;
    if (event.key === "ArrowLeft") desired -= step;
    else if (event.key === "ArrowRight") desired += step;
    else return;
    desired = Math.min(0.78, Math.max(0.28, desired));
    event.preventDefault();
    remember();
    apply(true);
  });

  narrow.addEventListener("change", () => apply(true));
  window.addEventListener("resize", () => {
    if (applying || dragging) return;
    apply(true);
  });

  apply(false);
})();
