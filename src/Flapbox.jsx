import React, { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_DIMS = {
  L: 100,
  W: 40,
  H: 120,
  t: 0.5,
  glue: 10,
};

const UNIT_OPTIONS = [
  { value: "mm", label: "mm", factor: 1, decimals: 2 },
  { value: "cm", label: "cm", factor: 10, decimals: 2 },
  { value: "inch", label: "inch", factor: 25.4, decimals: 3 },
];

const getUnit = (unit) => UNIT_OPTIONS.find((item) => item.value === unit) || UNIT_OPTIONS[0];

const clamp = (value, min, max = Number.POSITIVE_INFINITY) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const toDisplayValue = (mmValue, unit) => {
  const u = getUnit(unit);
  return round(mmValue / u.factor, u.decimals);
};

const fromDisplayValue = (displayValue, unit) => {
  const u = getUnit(unit);
  return displayValue * u.factor;
};

const formatMM = (value, decimals = 2) => `${round(value, decimals).toFixed(decimals)} mm`;
const formatCM = (valueMM) => `${round(valueMM / 10, 2).toFixed(2)} cm`;


const APP_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  .ulg-root {
    min-height: 100vh;
    background: #f5f6f8;
    color: #111827;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .ulg-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    gap: 24px;
    align-items: stretch;
  }
  .sidebar {
    background: #ffffff;
    border-radius: 0 18px 18px 0;
    box-shadow: 0 12px 34px rgba(15, 23, 42, 0.10);
    padding: 22px;
    min-height: 100vh;
  }
  .main {
    background: #ffffff;
    margin: 12px 12px 12px 0;
    border-radius: 18px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    padding: 28px 34px;
    min-width: 0;
    overflow: hidden;
  }
  .brandRow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .brandLeft { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .brandIcon { font-size: 18px; line-height: 1; }
  .brandTitle { margin: 0; color: #111827; font-size: 17px; line-height: 1.25; font-weight: 850; }
  .badge {
    border-radius: 8px;
    background: #eef2f7;
    color: #9ca3af;
    padding: 4px 9px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .04em;
  }
  .divider { height: 1px; background: #e5e7eb; margin: 18px 0 16px; }
  .section { margin-top: 18px; }
  .sectionTitle {
    margin-bottom: 9px;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: #374151;
  }
  .unitGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .segBtn {
    border: 1px solid #e5e7eb;
    border-radius: 7px;
    background: #ffffff;
    color: #111827;
    font-size: 12px;
    font-weight: 850;
    text-transform: uppercase;
    padding: 8px 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .segBtn.active { background: #2636c9; border-color: #2636c9; color: #ffffff; }
  .segBtn:hover { border-color: #2636c9; }
  .fieldGrid { display: grid; gap: 14px; }
  .fieldLabelRow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
  .fieldLabel { font-size: 12px; font-weight: 850; color: #111827; }
  .fieldHint { font-size: 11px; color: #2636c9; }
  .inputWrap {
    display: flex;
    align-items: center;
    border: 1px solid #e5e7eb;
    background: #ffffff;
    border-radius: 6px;
    padding: 0 10px;
  }
  .inputWrap:focus-within { border-color: #2636c9; box-shadow: 0 0 0 2px rgba(38,54,201,0.10); }
  .inputWrap input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 8px 0;
    font-size: 13px;
    color: #111827;
  }
  .unitSuffix { margin-left: 8px; color: #2636c9; font-size: 11px; font-weight: 700; }
  .stepText { display: none; }
  .btnRow { display: grid; grid-template-columns: 1fr 1fr 36px; gap: 8px; }
  .ghostBtn {
    border: 1px solid #e5e7eb;
    background: #ffffff;
    color: #111827;
    border-radius: 7px;
    padding: 9px 8px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }
  .ghostBtn:disabled { color: #9ca3af; background: #f9fafb; cursor: not-allowed; }
  .dangerBtn { color: #ef4444; background: #fff7f7; border-color: #fecaca; }
  .downloadFull {
    width: 100%;
    border: 0;
    border-radius: 7px;
    background: #2636c9;
    color: #ffffff;
    padding: 12px 14px;
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 10px 20px rgba(38,54,201,0.18);
  }
  .downloadFull:hover { background: #1d2aa4; }
  .infoBox { border-radius: 8px; background: #f7f8ff; padding: 14px; }
  .infoTitle { margin-bottom: 11px; font-size: 12px; font-weight: 900; color: #2636c9; }
  .dimRows { display: grid; gap: 7px; font-size: 12px; }
  .dimRow { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .dimKey { color: #6b7280; }
  .dimVal { color: #111827; font-weight: 800; text-align: right; }
  .previewTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 16px; }
  .previewDims { color: #8b94a3; font-size: 12px; line-height: 1.75; }
  .previewDims b { color: #6b7280; font-weight: 600; }
  .legend { display: flex; align-items: center; justify-content: flex-end; gap: 20px; font-size: 12px; color: #2636c9; font-weight: 700; }
  .legendItem { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .legendSwatch { width: 8px; height: 8px; display: inline-block; }
  .legendCut { background: #2636c9; }
  .legendCrease { background: #ff0000; }
  .svgStage {
    width: 100%;
    height: calc(100vh - 105px);
    min-height: 620px;
    overflow: auto;
    background: #ffffff;
  }
  .svgStage svg { display: block; min-width: 900px; margin: 0 auto; }
  @media (max-width: 1080px) {
    .ulg-shell { grid-template-columns: 1fr; gap: 12px; }
    .sidebar { border-radius: 0; min-height: auto; }
    .main { margin: 0 12px 12px; }
    .previewTop { flex-direction: column; }
    .legend { justify-content: flex-start; }
  }
`;

const Field = ({
  label,
  valueMM,
  onChangeMM,
  unit,
  minMM = 0,
  maxMM = Number.POSITIVE_INFINITY,
  stepMM = 1,
  hint,
}) => {
  const activeUnit = getUnit(unit);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(toDisplayValue(valueMM, unit)));

  useEffect(() => {
    if (!focused) {
      setDraft(String(toDisplayValue(valueMM, unit)));
    }
  }, [focused, unit, valueMM]);

  const commitDraft = (rawValue) => {
    const normalized = String(rawValue).trim();
    if (normalized === "" || normalized === "." || normalized === "-") return;

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return;

    const nextMM = clamp(fromDisplayValue(parsed, unit), minMM, maxMM);
    onChangeMM(nextMM);
  };

  const handleBlur = () => {
    setFocused(false);

    const parsed = Number(String(draft).trim());
    if (!Number.isFinite(parsed)) {
      setDraft(String(toDisplayValue(valueMM, unit)));
      return;
    }

    const nextMM = clamp(fromDisplayValue(parsed, unit), minMM, maxMM);
    onChangeMM(nextMM);
    setDraft(String(toDisplayValue(nextMM, unit)));
  };

  return (
    <label>
      <div className="fieldLabelRow">
        <span className="fieldLabel">{label}</span>
        {hint ? <span className="fieldHint">{hint}</span> : null}
      </div>
      <div className="inputWrap">
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          onChange={(event) => {
            setDraft(event.target.value);
            commitDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
        <span className="unitSuffix">{activeUnit.label}</span>
      </div>
      <div className="stepText">
        Step: {round(stepMM / activeUnit.factor, activeUnit.decimals)} {activeUnit.label}
      </div>
    </label>
  );
};

const StatCard = ({ label, value, subValue }) => (
  <div className="statCard">
    <div className="statLabel">{label}</div>
    <div className="statValue">{value}</div>
    {subValue ? <div className="statSub">{subValue}</div> : null}
  </div>
);

const lineLength = (line) => Math.hypot(line.x2 - line.x1, line.y2 - line.y1);

const svgLine = (line, stroke) => `
    <line
      id="${line.id}"
      x1="${line.x1}"
      y1="${line.y1}"
      x2="${line.x2}"
      y2="${line.y2}"
      stroke="${stroke}"
      stroke-width="0.23"
      stroke-linecap="butt"
      fill="none"
    />`;

export default function UniversalLockBoxV1() {
  const [dims, setDims] = useState(DEFAULT_DIMS);
  const [unit, setUnit] = useState("mm");
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [cutLengthMM, setCutLengthMM] = useState(0);

  const cutPathRef = useRef(null);

  const updateDim = (key, nextValue) => {
    setDims((current) => {
      const roundedNext = round(nextValue, 4);
      if (Math.abs((current[key] ?? 0) - roundedNext) < 0.0001) return current;

      const next = { ...current, [key]: roundedNext };
      setUndoStack((stack) => [...stack.slice(-39), current]);
      setRedoStack([]);
      return next;
    });
  };

  const resetDims = () => {
    setUndoStack((stack) => [...stack.slice(-39), dims]);
    setRedoStack([]);
    setDims(DEFAULT_DIMS);
  };

  const undo = () => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setRedoStack((redo) => [dims, ...redo.slice(0, 39)]);
      setDims(previous);
      return stack.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[0];
      setUndoStack((undoItems) => [...undoItems.slice(-39), dims]);
      setDims(next);
      return stack.slice(1);
    });
  };

  const geometry = useMemo(() => {
    const outerL = Math.max(25, dims.L);
    const outerW = Math.max(20, dims.W);
    const outerH = Math.max(30, dims.H);
    const safeT = Math.max(0, dims.t);
    const safeGlue = Math.max(6, dims.glue);

    // Outer/final dimensions are used for main dieline geometry.
    const cL = outerL;
    const cW = outerW;
    const cH = outerH;

    // Inner box dimensions are display/reference values.
    const innerL = Math.max(0, outerL - safeT);
    const innerW = Math.max(0, outerW - safeT);
    const innerH = Math.max(0, outerH - safeT * 2);

    // Flap Seal End / Universal Lock body rule.
    // Body order: W-0.5 | L | W | L | Glue
    // Panel 1 uses fixed 0.5 mm side clearance, not board thickness.
    const sidePanelClearance = 0.5;
    const p1 = Math.max(1, cW - sidePanelClearance);
    const p2 = cL;
    const p3 = cW;
    const p4 = cL;
    const pGlue = safeGlue;

    const x0 = 0;
    const x1 = x0 + p1;
    const x2 = x1 + p2;
    const x3 = x2 + p3;
    const x4 = x3 + p4;
    const x5 = x4 + pGlue;

    // Flap heights.
    const flap123 = Math.max(8, cW - 3);
    const flap4 = Math.max(8, cW - 6);

    const sealInset = 1;
    const dustInset = 3;
    const dustCornerR = 4;
    const creaseEndTrim = 0.12; // half of 0.23 mm stroke; avoids red/blue production overlap.

    const yBodyTop = flap123;
    const yBodyBottom = yBodyTop + cH;

    // Body-height compensation rule for Universal / Flap Seal End.
    // Panel 2 closes last, so Panel 2 stays full height.
    // Panel 1, Panel 3, and Panel 4 are reduced and center-aligned.
    const getBodyHeightComp = (thickness) => {
      if (thickness < 0.3) return 0;
      if (thickness <= 0.5) return 1;
      if (thickness <= 1.0) return 2;
      return Math.ceil(thickness * 2);
    };

    const bodyHeightComp = getBodyHeightComp(safeT);
    const bodyHalfComp = bodyHeightComp / 2;

    const yP2Top = yBodyTop;
    const yP2Bottom = yBodyBottom;

    const yP1Top = yBodyTop + bodyHalfComp;
    const yP1Bottom = yBodyBottom - bodyHalfComp;

    const yP3Top = yBodyTop + bodyHalfComp;
    const yP3Bottom = yBodyBottom - bodyHalfComp;

    const yP4Top = yBodyTop + bodyHalfComp;
    const yP4Bottom = yBodyBottom - bodyHalfComp;

    // Flap outer levels measured from each panel's own fold line.
    const yP1TopOuter = yP1Top - flap123;
    const yP1BottomOuter = yP1Bottom + flap123;

    const yP2TopOuter = yP2Top - flap123;
    const yP2BottomOuter = yP2Bottom + flap123;

    const yP3TopOuter = yP3Top - flap123;
    const yP3BottomOuter = yP3Bottom + flap123;

    const yP4TopOuter = yP4Top - flap4;
    const yP4BottomOuter = yP4Bottom + flap4;

    const canvasW = x5;
    const canvasH = yP2BottomOuter;

    const trimPath = [
      // Start at Panel 1 top body joint.
      `M ${x0} ${yP1Top}`,

      // Panel 1 top dust flap.
      `L ${x0 + dustInset} ${yP1Top - dustInset}`,
      `L ${x0 + dustInset} ${yP1TopOuter + dustCornerR}`,
      `Q ${x0 + dustInset} ${yP1TopOuter} ${x0 + dustInset + dustCornerR} ${yP1TopOuter}`,
      `L ${x1 - dustInset - dustCornerR} ${yP1TopOuter}`,
      `Q ${x1 - dustInset} ${yP1TopOuter} ${x1 - dustInset} ${yP1TopOuter + dustCornerR}`,
      `L ${x1 - dustInset} ${yP1Top - dustInset}`,
      `L ${x1} ${yP1Top}`,

      // Step up to Panel 2 full-height fold line.
      `L ${x1} ${yP2Top}`,

      // Panel 2 top seal flap.
      `L ${x1 + sealInset} ${yP2TopOuter}`,
      `L ${x2 - sealInset} ${yP2TopOuter}`,
      `L ${x2} ${yP2Top}`,

      // Step down to Panel 3 compensated fold line.
      `L ${x2} ${yP3Top}`,

      // Panel 3 top dust flap.
      `L ${x2 + dustInset} ${yP3Top - dustInset}`,
      `L ${x2 + dustInset} ${yP3TopOuter + dustCornerR}`,
      `Q ${x2 + dustInset} ${yP3TopOuter} ${x2 + dustInset + dustCornerR} ${yP3TopOuter}`,
      `L ${x3 - dustInset - dustCornerR} ${yP3TopOuter}`,
      `Q ${x3 - dustInset} ${yP3TopOuter} ${x3 - dustInset} ${yP3TopOuter + dustCornerR}`,
      `L ${x3 - dustInset} ${yP3Top - dustInset}`,
      `L ${x3} ${yP3Top}`,

      // Step to Panel 4 compensated fold line.
      `L ${x3} ${yP4Top}`,

      // Panel 4 top seal flap.
      `L ${x3 + sealInset} ${yP4TopOuter}`,
      `L ${x4 - sealInset} ${yP4TopOuter}`,
      `L ${x4} ${yP4Top}`,

      // Glue flap connected to Panel 4 compensated body height.
      `L ${x5} ${yP4Top + 6}`,
      `L ${x5} ${yP4Bottom - 6}`,
      `L ${x4} ${yP4Bottom}`,

      // Panel 4 bottom seal flap.
      `L ${x4 - sealInset} ${yP4BottomOuter}`,
      `L ${x3 + sealInset} ${yP4BottomOuter}`,
      `L ${x3} ${yP4Bottom}`,

      // Panel 3 bottom dust flap.
      `L ${x3 - dustInset} ${yP3Bottom + dustInset}`,
      `L ${x3 - dustInset} ${yP3BottomOuter - dustCornerR}`,
      `Q ${x3 - dustInset} ${yP3BottomOuter} ${x3 - dustInset - dustCornerR} ${yP3BottomOuter}`,
      `L ${x2 + dustInset + dustCornerR} ${yP3BottomOuter}`,
      `Q ${x2 + dustInset} ${yP3BottomOuter} ${x2 + dustInset} ${yP3BottomOuter - dustCornerR}`,
      `L ${x2 + dustInset} ${yP3Bottom + dustInset}`,
      `L ${x2} ${yP3Bottom}`,

      // Step down to Panel 2 full-height bottom fold line.
      `L ${x2} ${yP2Bottom}`,

      // Panel 2 bottom seal flap.
      `L ${x2 - sealInset} ${yP2BottomOuter}`,
      `L ${x1 + sealInset} ${yP2BottomOuter}`,
      `L ${x1} ${yP2Bottom}`,

      // Step up to Panel 1 compensated bottom fold line.
      `L ${x1} ${yP1Bottom}`,

      // Panel 1 bottom dust flap.
      `L ${x1 - dustInset} ${yP1Bottom + dustInset}`,
      `L ${x1 - dustInset} ${yP1BottomOuter - dustCornerR}`,
      `Q ${x1 - dustInset} ${yP1BottomOuter} ${x1 - dustInset - dustCornerR} ${yP1BottomOuter}`,
      `L ${x0 + dustInset + dustCornerR} ${yP1BottomOuter}`,
      `Q ${x0 + dustInset} ${yP1BottomOuter} ${x0 + dustInset} ${yP1BottomOuter - dustCornerR}`,
      `L ${x0 + dustInset} ${yP1Bottom + dustInset}`,
      `L ${x0} ${yP1Bottom}`,

      // Close left body side.
      `L ${x0} ${yP1Top}`,
      "Z",
    ].join(" ");

    const flapCutLines = [];

    const vSideGap = 6;
    const vHeightRatio = 0.65;
    const vAngleDeg = 22.5;
    const vAngleRad = (vAngleDeg * Math.PI) / 180;

    // Assumption: 22.5° is from vertical.
    // This keeps exact angle and centers the pattern.
    // Side gap is minimum 6 mm; actual gap may become a little more after centering.
    const buildVPath = (xStart, xEnd, yA, yB) => {
      const usableW = xEnd - xStart;
      const vHeight = Math.abs(yB - yA);
      const singleVWidth = 2 * vHeight * Math.tan(vAngleRad);
      const vCount = Math.max(1, Math.floor(usableW / singleVWidth));
      const patternW = vCount * singleVWidth;
      const centeredStartX = xStart + (usableW - patternW) / 2;
      const parts = [`M ${centeredStartX} ${yA}`];

      for (let i = 0; i < vCount; i += 1) {
        const baseX = centeredStartX + i * singleVWidth;
        const midX = baseX + singleVWidth / 2;
        const endX = baseX + singleVWidth;
        parts.push(`L ${midX} ${yB}`);
        parts.push(`L ${endX} ${yA}`);
      }

      return parts.join(" ");
    };

    const topSealH = flap4;
    const topVHeight = topSealH * vHeightRatio;
    const topTopMargin = (topSealH - topVHeight) / 2;
    const topVY1 = yP4TopOuter + topTopMargin;
    const topVY2 = topVY1 + topVHeight;
    const topLockPath = buildVPath(x3 + vSideGap, x4 - vSideGap, topVY1, topVY2);

    const bottomSealH = flap4;
    const bottomVHeight = bottomSealH * vHeightRatio;
    const bottomBottomMargin = (bottomSealH - bottomVHeight) / 2;
    const bottomVY1 = yP4BottomOuter - bottomBottomMargin;
    const bottomVY2 = bottomVY1 - bottomVHeight;
    const bottomLockPath = buildVPath(x3 + vSideGap, x4 - vSideGap, bottomVY1, bottomVY2);

    const creaseLines = [
      {
        id: "Crease_P1_P2",
        x1,
        y1: yP1Top + creaseEndTrim,
        x2: x1,
        y2: yP1Bottom - creaseEndTrim,
      },
      {
        id: "Crease_P2_P3",
        x1: x2,
        y1: yP3Top + creaseEndTrim,
        x2,
        y2: yP3Bottom - creaseEndTrim,
      },
      {
        id: "Crease_P3_P4",
        x1: x3,
        y1: yP3Top + creaseEndTrim,
        x2: x3,
        y2: yP3Bottom - creaseEndTrim,
      },
      {
        id: "Crease_P4_Glue",
        x1: x4,
        y1: yP4Top + creaseEndTrim,
        x2: x4,
        y2: yP4Bottom - creaseEndTrim,
      },
      {
        id: "Crease_Top_P1",
        x1: x0 + creaseEndTrim,
        y1: yP1Top,
        x2: x1 - creaseEndTrim,
        y2: yP1Top,
      },
      {
        id: "Crease_Top_P2",
        x1: x1 + creaseEndTrim,
        y1: yP2Top,
        x2: x2 - creaseEndTrim,
        y2: yP2Top,
      },
      {
        id: "Crease_Top_P3",
        x1: x2 + creaseEndTrim,
        y1: yP3Top,
        x2: x3 - creaseEndTrim,
        y2: yP3Top,
      },
      {
        id: "Crease_Top_P4",
        x1: x3 + creaseEndTrim,
        y1: yP4Top,
        x2: x4 - creaseEndTrim,
        y2: yP4Top,
      },
      {
        id: "Crease_Bottom_P1",
        x1: x0 + creaseEndTrim,
        y1: yP1Bottom,
        x2: x1 - creaseEndTrim,
        y2: yP1Bottom,
      },
      {
        id: "Crease_Bottom_P2",
        x1: x1 + creaseEndTrim,
        y1: yP2Bottom,
        x2: x2 - creaseEndTrim,
        y2: yP2Bottom,
      },
      {
        id: "Crease_Bottom_P3",
        x1: x2 + creaseEndTrim,
        y1: yP3Bottom,
        x2: x3 - creaseEndTrim,
        y2: yP3Bottom,
      },
      {
        id: "Crease_Bottom_P4",
        x1: x3 + creaseEndTrim,
        y1: yP4Bottom,
        x2: x4 - creaseEndTrim,
        y2: yP4Bottom,
      },
    ];

    const labels = [
      { text: "P1 W-0.5", x: (x0 + x1) / 2, y: (yP1Top + yP1Bottom) / 2 },
      { text: "P2 L", x: (x1 + x2) / 2, y: (yP2Top + yP2Bottom) / 2 },
      { text: "P3 W", x: (x2 + x3) / 2, y: (yP3Top + yP3Bottom) / 2 },
      { text: "P4 L", x: (x3 + x4) / 2, y: (yP4Top + yP4Bottom) / 2 },
      { text: "Glue", x: (x4 + x5) / 2, y: (yP4Top + yP4Bottom) / 2 },
    ];

    const creaseLengthMM = creaseLines.reduce((total, line) => total + lineLength(line), 0);

    return {
      outerL,
      outerW,
      outerH,
      innerL,
      innerW,
      innerH,
      safeT,
      safeGlue,
      cL,
      cW,
      cH,
      p1,
      p2,
      p3,
      p4,
      pGlue,
      sidePanelClearance,
      bodyHeightComp,
      bodyHalfComp,
      x0,
      x1,
      x2,
      x3,
      x4,
      x5,
      yBodyTop,
      yBodyBottom,
      canvasW,
      canvasH,
      trimPath,
      creaseLines,
      creaseLengthMM,
      flapCutLines,
      topLockPath,
      bottomLockPath,
      labels,
      flap123,
      flap4,
      vSideGap,
      vHeightRatio,
      vAngleDeg,
    };
  }, [dims]);

  useEffect(() => {
    if (!cutPathRef.current) return;

    const mainCutLength = cutPathRef.current.getTotalLength();
    const extraCutLength = geometry.flapCutLines.reduce(
      (total, line) => total + lineLength(line),
      0
    );

    setCutLengthMM(mainCutLength + extraCutLength);
  }, [geometry]);

  const padding = 20;
  const viewBox = `${-padding} ${-padding} ${geometry.canvasW + padding * 2} ${
    geometry.canvasH + padding * 2
  }`;

  const downloadSVG = () => {
    const cutLinesSvg = geometry.flapCutLines.map((line) => svgLine(line, "#2636c9")).join("");
    const creaseLinesSvg = geometry.creaseLines.map((line) => svgLine(line, "#ff0000")).join("");

    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${geometry.canvasW}mm"
  height="${geometry.canvasH}mm"
  viewBox="0 0 ${geometry.canvasW} ${geometry.canvasH}"
>
  <title>Universal Lock / Flap Over Seal Box V1</title>
  <desc>1 SVG unit = 1 mm. Blue = cut. Red = crease. Black dashed = Panel 4 universal lock guide.</desc>

  <g id="Crease_Lines" stroke-linecap="butt" stroke-linejoin="miter">
${creaseLinesSvg}
  </g>

  <g id="Outer_Trim" stroke-linecap="butt" stroke-linejoin="round">
    <path
      id="Outer_Trim_Path"
      d="${geometry.trimPath}"
      fill="none"
      stroke="#2636c9"
      stroke-width="0.23"
    />
  </g>

  <g id="Flap_Cut_Lines" stroke-linecap="butt" stroke-linejoin="miter">
${cutLinesSvg}
  </g>

  <g id="Panel_4_Dashed_V_Lock_Guide" stroke-linecap="round" stroke-linejoin="round">
    <path
      id="Top_V_Lock_Guide"
      d="${geometry.topLockPath || ""}"
      fill="none"
      stroke="#222222"
      stroke-width="0.23"
      stroke-dasharray="3 2"
    />
    <path
      id="Bottom_V_Lock_Guide"
      d="${geometry.bottomLockPath || ""}"
      fill="none"
      stroke="#222222"
      stroke-width="0.23"
      stroke-dasharray="3 2"
    />
  </g>
</svg>`;

    const blob = new Blob([svgContent], {
      type: "image/svg+xml;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Universal_Lock_Flap_Over_Seal_${geometry.outerL}x${geometry.outerW}x${geometry.outerH}_mm.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parameterFields = [
    { key: "L", label: "Length", minMM: 25, stepMM: 1 },
    { key: "W", label: "Width", minMM: 20, stepMM: 1 },
    { key: "H", label: "Height", minMM: 30, stepMM: 1 },
    { key: "t", label: "Board Thickness", minMM: 0, stepMM: 0.1, hint: "0 allowed" },
    { key: "glue", label: "Glue Flap", minMM: 6, stepMM: 1 },
  ];

  return (
    <div className="ulg-root">
      <style>{APP_CSS}</style>
      <div className="ulg-shell">
        <aside className="sidebar">
          <div className="brandRow">
            <div className="brandLeft">
              <span className="brandIcon">📦</span>
              <h1 className="brandTitle">Universal Lock / Flap Over Seal</h1>
            </div>
            <span className="badge">ECMA</span>
          </div>

          <div className="section">
            <div className="sectionTitle">Unit System</div>
            <div className="unitGrid">
              {UNIT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setUnit(option.value)}
                  className={unit === option.value ? "segBtn active" : "segBtn"}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divider" />

          <div className="fieldGrid">
            {parameterFields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                valueMM={dims[field.key]}
                onChangeMM={(value) => updateDim(field.key, value)}
                unit={unit}
                minMM={field.minMM}
                stepMM={field.stepMM}
                hint={field.hint}
              />
            ))}
          </div>

          <div className="section btnRow">
            <button type="button" onClick={undo} disabled={undoStack.length === 0} className="ghostBtn">
              ↩ Undo
            </button>
            <button type="button" onClick={redo} disabled={redoStack.length === 0} className="ghostBtn">
              ↪ Redo
            </button>
            <button type="button" onClick={resetDims} className="ghostBtn dangerBtn" title="Reset">
              ⊘
            </button>
          </div>

          <div className="section">
            <button type="button" onClick={downloadSVG} className="downloadFull">
              ↓ Download Layered SVG
            </button>
          </div>

          <div className="section infoBox">
            <div className="infoTitle">Box Dimensions</div>
            <div className="dimRows">
              <div className="dimRow">
                <span className="dimKey">Outer Dimension</span>
                <span className="dimVal">
                  {round(geometry.outerL, 2)} × {round(geometry.outerW, 2)} × {round(geometry.outerH, 2)} mm
                </span>
              </div>
              <div className="dimRow">
                <span className="dimKey">Inner Dimension</span>
                <span className="dimVal">
                  {round(geometry.innerL, 2)} × {round(geometry.innerW, 2)} × {round(geometry.innerH, 2)} mm
                </span>
              </div>
            </div>
          </div>
        </aside>

        <main className="main">
          <div className="previewTop">
            <div className="previewDims">
              <div>Canvas: {round(geometry.canvasW, 2)} × {round(geometry.canvasH, 2)} mm</div>
              <div>Outer Dimension = {round(geometry.outerL, 2)} × {round(geometry.outerW, 2)} × {round(geometry.outerH, 2)} mm</div>
              <div>Inner Dimension = {round(geometry.innerL, 2)} × {round(geometry.innerW, 2)} × {round(geometry.innerH, 2)} mm</div>
            </div>

            <div className="legend">
              <span className="legendItem">
                <span className="legendSwatch legendCut" /> Cut Lines ({formatCM(cutLengthMM)})
              </span>
              <span className="legendItem" style={{ color: "#ff0000" }}>
                <span className="legendSwatch legendCrease" /> Crease Lines ({formatCM(geometry.creaseLengthMM)})
              </span>
            </div>
          </div>

          <div className="svgStage">
            <svg
              viewBox={viewBox}
              width="100%"
              height="100%"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="Universal Lock / Flap Over Seal Box dieline preview"
            >
              <g>
                {geometry.creaseLines.map((line) => (
                  <line
                    key={line.id}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#ff0000"
                    strokeWidth="0.23"
                    strokeLinecap="butt"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}

                <path
                  ref={cutPathRef}
                  d={geometry.trimPath}
                  fill="none"
                  stroke="#2636c9"
                  strokeWidth="0.23"
                  strokeLinecap="butt"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />

                {geometry.flapCutLines.map((line) => (
                  <line
                    key={line.id}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#2636c9"
                    strokeWidth="0.23"
                    strokeLinecap="butt"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}

                <path
                  d={geometry.topLockPath}
                  fill="none"
                  stroke="#222222"
                  strokeWidth="0.23"
                  strokeDasharray="3 2"
                  vectorEffect="non-scaling-stroke"
                />

                <path
                  d={geometry.bottomLockPath}
                  fill="none"
                  stroke="#222222"
                  strokeWidth="0.23"
                  strokeDasharray="3 2"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            </svg>
          </div>
        </main>
      </div>
    </div>
  );
}
