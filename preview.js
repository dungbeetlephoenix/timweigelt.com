(() => {
  if (!("showPopover" in HTMLElement.prototype)) return;

  const main = document.querySelector("main");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let active = null;
  let request = 0;

  const pictureBounds = (frame, image) => ({ frame: frame.getBoundingClientRect(), image: image.getBoundingClientRect() });
  const box = (rect, parent = { left: 0, top: 0 }) => ({ left: `${rect.left - parent.left}px`, top: `${rect.top - parent.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  const finishFlight = (controller) => {
    controller.motionId++;
    controller.flight?.animations.forEach((animation) => animation.cancel());
    controller.flight?.holder.remove();
    controller.flight = null;
    controller.popup.classList.remove("is-transitioning");
    const settle = controller.settle;
    controller.settle = null;
    settle?.();
  };
  // One image plane moves between the two windows; no old/new-image crossfade.
  const fly = (controller, from, to, settle) => {
    controller.motionId++;
    const motionId = controller.motionId;
    controller.flight?.animations.forEach((animation) => animation.cancel());
    controller.flight?.holder.remove();
    controller.flight = null;
    controller.settle = settle;
    if (reducedMotion.matches || !Element.prototype.animate) {
      finishFlight(controller);
      return;
    }
    const holder = document.createElement("div");
    holder.className = "image-flight";
    holder.style.borderRadius = getComputedStyle(controller.frame).borderRadius;
    holder.setAttribute("aria-hidden", "true");
    const picture = controller.image.cloneNode();
    picture.removeAttribute("style");
    picture.alt = "";
    holder.append(picture);
    controller.popup.append(holder);
    Object.assign(holder.style, box(from.frame));
    Object.assign(picture.style, box(from.image, from.frame));
    controller.popup.classList.add("is-transitioning");
    const timing = { duration: controller.phase === "closing" ? 320 : 440, easing: "cubic-bezier(.2, .8, .2, 1)", fill: "both" };
    const animations = [holder.animate([box(from.frame), box(to.frame)], timing), picture.animate([box(from.image, from.frame), box(to.image, to.frame)], timing)];
    controller.flight = { holder, picture, animations };
    Promise.all(animations.map((animation) => animation.finished)).then(() => {
      if (controller.motionId === motionId) finishFlight(controller);
    }).catch(() => {});
  };

  const close = () => {
    request++;
    if (!active) return;
    const previous = active;
    if (previous.phase === "closing") { finishFlight(previous); return; }
    const from = previous.flight ? pictureBounds(previous.flight.holder, previous.flight.picture) : pictureBounds(previous.frame, previous.image);
    previous.freeze();
    previous.phase = "closing";
    previous.popup.classList.add("is-closing");
    const to = pictureBounds(previous.trigger, previous.trigger.querySelector("img"));
    fly(previous, from, to, () => {
      active = null;
      previous.popup.hidePopover();
      previous.popup.classList.remove("is-closing");
      previous.trigger.classList.remove("is-source");
      previous.phase = "closed";
      previous.reset();
      main.inert = false;
      document.body.classList.remove("has-preview");
      previous.trigger.focus({ preventScroll: true });
    });
  };

  for (const trigger of document.querySelectorAll(".artifact:not([data-player])")) {
    const popup = document.getElementById(trigger.getAttribute("popovertarget"));
    const frame = popup.querySelector(".inspection-frame");
    const image = frame.querySelector("img");
    const fitButton = popup.querySelector("[data-fit]");
    const pointers = new Map();
    let camera = { scale: 1, x: 0, y: 0 };
    let target = { ...camera };
    let animation = 0;
    let lastTime = 0;
    let gesture = null;
    let moved = false;
    let baseWidth = 0;
    let baseHeight = 0;
    let frameWidth = 0;
    let frameHeight = 0;

    popup.popover = "manual";
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-describedby", popup.querySelector(".visually-hidden").id);
    frame.tabIndex = 0;
    frame.setAttribute("role", "region");
    frame.setAttribute("aria-label", "Image inspection. Plus and minus to zoom, arrow keys to pan, zero to fit.");
    frame.classList.add("is-interactive");
    image.draggable = false;

    const measure = () => {
      const rect = frame.getBoundingClientRect();
      frameWidth = baseWidth = rect.width;
      frameHeight = baseHeight = rect.height;
    };
    const maxScale = () => {
      const density = Math.max(1, devicePixelRatio);
      return Math.max(1, Math.min(4, image.naturalWidth / ((baseWidth || 1) * density), image.naturalHeight / ((baseHeight || 1) * density)));
    };
    const bound = (value) => {
      value.scale = Math.max(1, Math.min(maxScale(), value.scale));
      const xLimit = Math.max(0, (baseWidth * value.scale - frameWidth) / 2);
      const yLimit = Math.max(0, (baseHeight * value.scale - frameHeight) / 2);
      value.x = Math.max(-xLimit, Math.min(xLimit, value.x));
      value.y = Math.max(-yLimit, Math.min(yLimit, value.y));
      return value;
    };
    const render = () => {
      image.style.width = `${baseWidth}px`;
      image.style.height = `${baseHeight}px`;
      image.style.transform = `translate(-50%, -50%) translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;
      frame.classList.toggle("is-zoomable", maxScale() > 1.01);
      frame.classList.toggle("is-zoomed", camera.scale > 1.01);
      fitButton.hidden = controller.phase !== "open" || target.scale <= 1.01;
    };
    const tick = (time) => {
      const fraction = 1 - Math.exp(-Math.min(time - lastTime, 64) / 35);
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
    const freeze = () => { pointers.clear(); gesture = null; setCamera({ ...camera }, true); };
    const controller = { popup, trigger, frame, image, reset, freeze, phase: "closed", motionId: 0, flight: null, settle: null };

    trigger.addEventListener("click", async (event) => {
      event.preventDefault();
      const ticket = ++request;
      if (!image.complete || !image.naturalWidth) {
        await image.decode().catch(() => {});
        if (ticket !== request || !image.naturalWidth) return;
      }
      if (active) return;
      const from = pictureBounds(trigger, trigger.querySelector("img"));
      active = controller;
      controller.phase = "opening";
      popup.classList.remove("is-closing");
      document.body.classList.add("has-preview");
      main.inert = true;
      popup.showPopover();
      measure();
      reset();
      trigger.classList.add("is-source");
      fly(controller, from, pictureBounds(frame, image), () => {
        controller.phase = "open";
        render();
      });
    });
    popup.querySelector("[data-close]").addEventListener("click", (event) => {
      event.preventDefault();
      close();
    });
    popup.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Tab") {
        const stops = [...popup.querySelectorAll("a, button, [tabindex='0']")].filter((element) => !element.disabled && !element.hidden && getComputedStyle(element).visibility !== "hidden");
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      if (document.activeElement !== frame || controller.phase !== "open") return;
      if (event.key === "+" || event.key === "=") zoom(target.scale * 1.4);
      else if (event.key === "-") zoom(target.scale / 1.4);
      else if (event.key === "0") setCamera({ scale: 1, x: 0, y: 0 });
      else if (event.key.startsWith("Arrow")) {
        const step = event.shiftKey ? 100 : 40;
        setCamera({ ...target, x: target.x + (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0), y: target.y + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0) });
      } else return;
      event.preventDefault();
    });
    fitButton.addEventListener("click", () => {
      if (controller.phase !== "open") return;
      frame.focus({ preventScroll: true });
      setCamera({ scale: 1, x: 0, y: 0 });
    });
    frame.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (controller.phase !== "open") return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame.clientHeight : 1;
      const delta = event.deltaY * unit;
      if (event.ctrlKey) zoom(target.scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.008), point(event.clientX, event.clientY));
      else setCamera({ ...camera, x: camera.x - event.deltaX * unit, y: camera.y - delta }, true);
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
      if (event.button !== 0 || controller.phase !== "open") return;
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
    image.addEventListener("load", () => { if (popup.matches(":popover-open")) { measure(); setCamera({ ...target }, true); } });
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) { setCamera({ ...target }, true); if (controller.flight) finishFlight(controller); }
    });
    new ResizeObserver(() => {
      const rect = frame.getBoundingClientRect();
      if (!popup.matches(":popover-open") || (rect.width === frameWidth && rect.height === frameHeight)) return;
      measure();
      setCamera({ ...target }, true);
      if (controller.flight) finishFlight(controller);
    }).observe(frame);
  }
  document.addEventListener("click", (event) => {
    if (!active || active.trigger.contains(event.target)) return;
    const rect = active.popup.getBoundingClientRect();
    const outsideBounds = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (!active.popup.contains(event.target) || (event.target === active.popup && outsideBounds)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { if (active) event.preventDefault(); close(); }
  });
})();
