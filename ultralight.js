// A controls-only model of the retained native frame. No playback, decoding,
// filesystem access, network requests, or persistent settings.
import { tracks } from './ultralight-tracks.js?v=f854315b8a3a';
import { createFlair } from './ultralight-flair.js?v=c773644e4533';
const dialog = document.querySelector('.ultralight-dialog');
const plane = dialog.querySelector('.native-plane');
const object = dialog.querySelector('.native-object');
const settings = dialog.querySelector('.native-settings');
const $ = selector => dialog.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const flair = createFlair(dialog, reducedMotion);
const frequencies = ['60', '170', '310', '600', '1K', '3K', '6K', '12K'];
const hz = [60, 170, 310, 600, 1000, 3000, 6000, 12000];
const originalGains = tracks[9].suggestedEQ.gains;
const savedProfiles = new Map();
let gains = [...originalGains], preamp = 0, volume = 80, selected = 9, position = 0;
let opener, motion, closing = false, playPressed = false, eqVisible = true, folderVisible = true;
let saveTimer = 0;
const title = index => tracks[index].displayTitle;
const duration = () => tracks[selected].durationSeconds;
const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function measure(width = parseFloat(getComputedStyle(object).width)) {
  // Measure layout, not the temporarily scaled opening animation.
  plane.style.setProperty('--native-scale', width / 900);
}
new ResizeObserver(entries => measure(entries[0].contentRect.width)).observe(object);

const rows = tracks.map((track, index) => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'native-track';
  button.setAttribute('role', 'option'); button.setAttribute('aria-label', title(index));
  button.setAttribute('aria-selected', String(index === selected));
  button.tabIndex = index === selected ? 0 : -1;
  const label = document.createElement('span'); label.textContent = title(index);
  const format = document.createElement('span'); format.className = 'native-track-format'; format.textContent = 'FLAC';
  button.append(label, format);
  button.addEventListener('click', () => selectRow(index));
  button.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowDown') next = Math.min(tracks.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tracks.length - 1;
    else return;
    event.preventDefault(); selectRow(next); rows[next].focus({ preventScroll: true });
  });
  $('.native-library').append(button); return button;
});

function selectRow(index) {
  if (index === selected) return;
  selected = index;
  $('.native-library').classList.add('is-painted');
  rows.forEach((row, i) => { row.setAttribute('aria-selected', String(i === selected)); row.tabIndex = i === selected ? 0 : -1; });
  $('.native-title').hidden = false; $('.native-title').textContent = title(index);
  const profile = savedProfiles.get(index) || tracks[index].suggestedEQ;
  gains = [...profile.gains]; preamp = profile.preamp; position = 0;
  paintEQ(); paintPreamp(); paintAnalysis(); paintWaveform(); paintPosition();
  $('.native-duration').hidden = false; $('.native-duration').textContent = formatTime(duration());
}

const bandControls = frequencies.map((frequency, index) => {
  const input = document.createElement('input');
  input.type = 'range'; input.min = -12; input.max = 12; input.step = 0.5; input.value = gains[index];
  input.setAttribute('aria-label', `${hz[index]} Hz equalizer`); input.title = `${frequency} Hz`;
  input.addEventListener('input', () => { gains[index] = Number(input.value); paintEQ(); });
  input.addEventListener('dblclick', () => { gains[index] = 0; paintEQ(); });
  $('.native-eq-inputs').append(input); return input;
});

const visualBands = frequencies.map((frequency, index) => {
    const band = document.createElement('div'); band.className = 'native-band-visual';
    band.style.left = `${index * 230 / 8}px`; band.style.width = `${230 / 8}px`;
    const output = document.createElement('output'); output.textContent = `${gains[index] >= 0 ? '+' : ''}${gains[index].toFixed(0)}`;
    const rail = document.createElement('i');
    const thumb = document.createElement('b'); thumb.style.top = `${12 + (12 - gains[index]) / 24 * 86 - 2}px`;
    const label = document.createElement('span'); label.textContent = frequency;
    band.append(output, rail, thumb, label); $('.native-eq-paint').append(band);
    return { output, thumb };
});
function paintEQ() {
  $('.native-eq-paint').hidden = false;
  visualBands.forEach(({ output, thumb }, index) => {
    output.textContent = `${gains[index] >= 0 ? '+' : ''}${gains[index].toFixed(0)}`;
    thumb.style.top = `${12 + (12 - gains[index]) / 24 * 86 - 2}px`;
    bandControls[index].value = gains[index];
    bandControls[index].setAttribute('aria-valuetext', `${gains[index]} decibels`);
  });
}

function paintAnalysis() {
  const analysis = tracks[selected].analysis;
  $('.native-analysis-paint').hidden = false;
  $('.native-analysis-reason').textContent = analysis.reason;
  const badges = $('.native-analysis-badges'); badges.replaceChildren();
  const flags = [['isBassHeavy', 'BASS-HEAVY', '#f59e0b'], ['isThin', 'THIN', '#8b5cf6'], ['isMuddy', 'MUDDY', '#ef4444'], ['isBright', 'BRIGHT', '#06b6d4'], ['isCompressed', 'COMPRESSED', '#f97316'], ['isDynamic', 'DYNAMIC', '#4ade80'], ['isClipping', 'CLIPPING', '#ef4444']].filter(([flag]) => analysis[flag]);
  if (!flags.length) flags.push([null, 'BALANCED', '#4ade80']);
  for (const [, label, color] of flags) {
    const badge = document.createElement('span'); badge.textContent = label; badge.style.setProperty('--badge', color); badges.append(badge);
  }
  $('.native-analysis-stats').textContent = `bass ${Math.floor(analysis.bassEnergy * 100)}%  mid ${Math.floor(analysis.midEnergy * 100)}%  treble ${Math.floor(analysis.trebleEnergy * 100)}%  peak ${analysis.peakLevel.toFixed(0)}dB`;
}

function paintPreamp() {
  const painted = $('.native-preamp-paint'); painted.hidden = false;
  painted.style.setProperty('--preamp', `${(preamp + 12) / 24 * 100}%`);
  painted.querySelector('output').textContent = `${preamp >= 0 ? '+' : ''}${preamp.toFixed(0)}`;
  $('.native-preamp').value = preamp;
}

$('.native-auto').addEventListener('click', event => {
  const button = event.currentTarget;
  button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
  button.classList.add('is-painted');
});
$('.native-reset').addEventListener('click', () => { gains.fill(0); preamp = 0; paintEQ(); paintPreamp(); });
$('.native-save').addEventListener('click', event => {
  savedProfiles.set(selected, { gains: [...gains], preamp });
  clearTimeout(saveTimer); const button = event.currentTarget;
  button.classList.add('is-painted', 'is-saved');
  saveTimer = setTimeout(() => button.classList.remove('is-saved', 'is-painted'), 650);
});
$('.native-preamp').addEventListener('input', event => { preamp = Number(event.target.value); paintPreamp(); });
$('.native-volume').addEventListener('input', event => {
  volume = Number(event.target.value);
  const painted = $('.native-volume-paint'); painted.hidden = false;
  painted.style.setProperty('--volume', `${volume}%`); painted.querySelector('output').textContent = `${volume}%`;
});

function togglePainted(button) {
  const pressed = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(pressed)); button.querySelector('span').hidden = !pressed;
}
$('.native-shuffle').addEventListener('click', event => togglePainted(event.currentTarget));
$('.native-repeat').addEventListener('click', event => togglePainted(event.currentTarget));
function togglePlay() {
  playPressed = !playPressed;
  $('.native-play').setAttribute('aria-pressed', String(playPressed));
  $('.native-play').querySelector('span').hidden = !playPressed;
}
$('.native-play').addEventListener('click', togglePlay);
$('.native-previous').addEventListener('click', () => selectRow(Math.max(0, selected - 1)));
$('.native-next').addEventListener('click', () => selectRow(Math.min(tracks.length - 1, selected + 1)));
$('.native-show-eq').addEventListener('click', event => {
  eqVisible = !eqVisible; event.currentTarget.setAttribute('aria-pressed', String(eqVisible));
  $('.native-eq-cover').hidden = eqVisible; $('.native-eq').inert = !eqVisible;
});

const svgNS = 'http://www.w3.org/2000/svg';
let waveformBars = [], playhead;
function paintWaveform() {
  const region = $('.native-waveform'); region.replaceChildren();
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 818 16'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  const waveform = tracks[selected].waveform;
  waveformBars = waveform.map((peak, index) => {
    const rect = document.createElementNS(svgNS, 'rect');
    const x = index * 818 / waveform.length, height = Math.max(1, 16 * peak);
    for (const [key, value] of Object.entries({ x, y: (16 - height) / 2, width: 818 / waveform.length - 0.5, height, fill: '#222' })) rect.setAttribute(key, value);
    svg.append(rect); return rect;
  });
  playhead = document.createElementNS(svgNS, 'rect');
  for (const [key, value] of Object.entries({ x: 0, y: 0, width: 1, height: 16, fill: '#4a9eff', opacity: 0 })) playhead.setAttribute(key, value);
  svg.append(playhead); region.append(svg);
  region.setAttribute('aria-valuemax', duration());
  region.setAttribute('aria-label', `Playback position for ${title(selected)}`);
}
function paintPosition() {
  if (!waveformBars.length) paintWaveform();
  const region = $('.native-waveform'), fraction = position / duration();
  waveformBars.forEach((bar, index) => bar.setAttribute('fill', index / waveformBars.length < fraction ? '#4a9eff99' : '#222'));
  playhead.setAttribute('x', Math.min(817, fraction * 818)); playhead.setAttribute('opacity', position > 0 ? '1' : '0');
  region.setAttribute('aria-valuenow', position);
  region.setAttribute('aria-valuetext', `${formatTime(position)} of ${formatTime(duration())}`);
  $('.native-elapsed').hidden = false; $('.native-elapsed').textContent = formatTime(position);
}
let pointer = null;
function scrub(event) {
  const bounds = $('.native-waveform').getBoundingClientRect();
  position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * duration(); paintPosition();
}
$('.native-waveform').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); pointer = event.pointerId;
  event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(pointer); scrub(event);
});
$('.native-waveform').addEventListener('pointermove', event => { if (pointer === event.pointerId) scrub(event); });
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) $('.native-waveform').addEventListener(eventName, () => pointer = null);
$('.native-waveform').addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') position = Math.max(0, position - 5);
  else if (event.key === 'ArrowRight') position = Math.min(duration(), position + 5);
  else if (event.key === 'Home') position = 0;
  else if (event.key === 'End') position = duration();
  else return;
  event.preventDefault(); paintPosition();
});

const settingsTabs = [...settings.querySelectorAll('[role="tab"]')];
function selectSettingsTab(index) {
  settingsTabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1;
    $(`#${tab.getAttribute('aria-controls')}`).hidden = i !== index;
  });
  $('.native-folder-menu').hidden = true;
  if (index === 1 && !settings.hidden) flair.show(); else flair.hide();
}
settingsTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectSettingsTab(index));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? settingsTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + settingsTabs.length) % settingsTabs.length;
    selectSettingsTab(next); settingsTabs[next].focus();
  });
});
function settingsState(open) {
  settings.hidden = !open;
  object.inert = open; $('.ultralight-afterword').inert = open; $('.ultralight-context').inert = open;
  $('.native-settings-button').setAttribute('aria-expanded', String(open));
  if (open) {
    $('[data-settings-close]').focus({ preventScroll: true });
    if (!$('.native-flair').hidden) flair.show();
  }
  else { $('.native-folder-menu').hidden = true; flair.hide(); $('.native-settings-button').focus({ preventScroll: true }); }
}
$('.native-settings-button').addEventListener('click', event => { event.stopPropagation(); settingsState(true); });
$('[data-settings-close]').addEventListener('click', () => settingsState(false));
$('.native-add-folder').addEventListener('click', () => { $('.native-folder-menu').hidden = false; $('[data-folder-add]').focus(); });
$('[data-folder-cancel]').addEventListener('click', () => { $('.native-folder-menu').hidden = true; $('.native-add-folder').focus(); });
$('[data-folder-add]').addEventListener('click', () => {
  folderVisible = true; $('.native-folders span').hidden = false; $('[data-folder-remove]').hidden = false;
  $('.native-folder-menu').hidden = true; $('.native-add-folder').focus();
});
$('[data-folder-remove]').addEventListener('click', () => {
  folderVisible = false; $('.native-folders span').hidden = true; $('[data-folder-remove]').hidden = true; $('.native-add-folder').focus();
});

function resetStudy() {
  gains = [...originalGains]; preamp = 0; volume = 80; selected = 9; position = 0; playPressed = false; eqVisible = true; folderVisible = true;
  clearTimeout(saveTimer);
  savedProfiles.clear();
  $('.native-title').hidden = true; $('.native-library').classList.remove('is-painted');
  rows.forEach((row, i) => { row.setAttribute('aria-selected', String(i === selected)); row.tabIndex = i === selected ? 0 : -1; });
  bandControls.forEach((input, i) => { input.value = gains[i]; input.setAttribute('aria-valuetext', `${gains[i]} decibels`); });
  for (const selector of ['.native-eq-paint', '.native-preamp-paint', '.native-volume-paint', '.native-elapsed', '.native-duration', '.native-analysis-paint', '.native-eq-cover']) $(selector).hidden = true;
  $('.native-preamp').value = 0; $('.native-volume').value = 80;
  paintWaveform(); paintPosition(); $('.native-elapsed').hidden = true;
  for (const selector of ['.native-shuffle', '.native-repeat', '.native-play']) { $(selector).setAttribute('aria-pressed', 'false'); $(selector).querySelector('span').hidden = true; }
  $('.native-auto').setAttribute('aria-pressed', 'true');
  for (const selector of ['.native-auto', '.native-reset', '.native-save']) $(selector).classList.remove('is-painted', 'is-saved');
  $('.native-show-eq').setAttribute('aria-pressed', 'true'); $('.native-eq').inert = false;
  $('.native-folders span').hidden = false; $('[data-folder-remove]').hidden = false;
  selectSettingsTab(0); flair.reset();
}
$('[data-reset-study]').addEventListener('click', resetStudy);

function openStudy(trigger) {
  opener = trigger; closing = false; motion?.cancel(); dialog.classList.remove('is-closing');
  if (!dialog.open) dialog.showModal(); measure(); document.body.classList.add('has-player');
  if (!reducedMotion.matches) motion = dialog.animate([{ opacity: 0, transform: 'translateY(5px) scale(.992)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
  $('.native-play').focus({ preventScroll: true });
}
async function closeStudy() {
  if (!dialog.open || closing) return;
  closing = true; pointer = null; motion?.cancel(); flair.hide(); dialog.classList.add('is-closing');
  if (!reducedMotion.matches) {
    motion = dialog.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(3px) scale(.995)' }], { duration: 180, easing: 'ease-out' });
    await motion.finished.catch(() => {});
  }
  if (!closing) return;
  dialog.close(); document.body.classList.remove('has-player'); dialog.classList.remove('is-closing'); closing = false; opener?.focus({ preventScroll: true });
}
document.querySelectorAll('[data-player]').forEach(trigger => trigger.addEventListener('click', () => openStudy(trigger)));
$('.ultralight-dismiss').addEventListener('click', closeStudy);
$('.native-window-close').addEventListener('click', closeStudy);
$('.native-window-minimize').addEventListener('click', closeStudy);
$('.native-window-enlarge').addEventListener('click', () => {
  const enlarged = object.getAttribute('data-enlarged') !== 'true';
  object.setAttribute('data-enlarged', String(enlarged));
  const gutter = innerWidth <= 600 ? 24 : 48;
  dialog.style.width = enlarged ? `min(1350px, calc(100% - ${gutter}px), calc((100svh - 132px) * 900 / 494))` : '';
  measure();
});
function dismissLayer() {
  if (!$('.native-folder-menu').hidden) { $('.native-folder-menu').hidden = true; $('.native-add-folder').focus(); }
  else if (!settings.hidden) settingsState(false);
  else closeStudy();
}
dialog.addEventListener('cancel', event => { event.preventDefault(); dismissLayer(); });
dialog.addEventListener('click', event => {
  if (!settings.hidden && !settings.contains(event.target)) { settingsState(false); return; }
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeStudy();
});
dialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismissLayer(); return; }
  if (!settings.hidden && event.key === 'Tab') {
    const scope = $('.native-folder-menu').hidden ? settings : $('.native-folder-menu');
    const stops = [...scope.querySelectorAll('button, input')].filter(element => element.tabIndex >= 0 && !element.disabled && element.getClientRects().length);
    const first = stops[0], last = stops[stops.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  if (event.code === 'Space' && settings.hidden && !/^(INPUT|BUTTON)$/.test(event.target.tagName)) { event.preventDefault(); togglePlay(); }
});
paintWaveform();
