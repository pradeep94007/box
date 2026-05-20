import React, { useMemo, useState, useReducer, useRef, useCallback, useEffect } from "react";
const round = (n) => Number(n.toFixed(3));

// ============================================================
// UNIT CONVERSION SYSTEM
// ============================================================
const UNIT_CONFIGS = {
  mm: { label: "Millimeters (mm)", toMM: (v) => v, fromMM: (v) => v, step: 0.1, decimals: 1 },
  cm: { label: "Centimeters (cm)", toMM: (v) => v * 10, fromMM: (v) => v / 10, step: 0.01, decimals: 2 },
  inch: { label: "Inches (in)", toMM: (v) => v * 25.4, fromMM: (v) => v / 25.4, step: 0.001, decimals: 3 },
};

// ============================================================
// REDUCER FOR UNDO/REDO HISTORY
// ============================================================
const INITIAL_DIM = {
  L: 100,
  W: 30,
  H: 92,
  t: 0.5,
  glue: 10,
  A: 15,
  B: round((30 + 15) / 2), // Default B = (W + A) / 2
};
const MAX_HISTORY = 50;

const historyReducer = (state, action) => {
  switch (action.type) {
    case "UPDATE": {
      const newDim = { ...state.present, [action.key]: action.value };
      const newPast = [...state.past, state.present].slice(-MAX_HISTORY);
      return { past: newPast, present: newDim, future: [] };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      return { past: newPast, present: previous, future: [state.present, ...state.future] };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return { past: [...state.past, state.present], present: next, future: newFuture };
    }
    case "RESET":
      return { past: [...state.past, state.present].slice(-MAX_HISTORY), present: INITIAL_DIM, future: [] };
    default:
      return state;
  }
};

// ============================================================
// MAIN COMPONENT
// ============================================================
const DielineGenerator = () => {
  const [unit, setUnit] = useState("mm");
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
// always in mm internally
  const unitCfg = UNIT_CONFIGS[unit];

  // Convert display value → mm on input change
  const update = useCallback((key, displayValue) => {
    const mmValue = round(unitCfg.toMM(parseFloat(displayValue) || 0));
    dispatch({ type: "UPDATE", key, value: mmValue });
  }, [unitCfg]);

  // Convert mm → display unit for input rendering
  const toDisplay = useCallback((mmVal) =>
    round(unitCfg.fromMM(mmVal)), [unitCfg]);

  // ============================================================
  // GEOMETRY ENGINE
  // ============================================================
  const g = useMemo(() => {
    const { L, W, H, t, glue, A, B } = dim;
    let warnings = [];

   // ----------------------------------------------------------
// 1. OUTER / INNER DIMENSION LOGIC
// ----------------------------------------------------------
// User input is OUTER / final box size.
// Dieline body panels use outer size.
// Inner size is calculated separately for display/reference.
const outerL = round(L);
const outerW = round(W);
const outerH = round(H);

const innerL = round(Math.max(0, L - t));
const innerW = round(Math.max(0, W - t));
const innerH = round(Math.max(0, H - t * 2));

const cL = outerL;
const cW = outerW;
const cH = outerH;

    // ----------------------------------------------------------
    // 2. FLAP VALIDATION
    // ----------------------------------------------------------
    let safeA = A;
    let safeB = B;

    const maxA = round(cW - 1);
    if (A > maxA) {
      warnings.push(`Tuck flap (A) capped at ${round(unitCfg.fromMM(maxA))}${unit} to fit inside box depth.`);
      safeA = maxA;
    }

    const maxB = round(Math.min(cW - 1, cL / 2 - 0.5));
    if (B > maxB) {
      warnings.push(`Dust flap (B) capped at ${round(unitCfg.fromMM(maxB))}${unit} to prevent overlap.`);
      safeB = maxB;
    }

    // ----------------------------------------------------------
    // 3. MICRO-GEOMETRY & TRIGONOMETRY
    // ----------------------------------------------------------
    const glueAngleDeg = 15;
    const glueBevelY = round(glue * Math.tan((glueAngleDeg * Math.PI) / 180));

    const tuckFront = safeA;
    const tuckScoreOffset = 0.75;
    const tuckShoulderY = round(tuckFront - tuckScoreOffset);
    const tuckSideRelief = 0.5;
    const maxTuckRadius = Math.min(12, safeA * 0.6, cL / 2 - tuckSideRelief - 0.5);
    const tuckRadius = Math.max(2, maxTuckRadius);

    const dustH = safeB;
    const sScale = Math.min(1, cW / 12, safeB / 9);

    // Scaled offsets
    const dTinyX        = 0.61  * sScale;
    const dTinyY        = 0.149 * sScale;
    const dReliefX      = 1.186 * sScale;
    const dReliefY      = 0.132 * sScale;
    const dSlopeX       = 3.5   * sScale;
    const dSlopeY       = 3.5   * sScale;
    const dShoulderX    = 2.3   * sScale;
    const dShoulderY    = 8.0   * sScale;
    const dBodyStepX    = 0.3   * sScale;
    const dBodyStepY    = 6.0   * sScale;

    // Slope-preserving trigonometry
    let dTopInsetL   = dSlopeX   + Math.max(0, safeB - dSlopeY)    * (1.0   / 19.5);
    let dTopInsetR   = dShoulderX + Math.max(0, safeB - dShoulderY) * (4.259 / 15.0);

    // FIX: Symmetric bottom insets — mirrors top exactly
    let dBottomInsetL = dTopInsetL;
    let dBottomInsetR = dTopInsetR;

    // Safety constraint
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

    [dTopInsetL,    dTopInsetR]    = clampInsets(dTopInsetL,    dTopInsetR,    cW);
    [dBottomInsetL, dBottomInsetR] = clampInsets(dBottomInsetL, dBottomInsetR, cW);

    // ----------------------------------------------------------
    // 4. PANEL GRID
    // ----------------------------------------------------------
    const x0 = 0;
    const x1 = glue;
    const x2 = round(x1 + cL);
    const x3 = round(x2 + cW);
    const x4 = round(x3 + cL);
    const x5 = round(x4 + (cW - t));

    const topWide      = round(cW + tuckShoulderY);
    const topNarrow    = round(topWide + t);
    const bottomNarrow = round(topWide + cH);
    const bottomWide   = round(bottomNarrow + t);

    const designW = round(x5);
    const designH = round(bottomWide + topWide);

    const topScoreY      = tuckFront;
    const bottomScoreY   = round(designH - tuckFront);
    const bottomShoulderY = round(designH - tuckShoulderY);

    // ----------------------------------------------------------
    // 5. CUT PATH — FULLY SYMMETRIC TOP & BOTTOM TUCK
    // ----------------------------------------------------------
    const trimPath = `
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
      V ${round(bottomNarrow + dBodyStepY)}
      L ${round(x5 - dShoulderX)},${round(bottomNarrow + dShoulderY)}
      L ${round(x5 - dBottomInsetR)},${round(bottomNarrow + dustH)}
      H ${round(x4 + dBottomInsetL)}
      L ${round(x4 + dSlopeX)},${round(bottomNarrow + dSlopeY)}
      L ${round(x4 + dReliefX)},${round(bottomNarrow + dReliefY)}
      L ${x4},${bottomWide}
      L ${x4},${bottomShoulderY}
      L ${round(x4 - tuckSideRelief)},${bottomShoulderY}
      L ${round(x4 - tuckSideRelief)},${round(designH - tuckRadius)}
      A ${tuckRadius},${tuckRadius} 0 0 1 ${round(x4 - tuckSideRelief - tuckRadius)},${designH}
      H ${round(x3 + tuckSideRelief + tuckRadius)}
      A ${tuckRadius},${tuckRadius} 0 0 1 ${round(x3 + tuckSideRelief)},${round(designH - tuckRadius)}
      L ${round(x3 + tuckSideRelief)},${bottomShoulderY}
      L ${x3},${bottomShoulderY}
      L ${x3},${bottomWide}
      L ${round(x3 - dReliefX)},${round(bottomNarrow + dReliefY)}
      L ${round(x3 - dSlopeX)},${round(bottomNarrow + dSlopeY)}
      L ${round(x3 - dBottomInsetL)},${round(bottomNarrow + dustH)}
      H ${round(x2 + dBottomInsetR)}
      L ${round(x2 + dShoulderX)},${round(bottomNarrow + dShoulderY)}
      L ${round(x2 + dBodyStepX)},${round(bottomNarrow + dBodyStepY)}
      L ${round(x2 + dBodyStepX)},${bottomNarrow}
      H ${x1}
      L ${x0},${round(bottomNarrow - glueBevelY)}
      Z
    `.replace(/\s+/g, " ").trim();

    // ----------------------------------------------------------
    // 6. FRICTION LOCK RELIEFS (unchanged)
    // ----------------------------------------------------------
    const trimReliefPaths = [
      `M ${round(x1 + tuckSideRelief)},${tuckShoulderY} H ${round(x1 + tuckRadius - 0.5)} Q ${round(x1 + tuckRadius)},${tuckShoulderY} ${round(x1 + tuckRadius)},${round(topScoreY + 0.5)}`,
      `M ${round(x2 - tuckSideRelief)},${tuckShoulderY} H ${round(x2 - tuckRadius + 0.5)} Q ${round(x2 - tuckRadius)},${tuckShoulderY} ${round(x2 - tuckRadius)},${round(topScoreY + 0.5)}`,
      `M ${round(x3 + tuckSideRelief)},${bottomShoulderY} H ${round(x3 + tuckRadius - 0.5)} Q ${round(x3 + tuckRadius)},${bottomShoulderY} ${round(x3 + tuckRadius)},${round(bottomScoreY - 0.5)}`,
      `M ${round(x4 - tuckSideRelief)},${bottomShoulderY} H ${round(x4 - tuckRadius + 0.5)} Q ${round(x4 - tuckRadius)},${bottomShoulderY} ${round(x4 - tuckRadius)},${round(bottomScoreY - 0.5)}`,
    ];

    // ----------------------------------------------------------
    // 7. CREASE LINES
    // ----------------------------------------------------------
    const creaseLines = [
      { id: "Crease_GlueLeft",       x1: x1, y1: topNarrow,    x2: x1, y2: bottomNarrow },
      { id: "Crease_Panel1Right",    x1: x2, y1: topWide,      x2: x2, y2: bottomNarrow },
      { id: "Crease_Panel2Right",    x1: x3, y1: topNarrow,    x2: x3, y2: bottomWide   },
      { id: "Crease_Panel3Right",    x1: x4, y1: topNarrow,    x2: x4, y2: bottomWide   },
      { id: "Crease_TopDust_Left",   x1: x1, y1: topWide,      x2: x2, y2: topWide      },
      { id: "Crease_TopDust_Mid1",   x1: round(x2 + 1.066 * sScale), y1: topNarrow, x2: round(x3 - 0.3 * sScale),  y2: topNarrow },
      { id: "Crease_TopDust_Mid2",   x1: round(x4 + 0.3 * sScale),   y1: topNarrow, x2: x5,                        y2: topNarrow },
      { id: "Crease_BotDust_Mid1",   x1: round(x2 + 0.3 * sScale),   y1: bottomNarrow, x2: round(x3 - 1.066 * sScale), y2: bottomNarrow },
      { id: "Crease_BotDust_Left",   x1: x3, y1: bottomWide,   x2: x4, y2: bottomWide   },
      { id: "Crease_BotDust_Mid2",   x1: round(x4 + 1.065 * sScale), y1: bottomNarrow, x2: x5, y2: bottomNarrow   },
      { id: "Crease_TopTuckScore",   x1: round(x1 + tuckRadius), y1: topScoreY,    x2: round(x2 - tuckRadius), y2: topScoreY    },
      { id: "Crease_BotTuckScore",   x1: round(x3 + tuckRadius), y1: bottomScoreY, x2: round(x4 - tuckRadius), y2: bottomScoreY },
    ];

// Mathematical calculation for crease line total length
const totalCreaseLengthMM = creaseLines.reduce((sum, line) => {
  return sum + Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
}, 0);

    return {
  designW,
  designH,
  trimPath,
  trimReliefPaths,
  creaseLines,
  warnings,
totalCreaseLengthMM,

  outerL,
  outerW,
  outerH,

  innerL,
  innerW,
  innerH,

  cL,
  cW,
  cH,
  safeA,
  safeB,
};
  }, [dim, unit, unitCfg]);

// Measure cut paths physically from the SVG canvas
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

  // ============================================================
  // SVG EXPORT — LAYERED FOR ILLUSTRATOR / ARTIOS
  // ============================================================
  const downloadSVG = useCallback(() => {
    const svgMarkup = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Reverse Tuck Inside (RTI) Dieline | ${dim.L}x${dim.W}x${dim.H}mm -->
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     version="1.1"
     width="${g.designW + 10}mm"
     height="${g.designH + 10}mm"
     viewBox="-5 -5 ${g.designW + 10} ${g.designH + 10}">

<title>Reverse Tuck Inside (RTI) — ${dim.L}x${dim.W}x${dim.H}mm</title>

  <!-- LAYER 1: CUT / TRIM LINES (Blue) -->
  <g id="Layer_Cut"
     inkscape:label="Cut Lines"
     inkscape:groupmode="layer">
    <path
      id="Trim_Main"
      d="${g.trimPath}"
      fill="none"
      stroke="#1a2cb0"
      stroke-width="0.23"
      stroke-linejoin="round"
      stroke-linecap="butt"
      vector-effect="non-scaling-stroke" />
${g.trimReliefPaths.map((d, i) => `    <path
      id="Trim_Relief_${i + 1}"
      d="${d}"
      fill="none"
      stroke="#1a2cb0"
      stroke-width="0.23"
      stroke-linejoin="round"
      stroke-linecap="butt"
      vector-effect="non-scaling-stroke" />`).join("\n")}
  </g>

  <!-- LAYER 2: CREASE / FOLD LINES (Red) -->
  <g id="Layer_Crease"
     inkscape:label="Crease Lines"
     inkscape:groupmode="layer">
${g.creaseLines.map((l) => `    <line
      id="${l.id}"
      x1="${l.x1}" y1="${l.y1}"
      x2="${l.x2}" y2="${l.y2}"
      fill="none"
      stroke="#ff0000"
      stroke-width="0.23"
      stroke-linecap="butt"
      vector-effect="non-scaling-stroke" />`).join("\n")}
  </g>

</svg>`;

    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ecma_tuck_end_v2_${dim.L}x${dim.W}x${dim.H}mm.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [g, dim]);

  // ============================================================
  // UI
  // ============================================================
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const inputFields = [
  ["L", "Length"],
  ["W", "Width"],
  ["H", "Height"],
  ["t", "Board Thickness"],
  ["glue", "Glue Flap Width"],
  ["A", "Tuck Flap"],
  ["B", "Dust Flap"],
];

  return (
    <div style={{ padding: 24, display: "flex", gap: 24, fontFamily: "system-ui, sans-serif", backgroundColor: "#f0f2f5", minHeight: "100vh" }}>

      {/* ── SETTINGS PANEL ── */}
      <div style={{ width: 300, background: "#fff", borderRadius: 12, padding: 24, height: "fit-content", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: "#1a1a2e", fontSize: 15 }}>📦 Reverse Tuck Inside (RTI)</h3>
          <span style={{ fontSize: 11, color: "#888", background: "#f0f2f5", padding: "2px 8px", borderRadius: 99 }}>ECMA</span>
        </div>

        {/* Unit Selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Unit System
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(UNIT_CONFIGS).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setUnit(key)}
                style={{
                  flex: 1, padding: "6px 0", border: "1px solid",
                  borderColor: unit === key ? "#1a2cb0" : "#ddd",
                  borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: unit === key ? "#1a2cb0" : "#fff",
                  color: unit === key ? "#fff" : "#555",
                  transition: "all 0.15s",
                }}
              >
                {key.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: "#f0f2f5", margin: "12px 0" }} />

        {/* Input Fields */}
        {inputFields.map(([key, label]) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <label style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 4, color: "#444" }}>
              <span>{label}</span>
              <span style={{ color: "#1a2cb0", fontWeight: 400 }}>{unit}</span>
            </label>
            <input
              type="number"
              step={unitCfg.step}
              value={toDisplay(dim[key])}
              onChange={(e) => update(key, e.target.value)}
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box", outline: "none" }}
            />
          </div>
        ))}

        {/* Warnings */}
        {g.warnings.length > 0 && (
          <div style={{ marginTop: 14, padding: 12, backgroundColor: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, fontSize: 11, lineHeight: 1.6, color: "#795548" }}>
            <strong>⚠️ Auto-corrected:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {g.warnings.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          </div>
        )}

        <div style={{ height: 1, background: "#f0f2f5", margin: "14px 0" }} />

        {/* Undo / Redo / Reset */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button
            onClick={() => dispatch({ type: "UNDO" })}
            disabled={!canUndo}
            title="Undo (last change)"
            style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 6, cursor: canUndo ? "pointer" : "not-allowed", background: canUndo ? "#fff" : "#f9f9f9", color: canUndo ? "#333" : "#bbb", fontSize: 13 }}
          >
            ↩ Undo {canUndo && <span style={{ fontSize: 10, color: "#aaa" }}>({history.past.length})</span>}
          </button>
          <button
            onClick={() => dispatch({ type: "REDO" })}
            disabled={!canRedo}
            title="Redo"
            style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 6, cursor: canRedo ? "pointer" : "not-allowed", background: canRedo ? "#fff" : "#f9f9f9", color: canRedo ? "#333" : "#bbb", fontSize: 13 }}
          >
            ↪ Redo
          </button>
          <button
            onClick={() => dispatch({ type: "RESET" })}
            title="Reset to defaults"
            style={{ padding: "8px 10px", border: "1px solid #ffcccc", borderRadius: 6, cursor: "pointer", background: "#fff5f5", color: "#c62828", fontSize: 13 }}
          >
            ⊘
          </button>
        </div>

        {/* Download Button */}
        <button
          onClick={downloadSVG}
          style={{ width: "100%", padding: 11, border: "none", borderRadius: 8, background: "linear-gradient(135deg, #1a2cb0, #2e43d1)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, letterSpacing: "0.02em" }}
        >
          ⬇ Download Layered SVG
        </button>

	{/* Dimension Table */}
<div style={{ marginTop: 16, padding: 12, background: "#f8f9ff", borderRadius: 8, fontSize: 11 }}>
  <div style={{ fontWeight: 700, color: "#1a2cb0", marginBottom: 8 }}>
    Box Dimensions
  </div>

  <div style={{ display: "flex", justifyContent: "space-between", color: "#444", marginBottom: 6 }}>
    <span>Outer Dimension</span>
    <strong>
      {round(unitCfg.fromMM(g.outerL))} × {round(unitCfg.fromMM(g.outerW))} × {round(unitCfg.fromMM(g.outerH))} {unit}
    </strong>
  </div>

  <div style={{ display: "flex", justifyContent: "space-between", color: "#444" }}>
    <span>Inner Dimension</span>
    <strong>
      {round(unitCfg.fromMM(g.innerL))} × {round(unitCfg.fromMM(g.innerW))} × {round(unitCfg.fromMM(g.innerH))} {unit}
    </strong>
  </div>
</div>

  </div>

      {/* ── SVG PREVIEW ── */}
      <div style={{ flex: 1, background: "#fff", borderRadius: 12, padding: 32, overflow: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
  <div>
    Canvas: <strong>{round(unitCfg.fromMM(g.designW))}</strong> ×{" "}
    <strong>{round(unitCfg.fromMM(g.designH))}</strong> {unit}
  </div>

  <div>
    Outer Dimension ={" "}
    <strong>
      {round(unitCfg.fromMM(g.outerL))} × {round(unitCfg.fromMM(g.outerW))} × {round(unitCfg.fromMM(g.outerH))} {unit}
    </strong>
  </div>

  <div>
    Inner Dimension ={" "}
    <strong>
      {round(unitCfg.fromMM(g.innerL))} × {round(unitCfg.fromMM(g.innerW))} × {round(unitCfg.fromMM(g.innerH))} {unit}
    </strong>
  </div>
</div>

         <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
  <span style={{ color: "#1a2cb0" }}>
    ■ Cut Lines <strong>({((cutLengthMM || 0) / 10).toFixed(1)} cm)</strong>
  </span>

  <span style={{ color: "#ff0000" }}>
    ■ Crease Lines <strong>({((g.totalCreaseLengthMM || 0) / 10).toFixed(1)} cm)</strong>
  </span>
</div>
        </div>

        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          viewBox={`-5 -5 ${g.designW + 10} ${g.designH + 10}`}
          style={{ minWidth: 600, display: "block" }}
        >
          {/* Cut Layer */}
          <g id="Layer_Cut" ref={cutLayerRef}>
            <path d={g.trimPath} fill="none" stroke="#1a2cb0" strokeWidth="0.23" strokeLinejoin="round" strokeLinecap="butt" />
            {g.trimReliefPaths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#1a2cb0" strokeWidth="0.23" strokeLinejoin="round" strokeLinecap="butt" />
            ))}
          </g>

          {/* Crease Layer */}
          <g id="Layer_Crease">
            {g.creaseLines.map((line) => (
              <line key={line.id} id={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                fill="none" stroke="#ff0000" strokeWidth="0.23" strokeLinecap="butt" />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
};

export default DielineGenerator;