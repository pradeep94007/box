import React, { useMemo, useState, useReducer, useRef, useCallback, useEffect } from "react";

// --- HELPERS ---
const round = (value, precision = 3) => {
  const val = Number(value);
  return isNaN(val) ? 0 : Number(val.toFixed(precision));
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cleanPath = (path) => path.replace(/\s+/g, " ").trim();
const degToRad = (deg) => (deg * Math.PI) / 180;

const pointToward = (from, to, dist) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;

  return {
    x: round(from.x + (dx / len) * dist),
    y: round(from.y + (dy / len) * dist),
  };
};

// --- UNIT CONFIGURATION ---
const UNIT_CONFIGS = {
  mm: { label: "Millimeters (mm)", toMM: (v) => v, fromMM: (v) => v, step: 0.1, decimals: 1 },
  cm: { label: "Centimeters (cm)", toMM: (v) => v * 10, fromMM: (v) => v / 10, step: 0.01, decimals: 2 },
  inch: { label: "Inches (in)", toMM: (v) => v * 25.4, fromMM: (v) => v / 25.4, step: 0.001, decimals: 3 },
};

// --- INITIAL STATE ---
const INITIAL_DIM = {
  L: 80,
  W: 40,
  H: 100,
  t: 0.5,
  glue: 10,
  A: 10,
  B: round((40 + 10) / 2),
  snapPocketExtra: 10,
  bottomExtra: 10,
};

const MAX_HISTORY = 50;

const historyReducer = (state, action) => {
  switch (action.type) {
    case "UPDATE": {
      const newDim = { ...state.present, [action.key]: action.value };
      const newPast = [...state.past, state.present].slice(-MAX_HISTORY);
      return { past: newPast, present: newDim, future: [] };
    }

    case "UPDATE_MULTIPLE": {
      const newDim = { ...state.present, ...action.payload };
      const newPast = [...state.past, state.present].slice(-MAX_HISTORY);
      return { past: newPast, present: newDim, future: [] };
    }

    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }

    case "RESET":
      return {
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present: INITIAL_DIM,
        future: [],
      };

    default:
      return state;
  }
};

// ==================================================
// SNAP LOCK BOTTOM TYPE A BASE GEOMETRY ENGINE
// Local coordinate system:
// x = left to right
// y = upward negative from body bottom crease
// ==================================================
function computeSnapLockBottom90({ panelL, panelW, panelW4, lockExtra, pocketExtra }) {
  const L = round(panelL);
  const W = round(panelW);
  const W4 = round(panelW4 ?? panelW);

  const minWindow = 6.6;
  const plungeExtension = Math.max(8, lockExtra || 8);
  const outerExtra = round(clamp(pocketExtra ?? 10, 0, 30));

const idealDepth = round(W / 2 - 0.5);

// ==================================================
// AUTO PERCENTAGE U-CUT RULE
// Below 70% ratio = normal rule
// 70% to 100% ratio = automatic gradual percentage blend
// Square box = approx 1/3 opening
// ==================================================

// 1) First calculate normal rule result
let normalHFoot = 0;
let normalRuleStatus = "";

if (L - idealDepth * 2 >= minWindow) {
  normalHFoot = idealDepth;
  normalRuleStatus = "NORMAL RULE";
} else {
  normalHFoot = round((L - minWindow) / 2);
  normalRuleStatus = "WINDOW OVERRIDE";
}

const maxAllowedFoot = round(L / 2 - plungeExtension);

if (normalHFoot > maxAllowedFoot) {
  normalHFoot = maxAllowedFoot;
  normalRuleStatus = "ANTI-OVERLAP OVERRIDE";
}

normalHFoot = round(Math.max(0, normalHFoot));

const normalWindowWidth = round(L - normalHFoot * 2);

// 2) Calculate box ratio percentage
const boxRatio = round(Math.min(L, W) / Math.max(L, W)); // 1.00 = square

const ratioStart = 0.70; // below 70%, normal rule only
const ratioEnd = 1.00;   // 100%, square rule

let windowWidth1 = normalWindowWidth;
let ruleStatus = normalRuleStatus;

if (boxRatio >= ratioStart) {
  // Blend percentage: 0 at 70%, 1 at 100%
  const blendPercent = clamp((boxRatio - ratioStart) / (ratioEnd - ratioStart), 0, 1);

  // Smooth easing, so 80x63 and 80x64 do not jump
  const smoothPercent = round(
    blendPercent * blendPercent * (3 - 2 * blendPercent),
    4
  );

  // Target U-cut opening factor:
  // near-square = 0.36 of L
  // perfect square = 0.333 of L
  const nearSquareFactor = 0.36;
  const squareFactor = 0.333;

  const targetFactor = round(
    nearSquareFactor + (squareFactor - nearSquareFactor) * smoothPercent,
    4
  );

  const targetWindowWidth = round(L * targetFactor);

  // Final U-cut opening = normal opening + percentage movement toward target
  windowWidth1 = round(
    normalWindowWidth + (targetWindowWidth - normalWindowWidth) * smoothPercent
  );

  ruleStatus = `AUTO % U-CUT RULE (${round(boxRatio * 100, 1)}%)`;
}

// Safety
// Safety + strict minimum U-cut opening
// Red marked U-cut opening should never go below 1/3 of L.
const minUCutOpening = round(Math.max(minWindow, L / 3));

const beforeMinWindow = windowWidth1;

windowWidth1 = round(
  clamp(
    Math.max(windowWidth1, minUCutOpening),
    minUCutOpening,
    L - 1
  )
);

if (windowWidth1 > beforeMinWindow) {
  ruleStatus = `${ruleStatus} + MIN 1/3 U-CUT`;
}

let H_foot = round((L - windowWidth1) / 2);

const orangeLineY = round(W / 2);
const maxFlapDepth = round(orangeLineY + outerExtra);const hookPlungeY = round(-H_foot - plungeExtension);
  const hookStepWidth = round(orangeLineY + 5);

  const bridgeWidth3 = round(Math.max(1, windowWidth1 - 1));
  const sideClearance3 = round((L - bridgeWidth3) / 2);

  const hookStepWidth4 = round(clamp(hookStepWidth, 1, Math.max(1, W4 - 0.5)));

  // Panel 1: stepped pocket
  const flap1Coords = [
    [0, 0],
    [0, -maxFlapDepth],
    [H_foot, -maxFlapDepth],
    [H_foot, -orangeLineY],
    [L - H_foot, -orangeLineY],
    [L - H_foot, -maxFlapDepth],
    [L, -maxFlapDepth],
    [L, 0],
  ];

  // Panel 2: snap hook side
  const flap2Coords = [
    [0, 0],
    [W / 2, -H_foot],
    [W - hookStepWidth, hookPlungeY],
    [W, hookPlungeY],
    [W, 0],
  ];

  // Panel 3: receiver/support bridge
  const flap3Coords = [
    [0, 0],
    [sideClearance3, -orangeLineY],
    [sideClearance3, -maxFlapDepth],
    [sideClearance3 + bridgeWidth3, -maxFlapDepth],
    [sideClearance3 + bridgeWidth3, -orangeLineY],
    [L, 0],
  ];

  // Panel 4: mirror-side snap hook
  const flap4Coords = [
    [0, 0],
    [0, hookPlungeY],
    [hookStepWidth4, hookPlungeY],
    [W4 / 2, -H_foot],
    [W4, 0],
  ];

  const offsetCoords = (coords, offsetX) =>
    coords.map(([x, y]) => [round(offsetX + x), round(y)]);

  const p1 = offsetCoords(flap1Coords, 0);
  const p2 = offsetCoords(flap2Coords, L);
  const p3 = offsetCoords(flap3Coords, L + W);
  const p4 = offsetCoords(flap4Coords, L + W + L);

  const leftToRight = [
    ...p1,
    ...p2.slice(1),
    ...p3.slice(1),
    ...p4.slice(1),
  ];

  const rightToLeft = [...leftToRight].reverse();

  const pointLabels = {
    A: p1[0],
    B: p1[1],
    C: p1[2],
    D: p1[3],
    E: p1[4],
    F: p1[5],
    G: p1[6],
    H: p1[7],

    I: p2[1],
    J: p2[2],
    K: p2[3],
    L: p2[4],

    M: p3[1],
    N: p3[2],
    O: p3[3],
    P: p3[4],
    Q: p3[5],

    R: p4[1],
    S: p4[2],
    T: p4[3],
    U: p4[4],
  };

  return {
    flap1Coords,
    flap2Coords,
    flap3Coords,
    flap4Coords,
    leftToRight,
    rightToLeft,
    pointLabels,
    derived: {
      H_foot,
      ruleStatus,
      minWindow,
      idealDepth,
      orangeLineY,
      maxFlapDepth,
      windowWidth1,
      hookPlungeY,
      hookStepWidth,
      hookStepWidth4,
      sideClearance3,
      bridgeWidth3,
      plungeExtension,
      totalWidth: round(L + W + L + W4),
    },
  };
}

const SnapLockBottomGenerator = () => {
  const [unit, setUnit] = useState("mm");
  const [dielineType, setDielineType] = useState("A");
  const showGuides = false;
  const showPoints = false;

  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: INITIAL_DIM,
    future: [],
  });

  const svgRef = useRef(null);

  // Length measurement states
  const [cutLengthMM, setCutLengthMM] = useState(0);
  const cutLayerRef = useRef(null);

  const dim = history.present;
  const unitCfg = UNIT_CONFIGS[unit];

  const update = useCallback(
    (key, displayValue) => {
      const mmValue = round(unitCfg.toMM(parseFloat(displayValue) || 0));
      dispatch({ type: "UPDATE", key, value: mmValue });
    },
    [unitCfg]
  );

  const toDisplay = useCallback(
    (mmVal) => round(unitCfg.fromMM(mmVal)),
    [unitCfg]
  );

  const g = useMemo(() => {
    const {
      L: inputL,
      W: inputW,
      H: inputH,
      t: inputT,
      glue,
      A,
      B,
      snapPocketExtra,
      bottomExtra,
    } = dim;

    const isTypeA = dielineType === "A";
    const warnings = [];

    const minL = 25;
    const minW = 20;

    const safeL = round(Math.max(inputL, minL));
    const safeW = round(Math.max(inputW, minW));
    const safeH = round(Math.max(inputH, 30));
    const safeT = round(clamp(inputT, 0.2, 2));
    const safeGlue = round(clamp(glue, 10, 25));

    if (inputL > 0 && inputL < minL) warnings.push(`Length L adjusted to minimum ${minL} mm.`);
    if (inputW > 0 && inputW < minW) warnings.push(`Width W adjusted to minimum ${minW} mm.`);

    // --- TOP VALIDATION ---
    let actualA = A;
    let actualB = B;

    const maxA = round(safeW - 1);
    if (actualA > maxA) {
      actualA = maxA;
      warnings.push(`Top tuck A adjusted to ${round(unitCfg.fromMM(actualA))}${unit}.`);
    }
    actualA = round(clamp(actualA, 6, maxA));

    const minB = 4;
    const maxB = round((safeW + actualA) / 2);
    if (actualB > maxB) {
      actualB = maxB;
      warnings.push(`Top dust B adjusted to maximum ${round(unitCfg.fromMM(actualB))}${unit}.`);
    }
    actualB = round(clamp(actualB, minB, maxB));

    const suggestedA = round(clamp(safeW * 0.65, 16, 30));
    const suggestedB = round(clamp((safeW + suggestedA) / 2, 14, 32));

    const actualSnapPocketExtra = round(clamp(snapPocketExtra ?? 10, 0, 30));
    const actualBottomExtra = round(Math.max(8, bottomExtra || 8));
    if (bottomExtra < 8) warnings.push("Snap lock extra adjusted to minimum 8 mm.");

    // --- OUTER / INNER DIMENSION LOGIC ---
    const outerL = round(safeL);
    const outerW = round(safeW);
    const outerH = round(safeH);

    const innerL = round(Math.max(0, outerL - safeT));
    const innerW = round(Math.max(0, outerW - safeT));
    const innerH = round(Math.max(0, outerH - safeT * 2));

    const cL = outerL;
    const cW = outerW;
    const cH = outerH;

    // --- PANEL LAYOUT ---
    let x0 = 0;
    let x1;
    let x2;
    let x3;
    let x4;
    let x5;

    if (isTypeA) {
      // Type A: Glue | L | W | L | W-t
      x1 = round(safeGlue);
      x2 = round(x1 + cL);
      x3 = round(x2 + cW);
      x4 = round(x3 + cL);
      x5 = round(x4 + (cW - safeT));
    } else {
      // Type B: W-t | L | W | L | Glue
      x1 = round(cW - safeT);
      x2 = round(x1 + cL);
      x3 = round(x2 + cW);
      x4 = round(x3 + cL);
      x5 = round(x4 + safeGlue);
    }

    // --- TOP GEOMETRY FROM STABLE RTI/STI LOGIC ---
    const glueAngleDeg = 15;
    const glueBevelY = round(safeGlue * Math.tan(degToRad(glueAngleDeg)));

    const tuckFront = actualA;
    const tuckScoreOffset = 0.75;
    const tuckShoulderY = round(tuckFront - tuckScoreOffset);
    const tuckSideRelief = 0.5;
    const maxTuckRadius = Math.min(12, actualA * 0.6, safeL / 2 - tuckSideRelief - 0.5);
    const tuckRadius = round(Math.max(2, maxTuckRadius));

    const dustH = actualB;
    const sScale = Math.min(1, safeW / 12, actualB / 9);

    const dTinyX = round(0.61 * sScale);
    const dTinyY = round(0.149 * sScale);
    const dReliefX = round(1.186 * sScale);
    const dReliefY = round(0.132 * sScale);
    const dSlopeX = round(3.5 * sScale);
    const dSlopeY = round(3.5 * sScale);
    const dShoulderX = round(2.3 * sScale);
    const dShoulderY = round(8.0 * sScale);
    const dBodyStepX = round(0.3 * sScale);
    const dBodyStepY = round(6.0 * sScale);

    let dTopInsetL = dSlopeX + Math.max(0, actualB - dSlopeY) * (1.0 / 19.5);
    let dTopInsetR = dShoulderX + Math.max(0, actualB - dShoulderY) * (4.259 / 15.0);
    const minFlatTop = 1.0;

    const clampInsets = (insetL, insetR, width) => {
      if (insetL + insetR > width - minFlatTop) {
        const excess = insetL + insetR - (width - minFlatTop);
        const total = insetL + insetR;
        return [
          insetL - excess * (insetL / total),
          insetR - excess * (insetR / total),
        ];
      }
      return [insetL, insetR];
    };

    [dTopInsetL, dTopInsetR] = clampInsets(dTopInsetL, dTopInsetR, cW);
    dTopInsetL = round(dTopInsetL);
    dTopInsetR = round(dTopInsetR);

    const topWide = round(cW + tuckShoulderY);
    const topNarrow = round(topWide + safeT);
    const yBottom = round(topNarrow + safeH);
    const topScoreY = tuckFront;

    // --- SNAP LOCK BOTTOM ---
    const snap = computeSnapLockBottom90({
      panelL: cL,
      panelW: cW,
      panelW4: cW - safeT,
      lockExtra: actualBottomExtra,
      pocketExtra: actualSnapPocketExtra,
    });

    const bodyWidth = round(cL + cW + cL + (cW - safeT));
    const bodyStartX = isTypeA ? x1 : x0;

    const toWorld = ([localX, localY]) => [
      round(bodyStartX + (isTypeA ? localX : bodyWidth - localX)),
      round(yBottom - localY),
    ];

    const baseCornerR = round(clamp(cW * 0.11, 2.5, 5.5));
    const bigCornerR = round(clamp(cW * 0.18, 5, 9));
    const smallCornerR = round(clamp(cW * 0.06, 1.1, 2.3));

    const p = Object.fromEntries(
      Object.entries(snap.pointLabels).map(([key, pt]) => {
        const [px, py] = toWorld(pt);
        return [key, { x: px, y: py }];
      })
    );
// ==================================================
// ECMA LOCAL MICRO JOINT RELIEF TRIAL
// A1-B, H1-G, L1-K, Q2-R are straight vertical lines.
// B/G/K/R also shift by same 0.25–0.50 mm relief.
// ==================================================
const useEcmaLocalRelief = true;
const jointRelief = round(clamp(cW * 0.01, 0.25, 0.5));
const jointLift = jointRelief;

// true lifted control points
const jointCtrl = {
  H: { x: p.H.x, y: round(p.H.y - jointLift) },
  L: { x: p.L.x, y: round(p.L.y - jointLift) },
  Q: { x: p.Q.x, y: round(p.Q.y - jointLift) },
};


const reliefDir = isTypeA ? 1 : -1;

const jointHelper = {
  A1: { x: round(p.A.x + jointRelief * reliefDir), y: p.A.y },

  H1: { x: round(p.H.x - jointRelief * reliefDir), y: p.H.y },
  H2: { x: round(p.H.x + jointRelief * reliefDir), y: p.H.y },

  L1: { x: round(p.L.x - jointRelief * reliefDir), y: p.L.y },
  L2: { x: round(p.L.x + jointRelief * reliefDir), y: p.L.y },

  Q1: { x: round(p.Q.x - jointRelief * reliefDir), y: p.Q.y },
  Q2: { x: round(p.Q.x + jointRelief * reliefDir), y: p.Q.y },
};

// shifted straight-line bottom points

const pCut = useEcmaLocalRelief
  ? {
      ...p,

      // A1 straight to B
      A: { x: round(p.A.x + jointRelief * reliefDir), y: p.A.y },
      B: { x: round(p.B.x + jointRelief * reliefDir), y: p.B.y },

      // H1 straight to G
      G: { x: round(p.G.x - jointRelief * reliefDir), y: p.G.y },

      // L1 straight to K
      K: { x: round(p.K.x - jointRelief * reliefDir), y: p.K.y },

      // Q2 straight to R
      R: { x: round(p.R.x + jointRelief * reliefDir), y: p.R.y },
    }
  : p;
    const safeCorner = (corner, prev, next, desiredR = baseCornerR, factor = 0.45) => {
      const d1 = Math.hypot(prev.x - corner.x, prev.y - corner.y);
      const d2 = Math.hypot(next.x - corner.x, next.y - corner.y);
      return round(Math.min(desiredR, d1 * factor, d2 * factor));
    };

    const roundedSpec = {
      J: { r: bigCornerR, factor: 0.75 },
      S: { r: bigCornerR, factor: 0.75 },
      N: { r: smallCornerR, factor: 0.35 },
      O: { r: smallCornerR, factor: 0.35 },
    };

    const buildRoundedSegment = (order) => {
  const commands = [];

  const getLocalJointPoint = (key, sideKey) => {
    if (key === "H") {
      if (sideKey === "G") return jointHelper.H1;
      if (sideKey === "I") return jointHelper.H2;
    }

    if (key === "L") {
      if (sideKey === "K") return jointHelper.L1;
      if (sideKey === "M") return jointHelper.L2;
    }

    if (key === "Q") {
      if (sideKey === "P") return jointHelper.Q1;
      if (sideKey === "R") return jointHelper.Q2;
    }

    return p[key];
  };

  order.forEach((key, index) => {
    const current = p[key];
    const currentCut = pCut[key] || current;

    const prevKey = order[index - 1];
    const nextKey = order[index + 1];
    const spec = roundedSpec[key];

    // ECMA local micro joint:
    // H1 → H → H2
    // L1 → L → L2
    // Q1 → Q → Q2
    if (
      useEcmaLocalRelief &&
      ["H", "L", "Q"].includes(key) &&
      prevKey &&
      nextKey
    ) {
      const ctrl = jointCtrl[key];

      const entry = getLocalJointPoint(key, prevKey);
      const exit = getLocalJointPoint(key, nextKey);

      commands.push(`L ${entry.x},${entry.y}`);
      commands.push(`Q ${ctrl.x},${ctrl.y} ${exit.x},${exit.y}`);
      return;
    }

    // Existing J / S / N / O rounded corners
    if (spec && prevKey && nextKey) {
      const prev = pCut[prevKey] || p[prevKey];
      const next = pCut[nextKey] || p[nextKey];

      const r = safeCorner(current, prev, next, spec.r, spec.factor);
      const entry = pointToward(current, prev, r);
      const exit = pointToward(current, next, r);

      commands.push(`L ${entry.x},${entry.y}`);
      commands.push(`Q ${current.x},${current.y} ${exit.x},${exit.y}`);
    } else {
      commands.push(`L ${currentCut.x},${currentCut.y}`);
    }
  });

  return cleanPath(commands.join(" "));
};

    const typeAOrder = [
      "T", "S", "R", "Q", "P", "O", "N", "M", "L", "K", "J", "I", "H", "G", "F", "E", "D", "C", "B", "A",
    ];

    const typeBOrder = [
      "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U",
    ];

    const snapBottomSegment = buildRoundedSegment(isTypeA ? typeAOrder : typeBOrder);
    const snapPointLabels = p;

    const yOrange = round(yBottom + snap.derived.orangeLineY);
    const yMaxFlap = round(yBottom + snap.derived.maxFlapDepth);
    const creaseBreak = round(clamp(safeT + 0.3, 0.8, 1.6));
// Small gap so crease line does not overlap cut line
const creaseCutGap = round(clamp(cW * 0.01, 0.25, 0.5));
const vBottomStop = round(yBottom - creaseCutGap);

    let trimPath;
    let trimReliefPaths;
    let creaseLines;

    if (isTypeA) {
      trimPath = cleanPath(`
        M ${x0},${round(topNarrow + glueBevelY)}
        L ${x1},${topNarrow}
        L ${x1},${tuckShoulderY}
        L ${round(x1 + tuckSideRelief)},${tuckShoulderY}
        L ${round(x1 + tuckSideRelief)},${tuckRadius}
        A ${tuckRadius},${tuckRadius} 0 0 1 ${round(x1 + tuckSideRelief + tuckRadius)},0
        H ${round(x2 - tuckSideRelief - tuckRadius)}
        A ${tuckRadius},${tuckRadius} 0 0 1 ${round(x2 - tuckSideRelief)},${tuckRadius}
        L ${round(x2 - tuckSideRelief)},${tuckShoulderY}
        L ${x2},${tuckShoulderY}
        L ${x2},${topWide}
        L ${round(x2 + dTinyX)},${round(topNarrow + dTinyY)}
        L ${round(x2 + dReliefX)},${round(topNarrow - dReliefY)}
        L ${round(x2 + dSlopeX)},${round(topNarrow - dSlopeY)}
        L ${round(x2 + dTopInsetL)},${round(topNarrow - dustH)}
        H ${round(x3 - dTopInsetR)}
        L ${round(x3 - dShoulderX)},${round(topNarrow - dShoulderY)}
        L ${round(x3 - dBodyStepX)},${round(topNarrow - dBodyStepY)}
        L ${round(x3 - dBodyStepX)},${topNarrow}
        H ${round(x4 + dBodyStepX)}
        L ${round(x4 + dBodyStepX)},${round(topNarrow - dBodyStepY)}
        L ${round(x4 + dShoulderX)},${round(topNarrow - dShoulderY)}
        L ${round(x4 + dTopInsetR)},${round(topNarrow - dustH)}
        H ${round(x5 - dTopInsetL)}
        L ${round(x5 - dSlopeX)},${round(topNarrow - dSlopeY)}
        L ${x5},${topNarrow}
        L ${x5},${yBottom}
        ${snapBottomSegment}
        L ${x0},${round(yBottom - glueBevelY)}
        Z
      `);

      trimReliefPaths = [
        cleanPath(`M ${round(x1 + tuckSideRelief)},${tuckShoulderY} H ${round(x1 + tuckRadius - 0.5)} Q ${round(x1 + tuckRadius)},${tuckShoulderY} ${round(x1 + tuckRadius)},${round(topScoreY + 0.5)}`),
        cleanPath(`M ${round(x2 - tuckSideRelief)},${tuckShoulderY} H ${round(x2 - tuckRadius + 0.5)} Q ${round(x2 - tuckRadius)},${tuckShoulderY} ${round(x2 - tuckRadius)},${round(topScoreY + 0.5)}`),
      ];

      creaseLines = [
        { id: "v_glue", x1, y1: topNarrow, x2: x1, y2: vBottomStop },
        { id: "v_p1_p2", x1: x2, y1: topWide, x2: x2, y2: vBottomStop },
        { id: "v_p2_p3", x1: x3, y1: topNarrow, x2: x3, y2: vBottomStop },
        { id: "v_p3_p4", x1: x4, y1: topNarrow, x2: x4, y2: vBottomStop },
        { id: "top_tuck_panel", x1, y1: topWide, x2, y2: topWide },
        { id: "top_dust_left", x1: round(x2 + 1.066 * sScale), y1: topNarrow, x2: round(x3 - 0.3 * sScale), y2: topNarrow },
        { id: "top_dust_right", x1: round(x4 + 0.3 * sScale), y1: topNarrow, x2: x5, y2: topNarrow },
        { id: "top_tuck_score", x1: round(x1 + tuckRadius), y1: topScoreY, x2: round(x2 - tuckRadius), y2: topScoreY },
        { id: "h_bottom_panel1", x1: round(x1 + creaseCutGap), y1: yBottom, x2: round(x2 - creaseBreak), y2: yBottom },
{ id: "h_bottom_panel2", x1: round(x2 + creaseBreak), y1: yBottom, x2: round(x3 - creaseBreak), y2: yBottom },
{ id: "h_bottom_panel3", x1: round(x3 + creaseBreak), y1: yBottom, x2: round(x4 - creaseBreak), y2: yBottom },
{ id: "h_bottom_panel4", x1: round(x4 + creaseBreak), y1: yBottom, x2: round(x5 - creaseCutGap), y2: yBottom },
      ];
    } else {
      trimPath = cleanPath(`
        M ${x0},${topNarrow}
        H ${round(x0 + dBodyStepX)}
        L ${round(x0 + dBodyStepX)},${round(topNarrow - dBodyStepY)}
        L ${round(x0 + dShoulderX)},${round(topNarrow - dShoulderY)}
        L ${round(x0 + dTopInsetR)},${round(topNarrow - dustH)}
        H ${round(x1 - dTopInsetL)}
        L ${round(x1 - dSlopeX)},${round(topNarrow - dSlopeY)}
        L ${x1},${topNarrow}
        L ${x1},${tuckShoulderY}
        L ${round(x1 + tuckSideRelief)},${tuckShoulderY}
        L ${round(x1 + tuckSideRelief)},${tuckRadius}
        A ${tuckRadius},${tuckRadius} 0 0 1 ${round(x1 + tuckSideRelief + tuckRadius)},0
        H ${round(x2 - tuckSideRelief - tuckRadius)}
        A ${tuckRadius},${tuckRadius} 0 0 1 ${round(x2 - tuckSideRelief)},${tuckRadius}
        L ${round(x2 - tuckSideRelief)},${tuckShoulderY}
        L ${x2},${tuckShoulderY}
        L ${x2},${topWide}
        L ${round(x2 + dTinyX)},${round(topNarrow + dTinyY)}
        L ${round(x2 + dReliefX)},${round(topNarrow - dReliefY)}
        L ${round(x2 + dSlopeX)},${round(topNarrow - dSlopeY)}
        L ${round(x2 + dTopInsetL)},${round(topNarrow - dustH)}
        H ${round(x3 - dTopInsetR)}
        L ${round(x3 - dShoulderX)},${round(topNarrow - dShoulderY)}
        L ${round(x3 - dBodyStepX)},${round(topNarrow - dBodyStepY)}
        L ${round(x3 - dBodyStepX)},${topNarrow}
        H ${x4}
        L ${x5},${round(topNarrow + glueBevelY)}
        L ${x5},${round(yBottom - glueBevelY)}
        L ${x4},${yBottom}
        ${snapBottomSegment}
        Z
      `);

      trimReliefPaths = [
        cleanPath(`M ${round(x1 + tuckSideRelief)},${tuckShoulderY} H ${round(x1 + tuckRadius - 0.5)} Q ${round(x1 + tuckRadius)},${tuckShoulderY} ${round(x1 + tuckRadius)},${round(topScoreY + 0.5)}`),
        cleanPath(`M ${round(x2 - tuckSideRelief)},${tuckShoulderY} H ${round(x2 - tuckRadius + 0.5)} Q ${round(x2 - tuckRadius)},${tuckShoulderY} ${round(x2 - tuckRadius)},${round(topScoreY + 0.5)}`),
      ];

      creaseLines = [
        { id: "v_p4_p1", x1, y1: topNarrow, x2: x1, y2: vBottomStop  },
        { id: "v_p1_p2", x1: x2, y1: topWide, x2: x2, y2: vBottomStop  },
        { id: "v_p2_p3", x1: x3, y1: topNarrow, x2: x3, y2: vBottomStop  },
        { id: "v_p3_glue", x1: x4, y1: topNarrow, x2: x4, y2: vBottomStop  },
        { id: "top_dust_panel4", x1: round(x0 + 0.3 * sScale), y1: topNarrow, x2: x1, y2: topNarrow },
        { id: "top_tuck_panel1", x1, y1: topWide, x2, y2: topWide },
        { id: "top_dust_panel2", x1: round(x2 + 1.066 * sScale), y1: topNarrow, x2: round(x3 - 0.3 * sScale), y2: topNarrow },
        { id: "top_tuck_score", x1: round(x1 + tuckRadius), y1: topScoreY, x2: round(x2 - tuckRadius), y2: topScoreY },
        { id: "h_bottom_typeB_panel4", x1: round(x0 + creaseCutGap), y1: yBottom, x2: round(x1 - creaseBreak), y2: yBottom },
{ id: "h_bottom_typeB_panel1", x1: round(x1 + creaseBreak), y1: yBottom, x2: round(x2 - creaseBreak), y2: yBottom },
{ id: "h_bottom_typeB_panel2", x1: round(x2 + creaseBreak), y1: yBottom, x2: round(x3 - creaseBreak), y2: yBottom },
{ id: "h_bottom_typeB_panel3", x1: round(x3 + creaseBreak), y1: yBottom, x2: round(x4 - creaseCutGap), y2: yBottom },
      ];
    }

    const guideLines = [
      { id: "guide_orange_half_width", x1: bodyStartX, y1: yOrange, x2: round(bodyStartX + bodyWidth), y2: yOrange },
      { id: "guide_max_flap_depth", x1: bodyStartX, y1: yMaxFlap, x2: round(bodyStartX + bodyWidth), y2: yMaxFlap },
      { id: "guide_panel1_center", x1: isTypeA ? round(x1 + cL / 2) : round(x1 + cL / 2), y1: yBottom - 8, x2: isTypeA ? round(x1 + cL / 2) : round(x1 + cL / 2), y2: yMaxFlap + 5 },
      { id: "guide_panel3_center", x1: isTypeA ? round(x3 + cL / 2) : round(x3 + cL / 2), y1: yBottom - 8, x2: isTypeA ? round(x3 + cL / 2) : round(x3 + cL / 2), y2: yMaxFlap + 5 },
    ];

    const totalCreaseLengthMM = creaseLines.reduce((sum, line) => {
      return sum + Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
    }, 0);

    return {
      isTypeA,
      designW: round(x5),
      designH: round(yMaxFlap + 10),
      trimPath,
      trimReliefPaths,
      creaseLines,
      guideLines,
      snapPointLabels,
      snapDerived: snap.derived,
      outerL,
      outerW,
      outerH,
      innerL,
      innerW,
      innerH,
      actualL: safeL,
      actualW: safeW,
      actualH: safeH,
      actualA,
      actualB,
      suggestedA,
      suggestedB,
      actualSnapPocketExtra,
      actualBottomExtra,
      totalCreaseLengthMM,
      warnings,
    };
  }, [dim, unit, unitCfg, dielineType]);

  useEffect(() => {
    if (cutLayerRef.current) {
      let total = 0;
      const paths = cutLayerRef.current.querySelectorAll("path");

      paths.forEach((p) => {
        if (p.getTotalLength) {
          total += p.getTotalLength();
        }
      });

      setCutLengthMM(total);
    }
  }, [g.trimPath, g.trimReliefPaths]);

  const applySuggestedAB = () => {
    dispatch({ type: "UPDATE_MULTIPLE", payload: { A: g.suggestedA, B: g.suggestedB } });
  };

  const downloadSVG = useCallback(() => {
    const svgMarkup = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     version="1.1"
     width="${g.designW + 10}mm" height="${g.designH + 10}mm"
     viewBox="-5 -5 ${g.designW + 10} ${g.designH + 10}">
  <title>Snap Lock Bottom Type ${dielineType} — ${dim.L}x${dim.W}x${dim.H}mm</title>
  <g id="Layer_Cut" inkscape:label="Cut Lines" inkscape:groupmode="layer">
    <path id="Trim_Main" d="${g.trimPath}" fill="none" stroke="#1a2cb0" stroke-width="0.23" stroke-linejoin="round" stroke-linecap="butt" vector-effect="non-scaling-stroke" />
${g.trimReliefPaths.map((d, i) => `    <path id="Trim_Relief_${i + 1}" d="${d}" fill="none" stroke="#1a2cb0" stroke-width="0.23" stroke-linejoin="round" stroke-linecap="butt" vector-effect="non-scaling-stroke" />`).join("\n")}
  </g>
  <g id="Layer_Crease" inkscape:label="Crease Lines" inkscape:groupmode="layer">
${g.creaseLines.map((l) => `    <line id="${l.id}" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" fill="none" stroke="#ff0000" stroke-width="0.23" stroke-linecap="butt" vector-effect="non-scaling-stroke" />`).join("\n")}
  </g>
</svg>`;

    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `snap_lock_type${dielineType}_${dim.L}x${dim.W}x${dim.H}mm.svg`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [g, dim, dielineType]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const inputFields = [
    ["L", "Length"],
    ["W", "Width"],
    ["H", "Height"],
    ["t", "Board Thickness"],
    ["glue", "Glue Flap Width"],
    ["A", "Top Tuck Flap"],
    ["B", "Top Dust Flap"],
    ["snapPocketExtra", "Snap Pocket Extra"],
    ["bottomExtra", "Snap Lock Plunge Extra"],
  ];

  return (
    <div style={{ padding: 24, display: "flex", gap: 24, fontFamily: "system-ui, sans-serif", backgroundColor: "#f0f2f5", minHeight: "100vh" }}>
      <div style={{ width: 310, background: "#fff", borderRadius: 12, padding: 24, height: "fit-content", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: "#1a1a2e", fontSize: 15 }}>📦 Snap Lock Bottom Type {dielineType}</h3>
          <span style={{ fontSize: 11, color: "#1565c0", background: "#e3f2fd", padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>
            Snap Lock {dielineType} V1
          </span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Dieline Configuration
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            {["A", "B"].map((type) => (
              <button
                key={type}
                onClick={() => setDielineType(type)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  border: "1px solid",
                  borderColor: dielineType === type ? "#1565c0" : "#ddd",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  background: dielineType === type ? "#1565c0" : "#fff",
                  color: dielineType === type ? "#fff" : "#555",
                }}
              >
                TYPE {type}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Unit System
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(UNIT_CONFIGS).map(([key]) => (
              <button
                key={key}
                onClick={() => setUnit(key)}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  border: "1px solid",
                  borderColor: unit === key ? "#2e7d32" : "#ddd",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                  background: unit === key ? "#2e7d32" : "#fff",
                  color: unit === key ? "#fff" : "#555",
                }}
              >
                {key.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: "#f0f2f5", margin: "12px 0" }} />

        {inputFields.map(([key, label]) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <label style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 4, color: "#444" }}>
              <span>{label}</span>
              <span style={{ color: "#2e7d32", fontWeight: 400 }}>{unit}</span>
            </label>
            <input
              type="number"
              step={unitCfg.step}
              value={toDisplay(dim[key])}
              onChange={(e) => update(key, e.target.value)}
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
        ))}

        <div style={{ height: 1, background: "#f0f2f5", margin: "14px 0" }} />

        <button onClick={applySuggestedAB} style={{ width: "100%", padding: 10, border: "1px solid #1565c0", borderRadius: 6, background: "#f0f7ff", color: "#1565c0", fontWeight: 700, cursor: "pointer", marginBottom: 12, fontSize: 13 }}>
          ✨ Apply Suggested A / B
        </button>

        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={() => dispatch({ type: "UNDO" })} disabled={!canUndo} style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 6, cursor: canUndo ? "pointer" : "not-allowed", background: canUndo ? "#fff" : "#f9f9f9", color: canUndo ? "#333" : "#bbb", fontSize: 13 }}>
            ↩ Undo
          </button>
          <button onClick={() => dispatch({ type: "REDO" })} disabled={!canRedo} style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 6, cursor: canRedo ? "pointer" : "not-allowed", background: canRedo ? "#fff" : "#f9f9f9", color: canRedo ? "#333" : "#bbb", fontSize: 13 }}>
            ↪ Redo
          </button>
          <button onClick={() => dispatch({ type: "RESET" })} style={{ padding: "8px 10px", border: "1px solid #ffcccc", borderRadius: 6, cursor: "pointer", background: "#fff5f5", color: "#c62828", fontSize: 13 }}>
            ⊘
          </button>
        </div>

        <button onClick={downloadSVG} style={{ width: "100%", padding: 11, border: "none", borderRadius: 8, background: "linear-gradient(135deg, #2e7d32, #43a047)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, marginTop: 4 }}>
          ⬇ Download Layered SVG
        </button>

        <div style={{ marginTop: 14, padding: 12, background: "#f8f9ff", borderRadius: 8, fontSize: 11, lineHeight: 1.6, color: "#444" }}>
          <div style={{ fontWeight: 700, color: "#1565c0", marginBottom: 6 }}>Box Dimensions</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Outer Dimension</span>
            <strong>{round(unitCfg.fromMM(g.outerL))} × {round(unitCfg.fromMM(g.outerW))} × {round(unitCfg.fromMM(g.outerH))} {unit}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Inner Dimension</span>
            <strong>{round(unitCfg.fromMM(g.innerL))} × {round(unitCfg.fromMM(g.innerW))} × {round(unitCfg.fromMM(g.innerH))} {unit}</strong>
          </div>
        </div>

        <div style={{ marginTop: 14, padding: 12, backgroundColor: "#f7fbff", border: "1px solid #d8ecff", borderRadius: 8, fontSize: 11, lineHeight: 1.6, color: "#35506b" }}>
          <strong>Snap Geometry:</strong>
          <div>Rule: {g.snapDerived.ruleStatus}</div>
          <div>H Foot: {round(unitCfg.fromMM(g.snapDerived.H_foot))} {unit}</div>
          <div>Half W Guide: {round(unitCfg.fromMM(g.snapDerived.orangeLineY))} {unit}</div>
          <div>Snap Pocket Extra: {round(unitCfg.fromMM(g.actualSnapPocketExtra))} {unit}</div>
          <div>Max Depth: {round(unitCfg.fromMM(g.snapDerived.maxFlapDepth))} {unit}</div>
          <div>Hook Step: {round(unitCfg.fromMM(g.snapDerived.hookStepWidth))} {unit}</div>
        </div>

        {g.warnings.length > 0 && (
          <div style={{ marginTop: 14, padding: 12, backgroundColor: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, fontSize: 11, lineHeight: 1.6, color: "#795548" }}>
            <strong>⚠️ Auto-corrected:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {g.warnings.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div style={{ flex: 1, background: "#fff", borderRadius: 12, padding: 32, overflow: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ lineHeight: 1.7 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1565c0" }}>Snap Lock Bottom Type {dielineType}</div>
            <div style={{ fontSize: 11, color: "#888" }}>
              Canvas: <strong>{round(unitCfg.fromMM(g.designW))}</strong> × <strong>{round(unitCfg.fromMM(g.designH))}</strong> {unit}
            </div>
            <div style={{ fontSize: 11, color: "#888" }}>
              Outer Dimension = <strong>{round(unitCfg.fromMM(g.outerL))} × {round(unitCfg.fromMM(g.outerW))} × {round(unitCfg.fromMM(g.outerH))} {unit}</strong>
            </div>
            <div style={{ fontSize: 11, color: "#888" }}>
              Inner Dimension = <strong>{round(unitCfg.fromMM(g.innerL))} × {round(unitCfg.fromMM(g.innerW))} × {round(unitCfg.fromMM(g.innerH))} {unit}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
            <span style={{ color: "#1a2cb0" }}>
              ■ Cut Lines <strong>({((cutLengthMM || 0) / 10).toFixed(1)} cm)</strong>
            </span>
            <span style={{ color: "#ff0000" }}>
              ■ Crease Lines <strong>({((g.totalCreaseLengthMM || 0) / 10).toFixed(1)} cm)</strong>
            </span>
            {showGuides && <span style={{ color: "#ff66cc" }}>■ Guide Lines</span>}
            {showPoints && <span style={{ color: "#111" }}>● Points</span>}
          </div>
        </div>

        <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width="100%" viewBox={`-5 -5 ${g.designW + 10} ${g.designH + 10}`} style={{ minWidth: 650, display: "block" }}>
          <g id="Layer_Cut" ref={cutLayerRef}>
            <path d={g.trimPath} fill="none" stroke="#1a2cb0" strokeWidth="0.23" strokeLinejoin="round" strokeLinecap="butt" />
            {g.trimReliefPaths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#1a2cb0" strokeWidth="0.23" strokeLinejoin="round" strokeLinecap="butt" />
            ))}
          </g>

          <g id="Layer_Crease">
            {g.creaseLines.map((line) => (
              <line key={line.id} id={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} fill="none" stroke="#ff0000" strokeWidth="0.23" strokeLinecap="butt" />
            ))}
          </g>

          {showGuides && (
            <g id="Layer_Guides">
              {g.guideLines.map((line) => (
                <line key={line.id} id={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} fill="none" stroke="#ff66cc" strokeWidth="0.4" strokeDasharray="3 3" />
              ))}
            </g>
          )}

          {showPoints && (
            <g id="Layer_Point_Labels">
              {Object.entries(g.snapPointLabels).map(([key, point]) => (
                <g key={key}>
                  <circle cx={point.x} cy={point.y} r="1.2" fill="#111" />
                  <text x={point.x + 2} y={point.y - 2} fontSize="5" fill="#111" fontFamily="Arial, sans-serif">
                    {key}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};

export default SnapLockBottomGenerator;
