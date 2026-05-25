import React, { useEffect, useMemo, useRef, useState } from "react";

const round = (val, dec = 2) => Number(Number(val).toFixed(dec));
const r = (v) => round(v, 2);
const fmm = (v) => r(v).toFixed(2);
const fcm = (v) => (r(v) / 10).toFixed(2);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function buildGeometry(L, W, H, t) {
  L = clamp(Number(L) || 200, 25, 1000);
  W = clamp(Number(W) || 150, 20, 1000);
  H = clamp(Number(H) || 50, 8, 500);
  t = clamp(Number(t) || 0.5, 0.1, 5);

  const pad = 32;
// --------------------------------------------------
// PANEL-WISE BOARD THICKNESS COMPENSATION
// Based on approved scenarios for L=200, W=150, H=50
// --------------------------------------------------
const byThickness = (points) => {
  if (t <= points[0][0]) {
    const [t0, v0] = points[0];
    const [t1, v1] = points[1];
    return round(v0 + ((t - t0) / (t1 - t0)) * (v1 - v0), 2);
  }

  for (let i = 0; i < points.length - 1; i++) {
    const [t0, v0] = points[i];
    const [t1, v1] = points[i + 1];

    if (t <= t1) {
      return round(v0 + ((t - t0) / (t1 - t0)) * (v1 - v0), 2);
    }
  }

  const [t0, v0] = points[points.length - 2];
  const [t1, v1] = points[points.length - 1];
  return round(v0 + ((t - t0) / (t1 - t0)) * (v1 - v0), 2);
};

// Length losses from L
const p1LenLoss = byThickness([
  [0.5, 2],
  [1.0, 3],
  [1.5, 5],
  [2.0, 6],
]);

const p2LenLoss = 0;

const p3LenLoss = byThickness([
  [0.5, 1],
  [1.0, 2],
  [1.5, 3],
  [2.0, 4],
]);

const p4LenLoss = byThickness([
  [0.5, 3],
  [1.0, 5],
  [1.5, 7],
  [2.0, 10],
]);

const p5LenLoss = p3LenLoss;

// Width / height compensation
const p1WidLoss = t;
const p2WidLoss = 0;
const p3WidLoss = 0;
const p4WidGain = byThickness([
  [0.5, 1],
  [1.0, 1],
  [1.5, 1.5],
  [2.0, 2],
]);
const p5WidLoss = 0;

// Final panel sizes
const p1Len = round(Math.max(L - p1LenLoss, 1), 2);
const p1Wid = round(Math.max(H - p1WidLoss, 1), 2);

const p2Len = round(Math.max(L - p2LenLoss, 1), 2);
const p2Wid = round(Math.max(W - p2WidLoss, 1), 2);

const p3Len = round(Math.max(L - p3LenLoss, 1), 2);
const p3Wid = round(Math.max(H - p3WidLoss, 1), 2);

const p4Len = round(Math.max(L - p4LenLoss, 1), 2);
const p4Wid = round(Math.max(W + p4WidGain, 1), 2);

const p5Len = round(Math.max(L - p5LenLoss, 1), 2);
const p5Wid = round(Math.max(H - p5WidLoss, 1), 2);
  // Body panel order: Panel 1 | Panel 2 | Panel 3 | Panel 4 | Panel 5
  // Widths: H-t | W | H | W+t | H
  const x0 = pad;
  const x1 = x0 + p1Wid;
  const x2 = x1 + p2Wid;
  const x3 = x2 + p3Wid;
  const x4 = x3 + p4Wid;
  const x5 = x4 + p5Wid;

  // --------------------------------------------------
  // MAIN BODY VERTICAL CENTER ALIGNMENT
  // --------------------------------------------------
  const yBodyBaseTop = pad + H * 2 + 4;
  const bodyCenterY = yBodyBaseTop + p2Len / 2;

  const yT1 = round(bodyCenterY - p1Len / 2, 2);
  const yT2 = round(bodyCenterY - p2Len / 2, 2);
  const yT3 = round(bodyCenterY - p3Len / 2, 2);
  const yT4 = round(bodyCenterY - p4Len / 2, 2);
  const yT5 = round(bodyCenterY - p5Len / 2, 2);

  const yP1 = round(bodyCenterY + p1Len / 2, 2);
  const yP2 = round(bodyCenterY + p2Len / 2, 2);
  const yP3 = round(bodyCenterY + p3Len / 2, 2);
  const yP4 = round(bodyCenterY + p4Len / 2, 2);
  const yP5 = round(bodyCenterY + p5Len / 2, 2);

  const yTop = yT2;

  // --------------------------------------------------
  // FLAP DEPTH RULES
  // --------------------------------------------------
  const panel1Depth = round(Math.min(L / 2, H * 1.5), 2);
  const panel3Depth = round(Math.min(L / 2, H * 1.5), 2);
  const panel4Depth = round(H - t, 2);
  const panel5Depth = round(H - 7, 2);

  const cut45 = 1;

// Thickness-wise inside movement rules
const deepInset = byThickness([
  [0.5, 2],
  [1.0, 3],
  [1.5, 3],
  [2.0, 3],
]);

const smallJointInset = byThickness([
  [0.5, 0.75],
  [1.0, 0.75],
  [1.5, 1],
  [2.0, 1],
]);

const a1Inset = byThickness([
  [0.5, 1],
  [1.0, 1.5],
  [1.5, 2],
  [2.0, 2],
]);

const panel1Gap = deepInset;


 // --------------------------------------------------
// PANEL 5 A-SERIES
// A1 inside from A follows a1Inset.
// A4/A3 inside from A5 follows smallJointInset.
// --------------------------------------------------
const panel5FoldY = yP4 + smallJointInset;

const A1 = { x: x5 - a1Inset, y: panel5FoldY };
const A = { x: x5, y: A1.y - a1Inset };

const A5 = { x: x4, y: yP4 };
const A4 = { x: x4 + smallJointInset, y: panel5FoldY };

const yA2 = A1.y + panel5Depth;
const A2 = { x: x4 + H * 0.34, y: yA2 };
const A3 = { x: x4 + smallJointInset, y: A1.y + panel5Depth * 0.78 };
// Smooth curve control for A2 → A3
const aCurveCtrlX = round(clamp(H * 0.16, 6, 14), 2);
const aCurveCtrlY = round(clamp(panel5Depth * 0.18, 5, 12), 2);

// --------------------------------------------------
// PANEL 4 B-SERIES
// B4/B1 joint inset follows smallJointInset.
// Deep curve points keep approved curve ratio.
// --------------------------------------------------
const B5 = { x: x3, y: yP4 };

// B2/B3 bottom join points only.
// Move B2/B3 slightly more inside so side curve joins bottom flat smoothly.
const panel4CurveInset = round(clamp(p4Wid * 0.18, 22, 34), 2);

const B4 = { x: x3 + smallJointInset, y: yP4 + smallJointInset };
const B3 = { x: x3 + panel4CurveInset, y: yP4 + panel4Depth };

const B2 = { x: x4 - panel4CurveInset, y: yP4 + panel4Depth };
const B1 = { x: x4 - smallJointInset, y: yP4 + smallJointInset };
// Smooth micro-round controls for B5→B4 and B1→A5
// Controls must stay inside the current smallJointInset, not fixed 1.4 mm.
const bMicroC1 = round(smallJointInset * 0.35, 2);
const bMicroC2 = round(smallJointInset * 0.70, 2);

 // --------------------------------------------------
// PANEL 3 C-SERIES
// C1/C2 inside from B5 follows smallJointInset.
// C4/C3 inside from D1 follows deepInset.
// --------------------------------------------------
const C1 = { x: x3 - smallJointInset, y: B5.y + smallJointInset };
const D1 = { x: x2, y: C1.y };

const C2 = { x: x3 - smallJointInset, y: yP3 + panel3Depth };
const C3 = { x: x2 + deepInset, y: yP3 + panel3Depth };
const C4 = { x: x2 + deepInset, y: D1.y + deepInset };

  // --------------------------------------------------
  // PANEL 2 D-SERIES — STABLE V4 BOARD-THICKNESS RULE
  // --------------------------------------------------
  const D16 = { x: x1, y: yP1 };

  const D2 = { x: x2, y: yP2 + H };
  const D15 = { x: x1, y: yP2 + H };

  const thickBoard = t > 1;

  let flap2Shift = 0;
  if (t > 1 && t <= 1.5) flap2Shift = 3;
  else if (t > 1.5 && t < 2.0) flap2Shift = 4;
  else if (t >= 2.0) flap2Shift = 5;

  const Dx2 = thickBoard ? { x: x2, y: yP2 + H + flap2Shift } : null;
  const Dx15 = thickBoard ? { x: x1, y: yP2 + H + flap2Shift } : null;

  const flapInset = round(t + 0.5, 2);
  const flap2Height = round(H - t, 2);

  const D3 = {
    x: x2 - flapInset,
    y: yP2 + H + flapInset + flap2Shift,
  };

  const D4 = {
    x: x2 - flapInset,
    y: yP2 + H + flap2Shift + flap2Height,
  };

  const D13 = {
    x: x1 + flapInset,
    y: yP2 + H + flap2Shift + flap2Height,
  };

  const D14 = {
    x: x1 + flapInset,
    y: yP2 + H + flapInset + flap2Shift,
  };

  // --------------------------------------------------
  // PANEL 2 BOTTOM LOCK CUTS — D5 TO D12
  // 5-zone placement rule:
  // cut 1 = zone 2
  // cut 2 = zone 4
  // --------------------------------------------------
  const bottomLockOffset = round(2.333 + (4 / 3) * t, 2);

  const bottomLockBaseY = D4.y;
  const bottomLockOutY = round(bottomLockBaseY + bottomLockOffset, 2);

  const lockLineLeftX = D13.x;
  const lockLineRightX = D4.x;
  const lockLineWidth = round(lockLineRightX - lockLineLeftX, 2);

  const targetLockWidth = 25;
  const minLockWidth = 18;

  const zoneWidth = round(lockLineWidth / 5, 2);
  const useTwoBottomLocks = zoneWidth >= minLockWidth;

  const bottomLockWidth = round(
    Math.min(targetLockWidth, Math.max(minLockWidth, zoneWidth)),
    2
  );

  const lockSlopeRun = round(
    Math.min(bottomLockOffset, Math.max(1, bottomLockWidth / 2 - 1)),
    2
  );

  const firstCutCenterX = round(lockLineLeftX + zoneWidth * 1.5, 2);
  const secondCutCenterX = round(lockLineLeftX + zoneWidth * 3.5, 2);
  const singleCutCenterX = round(lockLineLeftX + lockLineWidth / 2, 2);

  const buildBottomLock = (centerX) => ({
    rightBase: {
      x: round(centerX + bottomLockWidth / 2, 2),
      y: bottomLockBaseY,
    },
    rightOut: {
      x: round(centerX + bottomLockWidth / 2 - lockSlopeRun, 2),
      y: bottomLockOutY,
    },
    leftOut: {
      x: round(centerX - bottomLockWidth / 2 + lockSlopeRun, 2),
      y: bottomLockOutY,
    },
    leftBase: {
      x: round(centerX - bottomLockWidth / 2, 2),
      y: bottomLockBaseY,
    },
  });

  const leftLock = buildBottomLock(
    useTwoBottomLocks ? firstCutCenterX : singleCutCenterX
  );

  const rightLock = buildBottomLock(
    useTwoBottomLocks ? secondCutCenterX : singleCutCenterX
  );

  // Left cut group = D9-D12
  const D9 = leftLock.rightBase;
  const D10 = leftLock.rightOut;
  const D11 = leftLock.leftOut;
  const D12 = leftLock.leftBase;

  // Right cut group = D5-D8
  const D5 = rightLock.rightBase;
  const D6 = rightLock.rightOut;
  const D7 = rightLock.leftOut;
  const D8 = rightLock.leftBase;

  const lockSegBottom = useTwoBottomLocks
    ? `
      L ${r(D5.x)} ${r(D5.y)}
      L ${r(D6.x)} ${r(D6.y)}
      L ${r(D7.x)} ${r(D7.y)}
      L ${r(D8.x)} ${r(D8.y)}

      L ${r(D9.x)} ${r(D9.y)}
      L ${r(D10.x)} ${r(D10.y)}
      L ${r(D11.x)} ${r(D11.y)}
      L ${r(D12.x)} ${r(D12.y)}

      L ${r(D13.x)} ${r(D13.y)}
    `
    : `
      L ${r(D5.x)} ${r(D5.y)}
      L ${r(D6.x)} ${r(D6.y)}
      L ${r(D7.x)} ${r(D7.y)}
      L ${r(D8.x)} ${r(D8.y)}

      L ${r(D13.x)} ${r(D13.y)}
    `;

  // --------------------------------------------------
  // PANEL 2 TOP LOCK CUTS — D17 TO D24
  // top offset = bottom offset / 3
  // follows bottom lock decision and centers
  // --------------------------------------------------
  const topLockOffset = round(bottomLockOffset / 3, 2);

  const topLockBaseY = yP2;
  const topLockOutY = round(topLockBaseY - topLockOffset, 2);

  const useTwoTopLocks = useTwoBottomLocks;
  const topLockWidth = bottomLockWidth;

  const topLockSlopeRun = round(
    Math.min(topLockOffset, Math.max(1, topLockWidth / 2 - 1)),
    2
  );

  const firstTopCutCenterX = firstCutCenterX;
  const secondTopCutCenterX = secondCutCenterX;
  const singleTopCutCenterX = singleCutCenterX;

  const buildTopLock = (centerX) => ({
    leftBase: {
      x: round(centerX - topLockWidth / 2, 2),
      y: topLockBaseY,
    },
    leftOut: {
      x: round(centerX - topLockWidth / 2 + topLockSlopeRun, 2),
      y: topLockOutY,
    },
    rightOut: {
      x: round(centerX + topLockWidth / 2 - topLockSlopeRun, 2),
      y: topLockOutY,
    },
    rightBase: {
      x: round(centerX + topLockWidth / 2, 2),
      y: topLockBaseY,
    },
  });

  const topLeftLock = buildTopLock(
    useTwoTopLocks ? firstTopCutCenterX : singleTopCutCenterX
  );

  const topRightLock = buildTopLock(
    useTwoTopLocks ? secondTopCutCenterX : singleTopCutCenterX
  );

  // Left top cut group
  const D18 = topLeftLock.leftBase;
  const D17 = topLeftLock.leftOut;
  const D19 = topLeftLock.rightOut;
  const D20 = topLeftLock.rightBase;

  // Right top cut group
  const D22 = topRightLock.leftBase;
  const D21 = topRightLock.leftOut;
  const D23 = topRightLock.rightOut;
  const D24 = topRightLock.rightBase;

  const topLockPath = useTwoTopLocks
    ? `
      M ${r(D18.x)} ${r(D18.y)}
      L ${r(D17.x)} ${r(D17.y)}
      L ${r(D19.x)} ${r(D19.y)}
      L ${r(D20.x)} ${r(D20.y)}

      M ${r(D22.x)} ${r(D22.y)}
      L ${r(D21.x)} ${r(D21.y)}
      L ${r(D23.x)} ${r(D23.y)}
      L ${r(D24.x)} ${r(D24.y)}
    `
    : `
      M ${r(D18.x)} ${r(D18.y)}
      L ${r(D17.x)} ${r(D17.y)}
      L ${r(D19.x)} ${r(D19.y)}
      L ${r(D20.x)} ${r(D20.y)}
    `;

  // --------------------------------------------------
// PANEL 1 E-SERIES
// E1/E2 inside from D16 follows deepInset.
// --------------------------------------------------
const E6 = { x: x0, y: yP1 };
const E1 = { x: x1 - deepInset, y: yP1 + deepInset };
const E2 = { x: x1 - deepInset, y: yP2 + panel1Depth };
const E3 = { x: x0, y: yP2 + panel1Depth };

  // --------------------------------------------------
  // TOP MIRROR POINTS
  // --------------------------------------------------
  const mirrorY = (pt, bottomFoldY, topFoldY) => ({
    x: pt.x,
    y: round(topFoldY - (pt.y - bottomFoldY), 2),
  });

  const tE6 = mirrorY(E6, E6.y, yT1);
  const tE1 = mirrorY(E1, E6.y, yT1);
  const tE2 = mirrorY(E2, E6.y, yT1);
  const tE3 = mirrorY(E3, E6.y, yT1);
  const tD16 = mirrorY(D16, D16.y, yT1);

  const tD15 = mirrorY(D15, yP2, yT2);
  const tD14 = mirrorY(D14, yP2, yT2);
  const tD13 = mirrorY(D13, yP2, yT2);
  const tD4 = mirrorY(D4, yP2, yT2);
  const tD3 = mirrorY(D3, yP2, yT2);
  const tD2 = mirrorY(D2, yP2, yT2);

  const tDx2 = thickBoard ? mirrorY(Dx2, yP2, yT2) : null;
  const tDx15 = thickBoard ? mirrorY(Dx15, yP2, yT2) : null;

  const tD5 = mirrorY(D5, yP2, yT2);
  const tD6 = mirrorY(D6, yP2, yT2);
  const tD7 = mirrorY(D7, yP2, yT2);
  const tD8 = mirrorY(D8, yP2, yT2);
  const tD9 = mirrorY(D9, yP2, yT2);
  const tD10 = mirrorY(D10, yP2, yT2);
  const tD11 = mirrorY(D11, yP2, yT2);
  const tD12 = mirrorY(D12, yP2, yT2);

  const tD17 = mirrorY(D17, yP2, yT2);
  const tD18 = mirrorY(D18, yP2, yT2);
  const tD19 = mirrorY(D19, yP2, yT2);
  const tD20 = mirrorY(D20, yP2, yT2);
  const tD21 = mirrorY(D21, yP2, yT2);
  const tD22 = mirrorY(D22, yP2, yT2);
  const tD23 = mirrorY(D23, yP2, yT2);
  const tD24 = mirrorY(D24, yP2, yT2);

  const lockSegTop = useTwoBottomLocks
    ? `
      L ${r(tD12.x)} ${r(tD12.y)}
      L ${r(tD11.x)} ${r(tD11.y)}
      L ${r(tD10.x)} ${r(tD10.y)}
      L ${r(tD9.x)} ${r(tD9.y)}

      L ${r(tD8.x)} ${r(tD8.y)}
      L ${r(tD7.x)} ${r(tD7.y)}
      L ${r(tD6.x)} ${r(tD6.y)}
      L ${r(tD5.x)} ${r(tD5.y)}
    `
    : `
      L ${r(tD8.x)} ${r(tD8.y)}
      L ${r(tD7.x)} ${r(tD7.y)}
      L ${r(tD6.x)} ${r(tD6.y)}
      L ${r(tD5.x)} ${r(tD5.y)}
    `;

  const topLockMirrorPath = useTwoTopLocks
    ? `
      M ${r(tD18.x)} ${r(tD18.y)}
      L ${r(tD17.x)} ${r(tD17.y)}
      L ${r(tD19.x)} ${r(tD19.y)}
      L ${r(tD20.x)} ${r(tD20.y)}

      M ${r(tD22.x)} ${r(tD22.y)}
      L ${r(tD21.x)} ${r(tD21.y)}
      L ${r(tD23.x)} ${r(tD23.y)}
      L ${r(tD24.x)} ${r(tD24.y)}
    `
    : `
      M ${r(tD18.x)} ${r(tD18.y)}
      L ${r(tD17.x)} ${r(tD17.y)}
      L ${r(tD19.x)} ${r(tD19.y)}
      L ${r(tD20.x)} ${r(tD20.y)}
    `;

  const tB5 = mirrorY(B5, B5.y, yT4);
  const tA5 = mirrorY(A5, A5.y, yT4);

  const topInnerFoldY = round(tB5.y - cut45, 2);

  const tC1 = { x: C1.x, y: topInnerFoldY };
  const tD1 = { x: D1.x, y: topInnerFoldY };

  const tC2 = mirrorY(C2, C1.y, topInnerFoldY);
  const tC3 = mirrorY(C3, C1.y, topInnerFoldY);
  const tC4 = mirrorY(C4, D1.y, topInnerFoldY);

  const tB4 = mirrorY(B4, B5.y, yT4);
  const tB3 = mirrorY(B3, B5.y, yT4);
  const tB2 = mirrorY(B2, B5.y, yT4);
  const tB1 = mirrorY(B1, B5.y, yT4);

  const tA4 = { x: A4.x, y: topInnerFoldY };
  const tA1 = { x: A1.x, y: topInnerFoldY };
  const tA3 = mirrorY(A3, A1.y, topInnerFoldY);
  const tA2 = mirrorY(A2, A1.y, topInnerFoldY);
  const tA = mirrorY(A, A1.y, topInnerFoldY);

  // --------------------------------------------------
  // CUT PATHS
  // --------------------------------------------------
  const topMirrorPath = `
    M ${r(tE6.x)} ${r(tE6.y)}

    L ${r(tE3.x)} ${r(tE3.y)}
    L ${r(tE2.x)} ${r(tE2.y)}
    L ${r(tE1.x)} ${r(tE1.y)}
    L ${r(tD16.x)} ${r(tD16.y)}

    L ${r(tD15.x)} ${r(tD15.y)}
    ${thickBoard ? `L ${r(tDx15.x)} ${r(tDx15.y)}` : ""}
    L ${r(tD14.x)} ${r(tD14.y)}
    L ${r(tD13.x)} ${r(tD13.y)}

    ${lockSegTop}

    L ${r(tD4.x)} ${r(tD4.y)}
    L ${r(tD3.x)} ${r(tD3.y)}
    ${thickBoard ? `L ${r(tDx2.x)} ${r(tDx2.y)}` : ""}
    L ${r(tD2.x)} ${r(tD2.y)}

    L ${r(tD1.x)} ${r(tD1.y)}
    L ${r(tC4.x)} ${r(tC4.y)}
    L ${r(tC3.x)} ${r(tC3.y)}
    L ${r(tC2.x)} ${r(tC2.y)}
    L ${r(tC1.x)} ${r(tC1.y)}
    L ${r(tB5.x)} ${r(tB5.y)}

    C ${r(x3 + bMicroC1)} ${r(tB5.y - bMicroC1)}
  ${r(x3 + bMicroC2)} ${r(tB5.y - bMicroC2)}
  ${r(tB4.x)} ${r(tB4.y)}

    C ${r(x3 + p4Wid * 0.08)} ${r(tB5.y - panel4Depth * 0.62)}
      ${r(x3 + p4Wid * 0.06)} ${r(tB5.y - panel4Depth)}
      ${r(tB3.x)} ${r(tB3.y)}

    L ${r(tB2.x)} ${r(tB2.y)}

    C ${r(x4 - p4Wid * 0.06)} ${r(tA5.y - panel4Depth)}
      ${r(x4 - p4Wid * 0.08)} ${r(tA5.y - panel4Depth * 0.62)}
      ${r(tB1.x)} ${r(tB1.y)}

    C ${r(x4 - bMicroC2)} ${r(tA5.y - bMicroC2)}
  ${r(x4 - bMicroC1)} ${r(tA5.y - bMicroC1)}
  ${r(tA5.x)} ${r(tA5.y)}

    L ${r(tA4.x)} ${r(tA4.y)}
    L ${r(tA3.x)} ${r(tA3.y)}

    C ${r(tA3.x)} ${r(tA3.y - aCurveCtrlY)}
  ${r(tA2.x - aCurveCtrlX)} ${r(tA2.y)}
  ${r(tA2.x)} ${r(tA2.y)}

    C ${r(x4 + H * 0.78)} ${r(tA2.y)}
      ${r(x5 - H * 0.03)} ${r(tA1.y - ((yP5 + H * 0.35) - A1.y))}
      ${r(tA1.x)} ${r(tA1.y)}

    L ${r(tA.x)} ${r(tA.y)}
  `;

  const bottomPath = `
    L ${r(A.x)} ${r(A.y)}
    L ${r(A1.x)} ${r(A1.y)}

    C ${r(x5 - H * 0.03)} ${r(yP5 + H * 0.35)}
      ${r(x4 + H * 0.78)} ${r(yA2)}
      ${r(A2.x)} ${r(A2.y)}

    C ${r(A2.x - aCurveCtrlX)} ${r(A2.y)}
  ${r(A3.x)} ${r(A3.y + aCurveCtrlY)}
  ${r(A3.x)} ${r(A3.y)}

    L ${r(A4.x)} ${r(A4.y)}
    L ${r(A5.x)} ${r(A5.y)}

C ${r(x4 - bMicroC1)} ${r(yP4 + bMicroC1)}
  ${r(x4 - bMicroC2)} ${r(yP4 + bMicroC2)}
  ${r(B1.x)} ${r(B1.y)}

    C ${r(x4 - p4Wid * 0.08)} ${r(yP4 + panel4Depth * 0.62)}
      ${r(x4 - p4Wid * 0.06)} ${r(yP4 + panel4Depth)}
      ${r(B2.x)} ${r(B2.y)}

    L ${r(B3.x)} ${r(B3.y)}

    C ${r(x3 + p4Wid * 0.06)} ${r(yP4 + panel4Depth)}
      ${r(x3 + p4Wid * 0.08)} ${r(yP4 + panel4Depth * 0.62)}
      ${r(B4.x)} ${r(B4.y)}

    C ${r(x3 + bMicroC2)} ${r(yP4 + bMicroC2)}
  ${r(x3 + bMicroC1)} ${r(yP4 + bMicroC1)}
  ${r(B5.x)} ${r(B5.y)}

    L ${r(C1.x)} ${r(C1.y)}
    L ${r(C2.x)} ${r(C2.y)}
    L ${r(C3.x)} ${r(C3.y)}
    L ${r(C4.x)} ${r(C4.y)}
    L ${r(D1.x)} ${r(D1.y)}

    L ${r(D2.x)} ${r(D2.y)}
    ${thickBoard ? `L ${r(Dx2.x)} ${r(Dx2.y)}` : ""}
    L ${r(D3.x)} ${r(D3.y)}
    L ${r(D4.x)} ${r(D4.y)}

    ${lockSegBottom}

    L ${r(D14.x)} ${r(D14.y)}
    ${thickBoard ? `L ${r(Dx15.x)} ${r(Dx15.y)}` : ""}
    L ${r(D15.x)} ${r(D15.y)}
    L ${r(D16.x)} ${r(D16.y)}

    L ${r(E1.x)} ${r(E1.y)}
    L ${r(E2.x)} ${r(E2.y)}
    L ${r(E3.x)} ${r(E3.y)}
    L ${r(E6.x)} ${r(E6.y)}
    L ${r(tE6.x)} ${r(tE6.y)}
    Z
  `;

  const fullCutPath = `${topMirrorPath}${bottomPath}`;

  // --------------------------------------------------
  // CREASE PATHS
  // --------------------------------------------------
  const creases = [
    { id: "P1P2", d: `M ${r(tD16.x)} ${r(tD16.y)} L ${r(D16.x)} ${r(D16.y)}` },
    { id: "P2P3", d: `M ${r(tD1.x)} ${r(tD1.y)} L ${r(D1.x)} ${r(D1.y)}` },
    { id: "P3P4", d: `M ${r(tB5.x)} ${r(tB5.y)} L ${r(B5.x)} ${r(B5.y)}` },
    { id: "P4P5", d: `M ${r(tA5.x)} ${r(tA5.y)} L ${r(A5.x)} ${r(A5.y)}` },

    { id: "Bot_P1", d: `M ${r(E6.x)} ${r(E6.y)} L ${r(D16.x)} ${r(D16.y)}` },

    ...(useTwoTopLocks
      ? [
          { id: "Bot_P2_L", d: `M ${r(x1)} ${r(yP2)} L ${r(D18.x)} ${r(yP2)}` },
          { id: "Bot_P2_M", d: `M ${r(D20.x)} ${r(yP2)} L ${r(D22.x)} ${r(yP2)}` },
          { id: "Bot_P2_R", d: `M ${r(D24.x)} ${r(yP2)} L ${r(x2)} ${r(yP2)}` },
        ]
      : [
          { id: "Bot_P2_L", d: `M ${r(x1)} ${r(yP2)} L ${r(D18.x)} ${r(yP2)}` },
          { id: "Bot_P2_R", d: `M ${r(D20.x)} ${r(yP2)} L ${r(x2)} ${r(yP2)}` },
        ]),

    { id: "Bot_P3", d: `M ${r(D1.x)} ${r(D1.y)} L ${r(C1.x)} ${r(C1.y)}` },
    { id: "Bot_P4", d: `M ${r(B5.x)} ${r(B5.y)} L ${r(A5.x)} ${r(A5.y)}` },
    { id: "Bot_P5", d: `M ${r(A4.x)} ${r(A4.y)} L ${r(A1.x)} ${r(A1.y)}` },
    { id: "Bot_P2_div", d: `M ${r(D15.x)} ${r(D15.y)} L ${r(D2.x)} ${r(D2.y)}` },

    ...(thickBoard
      ? [
          {
            id: "Bot_P2_div2",
            d: `M ${r(Dx15.x)} ${r(Dx15.y)} L ${r(Dx2.x)} ${r(Dx2.y)}`,
          },
        ]
      : []),

    { id: "Top_P1", d: `M ${r(tE6.x)} ${r(tE6.y)} L ${r(tD16.x)} ${r(tD16.y)}` },

    ...(useTwoTopLocks
      ? [
          { id: "Top_P2_L", d: `M ${r(x1)} ${r(yT2)} L ${r(tD18.x)} ${r(yT2)}` },
          { id: "Top_P2_M", d: `M ${r(tD20.x)} ${r(yT2)} L ${r(tD22.x)} ${r(yT2)}` },
          { id: "Top_P2_R", d: `M ${r(tD24.x)} ${r(yT2)} L ${r(x2)} ${r(yT2)}` },
        ]
      : [
          { id: "Top_P2_L", d: `M ${r(x1)} ${r(yT2)} L ${r(tD18.x)} ${r(yT2)}` },
          { id: "Top_P2_R", d: `M ${r(tD20.x)} ${r(yT2)} L ${r(x2)} ${r(yT2)}` },
        ]),

    { id: "Top_P3", d: `M ${r(tD1.x)} ${r(tD1.y)} L ${r(tC1.x)} ${r(tC1.y)}` },
    { id: "Top_P4", d: `M ${r(tB5.x)} ${r(tB5.y)} L ${r(tA5.x)} ${r(tA5.y)}` },
    { id: "Top_P5", d: `M ${r(tA4.x)} ${r(tA4.y)} L ${r(tA1.x)} ${r(tA1.y)}` },
    { id: "Top_P2_div", d: `M ${r(tD15.x)} ${r(tD15.y)} L ${r(tD2.x)} ${r(tD2.y)}` },

    ...(thickBoard
      ? [
          {
            id: "Top_P2_div2",
            d: `M ${r(tDx15.x)} ${r(tDx15.y)} L ${r(tDx2.x)} ${r(tDx2.y)}`,
          },
        ]
      : []),
  ];

  // --------------------------------------------------
  // CANVAS SIZE
  // --------------------------------------------------
  const maxY = Math.max(
    yP1,
    yP2,
    yP3,
    yP4,
    yP5,
    A2.y,
    B2.y,
    B3.y,
    C2.y,
    C3.y,
    D4.y,
    D13.y,
    bottomLockOutY,
    E2.y,
    E3.y
  );

  const designW = round(x5 - x0, 2);
  const designH = round(maxY - yTop, 2);
  const viewW = designW + pad * 2;
  const viewH = maxY + pad;

  // L/H/W guide marks
  const labels = [
    {
      id: "L_Guide",
      text: "L",
      type: "vertical",
      x1: (x1 + x2) / 2,
      y1: yT2 + 12,
      x2: (x1 + x2) / 2,
      y2: yP2 - 12,
      tx: (x1 + x2) / 2 - 12,
      ty: bodyCenterY,
    },
    {
      id: "H_Guide",
      text: "H",
      type: "horizontal",
      x1: x2 + 8,
      y1: bodyCenterY,
      x2: x3 - 8,
      y2: bodyCenterY,
      tx: (x2 + x3) / 2,
      ty: bodyCenterY - 10,
    },
    {
      id: "W_Guide",
      text: "W",
      type: "horizontal",
      x1: x3 + 18,
      y1: bodyCenterY,
      x2: x4 - 18,
      y2: bodyCenterY,
      tx: (x3 + x4) / 2,
      ty: bodyCenterY - 10,
    },
  ];

  return {
    L,
    W,
    H,
    t,

    outerL: L,
    outerW: W,
    outerH: H,

    innerL: round(L - 2 * t, 2),
    innerW: round(W - 2 * t, 2),
    innerH: round(H - t, 2),

    p1Len,
    p1Wid,
    p2Len,
    p2Wid,
    p3Len,
    p3Wid,
    p4Len,
    p4Wid,
    p5Len,
    p5Wid,

    designW,
    designH,
    viewW,
    viewH,

    fullCutPath,
    topLockPath,
    topLockMirrorPath,
    creases,
    labels,

    panelInfo: [
      { name: "Panel 1", len: p1Len, wid: p1Wid },
      { name: "Panel 2", len: p2Len, wid: p2Wid },
      { name: "Panel 3", len: p3Len, wid: p3Wid },
      { name: "Panel 4", len: p4Len, wid: p4Wid },
      { name: "Panel 5", len: p5Len, wid: p5Wid },
      { name: "Canvas", len: designH, wid: designW, canvas: true },
    ],
  };
}

const UNIT_OPTIONS = [
  { key: "mm", label: "MM", factor: 1 },
  { key: "cm", label: "CM", factor: 10 },
  { key: "inch", label: "INCH", factor: 25.4 },
];

const getUnitFactor = (unit) => {
  const found = UNIT_OPTIONS.find((u) => u.key === unit);
  return found ? found.factor : 1;
};

const getUnitLabel = (unit) => {
  const found = UNIT_OPTIONS.find((u) => u.key === unit);
  return found ? found.label.toLowerCase() : "mm";
};

const toDisplayUnit = (mmValue, unit) => {
  return mmValue / getUnitFactor(unit);
};

const toMM = (displayValue, unit) => {
  return displayValue * getUnitFactor(unit);
};

const formatInputValue = (mmValue, unit) => {
  const v = toDisplayUnit(mmValue, unit);
  const dec = unit === "inch" ? 3 : unit === "cm" ? 2 : 2;
  return String(Number(v.toFixed(dec)));
};

function Field({ label, valueMM, onChangeMM, unit, minMM = 0.1, stepMM = 1 }) {
  const unitLabel = getUnitLabel(unit);
  const displayValue = formatInputValue(valueMM, unit);
  const stepValue = toDisplayUnit(stepMM, unit);
  const minValue = toDisplayUnit(minMM, unit);

  const handleChange = (e) => {
    const raw = e.target.value;

    if (raw === "") {
      onChangeMM(0);
      return;
    }

    const numericValue = parseFloat(raw) || 0;
    const mmValue = toMM(numericValue, unit);

    onChangeMM(round(mmValue, 3));
  };

  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 5,
          fontSize: 13,
          fontWeight: 700,
          color: "#333",
        }}
      >
        <span>{label}</span>
        <span style={{ color: "#2e7d32", fontWeight: 500 }}>
          {unitLabel}
        </span>
      </span>

      <input
        type="number"
        value={displayValue}
        min={minValue}
        step={stepValue}
        onChange={handleChange}
        style={{
          width: "100%",
          boxSizing: "border-box",
          border: "1px solid #d9d9d9",
          borderRadius: 7,
          padding: "9px 12px",
          fontSize: 14,
          outline: "none",
          background: "#fff",
        }}
      />
    </label>
  );
}


export default function MailerBox() {
  const [L, setL] = useState(200);
  const [W, setW] = useState(150);
  const [H, setH] = useState(50);
  const [t, setT] = useState(0.5);
  const [showLabels, setShowLabels] = useState(true);
const [unit, setUnit] = useState("mm");
  const [cutLen, setCutLen] = useState(0);
  const [creaseLen, setCreaseLen] = useState(0);


  const g = useMemo(() => buildGeometry(L, W, H, t), [L, W, H, t]);

const dim = (v) => `${formatInputValue(v, unit)} ${getUnitLabel(unit)}`;
const dim2 = (a, b) => `${formatInputValue(a, unit)} × ${formatInputValue(b, unit)} ${getUnitLabel(unit)}`;
const dim3 = (a, b, c) =>
  `${formatInputValue(a, unit)} × ${formatInputValue(b, unit)} × ${formatInputValue(c, unit)} ${getUnitLabel(unit)}`;

  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const getLen = (id) => {
      const el = svgRef.current.querySelector(`#${id}`);
      return el && el.getTotalLength ? el.getTotalLength() : 0;
    };

    const cut =
      getLen("Outer_Trim") +
      getLen("Top_Lock_Cuts") +
      getLen("Top_Lock_Cuts_Mirror");

    let crease = 0;
    g.creases.forEach((c) => {
      crease += getLen(c.id);
    });

    setCutLen(round(cut, 2));
    setCreaseLen(round(crease, 2));
  }, [g]);

  const handleExport = () => {
    const creaseSVG = g.creases
      .map(
        (c) =>
          `<path id="${c.id}" d="${c.d}" fill="none" stroke="#ff0000" stroke-width="0.23" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`
      )
      .join("\n");

    const svgOut = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
  width="${g.viewW}mm"
  height="${g.viewH}mm"
  viewBox="0 0 ${g.viewW} ${g.viewH}">
  <rect width="${g.viewW}" height="${g.viewH}" fill="white"/>
  <g id="crease-layer" data-line-type="crease">
    ${creaseSVG}
  </g>
  <g id="cut-layer" data-line-type="cut">
    <path id="Outer_Trim" d="${g.fullCutPath}" fill="none" stroke="#0000ff" stroke-width="0.23" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <path id="Top_Lock_Cuts" d="${g.topLockPath}" fill="none" stroke="#0000ff" stroke-width="0.23" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <path id="Top_Lock_Cuts_Mirror" d="${g.topLockMirrorPath}" fill="none" stroke="#0000ff" stroke-width="0.23" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </g>
</svg>`;

    const blob = new Blob([svgOut], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `Mailer_${g.L}x${g.W}x${g.H}_t${g.t}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  return (
  <div
    style={{
      minHeight: "100vh",
      background: "#f1f3f6",
      padding: 14,
      color: "#111827",
      fontFamily: "system-ui, sans-serif",
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "400px 1fr",
        gap: 28,
        alignItems: "start",
      }}
    >
      {/* LEFT SIDEBAR */}
      <aside
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 28,
          boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
          minHeight: "calc(100vh - 28px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <span style={{ fontSize: 18 }}>📦</span>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            Mailer Box
          </h1>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "#555",
              letterSpacing: "0.04em",
              marginBottom: 10,
              textTransform: "uppercase",
            }}
          >
            Unit System
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {UNIT_OPTIONS.map((u) => {
              const active = unit === u.key;
              return (
                <button
                  key={u.key}
                  onClick={() => setUnit(u.key)}
                  style={{
                    border: active ? "1px solid #2e7d32" : "1px solid #e0e0e0",
                    background: active ? "#2e7d32" : "#fff",
                    color: active ? "#fff" : "#444",
                    borderRadius: 7,
                    padding: "10px 8px",
                    fontWeight: 800,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {u.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            height: 1,
            background: "#e5e7eb",
            margin: "18px 0",
          }}
        />

        <div style={{ display: "grid", gap: 13 }}>
          <Field label="Length" valueMM={L} onChangeMM={setL} unit={unit} minMM={25} stepMM={1} />
          <Field label="Width" valueMM={W} onChangeMM={setW} unit={unit} minMM={20} stepMM={1} />
          <Field label="Height" valueMM={H} onChangeMM={setH} unit={unit} minMM={8} stepMM={1} />
          <Field label="Board Thickness" valueMM={t} onChangeMM={setT} unit={unit} minMM={0.1} stepMM={0.1} />
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginTop: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            color: "#333",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
          />
          Show L / H / W guide marks
        </label>

        <div
          style={{
            marginTop: 18,
            background: "#f1f8e9",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: "#2e7d32", marginBottom: 10 }}>
            Box Dimensions
          </div>

          <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#444" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span>Outer</span>
              <strong>{dim3(g.outerL, g.outerW, g.outerH)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span>Inner</span>
              <strong>{dim3(g.innerL, g.innerW, g.innerH)}</strong>
            </div>
          </div>
        </div>

        {false && (
          <div
            style={{
              marginTop: 16,
              background: "#f8fafc",
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: "#333", marginBottom: 10 }}>
              Panel Dimensions
            </div>

            {g.panelInfo.slice(0, 5).map((p, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "#444",
                  marginBottom: 4,
                }}
              >
                <span>{p.name}</span>
                <strong>{dim2(p.len, p.wid)}</strong>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            height: 1,
            background: "#e5e7eb",
            margin: "18px 0",
          }}
        />

        <button
          onClick={handleExport}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 9,
            background: "#2f8f3a",
            color: "#fff",
            padding: "13px 16px",
            fontSize: 15,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          ⬇ Download Layered SVG
        </button>
      </aside>

      {/* RIGHT PREVIEW */}
      <main
        style={{
          background: "#fff",
          borderRadius: 10,
          padding: 36,
          minHeight: "calc(100vh - 28px)",
          boxShadow: "0 4px 16px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#1262d6" }}>
              Mailer Box - Roll End Tuck Front V1
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#777" }}>
              Canvas: <strong>{dim2(g.designW, g.designH)}</strong>
              &nbsp; | &nbsp; Outer Dimension: <strong>{dim3(g.outerL, g.outerW, g.outerH)}</strong>
              &nbsp; | &nbsp; Inner Dimension: <strong>{dim3(g.innerL, g.innerW, g.innerH)}</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: 18, alignItems: "center", fontSize: 12 }}>
            <span style={{ color: "#1a2cb0", fontWeight: 600 }}>
              ■ Cut Lines ({fcm(cutLen)} cm)
            </span>
            <span style={{ color: "#ff0000", fontWeight: 600 }}>
              ■ Crease Lines ({fcm(creaseLen)} cm)
            </span>
          </div>
        </div>

        <div
          style={{
            overflow: "auto",
            background: "#fff",
          }}
        >
          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${g.viewW} ${g.viewH}`}
            style={{
              width: "100%",
              height: "auto",
              minHeight: 720,
              display: "block",
            }}
          >
            <rect width={g.viewW} height={g.viewH} fill="#ffffff" />

            <g id="Layer_Crease">
              {g.creases.map((c) => (
                <path
                  key={c.id}
                  id={c.id}
                  d={c.d}
                  fill="none"
                  stroke="#ff0000"
                  strokeWidth="0.23"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>

            <g id="Layer_Cut">
              <path
                id="Outer_Trim"
                d={g.fullCutPath}
                fill="none"
                stroke="#1a2cb0"
                strokeWidth="0.23"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <path
                id="Top_Lock_Cuts"
                d={g.topLockPath}
                fill="none"
                stroke="#1a2cb0"
                strokeWidth="0.23"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <path
                id="Top_Lock_Cuts_Mirror"
                d={g.topLockMirrorPath}
                fill="none"
                stroke="#1a2cb0"
                strokeWidth="0.23"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>

            {showLabels && (
              <g id="Layer_Labels">
                {g.labels.map((lb) => (
                  <g key={lb.id} style={{ pointerEvents: "none" }}>
                    <line
                      x1={r(lb.x1)}
                      y1={r(lb.y1)}
                      x2={r(lb.x2)}
                      y2={r(lb.y2)}
                      stroke="#dc2626"
                      strokeWidth="0.6"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={r(lb.tx)}
                      y={r(lb.ty)}
                      fontSize="18"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#dc2626"
                      fontWeight="700"
                    >
                      {lb.text}
                    </text>
                  </g>
                ))}
              </g>
            )}
          </svg>
        </div>
      </main>
    </div>
  </div>
);
}