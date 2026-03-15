const stage = document.getElementById("stage");
const stageWrapEl = document.querySelector(".stage-wrap");
const stageShellEl = document.querySelector(".stage-shell");
const canvasToolbarEl = document.querySelector(".canvas-toolbar");
const canvasHintEl = document.querySelector(".canvas-hint");
const ctx = stage.getContext("2d");
const traceCanvas = document.createElement("canvas");
const traceCtx = traceCanvas.getContext("2d");
const statusEl = document.getElementById("status");
const equationEl = document.getElementById("equationText");
const pointNowEl = document.getElementById("pointNow");
const guaranteeBadgeEl = document.getElementById("guaranteeBadge");
const geometryClosureBadgeEl = document.getElementById("geometryClosureBadge");
const geometryClosureHintEl = document.getElementById("geometryClosureHint");
const cycleInfoEl = document.getElementById("cycleInfo");
const orbitHintEl = document.getElementById("orbitHint");
const zeroDistanceHintEl = document.getElementById("zeroDistanceHint");
const recipeHintEl = document.getElementById("recipeHint");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const resetSimBtn = document.getElementById("resetSim");
const clearBtn = document.getElementById("clear");
const saveBtn = document.getElementById("save");
const exportParamsBtn = document.getElementById("exportParams");
const importParamsBtn = document.getElementById("importParams");
const importParamsFileInput = document.getElementById("importParamsFile");
const presetSelect = document.getElementById("presetSelect");
const centerViewBtn = document.getElementById("centerView");
const traceColorInput = document.getElementById("traceColor");
const reverseDriveInputL = document.getElementById("reverseDriveL");
const reverseDriveInputR = document.getElementById("reverseDriveR");
const zoomInBtn = document.getElementById("zoomIn");
const zoomOutBtn = document.getElementById("zoomOut");
const zoomResetBtn = document.getElementById("zoomReset");

const TAU = Math.PI * 2;
const GEOM_EPS = 1e-4;
const MAX_SIM_STEP = 1 / 240;
const MAX_ANGULAR_STEP = 0.03;
const TRACE_MIN_SEGMENT = 0.35;
const MAX_TRACE_POINTS = 120000;
const TRACE_CANVAS_MARGIN = 1400;
const appScriptEl = document.querySelector('script[src$="app.js"]');
const ASSET_BASE_URL = new URL(".", appScriptEl?.src ?? window.location.href);
const PRESET_DIRECTORY = "presets/";
const PRESET_MANIFEST_FILE = "index.json";
const PRESET_GROUPS = [
  { key: "base", prefix: "base_", label: "Basicos" },
  { key: "arq", prefix: "arq_", label: "Arquitectonicos" },
  { key: "orn", prefix: "orn_", label: "Ornamentales" },
  { key: "other", prefix: "", label: "Otros" },
];

traceCanvas.width = stage.width + TRACE_CANVAS_MARGIN * 2;
traceCanvas.height = stage.height + TRACE_CANVAS_MARGIN * 2;

const INITIAL_MODEL = {
  zeroDistance: 330,
  baseTeethL: 39,
  baseTeethR: 39,
  toothModule: 2,
  orbitTeethL: 9,
  orbitTeethR: 21,
  driveSpeed: 0.004,
  driveDirectionL: 1,
  driveDirectionR: 1,
  phaseL: 0.73,
  phaseR: 3.38,
  armL: 280,
  armR: 310,
  cycleSeconds: 8,
  playbackSpeed: 30,
};

const model = { ...INITIAL_MODEL };

const syncState = {
  baseTeeth: true,
  orbitTeeth: false,
  arms: false,
};

const syncPairs = {
  baseTeeth: ["baseTeethL", "baseTeethR"],
  orbitTeeth: ["orbitTeethL", "orbitTeethR"],
  arms: ["armL", "armR"],
};

const outputs = new Map();
const inputMap = new Map();
const syncMap = new Map();

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
let elapsed = 0;
let traceColor = traceColorInput.value;
let geometrySnapshot = null;
let lastTracePoint = null;
let presetCatalog = [];

document.querySelectorAll("span[data-out]").forEach((node) => {
  outputs.set(node.dataset.out, node);
});

document.querySelectorAll("input[data-key]").forEach((input) => {
  inputMap.set(input.dataset.key, input);
});

document.querySelectorAll("input[data-sync]").forEach((input) => {
  syncMap.set(input.dataset.sync, input);
});

function gcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));

  while (y !== 0) {
    const tmp = x % y;
    x = y;
    y = tmp;
  }

  return x || 1;
}

function lcm(a, b) {
  return Math.abs(a * b) / gcd(a, b);
}

function reduceFraction(numerator, denominator) {
  const div = gcd(numerator, denominator);
  return {
    numerator: numerator / div,
    denominator: denominator / div,
  };
}

function numberToFraction(value) {
  const normalized = Number(value.toFixed(3));
  const text = `${normalized}`;
  const decimals = (text.split(".")[1] || "").length;
  const denominator = 10 ** decimals;
  const numerator = Math.round(normalized * denominator);
  return reduceFraction(numerator, denominator);
}

function fmt(value) {
  return Number(value).toFixed(3);
}

function formatPresetLabel(value) {
  const normalized = value
    .replace(/\.json$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!normalized) return "Sin nombre";

  return normalized.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function getPresetGroup(fileName) {
  const normalized = fileName.replace(/\.json$/i, "");
  return PRESET_GROUPS.find((group) => group.prefix && normalized.startsWith(group.prefix))
    ?? PRESET_GROUPS[PRESET_GROUPS.length - 1];
}

function buildPresetEntry(fileName, url) {
  const group = getPresetGroup(fileName);
  const stem = fileName.replace(/\.json$/i, "");
  const rawLabel = group.prefix && stem.startsWith(group.prefix)
    ? stem.slice(group.prefix.length)
    : stem;

  return {
    fileName,
    url,
    groupKey: group.key,
    label: formatPresetLabel(rawLabel),
  };
}

function sortPresetEntries(entries) {
  const groupOrder = new Map(PRESET_GROUPS.map((group, index) => [group.key, index]));

  return entries.slice().sort((left, right) => {
    const orderDelta = (groupOrder.get(left.groupKey) ?? 999) - (groupOrder.get(right.groupKey) ?? 999);
    if (orderDelta !== 0) return orderDelta;
    return left.label.localeCompare(right.label, "es", { sensitivity: "base" });
  });
}

function parsePresetDirectoryListing(markup, directoryUrl) {
  const doc = new DOMParser().parseFromString(markup, "text/html");
  const directoryPath = directoryUrl.pathname.endsWith("/") ? directoryUrl.pathname : `${directoryUrl.pathname}/`;
  const entries = new Map();

  doc.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;

    let resolvedUrl;
    try {
      resolvedUrl = new URL(href, directoryUrl);
    } catch {
      return;
    }

    if (!resolvedUrl.pathname.startsWith(directoryPath)) return;

    const fileName = decodeURIComponent(resolvedUrl.pathname.split("/").pop() || "");
    if (!fileName || !fileName.toLowerCase().endsWith(".json")) return;

    entries.set(fileName, buildPresetEntry(fileName, resolvedUrl.href));
  });

  return sortPresetEntries([...entries.values()]);
}

function parsePresetManifest(payload, directoryUrl) {
  const files = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.files)
      ? payload.files
      : [];

  return sortPresetEntries(
    files
      .filter((fileName) => typeof fileName === "string" && fileName.toLowerCase().endsWith(".json"))
      .map((fileName) => buildPresetEntry(fileName, new URL(fileName, directoryUrl).href)),
  );
}

function getPresetDirectoryUrl() {
  return new URL(PRESET_DIRECTORY, ASSET_BASE_URL);
}

function getPresetManifestUrl() {
  return new URL(`${PRESET_DIRECTORY}${PRESET_MANIFEST_FILE}`, ASSET_BASE_URL);
}

function renderPresetOptions(items) {
  if (!presetSelect) return;

  const selectedValue = presetSelect.value;
  presetSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = items.length ? "Cargar preset..." : "No hay presets";
  presetSelect.append(placeholder);

  if (!items.length) {
    presetSelect.disabled = true;
    presetSelect.value = "";
    return;
  }

  const groups = new Map();

  PRESET_GROUPS.forEach((group) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    groups.set(group.key, optgroup);
  });

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.fileName;
    option.textContent = item.label;
    groups.get(item.groupKey)?.append(option);
  });

  PRESET_GROUPS.forEach((group) => {
    const optgroup = groups.get(group.key);
    if (optgroup?.children.length) {
      presetSelect.append(optgroup);
    }
  });

  presetSelect.disabled = false;
  presetSelect.value = items.some((item) => item.fileName === selectedValue) ? selectedValue : "";
}

async function loadPresetCatalog() {
  if (!presetSelect) return;

  presetSelect.disabled = true;
  presetSelect.replaceChildren();

  const loadingOption = document.createElement("option");
  loadingOption.value = "";
  loadingOption.textContent = "Cargando presets...";
  presetSelect.append(loadingOption);

  try {
    try {
      const manifestResponse = await fetch(getPresetManifestUrl(), { cache: "no-store" });
      if (!manifestResponse.ok) {
        throw new Error(`HTTP ${manifestResponse.status}`);
      }

      const manifestPayload = await manifestResponse.json();
      presetCatalog = parsePresetManifest(manifestPayload, getPresetDirectoryUrl());
    } catch (manifestError) {
      const response = await fetch(getPresetDirectoryUrl(), { cache: "no-store" });
      if (!response.ok) {
        throw manifestError;
      }

      const directoryUrl = new URL(response.url);
      const markup = await response.text();
      presetCatalog = parsePresetDirectoryListing(markup, directoryUrl);
    }
    renderPresetOptions(presetCatalog);

    if (!presetCatalog.length) {
      setStatus("No se encontraron archivos JSON en presets/index.json ni en presets/.", true);
    }
  } catch (error) {
    presetCatalog = [];
    renderPresetOptions(presetCatalog);
    setStatus(
      `No se pudieron cargar los presets dinamicos: ${error.message}. Genera y publica presets/index.json o habilita el listado de presets/.`,
      true,
    );
  }
}

async function loadPresetByFileName(fileName) {
  if (!fileName) return;

  const preset = presetCatalog.find((item) => item.fileName === fileName);
  if (!preset) {
    setStatus("El preset seleccionado ya no esta disponible.", true);
    renderPresetOptions(presetCatalog);
    return;
  }

  if (presetSelect) {
    presetSelect.disabled = true;
  }

  try {
    const response = await fetch(preset.url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    applyImportedParameters(payload);
    setStatus(
      geometrySnapshot?.valid
        ? `Preset cargado: ${preset.label}. Pulsa Start para dibujar la curva.`
        : `Preset cargado, pero la geometria no es valida: ${geometrySnapshot?.reason ?? "revision necesaria"}.`,
      !geometrySnapshot?.valid,
    );
  } catch (error) {
    setStatus(`No se pudo cargar el preset ${preset.label}: ${error.message}.`, true);
  } finally {
    renderPresetOptions(presetCatalog);
    if (presetSelect) {
      presetSelect.value = fileName;
    }
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setOutput(key, value) {
  const out = outputs.get(key);
  if (!out) return;
  out.textContent = Number.isInteger(value) ? `${value}` : Number(value).toFixed(2);
}

function stopForManualChange() {
  if (!running) return;
  running = false;
  updateControlState();
}

function getDerivedModel(cfg = model) {
  const baseRadiusL = cfg.toothModule * cfg.baseTeethL;
  const baseRadiusR = cfg.toothModule * cfg.baseTeethR;
  const orbitRadiusL = cfg.toothModule * cfg.orbitTeethL;
  const orbitRadiusR = cfg.toothModule * cfg.orbitTeethR;
  const legacyDriveDirection = cfg.driveDirection === -1 ? -1 : 1;
  const driveDirectionL = cfg.driveDirectionL === -1 ? -1 : (cfg.driveDirectionL === 1 ? 1 : legacyDriveDirection);
  const driveDirectionR = cfg.driveDirectionR === -1 ? -1 : (cfg.driveDirectionR === 1 ? 1 : legacyDriveDirection);
  const driveSpeed = Math.abs(cfg.driveSpeed);
  return {
    ...cfg,
    baseRadiusL,
    baseRadiusR,
    orbitRadiusL,
    orbitRadiusR,
    driveDirectionL,
    driveDirectionR,
    driveSpeed,
    signedDriveSpeedL: driveSpeed * driveDirectionL,
    signedDriveSpeedR: driveSpeed * driveDirectionR,
    fixedTeethL: cfg.baseTeethL,
    fixedTeethR: cfg.baseTeethR,
  };
}

function getCycleTurns(cfg = model) {
  const derived = getDerivedModel(cfg);
  const { numerator: speedNum, denominator: speedDen } = numberToFraction(Math.abs(derived.driveSpeed));

  if (speedNum === 0) return 1;

  const cycleForSide = (baseRadius, orbitRadius) => {
    const orbitFraction = reduceFraction(speedNum * orbitRadius, speedDen * (baseRadius + orbitRadius));
    return orbitFraction.denominator;
  };

  return lcm(
    cycleForSide(derived.baseRadiusL, derived.orbitRadiusL),
    cycleForSide(derived.baseRadiusR, derived.orbitRadiusR),
  );
}

function getZeroDistanceMinimum(cfg = model) {
  const derived = getDerivedModel(cfg);
  return derived.baseRadiusL + derived.baseRadiusR + derived.orbitRadiusL + derived.orbitRadiusR;
}

function getDistZeroMinInternal(cfg = model) {
  const derived = getDerivedModel(cfg);
  return cfg.zeroDistance - derived.baseRadiusL - derived.baseRadiusR;
}

function getArmReachMargin(cfg = model) {
  const derived = getDerivedModel(cfg);
  return (derived.baseRadiusL * 2)
    + (derived.baseRadiusR * 2)
    + getDistZeroMinInternal(cfg)
    + (derived.orbitRadiusL * 2)
    + (derived.orbitRadiusR * 2)
    - derived.armL
    - derived.armR;
}

function getSideState(side, timeSeconds, cfg = model) {
  const derived = getDerivedModel(cfg);
  const isLeft = side === "L";
  const baseRadius = isLeft ? derived.baseRadiusL : derived.baseRadiusR;
  const orbitRadius = isLeft ? derived.orbitRadiusL : derived.orbitRadiusR;
  const phase = isLeft ? derived.phaseL : derived.phaseR;
  const direction = isLeft ? -1 : 1;
  const signedDriveSpeed = isLeft ? derived.signedDriveSpeedL : derived.signedDriveSpeedR;
  const baseCenter = {
    x: stage.width / 2 + (isLeft ? -derived.zeroDistance / 2 : derived.zeroDistance / 2),
    y: stage.height * 0.7,
  };
  const spinAngle = phase + direction * TAU * signedDriveSpeed * timeSeconds;
  const orbitSpeed = signedDriveSpeed * (orbitRadius / (baseRadius + orbitRadius));
  const orbitAngle = phase + direction * TAU * orbitSpeed * timeSeconds;
  const orbitCenter = {
    x: baseCenter.x + (baseRadius + orbitRadius) * Math.cos(orbitAngle),
    y: baseCenter.y + (baseRadius + orbitRadius) * Math.sin(orbitAngle),
  };
  const marker = {
    x: orbitCenter.x - orbitRadius * Math.cos(spinAngle),
    y: orbitCenter.y - orbitRadius * Math.sin(spinAngle),
  };

  return {
    baseCenter,
    orbitCenter,
    marker,
    baseRadius,
    orbitRadius,
    orbitAngle,
    spinAngle,
  };
}

function isSideClockwise(side, cfg = model) {
  const derived = getDerivedModel(cfg);
  return side === "L" ? derived.driveDirectionL === -1 : derived.driveDirectionR === 1;
}

function getDriveDirectionForClockwise(side, clockwise) {
  if (side === "L") {
    return clockwise ? -1 : 1;
  }

  return clockwise ? 1 : -1;
}

function getSideRotationLabel(side, cfg = model) {
  return isSideClockwise(side, cfg) ? "horario" : "antihorario";
}

function circleIntersection(a, ra, b, rb) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);

  if (d <= GEOM_EPS || d > ra + rb + GEOM_EPS || d < Math.abs(ra - rb) - GEOM_EPS) return null;

  const ex = dx / d;
  const ey = dy / d;
  const x = (ra * ra - rb * rb + d * d) / (2 * d);
  const h2 = ra * ra - x * x;
  if (h2 < -GEOM_EPS) return null;

  const h = Math.sqrt(Math.max(0, h2));
  const px = a.x + x * ex;
  const py = a.y + x * ey;

  const i1 = { x: px + h * -ey, y: py + h * ex };
  const i2 = { x: px - h * -ey, y: py - h * ex };

  return i1.y < i2.y ? i1 : i2;
}

function getState(timeSeconds, cfg = model, cycleTurns = getCycleTurns(cfg)) {
  const cycleDuration = Math.max(cfg.cycleSeconds, 0.5);
  const progress = (timeSeconds % cycleDuration) / cycleDuration;
  const left = getSideState("L", timeSeconds, cfg);
  const right = getSideState("R", timeSeconds, cfg);
  const pen = circleIntersection(left.marker, cfg.armL, right.marker, cfg.armR);

  return {
    progress,
    cycleTurns,
    left,
    right,
    pen,
  };
}

function getDynamicSimulationStep(cfg = model) {
  const derived = getDerivedModel(cfg);
  const maxAngularSpeed = TAU * Math.max(Math.abs(derived.signedDriveSpeedL), Math.abs(derived.signedDriveSpeedR));

  if (maxAngularSpeed <= GEOM_EPS) return MAX_SIM_STEP;

  return Math.min(MAX_SIM_STEP, MAX_ANGULAR_STEP / maxAngularSpeed);
}

function isPenInUpperZone(state) {
  if (!state.pen) return false;

  const axisDx = state.right.marker.x - state.left.marker.x;
  const axisDy = state.right.marker.y - state.left.marker.y;
  const penDx = state.pen.x - state.left.marker.x;
  const penDy = state.pen.y - state.left.marker.y;

  return axisDx * penDy - axisDy * penDx < 0;
}

function evaluateGeometry(cfg) {
  const derived = getDerivedModel(cfg);
  const zeroDistanceMinimum = getZeroDistanceMinimum(cfg);

  if (cfg.zeroDistance <= zeroDistanceMinimum) {
    return {
      cycleTurns: getCycleTurns(cfg),
      valid: false,
      closed: false,
      reason: `Distancia Zero debe ser mayor que R1 + R1' + R2 + R2' = ${zeroDistanceMinimum.toFixed(2)}`,
      reasonCode: "zero_distance_min",
    };
  }

  const distZeroMinInternal = getDistZeroMinInternal(cfg);
  const orbitPair = derived.orbitRadiusL + derived.orbitRadiusR;

  if (distZeroMinInternal <= orbitPair) {
    return {
      cycleTurns: getCycleTurns(cfg),
      valid: false,
      closed: false,
      reason: `Debe cumplirse distZeromin > R2 + R2', y ahora ${distZeroMinInternal.toFixed(2)} <= ${orbitPair.toFixed(2)}`,
      reasonCode: "dist_zero_internal",
    };
  }

  const sampleCount = 900;
  const cycleTurns = getCycleTurns(cfg);
  let invalidSamples = 0;

  for (let i = 0; i <= sampleCount; i += 1) {
    const timeSeconds = (cfg.cycleSeconds * i) / sampleCount;
    const state = getState(timeSeconds, cfg, cycleTurns);
    if (!state.pen || !isPenInUpperZone(state)) {
      invalidSamples += 1;
    }
  }

  return {
    cycleTurns,
    valid: true,
    closed: invalidSamples === 0,
    reason: invalidSamples > 0
      ? `Geometria valida por restricciones base, con ${invalidSamples} muestra(s) conflictiva(s) del lapiz`
      : "Geometria valida",
    reasonCode: invalidSamples > 0 ? "trajectory_warning" : "ok",
    invalidSamples,
  };
}

function getRecipeText(snapshot, cfg = model) {
  if (!snapshot) {
    return "Ajusta la geometria y revisa los indicadores para ver recomendaciones.";
  }

  const derived = getDerivedModel(cfg);
  const zeroDistanceMinimum = getZeroDistanceMinimum(cfg);
  const distZeroMinInternal = getDistZeroMinInternal(cfg);
  const orbitPair = derived.orbitRadiusL + derived.orbitRadiusR;
  const armReachMargin = getArmReachMargin(cfg);
  const fmtInt = (value) => Math.ceil(value).toString();
  const fmtDelta = (value) => fmt(Math.max(0, value));

  switch (snapshot.reasonCode) {
    case "zero_distance_min":
      return `Sube Distancia Zero al menos hasta ${fmt(zeroDistanceMinimum + 1)}. Alternativas: baja el modulo a ${(Math.max(1, cfg.toothModule - 0.1)).toFixed(1)} o reduce dientes O2/O2' hasta que R2 + R2' baje en al menos ${fmtDelta(zeroDistanceMinimum + 1 - cfg.zeroDistance)}.`;
    case "dist_zero_internal":
      return `Falta separar ${fmtDelta(orbitPair - distZeroMinInternal + 1)} unidades. Opciones concretas: sube Distancia Zero a ${fmt(cfg.zeroDistance + orbitPair - distZeroMinInternal + 1)}, o baja R2+R2' hasta menos de ${fmt(distZeroMinInternal - 1)} reduciendo modulo o dientes.`;
    case "trajectory":
      return `La geometría estática pasa, pero la trayectoria falla. Prueba esta secuencia: 1) baja velocidad base de ${fmt(Math.abs(cfg.driveSpeed))} a ${fmt(Math.abs(cfg.driveSpeed) * 0.5)}; 2) mueve fase izquierda de ${fmt(cfg.phaseL)} a ${fmt((cfg.phaseL + 0.3) % TAU)}; 3) mueve fase derecha de ${fmt(cfg.phaseR)} a ${fmt((cfg.phaseR - 0.3 + TAU) % TAU)}; 4) si sigue fallando, baja brazo1 a ${fmt(Math.max(80, cfg.armL - 10))} y brazo2 a ${fmt(Math.max(80, cfg.armR - 10))}.`;
    case "trajectory_warning":
      return `La configuración ya es arrancable porque cumple Distancia Zero y distZeromin. Aun así hay ${snapshot.invalidSamples ?? 0} muestra(s) conflictiva(s) del lapiz. Si quieres suavizar eso, prueba a bajar la velocidad base a ${fmt(Math.abs(cfg.driveSpeed) * 0.5)} o ajustar fases a ${fmt((cfg.phaseL + 0.2) % TAU)} y ${fmt((cfg.phaseR - 0.2 + TAU) % TAU)}.`;
    case "tangent_ok":
      return `La geometría ya arranca. Para estabilizarla más, prueba a subir Distancia Zero de ${fmt(cfg.zeroDistance)} a ${fmt(cfg.zeroDistance + 5)}, o mover las fases a ${fmt((cfg.phaseL + 0.1) % TAU)} y ${fmt((cfg.phaseR - 0.1 + TAU) % TAU)}.`;
    case "ok":
      return `La configuración es arrancable. Si quieres variar la curva sin romperla, cambia dientes O2/O2' en pasos de 1, mantén Distancia Zero por encima de ${fmt(zeroDistanceMinimum + 1)} y conserva margen de brazos positivo.`;
    default:
      return "Ajusta Distancia Zero, dentados, fases o brazos hasta recuperar una trayectoria valida.";
  }
}

function getKeysToUpdate(changedKey) {
  for (const [syncKey, keys] of Object.entries(syncPairs)) {
    if (keys.includes(changedKey) && syncState[syncKey]) return keys;
  }

  return [changedKey];
}

function updateSyncPair(syncKey, anchorKey) {
  stopForManualChange();
  syncState[syncKey] = syncMap.get(syncKey)?.checked ?? false;
  if (!syncState[syncKey]) return;

  const [leftKey, rightKey] = syncPairs[syncKey];
  const anchorValue = Math.min(model[leftKey], model[rightKey], model[anchorKey]);
  model[leftKey] = anchorValue;
  model[rightKey] = anchorValue;
  geometrySnapshot = evaluateGeometry(model);
  refreshUiValues();
  setStatus(
    geometrySnapshot.valid
      ? "Geometria actualizada. Pulsa Start para reanudar."
      : `Geometria actualizada, pero no valida: ${geometrySnapshot.reason}. Pulsa Start solo cuando vuelva a ser valida.`,
    !geometrySnapshot.valid,
  );
}

function applyInputChange(key, nextValue) {
  stopForManualChange();
  const keys = getKeysToUpdate(key);

  keys.forEach((itemKey) => {
    model[itemKey] = nextValue;
  });

  geometrySnapshot = evaluateGeometry(model);
  refreshUiValues();
  setStatus(
    geometrySnapshot.valid
      ? "Geometria actualizada. Pulsa Start para reanudar."
      : `Geometria actualizada, pero no valida: ${geometrySnapshot.reason}. Pulsa Start solo cuando vuelva a ser valida.`,
    !geometrySnapshot.valid,
  );
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
    minusBtn.addEventListener("click", () => {
      nudgeRangeInput(input, -1);
    });

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "range-nudge";
    plusBtn.textContent = "+";
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
      applyInputChange(key, Number(input.value));
    });
  });

  syncMap.forEach((input, syncKey) => {
    input.checked = syncState[syncKey];
    input.addEventListener("change", () => {
      updateSyncPair(syncKey, syncPairs[syncKey][0]);
    });
  });

  if (reverseDriveInputL) {
    reverseDriveInputL.checked = isSideClockwise("L");
    reverseDriveInputL.addEventListener("change", () => {
      stopForManualChange();
      model.driveDirectionL = getDriveDirectionForClockwise("L", reverseDriveInputL.checked);
      geometrySnapshot = evaluateGeometry(model);
      refreshUiValues();
      updateControlState();
      setStatus(
        geometrySnapshot.valid
          ? "Sentido de O2 actualizado. Pulsa Start para reanudar."
          : `Sentido de O2 actualizado, pero la geometria no es valida: ${geometrySnapshot.reason}.`,
        !geometrySnapshot.valid,
      );
    });
  }

  if (reverseDriveInputR) {
    reverseDriveInputR.checked = isSideClockwise("R");
    reverseDriveInputR.addEventListener("change", () => {
      stopForManualChange();
      model.driveDirectionR = getDriveDirectionForClockwise("R", reverseDriveInputR.checked);
      geometrySnapshot = evaluateGeometry(model);
      refreshUiValues();
      updateControlState();
      setStatus(
        geometrySnapshot.valid
          ? "Sentido de O2' actualizado. Pulsa Start para reanudar."
          : `Sentido de O2' actualizado, pero la geometria no es valida: ${geometrySnapshot.reason}.`,
        !geometrySnapshot.valid,
      );
    });
  }

  if (presetSelect) {
    presetSelect.addEventListener("change", async () => {
      await loadPresetByFileName(presetSelect.value);
    });
  }
}

function refreshUiValues() {
  const derived = getDerivedModel(model);

  inputMap.forEach((input, key) => {
    input.value = String(model[key]);
    setOutput(key, model[key]);
  });

  outputs.set("orbitRadiusLDerived", outputs.get("orbitRadiusLDerived"));
  outputs.set("orbitRadiusRDerived", outputs.get("orbitRadiusRDerived"));
  outputs.set("baseRadiusLDerived", outputs.get("baseRadiusLDerived"));
  outputs.set("baseRadiusRDerived", outputs.get("baseRadiusRDerived"));
  setOutput("baseRadiusLDerived", derived.baseRadiusL);
  setOutput("baseRadiusRDerived", derived.baseRadiusR);
  setOutput("orbitRadiusLDerived", derived.orbitRadiusL);
  setOutput("orbitRadiusRDerived", derived.orbitRadiusR);

  syncMap.forEach((input, key) => {
    input.checked = syncState[key];
  });

  if (reverseDriveInputL) {
    reverseDriveInputL.checked = isSideClockwise("L");
  }

  if (reverseDriveInputR) {
    reverseDriveInputR.checked = isSideClockwise("R");
  }

  const zeroDistanceInput = inputMap.get("zeroDistance");
  if (zeroDistanceInput) {
    zeroDistanceInput.min = String(Math.ceil(getZeroDistanceMinimum(model) + 1));
  }

  if (zeroDistanceHintEl) {
    const distZeroMinInternal = getDistZeroMinInternal(model);
    const orbitPair = derived.orbitRadiusL + derived.orbitRadiusR;
    const armReachMargin = getArmReachMargin(model);
    zeroDistanceHintEl.textContent = `Premisa A: Distancia Zero > ${getZeroDistanceMinimum(model).toFixed(2)}. distZeromin = ${distZeroMinInternal.toFixed(2)} y debe cumplirse distZeromin > R2 + R2' = ${orbitPair.toFixed(2)}. Margen brazos = ${armReachMargin.toFixed(2)}.`;
  }
}

function updateControlState() {
  startBtn.disabled = running;
  stopBtn.disabled = !running;
}

function updateStageViewportSize() {
  if (!stageWrapEl || !stageShellEl) return;

  const horizontalPadding = 24;
  const verticalPadding = 24;
  const toolbarHeight = canvasToolbarEl ? canvasToolbarEl.getBoundingClientRect().height : 0;
  const hintHeight = canvasHintEl ? canvasHintEl.getBoundingClientRect().height : 0;
  const availableWidth = Math.max(260, stageWrapEl.clientWidth - horizontalPadding);
  const availableHeight = Math.max(220, stageWrapEl.clientHeight - toolbarHeight - hintHeight - verticalPadding);
  const aspect = stage.width / stage.height;

  let renderWidth = availableWidth;
  let renderHeight = renderWidth / aspect;

  if (renderHeight > availableHeight) {
    renderHeight = availableHeight;
    renderWidth = renderHeight * aspect;
  }

  stageShellEl.style.width = `${renderWidth}px`;
  stageShellEl.style.height = `${renderHeight}px`;
  stage.style.width = `${renderWidth}px`;
  stage.style.height = `${renderHeight}px`;
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

function expandBounds(bounds, padding) {
  if (!bounds) return null;
  return {
    minX: bounds.minX - (padding.left ?? 0),
    maxX: bounds.maxX + (padding.right ?? 0),
    minY: bounds.minY - (padding.top ?? 0),
    maxY: bounds.maxY + (padding.bottom ?? 0),
  };
}

function fitViewToBounds(bounds) {
  if (!bounds) {
    resetView();
    return;
  }

  const padding = {
    left: 80,
    right: 80,
    top: 150,
    bottom: 90,
  };
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scaleX = (stage.width - padding.left - padding.right) / width;
  const scaleY = (stage.height - padding.top - padding.bottom) / height;
  const nextScale = Math.max(view.minScale, Math.min(view.maxScale, Math.min(scaleX, scaleY)));
  const paddedWidth = stage.width - padding.left - padding.right;
  const paddedHeight = stage.height - padding.top - padding.bottom;

  view.scale = nextScale;
  view.offsetX = padding.left + (paddedWidth - width * nextScale) / 2 - bounds.minX * nextScale;
  view.offsetY = padding.top + (paddedHeight - height * nextScale) / 2 - bounds.minY * nextScale;
}

function centerViewOnContent() {
  const state = getState(elapsed);
  const leftBounds = {
    minX: Math.min(
      state.left.baseCenter.x - state.left.baseRadius,
      state.left.orbitCenter.x - state.left.orbitRadius,
      state.left.marker.x - model.armL,
    ),
    maxX: Math.max(
      state.left.baseCenter.x + state.left.baseRadius,
      state.left.orbitCenter.x + state.left.orbitRadius,
      state.left.marker.x + model.armL,
    ),
    minY: Math.min(
      state.left.baseCenter.y - state.left.baseRadius,
      state.left.orbitCenter.y - state.left.orbitRadius,
      state.left.marker.y - model.armL,
    ),
    maxY: Math.max(
      state.left.baseCenter.y + state.left.baseRadius,
      state.left.orbitCenter.y + state.left.orbitRadius,
      state.left.marker.y + model.armL,
    ),
  };
  const rightBounds = {
    minX: Math.min(
      state.right.baseCenter.x - state.right.baseRadius,
      state.right.orbitCenter.x - state.right.orbitRadius,
      state.right.marker.x - model.armR,
    ),
    maxX: Math.max(
      state.right.baseCenter.x + state.right.baseRadius,
      state.right.orbitCenter.x + state.right.orbitRadius,
      state.right.marker.x + model.armR,
    ),
    minY: Math.min(
      state.right.baseCenter.y - state.right.baseRadius,
      state.right.orbitCenter.y - state.right.orbitRadius,
      state.right.marker.y - model.armR,
    ),
    maxY: Math.max(
      state.right.baseCenter.y + state.right.baseRadius,
      state.right.orbitCenter.y + state.right.orbitRadius,
      state.right.marker.y + model.armR,
    ),
  };
  const penBounds = collectBoundsFromPoints([state.pen]);
  const machineBounds = mergeBounds([leftBounds, rightBounds, penBounds]);
  fitViewToBounds(mergeBounds([
    expandBounds(machineBounds, { left: 0, right: 0, top: 20, bottom: 20 }),
    collectBoundsFromPoints(points),
  ]));
}

function drawPoint(point, color, radius = 5) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, TAU);
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
  ctx.drawImage(traceCanvas, -TRACE_CANVAS_MARGIN, -TRACE_CANVAS_MARGIN);
}

function configureTraceContext(targetCtx) {
  targetCtx.strokeStyle = traceColor;
  targetCtx.lineWidth = 1.2;
  targetCtx.lineJoin = "round";
  targetCtx.lineCap = "round";
}

function clearTraceLayer() {
  traceCtx.clearRect(0, 0, traceCanvas.width, traceCanvas.height);
  lastTracePoint = points.at(-1) ?? null;
}

function resetSimulationState() {
  running = false;
  elapsed = 0;
  points = [];
  clearTraceLayer();
}

function rebuildTraceLayer() {
  clearTraceLayer();
  if (points.length < 2) return;

  configureTraceContext(traceCtx);
  traceCtx.beginPath();
  traceCtx.moveTo(points[0].x + TRACE_CANVAS_MARGIN, points[0].y + TRACE_CANVAS_MARGIN);
  for (let i = 1; i < points.length; i += 1) {
    traceCtx.lineTo(points[i].x + TRACE_CANVAS_MARGIN, points[i].y + TRACE_CANVAS_MARGIN);
  }
  traceCtx.stroke();
  lastTracePoint = points[points.length - 1];
}

function compactTracePoints() {
  if (points.length <= MAX_TRACE_POINTS) return;

  const compacted = [points[0]];
  for (let i = 2; i < points.length; i += 2) {
    compacted.push(points[i]);
  }

  const lastPoint = points[points.length - 1];
  if (compacted[compacted.length - 1] !== lastPoint) {
    compacted.push(lastPoint);
  }

  points = compacted;
  rebuildTraceLayer();
}

function appendTracePoint(point) {
  if (!point) return;

  if (!lastTracePoint) {
    points.push(point);
    lastTracePoint = point;
    return;
  }

  const dx = point.x - lastTracePoint.x;
  const dy = point.y - lastTracePoint.y;
  if ((dx * dx) + (dy * dy) < TRACE_MIN_SEGMENT * TRACE_MIN_SEGMENT) return;

  points.push(point);
  configureTraceContext(traceCtx);
  traceCtx.beginPath();
  traceCtx.moveTo(lastTracePoint.x + TRACE_CANVAS_MARGIN, lastTracePoint.y + TRACE_CANVAS_MARGIN);
  traceCtx.lineTo(point.x + TRACE_CANVAS_MARGIN, point.y + TRACE_CANVAS_MARGIN);
  traceCtx.stroke();
  lastTracePoint = point;
  compactTracePoints();
}

function polarPoint(center, radius, angle) {
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
}

function drawGear(center, outerRadius, teeth, angle, fill, stroke) {
  const toothHeight = Math.max(4, outerRadius * 0.16);
  const innerRadius = Math.max(outerRadius * 0.55, outerRadius - toothHeight);
  const pitchRadius = (innerRadius + outerRadius) * 0.5;

  ctx.beginPath();

  for (let i = 0; i < teeth; i += 1) {
    const currentAngle = angle + (TAU / teeth) * i;
    const nextAngle = angle + (TAU / teeth) * (i + 1);

    const rootStart = polarPoint(center, innerRadius, currentAngle);
    const tipStart = polarPoint(center, outerRadius, currentAngle);
    const tipEnd = polarPoint(center, outerRadius, nextAngle);
    const rootEnd = polarPoint(center, innerRadius, nextAngle);

    if (i === 0) ctx.moveTo(tipStart.x, tipStart.y);
    else ctx.lineTo(tipStart.x, tipStart.y);

    ctx.lineTo(rootStart.x, rootStart.y);
    ctx.lineTo(rootEnd.x, rootEnd.y);
    ctx.lineTo(tipEnd.x, tipEnd.y);
  }

  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, pitchRadius, 0, TAU);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(8, outerRadius * 0.18), 0, TAU);
  ctx.fillStyle = "#eff6ff";
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawLabel(text, point, dx = 0, dy = 0) {
  ctx.fillStyle = "#dbe8ff";
  ctx.font = `${Math.max(12, 14 / view.scale)}px "Segoe UI", sans-serif`;
  ctx.fillText(text, point.x + dx, point.y + dy);
}

function saveTrace() {
  if (points.length < 2) {
    setStatus("No hay trazo para guardar.", true);
    return;
  }

  const pathData = points
    .map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${stage.width} ${stage.height}">\n  <path d="${pathData}" fill="none" stroke="${traceColor}" stroke-width="1.5"/>\n</svg>\n`;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `trazo-pantografo-epicicloide-${Date.now()}.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Trazo guardado en SVG.");
}

function exportParameters() {
  const payload = {
    version: 1,
    model: { ...model },
    syncState: { ...syncState },
    traceColor,
  };

  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `armoniografo-params-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Parametros exportados a JSON.");
}

function applyImportedParameters(payload) {
  if (!payload || typeof payload !== "object" || !payload.model || typeof payload.model !== "object") {
    throw new Error("El archivo no contiene un bloque 'model' valido.");
  }

  stopForManualChange();

  Object.keys(INITIAL_MODEL).forEach((key) => {
    if (typeof payload.model[key] === "number" && Number.isFinite(payload.model[key])) {
      model[key] = payload.model[key];
    }
  });

  if (typeof payload.model.baseRadiusL === "number" && Number.isFinite(payload.model.baseRadiusL)) {
    model.baseTeethL = Math.max(10, Math.round(payload.model.baseRadiusL / model.toothModule));
  }
  if (typeof payload.model.baseRadiusR === "number" && Number.isFinite(payload.model.baseRadiusR)) {
    model.baseTeethR = Math.max(10, Math.round(payload.model.baseRadiusR / model.toothModule));
  }

  if (payload.syncState && typeof payload.syncState === "object") {
    Object.keys(syncState).forEach((key) => {
      if (typeof payload.syncState[key] === "boolean") {
        syncState[key] = payload.syncState[key];
      }
    });
    if (typeof payload.syncState.baseRadius === "boolean") {
      syncState.baseTeeth = payload.syncState.baseRadius;
    }
  }

  if (typeof payload.traceColor === "string") {
    traceColor = payload.traceColor;
    traceColorInput.value = payload.traceColor;
  }

  model.driveSpeed = Math.abs(model.driveSpeed);
  const legacyDriveDirection = typeof payload.model.driveDirection === "number"
    ? (payload.model.driveDirection === -1 ? -1 : 1)
    : (typeof payload.model.driveSpeed === "number" && payload.model.driveSpeed < 0 ? -1 : 1);
  model.driveDirectionL = payload.model.driveDirectionL === -1 ? -1 : (payload.model.driveDirectionL === 1 ? 1 : legacyDriveDirection);
  model.driveDirectionR = payload.model.driveDirectionR === -1 ? -1 : (payload.model.driveDirectionR === 1 ? 1 : legacyDriveDirection);

  geometrySnapshot = evaluateGeometry(model);
  resetSimulationState();
  if (presetSelect) {
    presetSelect.value = "";
  }
  refreshUiValues();
  updateControlState();
  centerViewOnContent();
  setStatus(
    geometrySnapshot.valid
      ? "Parametros importados. Pulsa Start para reproducir la configuracion."
      : `Parametros importados, pero la geometria no es valida: ${geometrySnapshot.reason}.`,
    !geometrySnapshot.valid,
  );
}

function importParametersFromFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result));
      applyImportedParameters(payload);
    } catch (error) {
      setStatus(`No se pudieron importar los parametros: ${error.message}.`, true);
    } finally {
      importParamsFileInput.value = "";
    }
  };
  reader.onerror = () => {
    setStatus("No se pudo leer el archivo de parametros.", true);
    importParamsFileInput.value = "";
  };
  reader.readAsText(file);
}

function updateEquationDisplay(state) {
  const derived = getDerivedModel(model);
  const cycleTurns = geometrySnapshot?.cycleTurns ?? getCycleTurns(model);
  const globallyValid = geometrySnapshot?.valid ?? false;
  const distZeroMinInternal = getDistZeroMinInternal(model);
  const orbitPair = derived.orbitRadiusL + derived.orbitRadiusR;
  const armReachMargin = getArmReachMargin(model);

  equationEl.textContent = [
    "R2 = modulo * dientes2,  R2' = modulo * dientes2'",
    "sin derrape: cada lado usa una velocidadBase con signo propio y orbitacion = velocidadBase * R2 / (R1 + R2)",
    "PL(t) = O2(t) - R2 * [cos(phiL(t)), sin(phiL(t))]",
    "PR(t) = O2'(t) - R2' * [cos(phiR(t)), sin(phiR(t))]",
    "Lapiz(t) = interseccion_superior( circ(PL, brazo1), circ(PR, brazo2) )",
    "",
    `dientes1=${fmt(model.baseTeethL)}, dientes1'=${fmt(model.baseTeethR)}, modulo=${fmt(model.toothModule)}`,
    `R1=${fmt(derived.baseRadiusL)}, R1'=${fmt(derived.baseRadiusR)}, dientes2=${fmt(model.orbitTeethL)}, dientes2'=${fmt(model.orbitTeethR)}`,
    `R2=${fmt(derived.orbitRadiusL)}, R2'=${fmt(derived.orbitRadiusR)}`,
    `velocidadBase=${fmt(Math.abs(model.driveSpeed))}, sentidoO2=${getSideRotationLabel("L")}, sentidoO2'=${getSideRotationLabel("R")}, velocidadVisual=${fmt(model.playbackSpeed)}, brazo1=${fmt(model.armL)}, brazo2=${fmt(model.armR)}`,
    `distZeromin=${fmt(distZeroMinInternal)}, condicion distZeromin > R2 + R2' = ${fmt(orbitPair)}`,
    `margen brazos=${fmt(armReachMargin)}, ciclo geometrico=${cycleTurns}`,
    `garantia global = ${globallyValid ? "SI" : "NO"}`,
  ].join("\n");

  guaranteeBadgeEl.textContent = `GARANTIA GLOBAL: ${globallyValid ? "SI" : "NO"}`;
  guaranteeBadgeEl.classList.toggle("ok", globallyValid);
  guaranteeBadgeEl.classList.toggle("bad", !globallyValid);
  geometryClosureBadgeEl.textContent = "ENGRANE SIN DERRAPE: SI";
  geometryClosureBadgeEl.classList.add("ok");
  geometryClosureBadgeEl.classList.remove("bad");
  geometryClosureHintEl.textContent = globallyValid
    ? "Las ruedas moviles ruedan por engrane exterior sin derrape y la configuracion cumple las restricciones base de Distancia Zero."
    : `El engrane es sin derrape por construccion, pero la trayectoria del lapiz no es globalmente valida: ${geometrySnapshot?.reason ?? "ajusta radios, dentados o brazos"}.`;
  cycleInfoEl.textContent = `Ciclo geometrico: ${cycleTurns} vuelta(s) equivalentes | progreso ${(state.progress * 100).toFixed(1)}%`;
  orbitHintEl.textContent = "Ambas ruedas comparten la misma magnitud de velocidad base, pero cada una puede girar en sentido horario o antihorario de forma independiente.";
  if (recipeHintEl) {
    recipeHintEl.textContent = getRecipeText(geometrySnapshot, model);
  }
  pointNowEl.textContent = state.pen
    ? `Lapiz = (${state.pen.x.toFixed(2)}, ${state.pen.y.toFixed(2)})`
    : "Lapiz = no definido";
}

function render(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  if (running) {
    const scaledDt = dt * Math.max(0.1, model.playbackSpeed);
    const dynamicStep = getDynamicSimulationStep(model);
    const steps = Math.max(1, Math.ceil(scaledDt / dynamicStep));
    const stepDt = scaledDt / steps;

    for (let i = 0; i < steps; i += 1) {
      elapsed += stepDt;
      const stepState = getState(elapsed);
      appendTracePoint(stepState.pen ? { x: stepState.pen.x, y: stepState.pen.y } : null);
    }

  }

  const state = getState(elapsed);
  updateEquationDisplay(state);

  const derived = getDerivedModel(model);

  ctx.clearRect(0, 0, stage.width, stage.height);
  ctx.save();
  ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

  drawGrid();
  drawTrace();
  drawLink(state.left.baseCenter, state.right.baseCenter, "#7d8fb1", 1.5);
  drawGear(state.left.baseCenter, derived.baseRadiusL, derived.fixedTeethL, 0, "#8fc5ff", "#3d5f88");
  drawGear(state.right.baseCenter, derived.baseRadiusR, derived.fixedTeethR, 0, "#8fc5ff", "#3d5f88");
  drawGear(state.left.orbitCenter, derived.orbitRadiusL, model.orbitTeethL, state.left.spinAngle, "#d1f0ff", "#456f8e");
  drawGear(state.right.orbitCenter, derived.orbitRadiusR, model.orbitTeethR, state.right.spinAngle, "#d1f0ff", "#456f8e");
  drawLink(state.left.marker, state.pen ?? state.left.marker, "#ecf2ff", 2.2);
  drawLink(state.right.marker, state.pen ?? state.right.marker, "#ecf2ff", 2.2);
  drawPoint(state.left.marker, "#ff5656", 4.5);
  drawPoint(state.right.marker, "#ff5656", 4.5);
  drawPoint(state.left.baseCenter, "#163553", 4.5);
  drawPoint(state.right.baseCenter, "#163553", 4.5);

  if (state.pen) drawPoint(state.pen, "#66e2a8", 5.6);

  drawLabel("O1", state.left.baseCenter, -20, 0);
  drawLabel("O1'", state.right.baseCenter, 10, 0);
  drawLabel("O2", state.left.orbitCenter, -14, -10);
  drawLabel("O2'", state.right.orbitCenter, 10, -10);
  ctx.restore();

  requestAnimationFrame(render);
}

startBtn.addEventListener("click", () => {
  if (!geometrySnapshot?.valid) {
    setStatus(`No se puede iniciar: ${geometrySnapshot?.reason ?? "geometria no valida"}.`, true);
    return;
  }

  running = true;
  updateControlState();
  setStatus("Simulacion en marcha.");
});

stopBtn.addEventListener("click", () => {
  running = false;
  updateControlState();
  setStatus("Simulacion detenida.");
});

clearBtn.addEventListener("click", () => {
  points = [];
  clearTraceLayer();
  setStatus("Trazo borrado.");
});

resetSimBtn.addEventListener("click", () => {
  Object.assign(model, INITIAL_MODEL);
  Object.assign(syncState, {
    baseTeeth: true,
    orbitTeeth: false,
    arms: false,
  });
  resetSimulationState();
  if (presetSelect) {
    presetSelect.value = "";
  }
  geometrySnapshot = evaluateGeometry(model);
  refreshUiValues();
  centerViewOnContent();
  updateControlState();
  setStatus("Simulacion reiniciada.");
});

saveBtn.addEventListener("click", saveTrace);
exportParamsBtn.addEventListener("click", exportParameters);
importParamsBtn.addEventListener("click", () => {
  importParamsFileInput.click();
});
importParamsFileInput.addEventListener("change", () => {
  importParametersFromFile(importParamsFileInput.files?.[0]);
});
centerViewBtn.addEventListener("click", () => {
  centerViewOnContent();
  setStatus("Vista centrada.");
});
traceColorInput.addEventListener("input", () => {
  traceColor = traceColorInput.value;
  rebuildTraceLayer();
  setStatus("Color de linea actualizado.");
});
zoomInBtn.addEventListener("click", () => zoomAt(1.15, stage.width / 2, stage.height / 2));
zoomOutBtn.addEventListener("click", () => zoomAt(1 / 1.15, stage.width / 2, stage.height / 2));
zoomResetBtn.addEventListener("click", resetView);

stage.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = stage.getBoundingClientRect();
  const x = ((event.clientX - rect.left) * stage.width) / rect.width;
  const y = ((event.clientY - rect.top) * stage.height) / rect.height;
  zoomAt(event.deltaY < 0 ? 1.08 : 1 / 1.08, x, y);
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

window.addEventListener("resize", () => {
  updateStageViewportSize();
});

syncUi();
geometrySnapshot = evaluateGeometry(model);
refreshUiValues();
updateStageViewportSize();
updateControlState();
centerViewOnContent();
loadPresetCatalog();
requestAnimationFrame((now) => {
  lastTime = now;
  render(now);
});
