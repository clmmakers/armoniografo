const stage = document.getElementById("stage");
const ctx = stage.getContext("2d");
const statusEl = document.getElementById("status");
const equationEl = document.getElementById("equationText");
const pointNowEl = document.getElementById("pointNow");
const guaranteeBadgeEl = document.getElementById("guaranteeBadge");
const geometryClosureBadgeEl = document.getElementById("geometryClosureBadge");
const geometryClosureHintEl = document.getElementById("geometryClosureHint");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const resetSimBtn = document.getElementById("resetSim");
const clearBtn = document.getElementById("clear");
const saveBtn = document.getElementById("save");
const centerViewBtn = document.getElementById("centerView");
const traceColorInput = document.getElementById("traceColor");
const zoomInBtn = document.getElementById("zoomIn");
const zoomOutBtn = document.getElementById("zoomOut");
const zoomResetBtn = document.getElementById("zoomReset");
const FIXED_OUTER_LEFT = -90;
const FIXED_OUTER_RIGHT = 90;

const INITIAL_MODEL = {
  baseGap: 205,
  armL: 25,
  armR: 29,
  linkL: 274,
  linkR: 261,
  strokeL: 127,
  slideFreqL: 0.6,
  slidePhaseL: 4.05,
  strokeR: 125,
  slideFreqR: 0.3,
  slidePhaseR: 1.46,
  rotFreqL: 0.6,
  rotPhaseL: 4.93,
  rotFreqR: -1,
  rotPhaseR: 6.08,
};
const model = { ...INITIAL_MODEL };

const outputs = new Map();
const inputMap = new Map();

const view = {
  scale: 1,
  minScale: 0.25,
  maxScale: 5,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

let running = false;
let points = [];
let lastTime = performance.now();
let t = 0;
let traceColor = traceColorInput.value;

document.querySelectorAll("span[data-out]").forEach((node) => {
  outputs.set(node.dataset.out, node);
});

document.querySelectorAll("input[data-key]").forEach((input) => {
  inputMap.set(input.dataset.key, input);
});

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setOutput(key, val) {
  const out = outputs.get(key);
  if (!out) return;
  out.textContent = Number.isInteger(val) ? `${val}` : val.toFixed(2);
}

function fmt(val) {
  return Number(val).toFixed(3);
}

function sliderBetween(startVal, endVal, freq, phase, time) {
  const wave = (Math.sin(2 * Math.PI * freq * time + phase) + 1) * 0.5;
  return startVal + wave * (endVal - startVal);
}

function getSliderStops(cfg) {
  return {
    slideOuterL: FIXED_OUTER_LEFT,
    slideInnerL: FIXED_OUTER_LEFT + cfg.strokeL,
    slideInnerR: FIXED_OUTER_RIGHT - cfg.strokeR,
    slideOuterR: FIXED_OUTER_RIGHT,
  };
}

function circleIntersection(a, ra, b, rb) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > ra + rb || d < Math.abs(ra - rb)) return null;

  const ex = dx / d;
  const ey = dy / d;
  const x = (ra * ra - rb * rb + d * d) / (2 * d);
  const h2 = ra * ra - x * x;
  if (h2 < 0) return null;

  const h = Math.sqrt(h2);
  const px = a.x + x * ex;
  const py = a.y + x * ey;

  const i1 = { x: px + h * -ey, y: py + h * ex };
  const i2 = { x: px - h * -ey, y: py - h * ex };

  return i1.y < i2.y ? i1 : i2;
}

function getState(time, cfg = model) {
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  const stops = getSliderStops(cfg);

  const baseL = { x: cx - cfg.baseGap / 2, y: cy };
  const baseR = { x: cx + cfg.baseGap / 2, y: cy };

  const sxL = sliderBetween(stops.slideOuterL, stops.slideInnerL, cfg.slideFreqL, cfg.slidePhaseL, time);
  const sxR = sliderBetween(stops.slideInnerR, stops.slideOuterR, cfg.slideFreqR, cfg.slidePhaseR, time);

  const slideL = { x: baseL.x + sxL, y: baseL.y };
  const slideR = { x: baseR.x + sxR, y: baseR.y };

  const thL = 2 * Math.PI * cfg.rotFreqL * time + cfg.rotPhaseL;
  const thR = 2 * Math.PI * cfg.rotFreqR * time + cfg.rotPhaseR;

  const jointL = {
    x: slideL.x + cfg.armL * Math.cos(thL),
    y: slideL.y + cfg.armL * Math.sin(thL),
  };

  const jointR = {
    x: slideR.x + cfg.armR * Math.cos(thR),
    y: slideR.y + cfg.armR * Math.sin(thR),
  };

  const pen = circleIntersection(jointL, cfg.linkL, jointR, cfg.linkR);

  return { baseL, baseR, slideL, slideR, jointL, jointR, pen };
}

function modelIsValid(cfg) {
  if (!innerEndstopsAreSeparated(cfg)) return false;

  const bounds = getCertifiedDistanceBounds(cfg);
  const linksMax = cfg.linkL + cfg.linkR;
  const linksMin = Math.abs(cfg.linkL - cfg.linkR);

  return bounds.dMax <= linksMax
    && bounds.dMin >= linksMin
    && penAlwaysStaysInUpperZone(cfg);
}

function innerEndstopsAreSeparated(cfg) {
  const stops = getSliderStops(cfg);
  const innerLeftX = -cfg.baseGap / 2 + stops.slideInnerL;
  const innerRightX = cfg.baseGap / 2 + stops.slideInnerR;
  return innerLeftX < innerRightX;
}

function getCertifiedDistanceBounds(cfg) {
  const stops = getSliderStops(cfg);
  const sxLMin = Math.min(stops.slideOuterL, stops.slideInnerL);
  const sxLMax = Math.max(stops.slideOuterL, stops.slideInnerL);
  const sxRMin = Math.min(stops.slideInnerR, stops.slideOuterR);
  const sxRMax = Math.max(stops.slideInnerR, stops.slideOuterR);

  const xMin = cfg.baseGap + sxRMin - sxLMax - cfg.armL - cfg.armR;
  const xMax = cfg.baseGap + sxRMax - sxLMin + cfg.armL + cfg.armR;
  const maxAbsX = Math.max(Math.abs(xMin), Math.abs(xMax));
  const maxAbsY = cfg.armL + cfg.armR;

  const dMax = Math.hypot(maxAbsX, maxAbsY);

  const xCrossesZero = xMin <= 0 && xMax >= 0;
  const dMin = xCrossesZero ? 0 : Math.min(Math.abs(xMin), Math.abs(xMax));

  return { dMin, dMax, xMin, xMax };
}

function isPenInUpperZone(state) {
  if (!state.pen) return false;

  const axisDx = state.slideR.x - state.slideL.x;
  const axisDy = state.slideR.y - state.slideL.y;
  const penDx = state.pen.x - state.slideL.x;
  const penDy = state.pen.y - state.slideL.y;
  const cross = axisDx * penDy - axisDy * penDx;

  return cross < 0;
}

function penAlwaysStaysInUpperZone(cfg) {
  const sampleCount = 720;
  const sampleDuration = 12;

  for (let i = 0; i <= sampleCount; i += 1) {
    const time = (sampleDuration * i) / sampleCount;
    const state = getState(time, cfg);
    if (!isPenInUpperZone(state)) return false;
  }

  return true;
}

function applyInputChange(key, nextValue, input) {
  const prevValue = model[key];
  const candidate = { ...model, [key]: nextValue };

  if (!modelIsValid(candidate)) {
    input.value = String(prevValue);
    setStatus("Cambio bloqueado: la geometria debe mantener GARANTIA GLOBAL: SI, evitar cruces interiores y dejar el punto siempre en la zona superior.", true);
    return;
  }

  model[key] = nextValue;
  setOutput(key, nextValue);
  setStatus(running ? "Simulacion en marcha." : "Listo para iniciar.");
  updateControlState();
}

function nudgeRangeInput(input, direction) {
  const step = Number(input.step) || 1;
  const min = input.min === "" ? -Infinity : Number(input.min);
  const max = input.max === "" ? Infinity : Number(input.max);
  const decimals = (input.step.split(".")[1] || "").length;
  const current = Number(input.value);
  const nextValue = Math.min(max, Math.max(min, current + step * direction));
  const normalized = Number(nextValue.toFixed(decimals));

  if (normalized === current) return;

  input.value = String(normalized);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function enhanceRangeInputs() {
  document.querySelectorAll("input[type='range'][data-key]").forEach((input) => {
    if (input.parentElement?.querySelector(".range-stepper")) return;

    const controls = document.createElement("div");
    controls.className = "range-stepper";

    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className = "range-nudge";
    minusBtn.textContent = "-";
    minusBtn.setAttribute("aria-label", `Reducir ${input.dataset.key}`);
    minusBtn.addEventListener("click", () => {
      nudgeRangeInput(input, -1);
    });

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "range-nudge";
    plusBtn.textContent = "+";
    plusBtn.setAttribute("aria-label", `Aumentar ${input.dataset.key}`);
    plusBtn.addEventListener("click", () => {
      nudgeRangeInput(input, 1);
    });

    input.insertAdjacentElement("beforebegin", controls);
    controls.append(minusBtn, input, plusBtn);
  });
}

function syncUi() {
  enhanceRangeInputs();

  inputMap.forEach((input, key) => {
    input.value = String(model[key]);
    setOutput(key, model[key]);

    input.addEventListener("input", () => {
      const nextValue = Number(input.value);
      applyInputChange(key, nextValue, input);
    });
  });
}

function zoomAt(factor, canvasX, canvasY) {
  const nextScale = Math.max(view.minScale, Math.min(view.maxScale, view.scale * factor));
  const ratio = nextScale / view.scale;

  view.offsetX = canvasX - (canvasX - view.offsetX) * ratio;
  view.offsetY = canvasY - (canvasY - view.offsetY) * ratio;
  view.scale = nextScale;
}

function resetView() {
  view.scale = 1;
  view.offsetX = 0;
  view.offsetY = 0;
}

function refreshUiValues() {
  inputMap.forEach((input, key) => {
    input.value = String(model[key]);
    setOutput(key, model[key]);
  });
}

function updateControlState() {
  startBtn.disabled = running;
  stopBtn.disabled = !running;
}

function collectBoundsFromPoints(items) {
  const validItems = items.filter(Boolean);
  if (!validItems.length) return null;

  const xs = validItems.map((item) => item.x);
  const ys = validItems.map((item) => item.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function mergeBounds(boundsList) {
  const validBounds = boundsList.filter(Boolean);
  if (!validBounds.length) return null;

  return {
    minX: Math.min(...validBounds.map((bounds) => bounds.minX)),
    maxX: Math.max(...validBounds.map((bounds) => bounds.maxX)),
    minY: Math.min(...validBounds.map((bounds) => bounds.minY)),
    maxY: Math.max(...validBounds.map((bounds) => bounds.maxY)),
  };
}

function fitViewToBounds(bounds) {
  if (!bounds) {
    resetView();
    return;
  }

  const padding = 60;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scaleX = (stage.width - padding * 2) / width;
  const scaleY = (stage.height - padding * 2) / height;
  const nextScale = Math.max(view.minScale, Math.min(view.maxScale, Math.min(scaleX, scaleY)));

  view.scale = nextScale;
  view.offsetX = (stage.width - width * nextScale) / 2 - bounds.minX * nextScale;
  view.offsetY = (stage.height - height * nextScale) / 2 - bounds.minY * nextScale;
}

function centerViewOnContent() {
  const state = getState(t);
  const machineBounds = collectBoundsFromPoints([
    state.baseL,
    state.baseR,
    state.slideL,
    state.slideR,
    state.jointL,
    state.jointR,
    state.pen,
  ]);
  const traceBounds = collectBoundsFromPoints(points);
  fitViewToBounds(mergeBounds([machineBounds, traceBounds]));
}

function drawPoint(p, color, r = 5) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawLink(a, b, color, width = 2) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawEndstops(base, fromOffset, toOffset) {
  const minOffset = Math.min(fromOffset, toOffset);
  const maxOffset = Math.max(fromOffset, toOffset);
  const minX = base.x + minOffset;
  const maxX = base.x + maxOffset;

  ctx.strokeStyle = "#ff7e7e";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(minX, base.y - 20);
  ctx.lineTo(minX, base.y + 20);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(maxX, base.y - 20);
  ctx.lineTo(maxX, base.y + 20);
  ctx.stroke();
}

function drawGrid() {
  ctx.strokeStyle = "#172133";
  ctx.lineWidth = 1;
  const step = 40;

  for (let x = 0; x <= stage.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, stage.height);
    ctx.stroke();
  }

  for (let y = 0; y <= stage.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(stage.width, y);
    ctx.stroke();
  }
}

function drawTrace() {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = traceColor;
  ctx.lineWidth = Math.max(0.45, 1.2 / view.scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function saveTrace() {
  if (points.length < 2) {
    setStatus("No hay trazo para guardar.", true);
    return;
  }

  const pathData = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${stage.width} ${stage.height}">\n  <path d="${pathData}" fill="none" stroke="${traceColor}" stroke-width="1.5"/>\n</svg>\n`;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trazo-pantografo-${Date.now()}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setStatus("Trazo guardado en SVG.");
}

function updateEquationDisplay(state) {
  const bounds = getCertifiedDistanceBounds(model);
  const linksMax = model.linkL + model.linkR;
  const linksMin = Math.abs(model.linkL - model.linkR);
  const closureDefined = bounds.dMax <= linksMax && bounds.dMin >= linksMin;
  const globallyValid = modelIsValid(model);
  const stops = getSliderStops(model);

  const eq = [
    "sL(t) = outerL + (carreraL/2) * (1 + sin(2*pi*fL*t + phiL))",
    "sR(t) = innerR + (carreraR/2) * (1 + sin(2*pi*fR*t + phiR))",
    "JL(t) = [xBL + sL(t) + armL*cos(2*pi*rL*t + thL), yBL + armL*sin(2*pi*rL*t + thL)]",
    "JR(t) = [xBR + sR(t) + armR*cos(2*pi*rR*t + thR), yBR + armR*sin(2*pi*rR*t + thR)]",
    "d(t)  = ||JR(t) - JL(t)||",
    "a(t)  = (linkL^2 - linkR^2 + d(t)^2) / (2*d(t))",
    "h(t)  = sqrt(linkL^2 - a(t)^2)",
    "u(t)  = (JR(t) - JL(t)) / d(t)",
    "P(t)  = JL(t) + a(t)*u(t) +/- h(t)*[-u_y(t), u_x(t)]",
    "",
    `outerL=${fmt(stops.slideOuterL)}, carreraL=${fmt(model.strokeL)}, innerL=${fmt(stops.slideInnerL)}, fL=${fmt(model.slideFreqL)}, phiL=${fmt(model.slidePhaseL)}`,
    `innerR=${fmt(stops.slideInnerR)}, carreraR=${fmt(model.strokeR)}, outerR=${fmt(stops.slideOuterR)}, fR=${fmt(model.slideFreqR)}, phiR=${fmt(model.slidePhaseR)}`,
    `brazoBielaL=${fmt(model.armL)}, brazoBielaR=${fmt(model.armR)}, brazoPantL=${fmt(model.linkL)}, brazoPantR=${fmt(model.linkR)}`,
    `cota: d_min>=${fmt(bounds.dMin)} y d_max<=${fmt(bounds.dMax)} | requerido: ${fmt(linksMin)}<=d<=${fmt(linksMax)}`,
    `cierre por distancia: ${closureDefined ? "SI" : "NO"}`,
    `garantia global: ${globallyValid ? "SI" : "NO"}`,
  ];

  equationEl.textContent = eq.join("\n");
  guaranteeBadgeEl.textContent = `GARANTIA GLOBAL: ${globallyValid ? "SI" : "NO"}`;
  guaranteeBadgeEl.classList.toggle("ok", globallyValid);
  guaranteeBadgeEl.classList.toggle("bad", !globallyValid);
  geometryClosureBadgeEl.textContent = `CIERRE DE CURVA GARANTIZADO: ${closureDefined ? "SI" : "NO"}`;
  geometryClosureBadgeEl.classList.toggle("ok", closureDefined);
  geometryClosureBadgeEl.classList.toggle("bad", !closureDefined);
  geometryClosureHintEl.textContent = globallyValid
    ? "Esta geometria asegura que el pantografo puede cerrar la curva y que el punto permanece en la zona superior durante todo el movimiento."
    : "Esta geometria no cumple todas las restricciones globales: cierre completo, no cruce interior y permanencia del punto en la zona superior.";

  if (state.pen) {
    pointNowEl.textContent = `P(t) actual = (${state.pen.x.toFixed(2)}, ${state.pen.y.toFixed(2)})`;
  } else {
    pointNowEl.textContent = "P(t) actual = no definido (geometria no cerrada en este instante)";
  }
}

function render(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  if (running) t += dt;

  const state = getState(t);
  updateEquationDisplay(state);
  if (running && state.pen) {
    points.push({ x: state.pen.x, y: state.pen.y });
    if (points.length > 12000) points = points.slice(-12000);
  }

  ctx.clearRect(0, 0, stage.width, stage.height);
  ctx.save();
  ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

  drawGrid();
  drawTrace();

  const stops = getSliderStops(model);
  drawEndstops(state.baseL, stops.slideOuterL, stops.slideInnerL);
  drawEndstops(state.baseR, stops.slideInnerR, stops.slideOuterR);

  drawLink(state.slideL, state.jointL, "#9bc1ff", 3);
  drawLink(state.slideR, state.jointR, "#9bc1ff", 3);

  if (state.pen) {
    drawLink(state.jointL, state.pen, "#d8e5ff", 2);
    drawLink(state.jointR, state.pen, "#d8e5ff", 2);
    drawPoint(state.pen, "#66e2a8", 5.5);
  }

  drawPoint(state.slideL, "#ffad66", 5);
  drawPoint(state.slideR, "#ffad66", 5);
  drawPoint(state.jointL, "#9bc1ff", 5);
  drawPoint(state.jointR, "#9bc1ff", 5);

  ctx.restore();
  requestAnimationFrame(render);
}

startBtn.addEventListener("click", () => {
  if (!modelIsValid(model)) {
    setStatus("No se puede iniciar: la geometria actual no tiene GARANTIA GLOBAL: SI.", true);
    return;
  }

  running = true;
  setStatus("Simulacion en marcha.");
  updateControlState();
});

stopBtn.addEventListener("click", () => {
  running = false;
  setStatus("Simulacion detenida.");
  updateControlState();
});

clearBtn.addEventListener("click", () => {
  points = [];
  setStatus("Trazo borrado.");
});

resetSimBtn.addEventListener("click", () => {
  Object.assign(model, INITIAL_MODEL);
  running = false;
  t = 0;
  points = [];
  refreshUiValues();
  centerViewOnContent();
  updateControlState();
  setStatus("Simulacion reiniciada.");
});

saveBtn.addEventListener("click", () => {
  saveTrace();
});

centerViewBtn.addEventListener("click", () => {
  centerViewOnContent();
  setStatus("Vista centrada en la maquina y el dibujo.");
});

traceColorInput.addEventListener("input", () => {
  traceColor = traceColorInput.value;
  setStatus("Color de linea actualizado.");
});

zoomInBtn.addEventListener("click", () => {
  zoomAt(1.15, stage.width / 2, stage.height / 2);
});

zoomOutBtn.addEventListener("click", () => {
  zoomAt(1 / 1.15, stage.width / 2, stage.height / 2);
});

zoomResetBtn.addEventListener("click", () => {
  resetView();
});

stage.addEventListener("wheel", (event) => {
  event.preventDefault();

  const rect = stage.getBoundingClientRect();
  const x = ((event.clientX - rect.left) * stage.width) / rect.width;
  const y = ((event.clientY - rect.top) * stage.height) / rect.height;
  const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
  zoomAt(factor, x, y);
});

stage.addEventListener("mousedown", (event) => {
  view.dragging = true;
  view.lastX = event.clientX;
  view.lastY = event.clientY;
  stage.classList.add("dragging");
});

window.addEventListener("mousemove", (event) => {
  if (!view.dragging) return;

  const dx = event.clientX - view.lastX;
  const dy = event.clientY - view.lastY;
  const rect = stage.getBoundingClientRect();
  view.offsetX += (dx * stage.width) / rect.width;
  view.offsetY += (dy * stage.height) / rect.height;
  view.lastX = event.clientX;
  view.lastY = event.clientY;
});

window.addEventListener("mouseup", () => {
  view.dragging = false;
  stage.classList.remove("dragging");
});

syncUi();
updateControlState();
centerViewOnContent();
requestAnimationFrame((now) => {
  lastTime = now;
  render(now);
});
