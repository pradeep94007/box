import React, { useState } from "react";
import AutoBottomCrashLockGenerator from "./CrashBottom";
import AutoBottomComponent from "./Autobottom";
import SnapBottomComponent from "./Snapbottom";
import Rtibox from "./Rtibox";
import DielineGeneratorCombo from "./STE_STI";

const COMPONENTS = {
  // CrashBottom: {
  //   label: "Crash Bottom",
  //   component: AutoBottomCrashLockGenerator,
  // },
  AutoBottom: {
    label: "Auto Bottom",
    component: AutoBottomComponent,
  },
  SnapBottom: {
    label: "Snap Bottom",
    component: SnapBottomComponent,
  },
  Rtibox: {
    label: "RTI Box",
    component: Rtibox,
  },
  STE_STI: {
    label: "STE / STI",
    component: DielineGeneratorCombo,
  },
};

const App = () => {
  const [activeKey, setActiveKey] = useState("CrashBottom");
  const ActiveComponent = COMPONENTS[activeKey].component;

  return (
    <div style={{ fontFamily: "sans-serif", minHeight: "100vh", padding: 16, background: "#f5f7fb" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: "1.8rem" }}>Component Selector</h1>
        <p style={{ margin: "8px 0 0", color: "#555" }}>
          Click a button to render the selected component and view its output.
        </p>
      </header>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {Object.entries(COMPONENTS).map(([key, item]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveKey(key)}
            style={{
              padding: "12px 18px",
              borderRadius: 8,
              border: activeKey === key ? "2px solid #1f6feb" : "1px solid #cbd5e1",
              background: activeKey === key ? "#1f6feb" : "#ffffff",
              color: activeKey === key ? "#ffffff" : "#111827",
              cursor: "pointer",
              boxShadow: activeKey === key ? "0 8px 20px rgba(31,111,235,0.18)" : "0 0 0 0 transparent",
              transition: "all 0.16s ease",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section style={{ padding: 20, borderRadius: 16, background: "#ffffff", boxShadow: "0 12px 40px rgba(0,0,0,0.04)" }}>
        <div style={{ marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <strong style={{ fontSize: "1.1rem" }}>Active component:</strong>
          <span style={{ color: "#334155" }}>{COMPONENTS[activeKey].label}</span>
        </div>

        <div style={{ width: "100%", minHeight: 300, borderRadius: 12, overflow: "hidden", background: "#eef2ff" }}>
          <ActiveComponent />
        </div>
      </section>
    </div>
  );
};

export default App;
