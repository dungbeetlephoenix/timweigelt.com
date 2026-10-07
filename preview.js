(() => {
  if (!("showPopover" in HTMLElement.prototype)) return;

  const main = document.querySelector("main");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let active = null;
  let transition = null;
  let operation = Promise.resolve();

  // Serialize state changes while allowing an interrupted animation to finish early.
  const changeView = (update) => {
    transition?.skipTransition();
    operation = operation.then(async () => {
      if (!document.startViewTransition || reducedMotion.matches) {
        update();
        return;
      }
      const current = document.startViewTransition(update);
      transition = current;
      await current.finished.catch(() => {});
      if (transition === current) transition = null;
    });
    return operation;
  };

  const close = () => changeView(() => {
    if (!active) return;
    const previous = active;
    active = null;
    previous.popup.hidePopover();
    previous.reset();
    main.inert = false;
    document.body.classList.remove("has-preview");
    previous.trigger.focus({ preventScroll: true });
  });

  for (const trigger of document.querySelectorAll(".artifact")) {
    const popup = document.getElementById(trigger.getAttribute("popovertarget"));
    const frame = popup.querySelector(".inspection-frame");
    const image = frame.querySelector("img");
    const zoomButton = popup.querySelector("[data-zoom]");
    const pointers = new Map();
    let camera = { scale: 1, x: 0, y: 0 };
    let target = { ...camera };
    let animation = 0;
    let lastTime = 0;
    let gesture = null;
    let moved = false;

    popup.popover = "manual";
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-describedby", popup.querySelector(".inspection-hint").id);
    frame.tabIndex = 0;
    frame.setAttribute("role", "region");
    frame.setAttribute("aria-label", "Image inspection. Plus and minus to zoom, arrow keys to pan, zero to fit.");
    frame.classList.add("is-interactive");
    popup.querySelector(".zoom-controls").hidden = false;
    popup.querySelector(".inspection-hint").hidden = false;
    image.draggable = false;

    const maxScale = () => Math.max(1, Math.min(4, image.naturalWidth / frame.clientWidth));
    const bound = (value) => {
      value.scale = Math.max(1, Math.min(maxScale(), value.scale));
      const xLimit = frame.clientWidth * (value.scale - 1) / 2;
      const yLimit = frame.clientHeight * (value.scale - 1) / 2;
      value.x = Math.max(-xLimit, Math.min(xLimit, value.x));
      value.y = Math.max(-yLimit, Math.min(yLimit, value.y));
      return value;
    };
    const render = () => {
      image.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;
      frame.classList.toggle("is-zoomed", camera.scale > 1.01);
      zoomButton.disabled = target.scale >= maxScale() - 0.01;
    };
    const tick = (time) => {
      const fraction = 1 - Math.exp(-Math.min(time - lastTime, 64) / 50);
      lastTime = time;
      for (const key of ["scale", "x", "y"]) camera[key] += (target[key] - camera[key]) * fraction;
      const settled = Math.abs(camera.scale - target.scale) < 0.001 && Math.abs(camera.x - target.x) < 0.1 && Math.abs(camera.y - target.y) < 0.1;
      if (settled) camera = { ...target };
      render();
      animation = settled ? 0 : requestAnimationFrame(tick);
    };
    const setCamera = (next, direct = false) => {
      target = bound(next);
      if (direct || reducedMotion.matches) {
        cancelAnimationFrame(animation);
        animation = 0;
        camera = { ...target };
        render();
      } else if (!animation) {
        lastTime = performance.now();
        animation = requestAnimationFrame(tick);
      }
    };
    const point = (x, y) => {
      const rect = frame.getBoundingClientRect();
      return { x: x - rect.left - rect.width / 2, y: y - rect.top - rect.height / 2 };
    };
    const zoom = (scale, anchor = { x: 0, y: 0 }, direct = false) => {
      scale = Math.max(1, Math.min(maxScale(), scale));
      const ratio = scale / target.scale;
      setCamera({ scale, x: anchor.x - (anchor.x - target.x) * ratio, y: anchor.y - (anchor.y - target.y) * ratio }, direct);
    };
    const reset = () => {
      pointers.clear();
      gesture = null;
      frame.classList.remove("is-dragging");
      setCamera({ scale: 1, x: 0, y: 0 }, true);
    };
    const controller = { popup, trigger, reset };

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      changeView(() => {
        if (active) active.popup.hidePopover();
        active = controller;
        reset();
        document.body.classList.add("has-preview");
        main.inert = true;
        popup.showPopover();
      });
    });
    popup.querySelector("[data-close]").addEventListener("click", (event) => {
      event.preventDefault();
      close();
    });
    popup.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Tab") {
        const stops = [...popup.querySelectorAll("a, button, [tabindex='0']")].filter((element) => !element.disabled && !element.hidden);
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      if (document.activeElement !== frame) return;
      if (event.key === "+" || event.key === "=") zoom(target.scale * 1.4);
      else if (event.key === "-") zoom(target.scale / 1.4);
      else if (event.key === "0") setCamera({ scale: 1, x: 0, y: 0 });
      else if (event.key.startsWith("Arrow")) {
        const step = event.shiftKey ? 100 : 40;
        setCamera({ ...target, x: target.x + (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0), y: target.y + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0) });
      } else return;
      event.preventDefault();
    });
    zoomButton.addEventListener("click", () => zoom(target.scale * 1.5));
    popup.querySelector("[data-fit]").addEventListener("click", () => setCamera({ scale: 1, x: 0, y: 0 }));
    frame.addEventListener("wheel", (event) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame.clientHeight : 1);
      zoom(target.scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.003), point(event.clientX, event.clientY));
    }, { passive: false });

    const startGesture = () => {
      const values = [...pointers.values()];
      if (values.length > 1) {
        const [a, b] = values;
        gesture = { camera: { ...camera }, center: point((a.x + b.x) / 2, (a.y + b.y) / 2), distance: Math.hypot(a.x - b.x, a.y - b.y) };
      } else if (values.length) gesture = { camera: { ...camera }, pointer: { ...values[0] } };
      else gesture = null;
    };
    frame.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      frame.focus({ preventScroll: true });
      setCamera({ ...camera }, true);
      if (!pointers.size) moved = false;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      frame.setPointerCapture(event.pointerId);
      if (pointers.size > 1) moved = true;
      startGesture();
    });
    frame.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size > 1) {
        const [a, b] = [...pointers.values()];
        const center = point((a.x + b.x) / 2, (a.y + b.y) / 2);
        const scale = Math.max(1, Math.min(maxScale(), gesture.camera.scale * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, gesture.distance)));
        const ratio = scale / gesture.camera.scale;
        setCamera({ scale, x: center.x - (gesture.center.x - gesture.camera.x) * ratio, y: center.y - (gesture.center.y - gesture.camera.y) * ratio }, true);
      } else {
        const dx = event.clientX - gesture.pointer.x;
        const dy = event.clientY - gesture.pointer.y;
        if (Math.hypot(dx, dy) > 4) moved = true;
        if (camera.scale > 1) {
          frame.classList.toggle("is-dragging", moved);
          setCamera({ ...gesture.camera, x: gesture.camera.x + dx, y: gesture.camera.y + dy }, true);
        }
      }
    });
    const release = (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      frame.classList.remove("is-dragging");
      if (!pointers.size && !moved && event.type === "pointerup") {
        zoom(camera.scale > 1.01 ? 1 : 2, point(event.clientX, event.clientY));
      }
      startGesture();
    };
    frame.addEventListener("pointerup", release);
    frame.addEventListener("pointercancel", release);
    frame.addEventListener("lostpointercapture", release);
    image.addEventListener("load", () => { if (popup.matches(":popover-open")) setCamera({ ...target }, true); });
    reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) setCamera({ ...target }, true); });
    new ResizeObserver(() => { if (popup.matches(":popover-open")) setCamera({ ...target }, true); }).observe(frame);
  }
  document.addEventListener("click", (event) => {
    if (!active || active.trigger.contains(event.target)) return;
    const rect = active.popup.getBoundingClientRect();
    const outsideBounds = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (!active.popup.contains(event.target) || (event.target === active.popup && outsideBounds)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (active || transition)) { event.preventDefault(); close(); }
  });
})();
