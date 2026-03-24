import React, { useEffect, useMemo, useRef, useState } from "react";
import pdfjsLib from "./pdfWorker.js";
import { calculateDieline, detectStrokeColors } from "./api.js";

function rgbToHex({ r, g, b }) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const LASER_BEND_RATE_EUR_PER_CM = 0.35;
const BLADE_RATE_EUR_PER_CM = 0.28;

const TEXT = {
  en: {
    title: "Dieline Calculator (PDF)",
    uploadPdf: "Upload PDF",
    page: "Page",
    prev: "Prev",
    next: "Next",
    pageHint: "After changing page, re-draw crop box and re-pick colors.",
    mode: "Mode",
    modeCombined: "1 color picker (cuts+bends combined)",
    modeSeparate: "2 color pickers (cuts vs bends)",
    useCrop: "Use crop (when off: scan whole page)",
    useCropHint:
      "If enabled, drag a crop box around the dieline. If disabled, no crop is required.",
    detectVectorColors: "Detect vector colors",
    detecting: "Detecting…",
    noVectorColors:
      "No vector colors detected yet. Click “Detect vector colors”.",
    clickColorBelow: "Click a color below to set it:",
    strokes: "strokes",
    pickedDielineColor: "Picked dieline color",
    notPickedYet:
      "Not picked yet (double-click a dieline line on the preview)",
    activePicker: "Active picker",
    pickCutColor: "Pick CUT color",
    pickBendColor: "Pick BEND color",
    notPicked: "not picked",
    calculate: "Calculate",
    calculating: "Calculating…",
    results: "Results",
    paths: "Paths",
    length: "Length",
    bladeCostPerBox: "Blade cost / box",
    laserCostPerBox: "Laser cost / box",
    totalLength: "TOTAL — Length",
    dielineBbox: "Dieline bbox",
    previewSteps:
      "1) Drag to create crop box. 2) Detect/pick colors. 3) Calculate.",
    controls: "Controls:",
    dragMouse: "- Drag mouse to create crop box",
    doubleClick: "- Double-click on a dieline stroke to pick color",
    nestingTitle: "Shape-aware nesting preview",
    searchStep: "Search step (mm)",
    precision: "Precision (px/mm)",
    rules: "Rules:",
    leftGap: "Left gap",
    rightGap: "Right gap",
    topGap: "Top gap",
    bottomGap: "Bottom gap",
    betweenShapes: "Between shapes",
    autoTests:
      "- Auto-tests both presets and both rotation sets, then keeps the best coverage.",
    buildingPreview: "Building nesting preview…",
    chosenPreset: "Chosen preset",
    chosenRotations: "Chosen rotations",
    fits: "Fits",
    bladeCostForBoxes: "Blade cost for",
    laserCostForBoxes: "Laser cost for",
    boxes: "boxes",
    coverage: "Coverage",
    usedWidth: "Used width",
    usedHeight: "Used height",
    freeRight: "Free right",
    freeBottom: "Free bottom",
    bestStrategy: "Best strategy",
    modeInfo:
      "Mode: auto preset + auto rotation + shape-aware greedy + compaction",
    infoTip:
      "Tip: drag to create crop box. Then double-click a line to pick color.",
    infoCropFirst:
      "Draw a crop box first (or turn off crop) before detecting vector colors.",
    infoColorsDetected: "Colors detected. Click a swatch to set the line color.",
    infoPickCombined:
      "Pick the combined color (double-click a dieline stroke).",
    infoPickBoth:
      "Pick BOTH colors: Cut and Bend (use the picker selector).",
    infoDrawCrop:
      "Please draw a crop box around the dieline first (or turn off crop).",
    infoCalculating: "Calculating…",
    infoReady: "Results ready. Building nesting preview…",
    infoDone: "Done.",
    cut: "CUT",
    bend: "BEND",
    total: "TOTAL",
    copies: "copies",
  },
  lt: {
    title: "Iškirtimo skaičiuoklė (PDF)",
    uploadPdf: "Įkelti PDF",
    page: "Puslapis",
    prev: "Atgal",
    next: "Pirmyn",
    pageHint:
      "Pakeitus puslapį, iš naujo pažymėkite iškirpimo zoną ir pasirinkite spalvas.",
    mode: "Režimas",
    modeCombined: "1 spalvos parinkiklis (pjovimas+lenkimas kartu)",
    modeSeparate: "2 spalvų parinkikliai (pjovimas ir lenkimas)",
    useCrop: "Naudoti iškirpimo zoną (kai išjungta: skenuoti visą puslapį)",
    useCropHint:
      "Jei įjungta, pažymėkite iškirpimo zoną aplink išklotinę. Jei išjungta, zona nebūtina.",
    detectVectorColors: "Aptikti vektorines spalvas",
    detecting: "Aptinkama…",
    noVectorColors:
      "Vektorinės spalvos dar neaptiktos. Paspauskite „Aptikti vektorines spalvas“.",
    clickColorBelow: "Spauskite spalvą žemiau, kad ją nustatytumėte:",
    strokes: "linijos",
    pickedDielineColor: "Pasirinkta išklotinės spalva",
    notPickedYet:
      "Dar nepasirinkta (dukart spustelėkite liniją peržiūroje)",
    activePicker: "Aktyvus parinkiklis",
    pickCutColor: "Pasirinkti PJOVIMO spalvą",
    pickBendColor: "Pasirinkti LENKIMO spalvą",
    notPicked: "nepasirinkta",
    calculate: "Skaičiuoti",
    calculating: "Skaičiuojama…",
    results: "Rezultatai",
    paths: "Linijos",
    length: "Ilgis",
    bladeCostPerBox: "Peilio kaina / dėžutei",
    laserCostPerBox: "Lazerio kaina / dėžutei",
    totalLength: "VISO — Ilgis",
    dielineBbox: "Išklotinės bbox",
    previewSteps:
      "1) Pažymėkite iškirpimo zoną. 2) Aptikite/pasirinkite spalvas. 3) Skaičiuokite.",
    controls: "Valdymas:",
    dragMouse: "- Tempkite pelę, kad pažymėtumėte zoną",
    doubleClick: "- Dukart spustelėkite liniją, kad pasirinktumėte spalvą",
    nestingTitle: "Formą įvertinanti išdėstymo peržiūra",
    searchStep: "Paieškos žingsnis (mm)",
    precision: "Tikslumas (px/mm)",
    rules: "Taisyklės:",
    leftGap: "Kairys tarpas",
    rightGap: "Dešinys tarpas",
    topGap: "Viršutinis tarpas",
    bottomGap: "Apatinis tarpas",
    betweenShapes: "Tarpas tarp formų",
    autoTests:
      "- Automatiškai testuojami abu presetai ir abu pasukimų variantai, paliekant geriausią užpildymą.",
    buildingPreview: "Kuriama išdėstymo peržiūra…",
    chosenPreset: "Pasirinktas preset",
    chosenRotations: "Pasirinkti pasukimai",
    fits: "Telpa",
    bladeCostForBoxes: "Peilio kaina už",
    laserCostForBoxes: "Lazerio kaina už",
    boxes: "dėž.",
    coverage: "Užpildymas",
    usedWidth: "Panaudotas plotis",
    usedHeight: "Panaudotas aukštis",
    freeRight: "Laisva dešinėje",
    freeBottom: "Laisva apačioje",
    bestStrategy: "Geriausia strategija",
    modeInfo:
      "Režimas: auto preset + auto pasukimas + formą vertinantis greedy + sutankinimas",
    infoTip:
      "Patarimas: pažymėkite iškirpimo zoną. Tada dukart spustelėkite liniją, kad pasirinktumėte spalvą.",
    infoCropFirst:
      "Pirmiausia pažymėkite iškirpimo zoną (arba išjunkite crop), prieš aptinkant vektorines spalvas.",
    infoColorsDetected:
      "Spalvos aptiktos. Spauskite spalvą, kad ją nustatytumėte.",
    infoPickCombined:
      "Pasirinkite bendrą spalvą (dukart spustelėkite išklotinės liniją).",
    infoPickBoth:
      "Pasirinkite ABI spalvas: pjovimo ir lenkimo (naudokite parinkiklį).",
    infoDrawCrop:
      "Pažymėkite iškirpimo zoną aplink išklotinę (arba išjunkite crop).",
    infoCalculating: "Skaičiuojama…",
    infoReady: "Rezultatai paruošti. Kuriama išdėstymo peržiūra…",
    infoDone: "Baigta.",
    cut: "PJOVIMAS",
    bend: "LENKIMAS",
    total: "VISO",
    copies: "vnt.",
  },
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function swatchStyle(c) {
  return {
    display: "inline-block",
    width: 18,
    height: 18,
    borderRadius: 6,
    background: `rgb(${c.r},${c.g},${c.b})`,
    border: "1px solid var(--border)",
    marginRight: 8,
    verticalAlign: "middle",
    flexShrink: 0,
  };
}

function buildShapeMask({
  pathStrings,
  dielineWmm,
  dielineHmm,
  innerGapMm,
  ppm,
  rotationDeg,
}) {
  if (typeof document === "undefined") return null;
  if (!pathStrings || pathStrings.length === 0) return null;

  const paddingMm = innerGapMm / 2 + 2;
  const padPx = Math.max(2, Math.ceil(paddingMm * ppm));

  const rotated = rotationDeg === 90 || rotationDeg === 270;
  const baseWmm = rotated ? dielineHmm : dielineWmm;
  const baseHmm = rotated ? dielineWmm : dielineHmm;

  const wPx = Math.max(1, Math.ceil(baseWmm * ppm) + padPx * 2);
  const hPx = Math.max(1, Math.ceil(baseHmm * ppm) + padPx * 2);

  const canvas = document.createElement("canvas");
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.clearRect(0, 0, wPx, hPx);

  const shapeScale = ppm * 10;

  ctx.save();
  ctx.translate(padPx, padPx);

  if (rotationDeg === 90) {
    ctx.translate(dielineHmm * ppm, 0);
    ctx.rotate(Math.PI / 2);
  } else if (rotationDeg === 270) {
    ctx.translate(0, dielineWmm * ppm);
    ctx.rotate(-Math.PI / 2);
  } else if (rotationDeg === 180) {
    ctx.translate(dielineWmm * ppm, dielineHmm * ppm);
    ctx.rotate(Math.PI);
  }

  ctx.scale(shapeScale, shapeScale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(0.5, innerGapMm / 10);
  ctx.strokeStyle = "black";

  for (const d of pathStrings) {
    try {
      const p = new Path2D(d);
      ctx.stroke(p);
    } catch {
      // ignore malformed path
    }
  }

  ctx.restore();

  const img = ctx.getImageData(0, 0, wPx, hPx).data;
  const mask = new Uint8Array(wPx * hPx);

  for (let i = 0, p = 0; i < img.length; i += 4, p += 1) {
    mask[p] = img[i + 3] > 0 ? 1 : 0;
  }

  return {
    mask,
    width: wPx,
    height: hPx,
    padPx,
    rot: rotationDeg,
    boxWmm: baseWmm,
    boxHmm: baseHmm,
  };
}

function buildMasksForRotations({
  pathStrings,
  dielineWmm,
  dielineHmm,
  innerGapMm,
  ppm,
  rotations,
}) {
  if (!pathStrings || pathStrings.length === 0) return [];

  return rotations
    .map((rot) =>
      buildShapeMask({
        pathStrings,
        dielineWmm,
        dielineHmm,
        innerGapMm,
        ppm,
        rotationDeg: rot,
      })
    )
    .filter(Boolean);
}

function canPlaceMask(occupancy, occW, occH, maskObj, xPx, yPx) {
  const { mask, width, height } = maskObj;

  if (xPx < 0 || yPx < 0) return false;
  if (xPx + width > occW || yPx + height > occH) return false;

  for (let my = 0; my < height; my++) {
    const occRow = (yPx + my) * occW + xPx;
    const maskRow = my * width;

    for (let mx = 0; mx < width; mx++) {
      if (mask[maskRow + mx] && occupancy[occRow + mx]) {
        return false;
      }
    }
  }

  return true;
}

function stampMask(occupancy, occW, maskObj, xPx, yPx) {
  const { mask, width, height } = maskObj;

  for (let my = 0; my < height; my++) {
    const occRow = (yPx + my) * occW + xPx;
    const maskRow = my * width;

    for (let mx = 0; mx < width; mx++) {
      if (mask[maskRow + mx]) {
        occupancy[occRow + mx] = 1;
      }
    }
  }
}

function unstampMask(occupancy, occW, maskObj, xPx, yPx) {
  const { mask, width, height } = maskObj;

  for (let my = 0; my < height; my++) {
    const occRow = (yPx + my) * occW + xPx;
    const maskRow = my * width;

    for (let mx = 0; mx < width; mx++) {
      if (mask[maskRow + mx]) {
        occupancy[occRow + mx] = 0;
      }
    }
  }
}

function cloneOccupancy(src) {
  return new Uint8Array(src);
}

function calcLayoutStats({
  placements,
  usableWmm,
  usableHmm,
  leftGapMm,
  topGapMm,
  dielineWmm,
  dielineHmm,
}) {
  if (!placements.length) {
    return {
      usedW: 0,
      usedH: 0,
      freeRight: usableWmm,
      freeBottom: usableHmm,
      coveragePct: 0,
      minTopY: usableHmm,
    };
  }

  let maxRight = 0;
  let maxBottom = 0;
  let minTopY = Infinity;

  for (const p of placements) {
    const rotated = p.rot === 90 || p.rot === 270;
    const w = rotated ? dielineHmm : dielineWmm;
    const h = rotated ? dielineWmm : dielineHmm;

    const localX = p.x - leftGapMm;
    const localY = p.y - topGapMm;

    minTopY = Math.min(minTopY, localY);
    maxRight = Math.max(maxRight, localX + w);
    maxBottom = Math.max(maxBottom, localY + h);
  }

  const singleArea = dielineWmm * dielineHmm;
  const usableArea = usableWmm * usableHmm;
  const coveragePct =
    usableArea > 0 ? (placements.length * singleArea / usableArea) * 100 : 0;

  return {
    usedW: maxRight,
    usedH: maxBottom,
    freeRight: Math.max(0, usableWmm - maxRight),
    freeBottom: Math.max(0, usableHmm - maxBottom),
    coveragePct,
    minTopY,
  };
}

function strategyIterators(strategy, occW, occH, stepPx) {
  const xsLR = [];
  const xsRL = [];
  const ysTB = [];
  const ysBT = [];

  for (let x = 0; x <= occW; x += stepPx) xsLR.push(x);
  for (let x = occW; x >= 0; x -= stepPx) xsRL.push(x);
  for (let y = 0; y <= occH; y += stepPx) ysTB.push(y);
  for (let y = occH; y >= 0; y -= stepPx) ysBT.push(y);

  switch (strategy) {
    case "top-right":
      return { ys: ysTB, rowXs: () => xsRL };
    case "bottom-left":
      return { ys: ysBT, rowXs: () => xsLR };
    case "bottom-right":
      return { ys: ysBT, rowXs: () => xsRL };
    case "snake":
      return {
        ys: ysTB,
        rowXs: (rowIdx) => (rowIdx % 2 === 0 ? xsLR : xsRL),
      };
    case "top-left":
    default:
      return { ys: ysTB, rowXs: () => xsLR };
  }
}

function compactPlacements({
  placements,
  masksByRot,
  occW,
  occH,
  occupancy,
  ppm,
  stepPx,
  leftGapMm,
  topGapMm,
}) {
  if (!placements.length) return placements;

  const compacted = placements
    .map((p) => ({ ...p }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const occ = cloneOccupancy(occupancy);

  occ.fill(0);
  for (const p of compacted) {
    const mask = masksByRot[p.rot];
    const xPx = Math.round((p.x - leftGapMm) * ppm);
    const yPx = Math.round((p.y - topGapMm) * ppm);
    stampMask(occ, occW, mask, xPx, yPx);
  }

  for (let i = 0; i < compacted.length; i++) {
    const p = compacted[i];
    const mask = masksByRot[p.rot];

    let xPx = Math.round((p.x - leftGapMm) * ppm);
    let yPx = Math.round((p.y - topGapMm) * ppm);

    unstampMask(occ, occW, mask, xPx, yPx);

    let moved = true;
    while (moved) {
      moved = false;
      const ny = Math.max(0, yPx - stepPx);
      if (ny !== yPx && canPlaceMask(occ, occW, occH, mask, xPx, ny)) {
        yPx = ny;
        moved = true;
      }
    }

    moved = true;
    while (moved) {
      moved = false;
      const nx = Math.max(0, xPx - stepPx);
      if (nx !== xPx && canPlaceMask(occ, occW, occH, mask, nx, yPx)) {
        xPx = nx;
        moved = true;
      }
    }

    stampMask(occ, occW, mask, xPx, yPx);

    p.x = leftGapMm + xPx / ppm;
    p.y = topGapMm + yPx / ppm;
  }

  return compacted;
}

function runOneStrategy({
  strategy,
  sheetWmm,
  sheetHmm,
  dielineWmm,
  dielineHmm,
  leftGapMm,
  rightGapMm,
  topGapMm,
  bottomGapMm,
  stepMm,
  ppm,
  masks,
}) {
  const usableWmm = Math.max(0, sheetWmm - leftGapMm - rightGapMm);
  const usableHmm = Math.max(0, sheetHmm - topGapMm - bottomGapMm);

  const occW = Math.max(1, Math.ceil(usableWmm * ppm));
  const occH = Math.max(1, Math.ceil(usableHmm * ppm));
  const occupancy = new Uint8Array(occW * occH);
  const stepPx = Math.max(1, Math.round(stepMm * ppm));

  if (!masks || masks.length === 0) {
    return {
      placements: [],
      count: 0,
      freeRight: usableWmm,
      freeBottom: usableHmm,
      usedW: 0,
      usedH: 0,
      coveragePct: 0,
      minTopY: usableHmm,
      strategy,
      occupancy,
      occW,
      occH,
    };
  }

  const minMaskW = Math.min(...masks.map((m) => m.width));
  const minMaskH = Math.min(...masks.map((m) => m.height));

  const { ys, rowXs } = strategyIterators(
    strategy,
    occW - minMaskW,
    occH - minMaskH,
    stepPx
  );

  const placements = [];

  for (let rowIdx = 0; rowIdx < ys.length; rowIdx++) {
    const yPx = ys[rowIdx];
    const xs = rowXs(rowIdx);

    for (let xi = 0; xi < xs.length; xi++) {
      const xPx = xs[xi];
      let chosen = null;

      for (const cand of masks) {
        if (canPlaceMask(occupancy, occW, occH, cand, xPx, yPx)) {
          chosen = cand;
          break;
        }
      }

      if (!chosen) continue;

      stampMask(occupancy, occW, chosen, xPx, yPx);

      placements.push({
        x: leftGapMm + xPx / ppm,
        y: topGapMm + yPx / ppm,
        rot: chosen.rot,
      });
    }
  }

  const stats = calcLayoutStats({
    placements,
    usableWmm,
    usableHmm,
    leftGapMm,
    topGapMm,
    dielineWmm,
    dielineHmm,
  });

  return {
    placements,
    count: placements.length,
    freeRight: stats.freeRight,
    freeBottom: stats.freeBottom,
    usedW: stats.usedW,
    usedH: stats.usedH,
    coveragePct: stats.coveragePct,
    minTopY: stats.minTopY,
    strategy,
    occupancy,
    occW,
    occH,
  };
}

function pickBetterLayout(a, b) {
  if (!a) return b;
  if (!b) return a;

  if (b.count !== a.count) return b.count > a.count ? b : a;
  if (Math.abs(b.coveragePct - a.coveragePct) > 1e-9) return b.coveragePct > a.coveragePct ? b : a;
  if (Math.abs(b.minTopY - a.minTopY) > 1e-9) return b.minTopY < a.minTopY ? b : a;
  if (Math.abs(b.usedH - a.usedH) > 1e-9) return b.usedH > a.usedH ? b : a;

  return a;
}

function makeShapeAwareLayout({
  sheetWmm,
  sheetHmm,
  dielineWmm,
  dielineHmm,
  leftGapMm,
  rightGapMm,
  topGapMm,
  bottomGapMm,
  stepMm = 2,
  ppm = 2,
  masks = [],
}) {
  const usableW = sheetWmm - leftGapMm - rightGapMm;
  const usableH = sheetHmm - topGapMm - bottomGapMm;

  if (!masks || masks.length === 0) {
    return {
      placements: [],
      count: 0,
      freeRight: usableW,
      freeBottom: usableH,
      usedW: 0,
      usedH: 0,
      coveragePct: 0,
      minTopY: usableH,
      mode: "shape-aware",
      approx: true,
      strategy: "none",
    };
  }

  const strategies = ["top-left", "bottom-left", "snake"];

  let best = null;

  for (const strategy of strategies) {
    const res = runOneStrategy({
      strategy,
      sheetWmm,
      sheetHmm,
      dielineWmm,
      dielineHmm,
      leftGapMm,
      rightGapMm,
      topGapMm,
      bottomGapMm,
      stepMm,
      ppm,
      masks,
    });

    best = pickBetterLayout(best, res);
  }

  if (!best) {
    return {
      placements: [],
      count: 0,
      freeRight: usableW,
      freeBottom: usableH,
      usedW: 0,
      usedH: 0,
      coveragePct: 0,
      minTopY: usableH,
      mode: "shape-aware",
      approx: true,
      strategy: "none",
    };
  }

  const masksByRot = Object.fromEntries(masks.map((m) => [m.rot, m]));
  const stepPx = Math.max(1, Math.round(stepMm * ppm));

  const compactedPlacements = compactPlacements({
    placements: best.placements,
    masksByRot,
    occW: best.occW,
    occH: best.occH,
    occupancy: best.occupancy,
    ppm,
    stepPx,
    leftGapMm,
    topGapMm,
  });

  const compactedStats = calcLayoutStats({
    placements: compactedPlacements,
    usableWmm: usableW,
    usableHmm: usableH,
    leftGapMm,
    topGapMm,
    dielineWmm,
    dielineHmm,
  });

  return {
    placements: compactedPlacements,
    count: compactedPlacements.length,
    freeRight: compactedStats.freeRight,
    freeBottom: compactedStats.freeBottom,
    usedW: compactedStats.usedW,
    usedH: compactedStats.usedH,
    coveragePct: compactedStats.coveragePct,
    minTopY: compactedStats.minTopY,
    mode: "shape-aware",
    approx: true,
    strategy: best.strategy,
    ppm,
    stepMm,
  };
}

function pickBetterAutoLayout(a, b) {
  if (!a) return b;
  if (!b) return a;

  if (Math.abs(b.coveragePct - a.coveragePct) > 1e-9) {
    return b.coveragePct > a.coveragePct ? b : a;
  }

  if (b.count !== a.count) {
    return b.count > a.count ? b : a;
  }

  const wasteA = a.freeRight + a.freeBottom;
  const wasteB = b.freeRight + b.freeBottom;
  if (Math.abs(wasteB - wasteA) > 1e-9) {
    return wasteB < wasteA ? b : a;
  }

  return a;
}

function findBestPresetAndRotationLayout({
  pathStrings,
  dielineWmm,
  dielineHmm,
  innerGapMm,
  ppm,
  stepMm,
  leftGapMm,
  rightGapMm,
  topGapMm,
  bottomGapMm,
}) {
  const combos = [
    {
      sheetWmm: 1020,
      sheetHmm: 720,
      presetLabel: "1020 × 720 mm",
      rotationLabelEn: "0° and 180°",
      rotationLabelLt: "0° ir 180°",
      rotations: [0, 180],
    },
    {
      sheetWmm: 1020,
      sheetHmm: 720,
      presetLabel: "1020 × 720 mm",
      rotationLabelEn: "90° and 270°",
      rotationLabelLt: "90° ir 270°",
      rotations: [90, 270],
    },
    {
      sheetWmm: 920,
      sheetHmm: 640,
      presetLabel: "920 × 640 mm",
      rotationLabelEn: "0° and 180°",
      rotationLabelLt: "0° ir 180°",
      rotations: [0, 180],
    },
    {
      sheetWmm: 920,
      sheetHmm: 640,
      presetLabel: "920 × 640 mm",
      rotationLabelEn: "90° and 270°",
      rotationLabelLt: "90° ir 270°",
      rotations: [90, 270],
    },
  ];

  let best = null;

  for (const combo of combos) {
    const masks = buildMasksForRotations({
      pathStrings,
      dielineWmm,
      dielineHmm,
      innerGapMm,
      ppm,
      rotations: combo.rotations,
    });

    const layout = makeShapeAwareLayout({
      sheetWmm: combo.sheetWmm,
      sheetHmm: combo.sheetHmm,
      dielineWmm,
      dielineHmm,
      leftGapMm,
      rightGapMm,
      topGapMm,
      bottomGapMm,
      stepMm,
      ppm,
      masks,
    });

    const candidate = {
      ...layout,
      sheetWmm: combo.sheetWmm,
      sheetHmm: combo.sheetHmm,
      presetLabel: combo.presetLabel,
      rotationLabelEn: combo.rotationLabelEn,
      rotationLabelLt: combo.rotationLabelLt,
      rotations: combo.rotations,
    };

    best = pickBetterAutoLayout(best, candidate);
  }

  return best;
}

export default function App() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);

  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [lang, setLang] = useState(() => localStorage.getItem("lang") || "en");

  const t = TEXT[lang];

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("lang", lang);
  }, [lang]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const toggleLanguage = () => {
    setLang((prev) => (prev === "en" ? "lt" : "en"));
  };

  const [file, setFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageViewport, setPageViewport] = useState(null);

  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);

  const [mode, setMode] = useState("separate");
  const [useCrop, setUseCrop] = useState(false);
  const [cropScreen, setCropScreen] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef(null);

  const [combinedColor, setCombinedColor] = useState(null);
  const [cutColor, setCutColor] = useState(null);
  const [bendColor, setBendColor] = useState(null);
  const [activePicker, setActivePicker] = useState("cut");

  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");

  const [layout, setLayout] = useState(null);
  const [layoutBusy, setLayoutBusy] = useState(false);

  const [vectorColors, setVectorColors] = useState([]);
  const [detectBusy, setDetectBusy] = useState(false);

  const [stepMm, setStepMm] = useState(5);
  const [ppm, setPpm] = useState(2);

  const leftGapMm = 5;
  const rightGapMm = 5;
  const topGapMm = 5;
  const bottomGapMm = 15;
  const innerGapMm = 5;

  useEffect(() => {
    async function load() {
      setResult(null);
      setLayout(null);
      setLayoutBusy(false);
      setInfo("");
      setCropScreen(null);
      setCombinedColor(null);
      setCutColor(null);
      setBendColor(null);
      setVectorColors([]);
      setPageViewport(null);
      setPageNum(1);
      setNumPages(1);

      if (!file) {
        setPdfDoc(null);
        return;
      }

      const bytes = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages || 1);
      setPageNum(1);
    }
    load();
  }, [file]);

  useEffect(() => {
    setCropScreen(null);
    setResult(null);
    setLayout(null);
    setLayoutBusy(false);
    setVectorColors([]);
    setInfo("");
    setCombinedColor(null);
    setCutColor(null);
    setBendColor(null);
  }, [pageNum]);

  useEffect(() => {
    async function render() {
      if (!pdfDoc || !canvasRef.current) return;

      const safePage = Math.max(1, Math.min(numPages || 1, pageNum));
      const page = await pdfDoc.getPage(safePage);

      const desiredWidth = 900;
      const viewport0 = page.getViewport({ scale: 1.0 });
      const scale = desiredWidth / viewport0.width;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({ canvasContext: ctx, viewport }).promise;
      setPageViewport({ page, viewport, scale });
      setInfo(t.infoTip);
    }
    render();
  }, [pdfDoc, pageNum, numPages, lang, t.infoTip]);

  function getCanvasCoordsFromEvent(e) {
    if (!overlayRef.current || !canvasRef.current) return null;

    const overlayRect = overlayRef.current.getBoundingClientRect();
    const canvas = canvasRef.current;

    const displayX = e.clientX - overlayRect.left;
    const displayY = e.clientY - overlayRect.top;

    const scaleX = canvas.width / overlayRect.width;
    const scaleY = canvas.height / overlayRect.height;

    const x = clamp(displayX * scaleX, 0, canvas.width);
    const y = clamp(displayY * scaleY, 0, canvas.height);

    return { x, y };
  }

  const cropPdf = useMemo(() => {
    if (!cropScreen || !pageViewport) return null;

    const { viewport } = pageViewport;

    const x0 = Math.min(cropScreen.x0, cropScreen.x1);
    const y0 = Math.min(cropScreen.y0, cropScreen.y1);
    const x1 = Math.max(cropScreen.x0, cropScreen.x1);
    const y1 = Math.max(cropScreen.y0, cropScreen.y1);

    const p0 = viewport.convertToPdfPoint(x0, y0);
    const p1 = viewport.convertToPdfPoint(x1, y1);

    return {
      x0: Math.min(p0[0], p1[0]),
      y0: Math.min(p0[1], p1[1]),
      x1: Math.max(p0[0], p1[0]),
      y1: Math.max(p0[1], p1[1]),
    };
  }, [cropScreen, pageViewport]);

  function onMouseDown(e) {
    const pt = getCanvasCoordsFromEvent(e);
    if (!pt) return;

    dragStart.current = { x: pt.x, y: pt.y };
    setCropScreen({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
    setIsDragging(true);
  }

  function onMouseMove(e) {
    if (!isDragging || !dragStart.current) return;

    const pt = getCanvasCoordsFromEvent(e);
    if (!pt) return;

    setCropScreen((prev) => (prev ? { ...prev, x1: pt.x, y1: pt.y } : prev));
  }

  function onMouseUp() {
    setIsDragging(false);
    dragStart.current = null;
  }

  function pickColor(e) {
    if (!canvasRef.current) return;

    const pt = getCanvasCoordsFromEvent(e);
    if (!pt) return;

    const x = Math.floor(pt.x);
    const y = Math.floor(pt.y);

    const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const c = { r: pixel[0], g: pixel[1], b: pixel[2] };

    if (mode === "combined") {
      setCombinedColor(c);
      setActivePicker("combined");
    } else {
      if (activePicker === "cut") setCutColor(c);
      if (activePicker === "bend") setBendColor(c);
    }
  }

  async function onDetectColors() {
    if (!file || detectBusy) return;

    if (useCrop && !cropPdf) {
      setInfo(t.infoCropFirst);
      return;
    }

    const payload = {
      page: pageNum,
      crop: useCrop ? { ...cropPdf, useCrop: true } : { useCrop: false },
    };

    try {
      setDetectBusy(true);
      setInfo(t.detecting);
      const res = await detectStrokeColors({ file, payload });
      setVectorColors(res.colors || []);
      setInfo(t.infoColorsDetected);
    } catch (err) {
      setInfo(`Error detecting colors: ${String(err.message || err)}`);
    } finally {
      setDetectBusy(false);
    }
  }

useEffect(() => {
  if (!file || !pdfDoc || !pageViewport || detectBusy) return;
  if (useCrop && !cropPdf) return;

  // stop if colors were already detected for this file/page
  if (vectorColors.length > 0) return;

  const timer = setTimeout(() => {
    onDetectColors();
  }, 150);

  return () => clearTimeout(timer);
}, [file, pdfDoc, pageNum, pageViewport, useCrop, cropPdf, detectBusy, vectorColors.length]);

  async function onCalculate() {
    if (!file) return;

    if (useCrop && !cropPdf) {
      setInfo(t.infoDrawCrop);
      return;
    }

    if (mode === "combined" && !combinedColor) {
      setInfo(t.infoPickCombined);
      return;
    }
    if (mode === "separate" && (!cutColor || !bendColor)) {
      setInfo(t.infoPickBoth);
      return;
    }

    const payload = {
      page: pageNum,
      crop: useCrop ? { ...cropPdf, useCrop: true } : { useCrop: false },
      mode,
      combinedColor: mode === "combined" ? combinedColor : null,
      cutColor: mode === "separate" ? cutColor : null,
      bendColor: mode === "separate" ? bendColor : null,
      colorTol: 0.08,
      minPathCm: 0.0,
      curveSteps: 40,
    };

    try {
      setBusy(true);
      setLayout(null);
      setLayoutBusy(false);
      setInfo(t.infoCalculating);
      const res = await calculateDieline({ file, payload });
      setResult(res);
      setInfo(t.infoReady);
    } catch (err) {
      setInfo(`Error: ${String(err.message || err)}`);
    } finally {
      setBusy(false);
    }
  }

  const cropStyle = useMemo(() => {
    if (!cropScreen || !canvasRef.current || !overlayRef.current) return null;

    const canvas = canvasRef.current;
    const overlayRect = overlayRef.current.getBoundingClientRect();

    const scaleX = overlayRect.width / canvas.width;
    const scaleY = overlayRect.height / canvas.height;

    const x = Math.min(cropScreen.x0, cropScreen.x1) * scaleX;
    const y = Math.min(cropScreen.y0, cropScreen.y1) * scaleY;
    const w = Math.abs(cropScreen.x1 - cropScreen.x0) * scaleX;
    const h = Math.abs(cropScreen.y1 - cropScreen.y0) * scaleY;

    if (w < 3 || h < 3) return null;
    return { left: x, top: y, width: w, height: h };
  }, [cropScreen]);

  const dielineWmm = useMemo(
    () => (result?.bbox ? Number(result.bbox.width_cm) * 10 : null),
    [result]
  );
  const dielineHmm = useMemo(
    () => (result?.bbox ? Number(result.bbox.height_cm) * 10 : null),
    [result]
  );

  const pathsSvg = result?.paths_svg || null;
  const cutPaths = pathsSvg?.cut || [];
  const bendPaths = pathsSvg?.bend || [];
  const combinedPaths = pathsSvg?.combined || [];

  const nestingPaths = useMemo(() => {
    if (mode === "combined") return combinedPaths;
    return cutPaths;
  }, [mode, combinedPaths, cutPaths]);

  const costSummary = useMemo(() => {
    if (!result) return null;

    const combinedLengthCm = Number(result?.combined?.length_cm || 0);
    const cutLengthCm = Number(result?.cut?.length_cm || 0);
    const bendLengthCm = Number(result?.bend?.length_cm || 0);

    const bladeLengthCm =
      mode === "combined" ? combinedLengthCm : cutLengthCm + bendLengthCm;

    const bladeSingleCost = bladeLengthCm * BLADE_RATE_EUR_PER_CM;

    const laserSingleCost =
      mode === "separate" ? bendLengthCm * LASER_BEND_RATE_EUR_PER_CM : null;

    const copies = Number(layout?.count || 0);

    return {
      bladeLengthCm,
      bendLengthCm,
      bladeSingleCost,
      laserSingleCost,
      bladeSheetCost: copies > 0 ? bladeSingleCost * copies : null,
      laserSheetCost:
        copies > 0 && laserSingleCost !== null ? laserSingleCost * copies : null,
    };
  }, [result, mode, layout]);

  useEffect(() => {
    setLayout(null);
  }, [result, stepMm, ppm, mode, pageNum]);

  useEffect(() => {
    if (!result?.bbox) {
      setLayout(null);
      setLayoutBusy(false);
      return;
    }

    if (
      !Number.isFinite(dielineWmm) ||
      !Number.isFinite(dielineHmm) ||
      dielineWmm <= 0 ||
      dielineHmm <= 0 ||
      !nestingPaths ||
      nestingPaths.length === 0
    ) {
      setLayout(null);
      setLayoutBusy(false);
      return;
    }

    setLayoutBusy(true);

    const timer = setTimeout(() => {
      try {
        const nextLayout = findBestPresetAndRotationLayout({
          pathStrings: nestingPaths,
          dielineWmm,
          dielineHmm,
          innerGapMm,
          ppm: Number(ppm),
          stepMm: Number(stepMm),
          leftGapMm,
          rightGapMm,
          topGapMm,
          bottomGapMm,
        });

        setLayout(nextLayout);
        setInfo(t.infoDone);
      } finally {
        setLayoutBusy(false);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [
    result,
    nestingPaths,
    dielineWmm,
    dielineHmm,
    innerGapMm,
    ppm,
    stepMm,
    leftGapMm,
    rightGapMm,
    topGapMm,
    bottomGapMm,
    t.infoDone,
  ]);

  const previewSheetWmm = layout?.sheetWmm ?? 1020;
  const previewSheetHmm = layout?.sheetHmm ?? 720;

  const sheetSvg = useMemo(() => {
    if (!result?.bbox || !layout) return null;

    const w = Number(previewSheetWmm);
    const h = Number(previewSheetHmm);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;

    const maxPx = 1100;
    const scale = maxPx / Math.max(w, h);
    return { scale, svgW: w * scale, svgH: h * scale };
  }, [result, layout, previewSheetWmm, previewSheetHmm]);

  function getPlacementTransform(p) {
    const x = p.x * sheetSvg.scale;
    const y = p.y * sheetSvg.scale;
    const shapeScale = sheetSvg.scale * 10;

    if (p.rot === 0) {
      return `translate(${x},${y}) scale(${shapeScale})`;
    }
    if (p.rot === 180) {
      return `translate(${x + dielineWmm * sheetSvg.scale},${y + dielineHmm * sheetSvg.scale}) rotate(180) scale(${shapeScale})`;
    }
    if (p.rot === 90) {
      return `translate(${x + dielineHmm * sheetSvg.scale},${y}) rotate(90) scale(${shapeScale})`;
    }
    return `translate(${x},${y + dielineWmm * sheetSvg.scale}) rotate(-90) scale(${shapeScale})`;
  }

  return (
    <div className="container">
      <div className="topButtons">
        <button
          type="button"
          className="lang-toggle"
          onClick={toggleLanguage}
          title={lang === "en" ? "Switch to Lithuanian" : "Perjungti į anglų kalbą"}
        >
          {lang === "en" ? "LT" : "EN"}
        </button>

        <button type="button" className="theme-toggle" onClick={toggleTheme}>
          {theme === "dark" ? "☀" : "🌙"}
        </button>
      </div>

      <h1>{t.title}</h1>

      <div className="row">
        <div className="card">
          <label>{t.uploadPdf}</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          {pdfDoc && (
            <>
              <label style={{ marginTop: 10 }}>{t.page}</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                  disabled={pageNum <= 1}
                >
                  {t.prev}
                </button>

                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={pageNum}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setPageNum(Math.max(1, Math.min(numPages, v)));
                  }}
                  style={{ width: 90 }}
                />

                <span className="small">/ {numPages}</span>

                <button
                  type="button"
                  onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                  disabled={pageNum >= numPages}
                >
                  {t.next}
                </button>
              </div>

              <div className="small" style={{ marginTop: 6 }}>
                {t.pageHint}
              </div>
            </>
          )}

          <hr />

<label>{t.mode}</label>
<div className="picker-toggle">
  <button
    type="button"
    className={mode === "combined" ? "picker-btn active" : "picker-btn"}
    onClick={() => {
      setMode("combined");
      setResult(null);
      setLayout(null);
      setLayoutBusy(false);
      setInfo("");
      setCutColor(null);
      setBendColor(null);
      setActivePicker("combined");
    }}
  >
    1
  </button>

  <button
    type="button"
    className={mode === "separate" ? "picker-btn active" : "picker-btn"}
    onClick={() => {
      setMode("separate");
      setResult(null);
      setLayout(null);
      setLayoutBusy(false);
      setInfo("");
      setCombinedColor(null);
      setActivePicker("cut");
    }}
  >
    2
  </button>
</div>

<div className="small" style={{ marginTop: 8 }}>
  {mode === "combined" ? t.modeCombined : t.modeSeparate}
</div>

          <hr />
          <hr />

          <label>
            <input
              type="checkbox"
              checked={useCrop}
              onChange={(e) => setUseCrop(e.target.checked)}
              style={{ width: "auto", marginRight: 8 }}
            />
            {t.useCrop}
          </label>

          <div className="small" style={{ marginTop: 6 }}>
            {t.useCropHint}
          </div>

          <hr />

          <button disabled={!file || detectBusy} onClick={onDetectColors}>
            {detectBusy ? t.detecting : t.detectVectorColors}
          </button>

          <div className="small" style={{ marginTop: 10 }}>
            {vectorColors.length === 0 ? t.noVectorColors : t.clickColorBelow}
          </div>

          {vectorColors.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {vectorColors.map((c, idx) => (
                <button
                  key={idx}
                  type="button"
                  style={{
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--input-bg)",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    if (mode === "combined") {
                      setCombinedColor({ r: c.r, g: c.g, b: c.b });
                      setActivePicker("combined");
                    } else {
                      if (activePicker === "cut") setCutColor({ r: c.r, g: c.g, b: c.b });
                      if (activePicker === "bend") setBendColor({ r: c.r, g: c.g, b: c.b });
                    }
                    setInfo(
                      lang === "en"
                        ? `Selected vector color RGB(${c.r},${c.g},${c.b})`
                        : `Pasirinkta vektorinė spalva RGB(${c.r},${c.g},${c.b})`
                    );
                  }}
                >
                  <span style={swatchStyle(c)} />
                  <span className="small">
                    <b>{rgbToHex(c)}</b> — RGB({c.r},{c.g},{c.b}) — {t.strokes}: {c.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          <hr />

          {mode === "combined" ? (
            <>
              <label>{t.pickedDielineColor}</label>
              <div className="small">
                {combinedColor ? (
                  <>
                    <span className="badge">{rgbToHex(combinedColor)}</span>{" "}
                    RGB({combinedColor.r},{combinedColor.g},{combinedColor.b})
                  </>
                ) : (
                  t.notPickedYet
                )}
              </div>
            </>
          ) : (
            <>
<label>{t.activePicker}</label>
<div className="picker-toggle">
  <button
    type="button"
    className={activePicker === "cut" ? "picker-btn active" : "picker-btn"}
    onClick={() => setActivePicker("cut")}
  >
    {t.cut}
  </button>

  <button
    type="button"
    className={activePicker === "bend" ? "picker-btn active" : "picker-btn"}
    onClick={() => setActivePicker("bend")}
  >
    {t.bend}
  </button>
</div>

              <div style={{ marginTop: 10 }} className="small">
                <div>
                  <span className="badge">{t.cut}</span>{" "}
                  {cutColor
                    ? `${rgbToHex(cutColor)}  RGB(${cutColor.r},${cutColor.g},${cutColor.b})`
                    : t.notPicked}
                </div>
                <div style={{ marginTop: 6 }}>
                  <span className="badge">{t.bend}</span>{" "}
                  {bendColor
                    ? `${rgbToHex(bendColor)}  RGB(${bendColor.r},${bendColor.g},${bendColor.b})`
                    : t.notPicked}
                </div>
              </div>
            </>
          )}

          <hr />

          <button disabled={!file || busy} onClick={onCalculate}>
            {busy ? t.calculating : t.calculate}
          </button>

          <div className="small" style={{ marginTop: 10 }}>{info}</div>

          {result && (
            <>
              <hr />
              <div className="small">
                <div><b>{t.results}</b></div>

                {mode === "combined" ? (
                  <div style={{ marginTop: 8 }}>
                    {t.paths}: <b>{result.combined.paths}</b><br />
                    {t.length}: <b>{result.combined.length_cm.toFixed(2)} cm</b><br />
                    {t.bladeCostPerBox}: <b>€{costSummary?.bladeSingleCost?.toFixed(2) ?? "0.00"}</b>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    {t.cut} — {t.paths}: <b>{result.cut.paths}</b>, {t.length}: <b>{result.cut.length_cm.toFixed(2)} cm</b><br />
                    {t.bend} — {t.paths}: <b>{result.bend.paths}</b>, {t.length}: <b>{result.bend.length_cm.toFixed(2)} cm</b><br />
                    <div style={{ marginTop: 6 }}>
                      {t.totalLength}: <b>{(result.cut.length_cm + result.bend.length_cm).toFixed(2)} cm</b>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      {t.laserCostPerBox}: <b>€{costSummary?.laserSingleCost?.toFixed(2) ?? "0.00"}</b>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {t.bladeCostPerBox}: <b>€{costSummary?.bladeSingleCost?.toFixed(2) ?? "0.00"}</b>
                    </div>
                  </div>
                )}

                {result.bbox && (
                  <div style={{ marginTop: 10 }}>
                    <b>{t.dielineBbox}:</b> {Number(result.bbox.width_cm).toFixed(2)} cm ×{" "}
                    {Number(result.bbox.height_cm).toFixed(2)} cm
                    <br />
                    <b>{t.dielineBbox}:</b> {Number(dielineWmm).toFixed(1)} mm × {Number(dielineHmm).toFixed(1)} mm
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="small" style={{ marginBottom: 10 }}>
            {t.previewSteps}
          </div>

          <div className="canvasWrap">
            <canvas ref={canvasRef} />
            <div
              className="overlay"
              ref={overlayRef}
              onMouseDown={useCrop ? onMouseDown : undefined}
              onMouseMove={useCrop ? onMouseMove : undefined}
              onMouseUp={useCrop ? onMouseUp : undefined}
              onDoubleClick={pickColor}
              title={
                lang === "en"
                  ? "Drag to crop. Double-click on a dieline stroke to pick the color."
                  : "Tempkite, kad pažymėtumėte zoną. Dukart spustelėkite liniją, kad pasirinktumėte spalvą."
              }
            />
            {useCrop && cropStyle && <div className="cropBox" style={cropStyle} />}
          </div>

          <div className="small" style={{ marginTop: 10 }}>
            <b>{t.controls}</b>
            <br />{t.dragMouse}
            <br />{t.doubleClick}
          </div>
        </div>
      </div>

      {result?.bbox && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {t.nestingTitle}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(140px, 1fr))", gap: 10 }}>
            <label>
              {t.searchStep}
              <input
                type="number"
                min={1}
                step="1"
                value={stepMm}
                onChange={(e) => setStepMm(Number(e.target.value))}
              />
            </label>
            <label>
              {t.precision}
              <input
                type="number"
                min={1}
                step="1"
                value={ppm}
                onChange={(e) => setPpm(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="small" style={{ marginTop: 10 }}>
            {t.rules}
            <br />- {t.leftGap}: <b>{leftGapMm} mm</b>
            <br />- {t.rightGap}: <b>{rightGapMm} mm</b>
            <br />- {t.topGap}: <b>{topGapMm} mm</b>
            <br />- {t.bottomGap}: <b>{bottomGapMm} mm</b>
            <br />- {t.betweenShapes}: <b>{innerGapMm} mm</b>
            <br />{t.autoTests}
          </div>

          {layoutBusy && (
            <div className="small" style={{ marginTop: 10 }}>
              {t.buildingPreview}
            </div>
          )}

          {layout && sheetSvg && (
            <div style={{ marginTop: 10 }}>
              <div className="small">
                <b>{t.chosenPreset}:</b> {layout.presetLabel}
                <br />
                <b>{t.chosenRotations}:</b> {lang === "en" ? layout.rotationLabelEn : layout.rotationLabelLt}
                <br />
                <b>{t.fits}:</b> {layout.count} {t.copies}
                <br />
                <b>{t.bladeCostForBoxes} {layout.count} {t.boxes}:</b> €{costSummary?.bladeSheetCost?.toFixed(2) ?? "0.00"}
                <br />
                {mode === "separate" && (
                  <>
                    <b>{t.laserCostForBoxes} {layout.count} {t.boxes}:</b> €{costSummary?.laserSheetCost?.toFixed(2) ?? "0.00"}
                    <br />
                  </>
                )}
                <b>{t.coverage}:</b> {layout.coveragePct.toFixed(2)}%
                <br />
                <b>{t.usedWidth}:</b> {layout.usedW.toFixed(1)} mm
                <br />
                <b>{t.usedHeight}:</b> {layout.usedH.toFixed(1)} mm
                <br />
                <b>{t.freeRight}:</b> {layout.freeRight.toFixed(1)} mm
                <br />
                <b>{t.freeBottom}:</b> {layout.freeBottom.toFixed(1)} mm
                <br />
                <b>{t.bestStrategy}:</b> {layout.strategy}
                <br />
                <b>{t.modeInfo}</b>
              </div>

              <div
                style={{
                  marginTop: 10,
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 10,
                  overflow: "auto",
                  background: "var(--card-bg)",
                }}
              >
                <svg width={sheetSvg.svgW} height={sheetSvg.svgH} style={{ background: "#fff" }}>
                  <rect
                    x={0}
                    y={0}
                    width={sheetSvg.svgW}
                    height={sheetSvg.svgH}
                    fill="white"
                    stroke="black"
                  />

                  <rect
                    x={leftGapMm * sheetSvg.scale}
                    y={topGapMm * sheetSvg.scale}
                    width={(previewSheetWmm - leftGapMm - rightGapMm) * sheetSvg.scale}
                    height={(previewSheetHmm - topGapMm - bottomGapMm) * sheetSvg.scale}
                    fill="none"
                    stroke="#999"
                    strokeDasharray="6 6"
                  />

                  {layout.placements.map((p, i) => (
                    <g key={i} transform={getPlacementTransform(p)}>
                      {mode === "combined" ? (
                        combinedPaths.map((d, idx) => (
                          <path
                            key={idx}
                            d={d}
                            fill="none"
                            stroke="red"
                            strokeWidth={1.2}
                            vectorEffect="non-scaling-stroke"
                          />
                        ))
                      ) : (
                        <>
                          {cutPaths.map((d, idx) => (
                            <path
                              key={`c${idx}`}
                              d={d}
                              fill="none"
                              stroke="red"
                              strokeWidth={1.2}
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                          {bendPaths.map((d, idx) => (
                            <path
                              key={`b${idx}`}
                              d={d}
                              fill="none"
                              stroke="blue"
                              strokeWidth={1.2}
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </>
                      )}
                    </g>
                  ))}
                </svg>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}