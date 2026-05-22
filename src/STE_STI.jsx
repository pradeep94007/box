import React, { useMemo, useState, useReducer, useRef, useCallback, useEffect } from "react";

const round = (n) => Number(n.toFixed(3));

const UNIT_CONFIGS = {
  mm:   { label: "Millimeters (mm)", toMM: (v) => v,        fromMM: (v) => v,        step: 0.1,   decimals: 1 },
  cm:   { label: "Centimeters (cm)", toMM: (v) => v * 10,   fromMM: (v) => v / 10,   step: 0.01,  decimals: 2 },
  inch: { label: "Inches (in)",      toMM: (v) => v * 25.4, fromMM: (v) => v / 25.4, step: 0.001, decimals: 3 },
};

const INITIAL_DIM = { L: 100, W: 30, H: 92, t: 0.5, glue: 10, A: 10, B: 20 };
const MAX_HISTORY = 50;

const historyReducer = (state, action) => {
  switch (action.type) {
    case "UPDATE": {
      const newDim  = { ...state.present, [action.key]: action.value };
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

const DielineGeneratorCombo = () => {
  const [unit, setUnit] = useState("mm");
  const [dielineType, setDielineType] = useState("A"); // "A" or "B"
  const [history, dispatch] = useReducer(historyReducer, {
    past: [], present: INITIAL_DIM, future: [],
  });
  const svgRef = useRef(null);
  const cutLayerRef = useRef(null);
  const creaseLayerRef = useRef(null);
  const [cutLengthMM, setCutLengthMM] = useState(0);
  const [creaseLengthMM, setCreaseLengthMM] = useState(0);
  const dim = history.present;
  const unitCfg = UNIT_CONFIGS[unit];

  const update = useCallback((key, displayValue) => {
    const mmValue = round(unitCfg.toMM(parseFloat(displayValue) || 0));
    dispatch({ type: "UPDATE", key, value: mmValue });
  }, [unitCfg]);

  const toDisplay = useCallback((mmVal) => round(unitCfg.fromMM(mmVal)), [unitCfg]);

  const g = useMemo(() => {
    const { L, W, H, t, glue, A, B } = dim;
    const warnings = [];

    // ── 1. OUTER / INNER DIMENSION LOGIC ─────────────────────
    // L/W/H input is treated as the final outside box size.
    const outerL = L;
    const outerW = W;
    const outerH = H;

    const innerL = round(Math.max(0, outerL - t));
    const innerW = round(Math.max(0, outerW - t));
    const innerH = round(Math.max(0, outerH - t * 2));

    // Main geometry uses outer/final dimensions.
    const cL = round(outerL);
    const cW = round(outerW);
    const cH = round(outerH);

    // ── 2. VALIDATION ─────────────────────────────────────────
    let safeA = A, safeB = B;
    const maxA = round(cW - 1);
    if (A > maxA) { 
      warnings.push(`Tuck flap (A) capped at ${round(unitCfg.fromMM(maxA))}${unit}.`); 
      safeA = maxA; 
    }
    const maxB = cW; 
if (B > maxB) { 
  warnings.push(`Dust flap (B) capped at box width ${round(unitCfg.fromMM(maxB))}${unit}.`); 
  safeB = maxB; 
}

    // ── 3. MICRO-GEOMETRY ─────────────────────────────────────
    const glueAngleDeg    = 15;
    const glueBevelY      = round(glue * Math.tan((glueAngleDeg * Math.PI) / 180));
    const tuckFront       = safeA;
    const tuckScoreOffset = 0.75;
   
    const tuckShoulderY   = round(tuckFront - tuckScoreOffset);
    const tuckSideRelief  = 0.5;
    const maxTuckRadius   = Math.min(12, safeA * 0.6, cL / 2 - tuckSideRelief - 0.5);
    const tuckRadius      = Math.max(2, maxTuckRadius);
    const dustH           = safeB;
    const sScale          = Math.min(1, cW / 12, safeB / 9);
    const dTinyX          = 0.61  * sScale;
    const dTinyY          = 0.149 * sScale;
    const dReliefX        = 1.186 * sScale;
    const dReliefY        = 0.132 * sScale;
    const dSlopeX         = 3.5   * sScale;
    const dSlopeY         = 3.5   * sScale;
    const dShoulderX      = 2.3   * sScale;
    const dShoulderY      = 8.0   * sScale;
    const dBodyStepX      = 0.3   * sScale;
    const dBodyStepY      = 6.0   * sScale;

    let dTopInsetL = dSlopeX    + Math.max(0, safeB - dSlopeY)    * (1.0   / 19.5);
    let dTopInsetR = dShoulderX + Math.max(0, safeB - dShoulderY) * (4.259 / 15.0);
    const minFlatTop = 1.0;
    
    const clampInsets = (iL, iR, width) => {
      if (iL + iR > width - minFlatTop) {
        const excess = iL + iR - (width - minFlatTop);
        const total  = iL + iR;
        return [iL - excess * (iL / total), iR - excess * (iR / total)];
      }
      return [iL, iR];
    };
    [dTopInsetL, dTopInsetR] = clampInsets(dTopInsetL, dTopInsetR, cW);

    // ── 4. X COORDINATE GRID CONFIGURATION ────────────────────
    let x0, x1, x2, x3, x4, x5;
    if (dielineType === "A") {
      x0 = 0;
      x1 = glue;
      x2 = round(x1 + cL);
      x3 = round(x2 + cW);
      x4 = round(x3 + cL);
      x5 = round(x4 + (cW - t));
    } else {
      x0 = 0;
      x1 = round(cW - t);
      x2 = round(x1 + cL);
      x3 = round(x2 + cW);
      x4 = round(x3 + cL);
      x5 = round(x4 + glue);
    }

    // ── 5. ROW Y COORDINATES ──────────────────────────────────
    const topWide      = round(cW + tuckShoulderY);
    const topNarrow    = round(topWide + t);
    const bottomNarrow = round(topWide + cH);
    const bottomWide   = round(bottomNarrow + t);

    const designW = round(x5);
    const designH = round(bottomWide + topWide);

    const topScoreY       = tuckFront;
    const bottomScoreY    = round(designH - tuckFront);
    const bottomShoulderY = round(designH - tuckShoulderY);

    let trimPath = "";
    let trimReliefPaths = [];
    let creaseLines = [];

    if (dielineType === "A") {
      // ── TYPE A ENGINES (CORRECTED BOTTOM ROW STEP-UP) ───────
      trimPath = `
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
        H ${x4}
        L ${round(x4 + dBodyStepX)},${topNarrow}
        L ${round(x4 + dBodyStepX)},${round(topNarrow - dBodyStepY)}
        L ${round(x4 + dShoulderX)},${round(topNarrow - dShoulderY)}
        L ${round(x4 + dTopInsetR)},${round(topNarrow - dustH)}
        H ${round(x5 - dTopInsetL)}
        L ${round(x5 - dSlopeX)},${round(topNarrow - dSlopeY)}
        L ${x5},${topNarrow}
        
        L ${x5},${bottomNarrow}
        L ${round(x5 - dSlopeX)},${round(bottomNarrow + dSlopeY)}
        L ${round(x5 - dTopInsetL)},${round(bottomNarrow + dustH)}
        H ${round(x4 + dTopInsetR)}
        L ${round(x4 + dShoulderX)},${round(bottomNarrow + dShoulderY)}
        L ${round(x4 + dBodyStepX)},${round(bottomNarrow + dBodyStepY)}
        L ${round(x4 + dBodyStepX)},${bottomNarrow}
        H ${x3}
        
        L ${round(x3 - dBodyStepX)},${bottomNarrow}
        L ${round(x3 - dBodyStepX)},${round(bottomNarrow + dBodyStepY)}
        L ${round(x3 - dShoulderX)},${round(bottomNarrow + dShoulderY)}
        L ${round(x3 - dTopInsetR)},${round(bottomNarrow + dustH)}
        H ${round(x2 + dTopInsetL)}
        L ${round(x2 + dSlopeX)},${round(bottomNarrow + dSlopeY)}
        L ${round(x2 + dReliefX)},${round(bottomNarrow + dReliefY)}
        L ${round(x2 + dTinyX)},${round(bottomNarrow + dTinyY)}
        L ${x2},${bottomNarrow}
        
        L ${x2},${bottomWide}
        L ${x2},${bottomShoulderY}
        L ${round(x2 - tuckSideRelief)},${bottomShoulderY}
        L ${round(x2 - tuckSideRelief)},${round(designH - tuckRadius)}
        A ${tuckRadius},${tuckRadius} 0 0 1 ${round(x2 - tuckSideRelief - tuckRadius)},${designH}
        H ${round(x1 + tuckSideRelief + tuckRadius)}
        A ${tuckRadius},${tuckRadius} 0 0 1 ${round(x1 + tuckSideRelief)},${round(designH - tuckRadius)}
        L ${round(x1 + tuckSideRelief)},${bottomShoulderY}
        L ${x1},${bottomShoulderY}
        L ${x1},${bottomWide}
        L ${x0},${round(bottomNarrow - glueBevelY)}
        Z
      `.replace(/\s+/g, " ").trim();

      trimReliefPaths = [
        `M ${round(x1 + tuckSideRelief)},${tuckShoulderY} H ${round(x1 + tuckRadius - 0.5)} Q ${round(x1 + tuckRadius)},${tuckShoulderY} ${round(x1 + tuckRadius)},${round(topScoreY + 0.5)}`,
        `M ${round(x2 - tuckSideRelief)},${tuckShoulderY} H ${round(x2 - tuckRadius + 0.5)} Q ${round(x2 - tuckRadius)},${tuckShoulderY} ${round(x2 - tuckRadius)},${round(topScoreY + 0.5)}`,
        `M ${round(x1 + tuckSideRelief)},${bottomShoulderY} H ${round(x1 + tuckRadius - 0.5)} Q ${round(x1 + tuckRadius)},${bottomShoulderY} ${round(x1 + tuckRadius)},${round(bottomScoreY - 0.5)}`,
        `M ${round(x2 - tuckSideRelief)},${bottomShoulderY} H ${round(x2 - tuckRadius + 0.5)} Q ${round(x2 - tuckRadius)},${bottomShoulderY} ${round(x2 - tuckRadius)},${round(bottomScoreY - 0.5)}`,
      ];

      creaseLines = [
        { id: "Crease_GlueLeft", x1: x1, y1: topNarrow, x2: x1, y2: bottomNarrow },
        { id: "Crease_Panel1Right", x1: x2, y1: topWide,   x2: x2, y2: bottomWide },
        { id: "Crease_Panel2Right", x1: x3, y1: topNarrow, x2: x3, y2: bottomNarrow },
        { id: "Crease_Panel3Right", x1: x4, y1: topNarrow, x2: x4, y2: bottomNarrow },
        { id: "Crease_TopTuckScore_P1", x1: round(x1 + tuckRadius), y1: topScoreY, x2: round(x2 - tuckRadius), y2: topScoreY },
        { id: "Crease_TopWide_P1", x1: x1, y1: topWide, x2: x2, y2: topWide },
        { id: "Crease_TopDust_Mid1", x1: round(x2 + 1.066 * sScale), y1: topNarrow, x2: round(x3 - 0.3 * sScale), y2: topNarrow },
        { id: "Crease_TopDust_Mid2", x1: round(x4 + 0.3 * sScale), y1: topNarrow, x2: x5, y2: topNarrow },
        { id: "Crease_BotWide_P1", x1: x1, y1: bottomWide, x2: x2, y2: bottomWide },
        { id: "Crease_BotTuckScore_P1", x1: round(x1 + tuckRadius), y1: bottomScoreY, x2: round(x2 - tuckRadius), y2: bottomScoreY },
        { id: "Crease_BotDust_Mid1", x1: round(x2 + 0.3 * sScale), y1: bottomNarrow, x2: round(x3 - 1.066 * sScale), y2: bottomNarrow },
        { id: "Crease_BotDust_Mid2", x1: round(x4 + 1.065 * sScale), y1: bottomNarrow, x2: x5, y2: bottomNarrow },
      ];
    } else {
      // ── TYPE B ENGINES (STRUCTURAL BOTTOM FIXES COMPLETED) ──
      trimPath = `
        M ${x0},${topNarrow}
        L ${round(x0 + dBodyStepX)},${topNarrow}
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
        L ${x5},${round(bottomNarrow - glueBevelY)}
        
        L ${x4},${bottomNarrow}
        H ${x3}

        L ${round(x3 - dBodyStepX)},${bottomNarrow}
        L ${round(x3 - dBodyStepX)},${round(bottomNarrow + dBodyStepY)}
        L ${round(x3 - dShoulderX)},${round(bottomNarrow + dShoulderY)}
        L ${round(x3 - dTopInsetR)},${round(bottomNarrow + dustH)}
        H ${round(x2 + dTopInsetL)}
        L ${round(x2 + dSlopeX)},${round(bottomNarrow + dSlopeY)}
        L ${round(x2 + dReliefX)},${round(bottomNarrow + dReliefY)}
        L ${round(x2 + dTinyX)},${round(bottomNarrow + dTinyY)}
        L ${x2},${bottomNarrow}

        L ${x2},${bottomWide}
        L ${x2},${bottomShoulderY}
        L ${round(x2 - tuckSideRelief)},${bottomShoulderY}
        L ${round(x2 - tuckSideRelief)},${round(designH - tuckRadius)}
        A ${tuckRadius},${tuckRadius} 0 0 1 ${round(x2 - tuckSideRelief - tuckRadius)},${designH}
        H ${round(x1 + tuckSideRelief + tuckRadius)}
        A ${tuckRadius},${tuckRadius} 0 0 1 ${round(x1 + tuckSideRelief)},${round(designH - tuckRadius)}
        L ${round(x1 + tuckSideRelief)},${bottomShoulderY}
        L ${x1},${bottomShoulderY}
        L ${x1},${bottomWide}

        L ${x1},${bottomNarrow}
        L ${round(x1 - dSlopeX)},${round(bottomNarrow + dSlopeY)}
        L ${round(x1 - dTopInsetL)},${round(bottomNarrow + dustH)}
        H ${round(x0 + dTopInsetR)}
        L ${round(x0 + dShoulderX)},${round(bottomNarrow + dShoulderY)}
        L ${round(x0 + dBodyStepX)},${round(bottomNarrow + dBodyStepY)}
        L ${round(x0 + dBodyStepX)},${bottomNarrow}
        L ${x0},${bottomNarrow}
        Z
      `.replace(/\s+/g, " ").trim();

      trimReliefPaths = [
        `M ${round(x1 + tuckSideRelief)},${tuckShoulderY} H ${round(x1 + tuckRadius - 0.5)} Q ${round(x1 + tuckRadius)},${tuckShoulderY} ${round(x1 + tuckRadius)},${round(topScoreY + 0.5)}`,
        `M ${round(x2 - tuckSideRelief)},${tuckShoulderY} H ${round(x2 - tuckRadius + 0.5)} Q ${round(x2 - tuckRadius)},${tuckShoulderY} ${round(x2 - tuckRadius)},${round(topScoreY + 0.5)}`,
        `M ${round(x1 + tuckSideRelief)},${bottomShoulderY} H ${round(x1 + tuckRadius - 0.5)} Q ${round(x1 + tuckRadius)},${bottomShoulderY} ${round(x1 + tuckRadius)},${round(bottomScoreY - 0.5)}`,
        `M ${round(x2 - tuckSideRelief)},${bottomShoulderY} H ${round(x2 - tuckRadius + 0.5)} Q ${round(x2 - tuckRadius)},${bottomShoulderY} ${round(x2 - tuckRadius)},${round(bottomScoreY - 0.5)}`,
      ];

      creaseLines = [
        { id: "Crease_Panel1Right", x1: x1, y1: topNarrow, x2: x1, y2: bottomNarrow },
        { id: "Crease_Panel2Right", x1: x2, y1: topWide,   x2: x2, y2: bottomWide },
        { id: "Crease_Panel3Right", x1: x3, y1: topNarrow, x2: x3, y2: bottomNarrow },
        { id: "Crease_GlueRight",   x1: x4, y1: topNarrow, x2: x4, y2: bottomNarrow },
        { id: "Crease_TopTuckScore_P2", x1: round(x1 + tuckRadius), y1: topScoreY, x2: round(x2 - tuckRadius), y2: topScoreY },
        { id: "Crease_TopWide_P2", x1: x1, y1: topWide, x2: x2, y2: topWide },
        { id: "Crease_TopDust_P1", x1: round(x0 + 0.3 * sScale), y1: topNarrow, x2: x1, y2: topNarrow },
        { id: "Crease_TopDust_P3", x1: round(x2 + 1.066 * sScale), y1: topNarrow, x2: round(x3 - 0.3 * sScale), y2: topNarrow },
        { id: "Crease_BotWide_P2", x1: x1, y1: bottomWide, x2: x2, y2: bottomWide },
        { id: "Crease_BotTuckScore_P2", x1: round(x1 + tuckRadius), y1: bottomScoreY, x2: round(x2 - tuckRadius), y2: bottomScoreY },
        { id: "Crease_BotDust_P1", x1: round(x0 + 0.3 * sScale), y1: bottomNarrow, x2: x1, y2: bottomNarrow },
        { id: "Crease_BotDust_P3", x1: round(x2 + 1.065 * sScale), y1: bottomNarrow, x2: round(x3 - 1.066 * sScale), y2: bottomNarrow },
      ];
    }

    return {
      designW, designH, trimPath, trimReliefPaths, creaseLines,
      warnings, cL, cW, cH, outerL, outerW, outerH, innerL, innerW, innerH, safeA, safeB,
    };
  }, [dim, unit, unitCfg, dielineType]);

  useEffect(() => {
    const getPathLength = (layer) => {
      if (!layer) return 0;
      return Array.from(layer.querySelectorAll("path")).reduce((sum, path) => {
        try {
          return sum + path.getTotalLength();
        } catch {
          return sum;
        }
      }, 0);
    };

    const getLineLength = (layer) => {
      if (!layer) return 0;
      return Array.from(layer.querySelectorAll("line")).reduce((sum, line) => {
        const x1 = parseFloat(line.getAttribute("x1") || "0");
        const y1 = parseFloat(line.getAttribute("y1") || "0");
        const x2 = parseFloat(line.getAttribute("x2") || "0");
        const y2 = parseFloat(line.getAttribute("y2") || "0");
        return sum + Math.hypot(x2 - x1, y2 - y1);
      }, 0);
    };

    setCutLengthMM(round(getPathLength(cutLayerRef.current)));
    setCreaseLengthMM(round(getLineLength(creaseLayerRef.current)));
  }, [g]);

  const downloadSVG = useCallback(() => {
    const svgMarkup = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     version="1.1"
     width="${g.designW + 10}mm" height="${g.designH + 10}mm"
     viewBox="-5 -5 ${g.designW + 10} ${g.designH + 10}">
  <title>ECMA STE Type ${dielineType} — ${dim.L}x${dim.W}x${dim.H}mm</title>
  <g id="Layer_Cut" inkscape:label="Cut Lines" inkscape:groupmode="layer">
    <path id="Trim_Main" d="${g.trimPath}" fill="none" stroke="#1a2cb0" stroke-width="0.23" stroke-linejoin="round" stroke-linecap="butt" vector-effect="non-scaling-stroke" />
${g.trimReliefPaths.map((d, i) => `    <path id="Trim_Relief_${i + 1}" d="${d}" fill="none" stroke="#1a2cb0" stroke-width="0.23" stroke-linejoin="round" stroke-linecap="butt" vector-effect="non-scaling-stroke" />`).join("\n")}
  </g>
  <g id="Layer_Crease" inkscape:label="Crease Lines" inkscape:groupmode="layer">
${g.creaseLines.map((l) => `    <line id="${l.id}" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" fill="none" stroke="#ff0000" stroke-width="0.23" stroke-linecap="butt" vector-effect="non-scaling-stroke" />`).join("\n")}
  </g>
</svg>`;
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `ecma_ste_type${dielineType}_${dim.L}x${dim.W}x${dim.H}mm.svg`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [g, dim, dielineType]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const inputFields = [
    ["L","Length"],["W","Width"],["H","Height"],
    ["t","Board Thickness"],["glue","Glue Flap Width"],
    ["A","Tuck Flap (A)"],["B","Dust Flap (B)"],
  ];

  return (
    <div style={{ padding: 24, display: "flex", gap: 24, fontFamily: "system-ui, sans-serif", backgroundColor: "#f0f2f5", minHeight: "100vh" }}>
      <div style={{ width: 300, background: "#fff", borderRadius: 12, padding: 24, height: "fit-content", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: "#1a1a2e", fontSize: 15 }}>📦 Straight Tuck Inside (STI)</h3>
          
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dieline Configuration</label>
          <div style={{ display: "flex", gap: 6 }}>
            {["A", "B"].map((type) => (
              <button key={type} onClick={() => setDielineType(type)}
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

        {g.warnings.length > 0 && (
          <div style={{ marginTop: 14, padding: 12, backgroundColor: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, fontSize: 11, lineHeight: 1.6, color: "#795548" }}>
            <strong>⚠️ Auto-corrected:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{g.warnings.map((msg, i) => <li key={i}>{msg}</li>)}</ul>
          </div>
        )}

        <div style={{ marginTop: 16, padding: 12, background: "#f1f8e9", borderRadius: 8, fontSize: 11 }}>
          <div style={{ fontWeight: 700, color: "#2e7d32", marginBottom: 6 }}>Box Dimensions</div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#444", marginBottom: 3 }}>
            <span>Outer</span><strong>{round(unitCfg.fromMM(g.outerL))} × {round(unitCfg.fromMM(g.outerW))} × {round(unitCfg.fromMM(g.outerH))} {unit}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#444", marginBottom: 3 }}>
            <span>Inner</span><strong>{round(unitCfg.fromMM(g.innerL))} × {round(unitCfg.fromMM(g.innerW))} × {round(unitCfg.fromMM(g.innerH))} {unit}</strong>
          </div>
        </div>

        <div style={{ height: 1, background: "#f0f2f5", margin: "14px 0" }} />
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={() => dispatch({ type: "UNDO" })} disabled={!canUndo} style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 6, cursor: canUndo ? "pointer" : "not-allowed", background: canUndo ? "#fff" : "#f9f9f9", color: canUndo ? "#333" : "#bbb", fontSize: 13 }}>
            ↩ Undo {canUndo && <span style={{ fontSize: 10, color: "#aaa" }}>({history.past.length})</span>}
          </button>
          <button onClick={() => dispatch({ type: "REDO" })} disabled={!canRedo} style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 6, cursor: canRedo ? "pointer" : "not-allowed", background: canRedo ? "#fff" : "#f9f9f9", color: canRedo ? "#333" : "#bbb", fontSize: 13 }}>
            ↪ Redo
          </button>
          <button onClick={() => dispatch({ type: "RESET" })} style={{ padding: "8px 10px", border: "1px solid #ffcccc", borderRadius: 6, cursor: "pointer", background: "#fff5f5", color: "#c62828", fontSize: 13 }}>⊘</button>
        </div>

        <button onClick={downloadSVG} style={{ width: "100%", padding: 11, border: "none", borderRadius: 8, background: "linear-gradient(135deg, #2e7d32, #43a047)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          ⬇ Download Layered SVG
        </button>
      </div>

      <div style={{ flex: 1, background: "#fff", borderRadius: 12, padding: 32, overflow: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1565c0" }}>Straight Tuck Inside (STI) - Type {dielineType}</span>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4, lineHeight: 1.6 }}>
              Canvas: <strong>{round(unitCfg.fromMM(g.designW))}</strong> × <strong>{round(unitCfg.fromMM(g.designH))}</strong> {unit}
              &nbsp; | &nbsp; Outer Dimension: <strong>{round(unitCfg.fromMM(g.outerL))}</strong> × <strong>{round(unitCfg.fromMM(g.outerW))}</strong> × <strong>{round(unitCfg.fromMM(g.outerH))}</strong> {unit}
              &nbsp; | &nbsp; Inner Dimension: <strong>{round(unitCfg.fromMM(g.innerL))}</strong> × <strong>{round(unitCfg.fromMM(g.innerW))}</strong> × <strong>{round(unitCfg.fromMM(g.innerH))}</strong> {unit}
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
            <span style={{ color: "#1a2cb0" }}>■ Cut Lines ({round(cutLengthMM / 10)} cm)</span>
            <span style={{ color: "#ff0000" }}>■ Crease Lines ({round(creaseLengthMM / 10)} cm)</span>
          </div>
        </div>
        <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width="100%" viewBox={`-5 -5 ${g.designW + 10} ${g.designH + 10}`} style={{ minWidth: 600, display: "block" }}>
          <g id="Layer_Cut" ref={cutLayerRef}>
            <path d={g.trimPath} fill="none" stroke="#1a2cb0" strokeWidth="0.23" strokeLinejoin="round" strokeLinecap="butt" />
            {g.trimReliefPaths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#1a2cb0" strokeWidth="0.23" strokeLinejoin="round" strokeLinecap="butt" />
            ))}
          </g>
          <g id="Layer_Crease" ref={creaseLayerRef}>
            {g.creaseLines.map((line) => (
              <line key={line.id} id={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} fill="none" stroke="#ff0000" strokeWidth="0.23" strokeLinecap="butt" />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
};

export default DielineGeneratorCombo;