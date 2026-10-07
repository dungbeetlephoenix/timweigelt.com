// A small folded-paper object. All flight is decorative, local UI state.
export function createFlair(root, reducedMotion) {
  const $ = selector => root.querySelector(selector);
  const stage = $('.native-glider-stage');
  const model = $('.native-folded-glider');
  const shadow = $('.native-flight-shadow');
  const air = [...root.querySelectorAll('.native-wind-lines path')];
  const lift = $('#native-lift');
  const ns = 'http://www.w3.org/2000/svg';
  const rad = Math.PI / 180;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const node = (tag, attributes = {}) => {
    const element = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  };

  // Two wings, two keel folds, and the thin trailing edges of the paper.
  const vertices = {
    nose: [1.3, 0, .06], left: [-1, -.86, .06], right: [-1, .86, .06],
    foldLeft: [-.73, -.075, .105], foldRight: [-.73, .075, .105], keel: [-.69, 0, -.25],
    leftUnder: [-1, -.86, .045], rightUnder: [-1, .86, .045],
    foldLeftUnder: [-.73, -.075, .09], foldRightUnder: [-.73, .075, .09]
  };
  const faces = [
    { points: ['nose', 'foldLeft', 'left'], material: [113, 126, 145] },
    { points: ['nose', 'right', 'foldRight'], material: [79, 94, 114] },
    { points: ['nose', 'keel', 'foldLeft'], material: [44, 58, 77] },
    { points: ['nose', 'foldRight', 'keel'], material: [56, 72, 94] },
    { points: ['left', 'foldLeft', 'foldLeftUnder', 'leftUnder'], material: [32, 41, 53] },
    { points: ['foldRight', 'right', 'rightUnder', 'foldRightUnder'], material: [32, 41, 53] }
  ].map(face => {
    const group = node('g'), surface = node('polygon'), light = node('polygon', { fill: 'url(#paper-light)' });
    group.append(surface, light); model.append(group);
    return { ...face, group, surface, light };
  });
  const rim = node('path', { fill: 'none', stroke: '#aab7c8', 'stroke-width': '.55', 'stroke-opacity': '.62', 'stroke-linejoin': 'round' });
  const folds = node('path', { fill: 'none', stroke: '#b0becf', 'stroke-width': '.45', 'stroke-opacity': '.22' });
  const crease = node('path', { fill: 'none', stroke: '#6faaff', 'stroke-width': '.8', 'stroke-opacity': '.9' });
  model.append(rim, folds, crease);

  const body = Object.fromEntries(['x', 'y', 'bank', 'yaw', 'pitch'].map(key => [key, { value: 0, velocity: 0 }]));
  let bank = 0, pointerX = 0, pointerY = 0, drag = null;
  let visible = false, frame = 0, lastTime = 0, flow = 0, gust = 0;
  let flashTimer;

  function rotate(point) {
    let [x, y, z] = point;
    const roll = body.bank.value * rad, pitch = body.pitch.value * rad, yaw = (-26 + body.yaw.value) * rad;
    [y, z] = [y * Math.cos(roll) - z * Math.sin(roll), y * Math.sin(roll) + z * Math.cos(roll)];
    [x, z] = [x * Math.cos(pitch) + z * Math.sin(pitch), -x * Math.sin(pitch) + z * Math.cos(pitch)];
    [x, y] = [x * Math.cos(yaw) - y * Math.sin(yaw), x * Math.sin(yaw) + y * Math.cos(yaw)];
    const tilt = 38 * rad;
    return [x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
  }

  function render() {
    const turned = Object.fromEntries(Object.entries(vertices).map(([name, point]) => [name, rotate(point)]));
    const projected = Object.fromEntries(Object.entries(turned).map(([name, [x, y, depth]]) => {
      const perspective = 8 / (8 - depth);
      return [name, [175 + body.x.value + x * 76 * perspective, 87 + body.y.value + y * 76 * perspective]];
    }));
    const point = name => projected[name].map(value => value.toFixed(2)).join(',');
    const path = names => `M${names.map(point).join('L')}`;
    const ordered = faces.map(face => ({ face, depth: face.points.reduce((sum, name) => sum + turned[name][2], 0) / face.points.length })).sort((a, b) => a.depth - b.depth);
    for (const { face } of ordered) {
      const [a, b, c] = face.points.map(name => turned[name]);
      const u = b.map((value, i) => value - a[i]), v = c.map((value, i) => value - a[i]);
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const length = Math.hypot(...normal) || 1;
      const exposure = Math.max(0, (-normal[0] * .38 - normal[1] * .48 + Math.abs(normal[2]) * .79) / length);
      const shade = .58 + exposure * .42;
      const points = face.points.map(point).join(' ');
      face.surface.setAttribute('points', points); face.light.setAttribute('points', points);
      face.surface.setAttribute('fill', `rgb(${face.material.map(value => Math.round(value * shade)).join(' ')})`);
      model.append(face.group);
    }
    rim.setAttribute('d', `${path(['nose', 'left', 'foldLeft', 'keel', 'foldRight', 'right', 'nose'])}Z`);
    folds.setAttribute('d', `${path(['nose', 'foldLeft'])}${path(['nose', 'foldRight'])}`);
    crease.setAttribute('d', path(['nose', 'keel']));
    model.append(rim, folds, crease);

    const altitude = -body.y.value;
    shadow.setAttribute('cx', 171 + body.x.value * .6);
    shadow.setAttribute('cy', 155 + body.pitch.value * .12);
    shadow.setAttribute('rx', 65 - altitude * .5);
    shadow.setAttribute('ry', 8 + Math.abs(body.bank.value) * .035);
    shadow.setAttribute('opacity', clamp(.85 - altitude * .02, .3, 1));
    shadow.setAttribute('transform', `rotate(${body.bank.value * .12} ${171 + body.x.value * .6} 155)`);

    const wake = 2 + gust * 5 + Math.abs(body.bank.value) * .18;
    const heights = [43, 67, 113, 142];
    air.forEach((line, i) => {
      const y = heights[i], sign = i < 2 ? -1 : 1;
      const bend = sign * (7 + wake) + body.y.value * .1;
      line.setAttribute('d', `M-10 ${y}C60 ${y - 3} 97 ${y + bend} 150 ${y + bend}S251 ${y + wake * sign} 360 ${y + 2}`);
      line.style.strokeDashoffset = `${-flow * (1 + i * .07)}`;
      line.style.opacity = `${.5 + gust * .18}`;
    });
    stage.classList.toggle('is-gusting', gust > .15);
  }

  function targets() {
    const amount = Number(lift.value);
    return { x: pointerX * 3.5, y: -amount * .19 + pointerY * 2, bank: clamp(bank + (drag ? 0 : pointerX * 5), -15, 15), yaw: pointerX * 7, pitch: (amount - 30) * .075 + pointerY * 3 };
  }
  function tick(now) {
    frame = 0;
    if (!visible || document.hidden || reducedMotion.matches) return;
    const dt = Math.min(.032, Math.max(.001, (now - lastTime) / 1000)); lastTime = now;
    const desired = targets();
    for (const [key, axis] of Object.entries(body)) {
      axis.velocity += ((desired[key] - axis.value) * 62 - axis.velocity * 12.5) * dt;
      axis.value += axis.velocity * dt;
    }
    gust *= Math.exp(-dt * 2.2); flow += dt * (12 + gust * 65);
    render(); frame = requestAnimationFrame(tick);
  }
  function start() {
    if (frame || !visible || document.hidden || reducedMotion.matches) return;
    lastTime = performance.now(); frame = requestAnimationFrame(tick);
  }
  function stop() { cancelAnimationFrame(frame); frame = 0; }
  function update() {
    stage.setAttribute('aria-valuenow', bank);
    stage.setAttribute('aria-valuetext', bank === 0 ? 'Level' : `${Math.abs(bank)} degrees ${bank < 0 ? 'left' : 'right'}`);
    if (reducedMotion.matches) {
      for (const [key, value] of Object.entries(targets())) { body[key].value = value; body[key].velocity = 0; }
      render();
    }
    start();
  }
  function paintLift() {
    $('.native-lift').style.setProperty('--lift', `${lift.value}%`);
    $('.native-lift output').textContent = `${lift.value}%`; update();
  }
  function sendGust() {
    clearTimeout(flashTimer);
    if (reducedMotion.matches) {
      $('.native-gust').classList.add('is-fired');
      flashTimer = setTimeout(() => $('.native-gust').classList.remove('is-fired'), 900);
      return;
    }
    // Add a force to the current motion; never restart or snap to a keyframe.
    body.y.velocity = Math.max(-115, body.y.velocity - 72);
    body.x.velocity = Math.min(55, body.x.velocity + 29);
    body.bank.velocity = Math.min(130, body.bank.velocity + 75);
    body.pitch.velocity = Math.max(-75, body.pitch.velocity - 43);
    gust = Math.min(1.8, gust + 1); update();
  }

  function pointerPosition(event) {
    const bounds = stage.getBoundingClientRect();
    pointerX = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
    pointerY = clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1);
  }
  stage.addEventListener('pointermove', event => {
    pointerPosition(event);
    if (drag?.id === event.pointerId) {
      bank = Math.round(clamp(drag.bank + (event.clientX - drag.x) / stage.clientWidth * 55, -15, 15));
    }
    update();
  });
  stage.addEventListener('pointerleave', () => { if (!drag) { pointerX = 0; pointerY = 0; update(); } });
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); stage.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, bank }; stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-banking'); pointerPosition(event); update();
  });
  function release() {
    if (!drag) return;
    const id = drag.id; drag = null; bank = 0; pointerX = 0; pointerY = 0;
    stage.classList.remove('is-banking');
    if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    update();
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(event, release);
  stage.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') bank = clamp(bank - 3, -15, 15);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') bank = clamp(bank + 3, -15, 15);
    else if (event.key === 'Home') bank = 0;
    else if (event.key === 'End') bank = 15;
    else if (event.code === 'Space' || event.key === 'Enter') { sendGust(); event.preventDefault(); event.stopPropagation(); return; }
    else return;
    event.preventDefault(); event.stopPropagation(); pointerX = 0; pointerY = 0; update();
  });
  stage.addEventListener('blur', () => { if (!drag) { bank = 0; pointerX = 0; pointerY = 0; update(); } });
  lift.addEventListener('input', paintLift);
  $('.native-gust').addEventListener('click', sendGust);
  reducedMotion.addEventListener('change', () => { stop(); update(); });
  document.addEventListener('visibilitychange', () => { stop(); start(); });

  function reset() {
    release(); clearTimeout(flashTimer); $('.native-gust').classList.remove('is-fired');
    lift.value = 30; bank = 0; pointerX = 0; pointerY = 0; gust = 0; flow = 0;
    for (const [key, value] of Object.entries(targets())) { body[key].value = value; body[key].velocity = 0; }
    paintLift(); render();
  }
  reset();
  return {
    show() { visible = true; update(); },
    hide() { visible = false; release(); stop(); pointerX = 0; pointerY = 0; bank = 0; },
    reset
  };
}
