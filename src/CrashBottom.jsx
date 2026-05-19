import React, { useMemo, useState, useReducer, useRef, useCallback } from "react";

// --- HELPERS ---
const round = (value, precision = 3) => {
  const val = Number(value);
  return isNaN(val) ? 0 : Number(val.toFixed(precision));
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cleanPath = (path) => path.replace(/\s+/g, " ").trim();
const degToRad = (deg) => (deg * Math.PI) / 180;

// --- UNIT CONFIGURATION ---
const UNIT_CONFIGS = {
  mm:   { label: "Millimeters (mm)", toMM: (v) => v,        fromMM: (v) => v,        step: 0.1,   decimals: 1 },
  cm:   { label: "Centimeters (cm)", toMM: (v) => v * 10,   fromMM: (v) => v / 10,   step: 0.01,  decimals: 2 },
  inch: { label: "Inches (in)",      toMM: (v) => v * 25.4, fromMM: (v) => v / 25.4, step: 0.001, decimals: 3 },
};

// --- INITIAL STATE ---
const INITIAL_DIM = { L: 80, W: 40, H: 100, t: 0.5, glue: 16, A: 26, B: 24, bottomExtra: 10 };
const MAX_HISTORY = 50;

const historyReducer = (state, action) => {
  switch (action.type) {
    case "UPDATE": {
      const newDim  = { ...state.present, [action.key]: action.value };
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
      const newPast  = state.past.slice(0, -1);
      return { past: newPast, present: previous, future: [state.present, ...state.future] };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next      = state.future[0];
      const newFuture = state.future.slice(1);
      return { past: [...state.past, state.present], present: next, future: newFuture };
    }
    case "RESET":
      return {
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present: INITIAL_DIM, future: [],
      };
    default:
      return state;
  }
};

const AutoBottomCrashLockGenerator = () => {
  const [unit, setUnit] = useState("mm");
  const [dielineType, setDielineType] = useState("A"); // "A" or "B"
  const [showGuides, setShowGuides] = useState(true);

  const [history, dispatch] = useReducer(historyReducer, {
    past: [], present: INITIAL_DIM, future: [],
  });

  const svgRef = useRef(null);
  const dim = history.present;
  const unitCfg = UNIT_CONFIGS[unit];

  const update = useCallback((key, displayValue) => {
    const mmValue = round(unitCfg.toMM(parseFloat(displayValue) || 0));
    dispatch({ type: "UPDATE", key, value: mmValue });
  }, [unitCfg]);

  const toDisplay = useCallback((mmVal) => round(unitCfg.fromMM(mmVal)), [unitCfg]);

  // ==================================================
  // EXACT MATH & GEOMETRY FROM V4_combo_90% 
  // ==================================================
  const g = useMemo(() => {
    const { L: inputL, W: inputW, H: inputH, t: inputT, glue, A, B, bottomExtra } = dim;
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

    const actualBottomExtra = round(Math.max(8, bottomExtra || 8));
    if (bottomExtra < 8) warnings.push(`Bottom extra adjusted to minimum 8 mm.`);

    // --- PANEL LAYOUT ---
    const cL = round(safeL + safeT);
    const cW = round(safeW + safeT);

    let x0 = 0, x1, x2, x3, x4, x5;
    if (isTypeA) {
      x1 = round(safeGlue);
      x2 = round(x1 + cL);
      x3 = round(x2 + cW);
      x4 = round(x3 + cL);
      x5 = round(x4 + (cW - safeT));
    } else {
      x1 = round(cW - safeT);
      x2 = round(x1 + cL);
      x3 = round(x2 + cW);
      x4 = round(x3 + cL);
      x5 = round(x4 + safeGlue);
    }

    // --- TOP GEOMETRY ---
    const glueAngleDeg = 15;
    const glueBevelY = round(safeGlue * Math.tan((glueAngleDeg * Math.PI) / 180));

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
        return [insetL - excess * (insetL / total), insetR - excess * (insetR / total)];
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

    // --- BOTTOM GUIDE LEVELS ---
    const halfW = round(cW / 2);
    const halfL = round(cL / 2);
    const bottomDepth = round(halfW + actualBottomExtra);
    const yFirstBase = round(yBottom + halfW);
    const yDeepBase = round(yBottom + bottomDepth);

    const creaseBreak = round(clamp(safeT + 0.3, 0.8, 1.6));

    const getLengthFlapDraftRun = (w) => {
      if (w <= 30) return 2.5;
      if (w <= 40) return round(2.5 + ((w - 30) / 10) * 2.5);
      return round(clamp(w * 0.125, 5, 10));
    };
    const leftDraftRun = getLengthFlapDraftRun(safeW);

    // ==================================================
    // TYPE A LOCK PAIR
    // ==================================================
    const buildLockPair = (pairStartX, pairLengthX, pairEndX, pairId, cornerMode = {}) => {
      const jointLift = round(clamp(safeT, 0.5, 1.2));
      const jointRound = round(clamp(safeT + 0.3, 0.8, 1.6));

      const makeTopPoint = (x, shouldLift = false) => ({
        x: round(x), y: shouldLift ? round(yBottom - jointLift) : yBottom,
      });

      const APoint = makeTopPoint(pairStartX, cornerMode.liftA);
      const KPoint = makeTopPoint(pairLengthX, cornerMode.liftK);
      const NPoint = makeTopPoint(pairEndX, cornerMode.liftN);
      const centerL = round(pairStartX + halfL);

      const stepLift = round(clamp(safeW * 0.05, 2.5, 3));
      const smallCorner = round(clamp(safeW * 0.0125, 0.4, 0.6));
      const glueSideLean = round(clamp(safeT + 0.3, 0.8, 1.5));
      const jkSize = round(clamp(safeW * 0.12 + glueSideLean, 3.5, 6.2));
      const hookGap = round(clamp(safeW * 0.04, 1, 2));

      const pointToward = (from, to, dist) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.max(Math.hypot(dx, dy), 0.001);
        return {
          x: round(from.x + (dx / len) * dist),
          y: round(from.y + (dy / len) * dist),
        };
      };

      const BPoint = { x: round(pairStartX + leftDraftRun), y: yDeepBase };
      const EPoint = { x: centerL, y: yFirstBase };
      const DPoint = { x: centerL, y: round(yFirstBase + stepLift) };
      const availableBD = round(DPoint.x - BPoint.x);
      const bcFlatLength = round(clamp(cL * 0.25, 8, 36));
      const usePointC = availableBD > bcFlatLength + 5;
      const CPoint = {
        x: round(Math.max(BPoint.x + 1, Math.min(BPoint.x + bcFlatLength, DPoint.x - 4))),
        y: yDeepBase,
      };

      const DCornerIn = { x: round(DPoint.x - smallCorner), y: DPoint.y };
      const DCornerOut = { x: DPoint.x, y: round(DPoint.y - smallCorner) };
      const FPoint = { x: round(KPoint.x - halfW), y: yFirstBase };
      const QPointJ = { x: round(KPoint.x - jkSize), y: round(yBottom + jkSize) };
      const IPoint = { x: round(KPoint.x - hookGap), y: round(QPointJ.y + (KPoint.x - hookGap - QPointJ.x)) };
      const HPoint = { x: IPoint.x, y: yDeepBase };
      const GPoint = { x: round(FPoint.x + (yDeepBase - yFirstBase)), y: yDeepBase };
      const MPoint = { x: round(NPoint.x - halfW), y: yFirstBase };
      const LPoint = { x: round(MPoint.x - clamp(halfW * 0.35, 4, 10)), y: yFirstBase };
      const NCornerOut = { x: round(NPoint.x - smallCorner), y: round(NPoint.y + smallCorner) };
      const KCornerIn = { x: round(KPoint.x + (LPoint.x - KPoint.x) * 0.04), y: round(KPoint.y + (LPoint.y - KPoint.y) * 0.04) };
      const KCornerOut = { x: round(KPoint.x + (QPointJ.x - KPoint.x) * 0.08), y: round(KPoint.y + (QPointJ.y - KPoint.y) * 0.08) };
      const cSegment = usePointC ? `L ${CPoint.x},${CPoint.y} L ${BPoint.x},${BPoint.y}` : `L ${BPoint.x},${BPoint.y}`;

      const nSegment = cornerMode.skipNStart
        ? `L ${MPoint.x},${MPoint.y}`
        : cornerMode.liftN
        ? (() => {
            const nEntry = pointToward(NPoint, NCornerOut, jointRound);
            const nExit = pointToward(NPoint, MPoint, jointRound);
            return `
              L ${nEntry.x},${nEntry.y}
              Q ${NPoint.x},${NPoint.y} ${nExit.x},${nExit.y}
              L ${MPoint.x},${MPoint.y}
            `;
          })()
        : `
          L ${NCornerOut.x},${NCornerOut.y}
          Q ${NPoint.x},${NPoint.y} ${MPoint.x},${MPoint.y}
        `;

      const kSegment = cornerMode.liftK
        ? (() => {
            const kEntry = pointToward(KPoint, KCornerIn, jointRound);
            const kExit = pointToward(KPoint, KCornerOut, jointRound);
            return `
              L ${kEntry.x},${kEntry.y}
              Q ${KPoint.x},${KPoint.y} ${kExit.x},${kExit.y}
            `;
          })()
        : `
          L ${KCornerIn.x},${KCornerIn.y}
          Q ${KPoint.x},${KPoint.y} ${KCornerOut.x},${KCornerOut.y}
        `;

      let endToA = `L ${APoint.x},${APoint.y}`;
      if (cornerMode.roundAConnector && cornerMode.startExitPoint) {
        const aEntry = pointToward(APoint, BPoint, jointRound);
        const aExit = pointToward(APoint, cornerMode.startExitPoint, jointRound);
        endToA = `
          L ${aEntry.x},${aEntry.y}
          Q ${APoint.x},${APoint.y} ${aExit.x},${aExit.y}
        `;
      }

      const reversePath = cleanPath(`
        ${nSegment}
        L ${LPoint.x},${LPoint.y}
        ${kSegment}
        L ${QPointJ.x},${QPointJ.y}
        L ${IPoint.x},${IPoint.y}
        L ${HPoint.x},${HPoint.y}
        L ${GPoint.x},${GPoint.y}
        L ${FPoint.x},${FPoint.y}
        L ${EPoint.x},${EPoint.y}
        L ${DCornerOut.x},${DCornerOut.y}
        Q ${DPoint.x},${DPoint.y} ${DCornerIn.x},${DCornerIn.y}
        ${cSegment}
        ${endToA}
      `);

      const creases = [{ id: `${pairId}_length_crease_FJ`, x1: FPoint.x, y1: FPoint.y, x2: QPointJ.x, y2: QPointJ.y }];
      return { path: reversePath, creases };
    };

    // ==================================================
    // TYPE B MIRROR LOCK PAIR
    // ==================================================
    const buildMirrorLockPair = (pairStartX, pairEndX, pairId, cornerMode = {}) => {
      const virtualStartX = pairStartX;
      const virtualKX = round(pairStartX + cL);
      const virtualNX = pairEndX;

      const mirrorSum = round(pairStartX + pairEndX);
      const mirror = (p) => ({ x: round(mirrorSum - p.x), y: p.y });
      const jointLift = round(clamp(safeT, 0.5, 1.2));
      const jointRound = round(clamp(safeT + 0.3, 0.8, 1.6));

      const makeTopPoint0 = (x, shouldLift = false) => ({
        x: round(x), y: shouldLift ? round(yBottom - jointLift) : yBottom,
      });

      const pointToward = (from, to, dist) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.max(Math.hypot(dx, dy), 0.001);
        return {
          x: round(from.x + (dx / len) * dist),
          y: round(from.y + (dy / len) * dist),
        };
      };

      const A0 = makeTopPoint0(virtualStartX, cornerMode.liftA);
      const K0 = makeTopPoint0(virtualKX, cornerMode.liftK);
      const N0 = makeTopPoint0(virtualNX, cornerMode.liftN);
      const centerL0 = round(virtualStartX + halfL);
      const stepLift = round(clamp(safeW * 0.05, 2.5, 3));
      const smallCorner = round(clamp(safeW * 0.0125, 0.4, 0.6));
      const glueSideLean = round(clamp(safeT + 0.3, 0.8, 1.5));
      const jkSize = round(clamp(safeW * 0.12 + glueSideLean, 3.5, 6.2));
      const hookGap = round(clamp(safeW * 0.04, 1, 2));

      const B0 = { x: round(virtualStartX + leftDraftRun), y: yDeepBase };
      const E0 = { x: centerL0, y: yFirstBase };
      const D0 = { x: centerL0, y: round(yFirstBase + stepLift) };
      const availableBD = round(D0.x - B0.x);
      const bcFlatLength = round(clamp(cL * 0.25, 8, 36));
      const usePointC = availableBD > bcFlatLength + 5;
      const C0 = {
        x: round(Math.max(B0.x + 1, Math.min(B0.x + bcFlatLength, D0.x - 4))),
        y: yDeepBase,
      };

      const DCornerIn0 = { x: round(D0.x - smallCorner), y: D0.y };
      const DCornerOut0 = { x: D0.x, y: round(D0.y - smallCorner) };
      const F0 = { x: round(K0.x - halfW), y: yFirstBase };
      const J0 = { x: round(K0.x - jkSize), y: round(yBottom + jkSize) };
      const I0 = { x: round(K0.x - hookGap), y: round(J0.y + (K0.x - hookGap - J0.x)) };
      const H0 = { x: I0.x, y: yDeepBase };
      const G0 = { x: round(F0.x + (yDeepBase - yFirstBase)), y: yDeepBase };
      const M0 = { x: round(N0.x - halfW), y: yFirstBase };
      const L0 = { x: round(M0.x - clamp(halfW * 0.35, 4, 10)), y: yFirstBase };
      const NCornerOut0 = { x: round(N0.x - smallCorner), y: round(N0.y + smallCorner) };
      const KCornerIn0 = { x: round(K0.x + (L0.x - K0.x) * 0.04), y: round(K0.y + (L0.y - K0.y) * 0.04) };
      const KCornerOut0 = { x: round(K0.x + (J0.x - K0.x) * 0.08), y: round(K0.y + (J0.y - K0.y) * 0.08) };

      const APoint = mirror(A0);
      const BPoint = mirror(B0);
      const CPoint = mirror(C0);
      const DPoint = mirror(D0);
      const EPoint = mirror(E0);
      const FPoint = mirror(F0);
      const GPoint = mirror(G0);
      const HPoint = mirror(H0);
      const IPoint = mirror(I0);
      const QPointJ = mirror(J0);
      const KPoint = mirror(K0);
      const LPoint = mirror(L0);
      const MPoint = mirror(M0);
      const NPoint = mirror(N0);
      const DCornerIn = mirror(DCornerIn0);
      const DCornerOut = mirror(DCornerOut0);
      const KCornerIn = mirror(KCornerIn0);
      const KCornerOut = mirror(KCornerOut0);
      const NCornerOut = mirror(NCornerOut0);

      const cSegment = usePointC ? `L ${CPoint.x},${CPoint.y}` : "";

      const kSegment = cornerMode.liftK
        ? (() => {
            const kEntry = pointToward(KPoint, KCornerOut, jointRound);
            const kExit = pointToward(KPoint, KCornerIn, jointRound);
            return `
              L ${kEntry.x},${kEntry.y}
              Q ${KPoint.x},${KPoint.y} ${kExit.x},${kExit.y}
            `;
          })()
        : `
          L ${KCornerOut.x},${KCornerOut.y}
          Q ${KPoint.x},${KPoint.y} ${KCornerIn.x},${KCornerIn.y}
        `;

      const nSegment = cornerMode.liftN
        ? (() => {
            const nEntry = pointToward(NPoint, MPoint, jointRound);
            const nExitTarget = cornerMode.nExitToPoint || NCornerOut;
            const nExit = pointToward(NPoint, nExitTarget, jointRound);
            return `
              L ${nEntry.x},${nEntry.y}
              Q ${NPoint.x},${NPoint.y} ${nExit.x},${nExit.y}
            `;
          })()
        : `
          Q ${NPoint.x},${NPoint.y} ${NCornerOut.x},${NCornerOut.y}
          L ${NPoint.x},${NPoint.y}
        `;

      const path = cleanPath(`
        L ${BPoint.x},${BPoint.y}
        ${cSegment}
        L ${DCornerIn.x},${DCornerIn.y}
        Q ${DPoint.x},${DPoint.y} ${DCornerOut.x},${DCornerOut.y}
        L ${EPoint.x},${EPoint.y}
        L ${FPoint.x},${FPoint.y}
        L ${GPoint.x},${GPoint.y}
        L ${HPoint.x},${HPoint.y}
        L ${IPoint.x},${IPoint.y}
        L ${QPointJ.x},${QPointJ.y}
        ${kSegment}
        L ${LPoint.x},${LPoint.y}
        L ${MPoint.x},${MPoint.y}
        ${nSegment}
      `);

      const creases = [{ id: `${pairId}_mirror_length_crease`, x1: FPoint.x, y1: FPoint.y, x2: QPointJ.x, y2: QPointJ.y }];
      return { path, creases };
    };

    let pair1, pair2;
    if (isTypeA) {
      pair1 = buildLockPair(x1, x2, x3, "pair1", { liftK: true, skipNStart: true });
      pair2 = buildLockPair(x3, x4, x5, "pair2", {
        liftA: true, liftK: true, roundAConnector: true,
        startExitPoint: { x: round(x3 - halfW + safeT - 1.00), y: yFirstBase },
      });
    } else {
      pair1 = buildMirrorLockPair(x0, x2, "pair1", { liftK: true });
      pair2 = buildMirrorLockPair(x2, x4, "pair2", {
        liftN: true, liftK: true,
        nExitToPoint: { x: round(x2 - leftDraftRun), y: yDeepBase },
      });
    }

    let trimPath, trimReliefPaths, creaseLines, guideLines;

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
        ${pair2.path}
        ${pair1.path}
        L ${x0},${round(yBottom - safeGlue)}
        Z
      `);
      trimReliefPaths = [
        cleanPath(`M ${round(x1 + tuckSideRelief)},${tuckShoulderY} H ${round(x1 + tuckRadius - 0.5)} Q ${round(x1 + tuckRadius)},${tuckShoulderY} ${round(x1 + tuckRadius)},${round(topScoreY + 0.5)}`),
        cleanPath(`M ${round(x2 - tuckSideRelief)},${tuckShoulderY} H ${round(x2 - tuckRadius + 0.5)} Q ${round(x2 - tuckRadius)},${tuckShoulderY} ${round(x2 - tuckRadius)},${round(topScoreY + 0.5)}`),
      ];
      creaseLines = [
        { id: "v_glue", x1, y1: topNarrow, x2: x1, y2: yBottom },
        { id: "v_p1_p2", x1: x2, y1: topWide, x2: x2, y2: yBottom },
        { id: "v_p2_p3", x1: x3, y1: topNarrow, x2: x3, y2: yBottom },
        { id: "v_p3_p4", x1: x4, y1: topNarrow, x2: x4, y2: yBottom },
        { id: "top_tuck_panel", x1, y1: topWide, x2, y2: topWide },
        { id: "top_dust_left", x1: round(x2 + 1.066 * sScale), y1: topNarrow, x2: round(x3 - 0.3 * sScale), y2: topNarrow },
        { id: "top_dust_right", x1: round(x4 + 0.3 * sScale), y1: topNarrow, x2: x5, y2: topNarrow },
        { id: "top_tuck_score", x1: round(x1 + tuckRadius), y1: topScoreY, x2: round(x2 - tuckRadius), y2: topScoreY },
        { id: "h_bottom_panel1", x1: x1, y1: yBottom, x2: round(x2 - creaseBreak), y2: yBottom },
        { id: "h_bottom_panel2", x1: round(x2 + creaseBreak), y1: yBottom, x2: round(x3 - creaseBreak), y2: yBottom },
        { id: "h_bottom_panel3", x1: round(x3 + creaseBreak), y1: yBottom, x2: round(x4 - creaseBreak), y2: yBottom },
        { id: "h_bottom_panel4", x1: round(x4 + creaseBreak), y1: yBottom, x2: x5, y2: yBottom },
        ...pair1.creases,
        ...pair2.creases,
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
        L ${x5},${round(yBottom - safeGlue)}
        L ${x4},${yBottom}
        ${pair2.path}
        ${pair1.path}
        Z
      `);
      trimReliefPaths = [
        cleanPath(`M ${round(x1 + tuckSideRelief)},${tuckShoulderY} H ${round(x1 + tuckRadius - 0.5)} Q ${round(x1 + tuckRadius)},${tuckShoulderY} ${round(x1 + tuckRadius)},${round(topScoreY + 0.5)}`),
        cleanPath(`M ${round(x2 - tuckSideRelief)},${tuckShoulderY} H ${round(x2 - tuckRadius + 0.5)} Q ${round(x2 - tuckRadius)},${tuckShoulderY} ${round(x2 - tuckRadius)},${round(topScoreY + 0.5)}`),
      ];
      creaseLines = [
        { id: "v_p4_p1", x1, y1: topNarrow, x2: x1, y2: yBottom },
        { id: "v_p1_p2", x1: x2, y1: topWide, x2: x2, y2: yBottom },
        { id: "v_p2_p3", x1: x3, y1: topNarrow, x2: x3, y2: yBottom },
        { id: "v_p3_glue", x1: x4, y1: topNarrow, x2: x4, y2: yBottom },
        { id: "top_dust_panel4", x1: round(x0 + 0.3 * sScale), y1: topNarrow, x2: x1, y2: topNarrow },
        { id: "top_tuck_panel1", x1, y1: topWide, x2, y2: topWide },
        { id: "top_dust_panel2", x1: round(x2 + 1.066 * sScale), y1: topNarrow, x2: round(x3 - 0.3 * sScale), y2: topNarrow },
        { id: "top_tuck_score", x1: round(x1 + tuckRadius), y1: topScoreY, x2: round(x2 - tuckRadius), y2: topScoreY },
        { id: "h_bottom_typeB_panel4", x1: x0, y1: yBottom, x2: round(x1 - creaseBreak), y2: yBottom },
        { id: "h_bottom_typeB_panel1", x1: round(x1 + creaseBreak), y1: yBottom, x2: round(x2 - creaseBreak), y2: yBottom },
        { id: "h_bottom_typeB_panel2", x1: round(x2 + creaseBreak), y1: yBottom, x2: round(x3 - creaseBreak), y2: yBottom },
        { id: "h_bottom_typeB_panel3", x1: round(x3 + creaseBreak), y1: yBottom, x2: x4, y2: yBottom },
        ...pair1.creases,
        ...pair2.creases,
      ];
    }

    // Guides for both
    guideLines = [
      { id: "guide_first_base", x1: 0, y1: yFirstBase, x2: x5, y2: yFirstBase },
      { id: "guide_deep_base", x1: 0, y1: yDeepBase, x2: x5, y2: yDeepBase },
      { id: "guide_pair1_center", x1: round(x1 + halfL), y1: yBottom - 8, x2: round(x1 + halfL), y2: yDeepBase + 5 },
      { id: "guide_pair2_center", x1: round(x3 + halfL), y1: yBottom - 8, x2: round(x3 + halfL), y2: yDeepBase + 5 },
    ];

    return {
      isTypeA, designW: round(x5), designH: round(yDeepBase + 10), trimPath, trimReliefPaths, creaseLines, guideLines,
      actualL: safeL, actualW: safeW, actualH: safeH, actualA, actualB,
      suggestedA, suggestedB, halfW, actualBottomExtra, bottomDepth, warnings,
    };
  }, [dim, dielineType]);

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
  <title>Crash Lock Bottom Type ${dielineType} — ${dim.L}x${dim.W}x${dim.H}mm</title>
  <g id="Layer_Cut" inkscape:label="Cut Lines" inkscape:groupmode="layer">
    <path id="Trim_Main" d="${g.trimPath}" fill="none" stroke="#1a2cb0" stroke-width="0.35" stroke-linejoin="round" stroke-linecap="butt" vector-effect="non-scaling-stroke" />
${g.trimReliefPaths.map((d, i) => `    <path id="Trim_Relief_${i + 1}" d="${d}" fill="none" stroke="#1a2cb0" stroke-width="0.35" stroke-linejoin="round" stroke-linecap="butt" vector-effect="non-scaling-stroke" />`).join("\n")}
  </g>
  <g id="Layer_Crease" inkscape:label="Crease Lines" inkscape:groupmode="layer">
${g.creaseLines.map((l) => `    <line id="${l.id}" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" fill="none" stroke="#ff0000" stroke-width="0.25" stroke-linecap="butt" vector-effect="non-scaling-stroke" />`).join("\n")}
  </g>
</svg>`;
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `crash_lock_type${dielineType}_${dim.L}x${dim.W}x${dim.H}mm.svg`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [g, dim, dielineType]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const inputFields = [
    ["L", "Internal Length"], ["W", "Internal Width"], ["H", "Internal Height"],
    ["t", "Board Thickness"], ["glue", "Glue Flap Width"],
    ["A", "Top Tuck Flap (A)"], ["B", "Top Dust Flap (B)"],
    ["bottomExtra", "Bottom Base Extra"],
  ];

  return (
    <div style={{ padding: 24, display: "flex", gap: 24, fontFamily: "system-ui, sans-serif", backgroundColor: "#f0f2f5", minHeight: "100vh" }}>
      <div style={{ width: 300, background: "#fff", borderRadius: 12, padding: 24, height: "fit-content", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: "#1a1a2e", fontSize: 15 }}>📦 Dieline Setup</h3>
          <span style={{ fontSize: 11, color: "#2e7d32", background: "#e8f5e9", padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>Crash Lock v4</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dieline Configuration</label>
          <div style={{ display: "flex", gap: 6 }}>
            {["A", "B"].map((type) => (
              <button 
                key={type} onClick={() => setDielineType(type)}
                style={{ flex: 1, padding: "8px 0", border: "1px solid", borderColor: dielineType === type ? "#1565c0" : "#ddd", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700, background: dielineType === type ? "#1565c0" : "#fff", color: dielineType === type ? "#fff" : "#555" }}>
                TYPE {type}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Unit System</label>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(UNIT_CONFIGS).map(([key]) => (
              <button key={key} onClick={() => setUnit(key)}
                style={{ flex: 1, padding: "6px 0", border: "1px solid", borderColor: unit === key ? "#2e7d32" : "#ddd", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, background: unit === key ? "#2e7d32" : "#fff", color: unit === key ? "#fff" : "#555" }}>
                {key.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: "#f0f2f5", margin: "12px 0" }} />
      
        {inputFields.map(([key, label]) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <label style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 4, color: "#444" }}>
              <span>{label}</span><span style={{ color: "#2e7d32", fontWeight: 400 }}>{unit}</span>
            </label>
            <input type="number" step={unitCfg.step} value={toDisplay(dim[key])} onChange={(e) => update(key, e.target.value)}
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
          </div>
        ))}

        <div style={{ height: 1, background: "#f0f2f5", margin: "14px 0" }} />

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 12 }}>
          <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} style={{ cursor: "pointer" }} /> 
          Show construction guide lines
        </label>

        <button onClick={applySuggestedAB} style={{ width: "100%", padding: 10, border: "1px solid #1565c0", borderRadius: 6, background: "#f0f7ff", color: "#1565c0", fontWeight: 700, cursor: "pointer", marginBottom: 12, fontSize: 13 }}>
          ✨ Apply Suggested A / B
        </button>

        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={() => dispatch({ type: "UNDO" })} disabled={!canUndo} style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 6, cursor: canUndo ? "pointer" : "not-allowed", background: canUndo ? "#fff" : "#f9f9f9", color: canUndo ? "#333" : "#bbb", fontSize: 13 }}>
            ↩ Undo {canUndo && <span style={{ fontSize: 10, color: "#aaa" }}>({history.past.length})</span>}
          </button>
          <button onClick={() => dispatch({ type: "REDO" })} disabled={!canRedo} style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 6, cursor: canRedo ? "pointer" : "not-allowed", background: canRedo ? "#fff" : "#f9f9f9", color: canRedo ? "#333" : "#bbb", fontSize: 13 }}>
            ↪ Redo
          </button>
          <button onClick={() => dispatch({ type: "RESET" })} style={{ padding: "8px 10px", border: "1px solid #ffcccc", borderRadius: 6, cursor: "pointer", background: "#fff5f5", color: "#c62828", fontSize: 13 }}>⊘</button>
        </div>

        <button onClick={downloadSVG} style={{ width: "100%", padding: 11, border: "none", borderRadius: 8, background: "linear-gradient(135deg, #2e7d32, #43a047)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, marginTop: 4 }}>
          ⬇ Download Layered SVG
        </button>

        {g.warnings.length > 0 && (
          <div style={{ marginTop: 14, padding: 12, backgroundColor: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, fontSize: 11, lineHeight: 1.6, color: "#795548" }}>
            <strong>⚠️ Auto-corrected:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{g.warnings.map((msg, i) => <li key={i}>{msg}</li>)}</ul>
          </div>
        )}
      </div>

      <div style={{ flex: 1, background: "#fff", borderRadius: 12, padding: 32, overflow: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1565c0" }}>Crash Lock Bottom (Type {dielineType})</span>
            <span style={{ fontSize: 11, color: "#888", marginLeft: 10 }}>
              Canvas: <strong>{round(unitCfg.fromMM(g.designW))}</strong> × <strong>{round(unitCfg.fromMM(g.designH))}</strong> {unit}
            </span>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
            <span style={{ color: "#1a2cb0" }}>■ Cut Lines</span>
            <span style={{ color: "#ff0000" }}>■ Crease Lines</span>
            {showGuides && <span style={{ color: "#ff66cc" }}>■ Guide Lines</span>}
          </div>
        </div>
        <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width="100%" viewBox={`-5 -5 ${g.designW + 10} ${g.designH + 10}`} style={{ minWidth: 600, display: "block" }}>
          <g id="Layer_Cut">
            <path d={g.trimPath} fill="none" stroke="#1a2cb0" strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="butt" />
            {g.trimReliefPaths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#1a2cb0" strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="butt" />
            ))}
          </g>
          <g id="Layer_Crease">
            {g.creaseLines.map((line) => (
              <line key={line.id} id={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} fill="none" stroke="#ff0000" strokeWidth="0.6" strokeLinecap="butt" />
            ))}
          </g>
          {showGuides && (
            <g id="Layer_Guides">
              {g.guideLines.map((line) => (
                <line key={line.id} id={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} fill="none" stroke="#ff66cc" strokeWidth="0.4" strokeDasharray="3 3" />
              ))}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};

export default AutoBottomCrashLockGenerator;