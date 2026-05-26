// extras-views.jsx — Templates page · Samples Cards view · Samples Lineage graph

const { Avatar: AvX, Icon: IX, LAB: LX } = window;

/* ─── TEMPLATES (risk workflow library detail) ─────────────────── */

const WORKFLOWS = {
  battery_safety_risk_v1: {
    title: "Battery cell safety risk assessment",
    scope: "system",
    description: "Walks through thermal-runaway, electrolyte handling, voltage / SoC range, and storage risks for cycling batches. Output is the structured risk register that lands on the project or iteration.",
    runs: 14,
    lastRun: "May 21 · 18:22 by JR",
    steps: [
      { id:"sample_context",       type:"gather_context", body:"Pull sample, sample_lineage, recent_experiments, related_artifacts, recent_iteration_pages." },
      { id:"thermal_runaway",      type:"ai_question",    body:"Given the sample chemistry and recent cycling artifacts, assess thermal runaway risk on a 1–5 scale and list mitigations." },
      { id:"electrolyte_handling", type:"ai_question",    body:"Given the electrolyte choice and recent dry-room SOPs, assess handling risk." },
      { id:"voltage_window",       type:"ai_question",    body:"Given the requested cutoff vs validated window, assess voltage / SoC range risk." },
      { id:"mechanical_assembly",  type:"ai_question",    body:"Given the recent assembly history (separator-lot QA, cell builds), assess mechanical risk." },
      { id:"summary",              type:"ai_synthesis",   body:"Combine the four structured ratings into a single risk register. Order by impact severity. Emit flagged_for_PI_review per the rule: any HIGH likelihood + KILLS impact triggers it, OR the AI may raise the flag directly." },
    ],
    outputSchema: {
      flagged_for_PI_review: "boolean",
      items: "list[{ risk:{title,description}, likelihood:'low'|'medium'|'high', impact:{tone,headline,description}, mitigation:string }]",
      summary: "string",
    },
  },
  experimental_risk_v1: {
    title: "Experimental risk assessment",
    scope: "system",
    description: "Generic per-experiment risk: hazards, PPE, instrument scheduling, escalation. Used for syntheses, post-mortems, and instrument-heavy experiments.",
    runs: 22,
    lastRun: "May 24 · 10:15 by SP",
    steps: [
      { id:"experiment_context", type:"gather_context", body:"Pull experiment method, related samples, prior identical experiments, instrument calibration history." },
      { id:"hazards",            type:"ai_question",    body:"What hazards does this experiment introduce? (chemical, electrical, mechanical, thermal)" },
      { id:"ppe_scheduling",     type:"ai_question",    body:"Assess PPE requirements, instrument scheduling conflicts, and operator-experience match." },
      { id:"escalation",         type:"ai_question",    body:"What conditions warrant halting the experiment? Set the abort criteria." },
      { id:"summary",            type:"ai_synthesis",   body:"Output the structured risk register; flag for PI if any HIGH+KILLS." },
    ],
    outputSchema: {
      flagged_for_PI_review: "boolean",
      items: "list[risk_item]",
      abort_criteria: "list[string]",
    },
  },
  project_risk_v1: {
    title: "Project risk assessment",
    scope: "system",
    description: "Scope, novelty, reproducibility, and publication strategy. Used at project kickoff and before major milestones.",
    runs: 6,
    lastRun: "May 11 · 16:42 by MT",
    steps: [
      { id:"project_context", type:"gather_context", body:"Pull project description, prior iterations, related projects, lab equipment availability." },
      { id:"reproducibility", type:"ai_question",    body:"Assess sample-to-sample variation risk." },
      { id:"bandwidth",       type:"ai_question",    body:"Assess team bandwidth / scheduling conflicts with active work." },
      { id:"sourcing",        type:"ai_question",    body:"Assess supplier / sourcing risks for any materials not in-house." },
      { id:"publication",     type:"ai_question",    body:"Assess publication strategy: novelty, target venue, plan B." },
      { id:"summary",         type:"ai_synthesis",   body:"Synthesize into the structured risk register." },
    ],
    outputSchema: {
      flagged_for_PI_review: "boolean",
      items: "list[risk_item]",
      plan_b: "string",
    },
  },
};

function syntaxHighlightJSON(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json
    .replace(/("[^"]+")(\s*:)/g, '<span class="k">$1</span>$2')
    .replace(/:\s*("[^"]*")/g, ': <span class="s">$1</span>')
    .replace(/:\s*(true|false|null|\d+(?:\.\d+)?)/g, ': <span class="n">$1</span>');
}

function TemplatePage({ key: templateKey, setRoute }) {
  const t = WORKFLOWS[templateKey];
  if (!t) return null;

  return (
    <div className="tpl-page">
      <div className="cal-head">
        <h2>{t.title}</h2>
        <span style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--muted-2)", textTransform:"uppercase", letterSpacing:".06em"}}>workflow template</span>
        <div className="right">
          <button className="top-btn"><IX name="history" size={12}/> Run history</button>
          <button className="top-btn primary"><span className="ai-orb" style={{width:11,height:11}}/> Run on…</button>
        </div>
      </div>

      <div className="tpl-head">
        <div className="tpl-meta">
          <span className="tpl-meta-pill" style={{color:"var(--ember)"}}>{templateKey}</span>
          <span>scope · {t.scope}</span>
          <span>·</span>
          <span>{t.runs} runs to date</span>
          <span>·</span>
          <span>last run {t.lastRun}</span>
        </div>
        <p style={{color:"var(--muted)", fontSize:14, lineHeight:1.6, maxWidth:680, marginTop:14, marginBottom:0, textWrap:"pretty"}}>{t.description}</p>
      </div>

      <div className="section-h" style={{marginTop:24}}><h2 style={{fontSize:14}}>Steps</h2><span className="meta">{t.steps.length} total</span></div>
      {t.steps.map((s, i) => (
        <div key={s.id} className="tpl-step">
          <div className="tpl-step-h">
            <span className="tpl-step-n">{i+1}</span>
            <span className="tpl-step-title">{s.id}</span>
            <span className="tpl-step-type">{s.type}</span>
          </div>
          <div className="tpl-step-body">{s.body}</div>
        </div>
      ))}

      <div className="section-h" style={{marginTop:28}}><h2 style={{fontSize:14}}>Output schema</h2><span className="meta">validated · §7.4</span></div>
      <pre className="tpl-json" dangerouslySetInnerHTML={{__html: syntaxHighlightJSON(t.outputSchema)}}/>

      <div className="set-note" style={{marginTop:18}}>
        Loaded from <code>/workflows/{templateKey}.json</code> at server boot. Edit the JSON in the repo to change behavior; admins can re-deploy without a database migration (spec §7.4).
      </div>

      <div style={{height:80}}/>
    </div>
  );
}

/* ─── SAMPLES — Cards view ─────────────────────────────────────── */

function SamplesCardsView({ project, setRoute }) {
  const samples = LX.SAMPLES;
  const byKind = {
    cell:      samples.filter(s => s.kind === "cell"),
    electrode: samples.filter(s => s.kind === "electrode"),
    precursor: samples.filter(s => s.kind === "precursor"),
    derivative:samples.filter(s => s.kind === "derivative"),
  };
  const openS = (id) => setRoute({view:"entity", entityType:"sample", entityId:id, projectId: project.id});

  return (
    <>
      {Object.entries(byKind).filter(([,arr]) => arr.length > 0).map(([k, arr]) => (
        <React.Fragment key={k}>
          <div className="section-h" style={{marginTop:24}}>
            <h2 style={{fontSize:14}}>{k}s</h2>
            <span className="meta">{arr.length} total</span>
          </div>
          <div className="sc-grid">
            {arr.map(s => (
              <div key={s.id} className="sc-card" onClick={() => openS(s.id)}>
                <div className="sc-head">
                  <span className={"pill k-"+s.kind}>{s.kind}</span>
                  <span className={"pill s-"+s.status}><span className={"dot-s "+s.status}/>{s.status}</span>
                </div>
                <div>
                  <div className="sc-id">{s.id}</div>
                  <div className="sc-name">{s.name}</div>
                </div>
                <div className="sc-props">
                  {s.chem && <div><span className="sc-prop-k">chem</span> <span className="sc-prop-v">{s.chem}</span></div>}
                  {s.mass && <div><span className="sc-prop-k">mass</span> <span className="sc-prop-v">{s.mass}</span></div>}
                  {s.cap  && <div><span className="sc-prop-k">capacity</span> <span className="sc-prop-v">{s.cap}</span></div>}
                  {s.load && <div><span className="sc-prop-k">loading</span> <span className="sc-prop-v">{s.load}</span></div>}
                  {s.v    && <div><span className="sc-prop-k">V cutoff</span> <span className="sc-prop-v">{s.v}</span></div>}
                </div>
                <div className="sc-foot">
                  <span>{s.parent ? <>derived from <span style={{color:"var(--ember)"}}>{s.parent}</span></> : "root sample"}</span>
                  <span>Open →</span>
                </div>
              </div>
            ))}
          </div>
        </React.Fragment>
      ))}
    </>
  );
}

/* ─── SAMPLES — Lineage graph ─────────────────────────────────── */

function SamplesLineageView({ project, setRoute }) {
  // Position nodes manually in a tree layout
  // Levels: precursor (col 0), electrode (col 1), cell (col 2), derivative (col 3)
  const COL_W = 220;
  const ROW_H = 64;
  const NODE_W = 180;
  const NODE_H = 46;
  const PAD = 30;

  // Define positions for each sample manually based on the lineage tree we know.
  const positions = {
    // Precursors (column 0)
    "NMC811-pwd-04":    { col:0, row:1 },
    "LPSCl-batch-22":   { col:0, row:5 },
    // Electrodes (column 1)
    "NMC-7B-cathode-r3":{ col:1, row:1 },
    // Cells (column 2)
    "NMC-7B-cell-014":  { col:2, row:0 },
    "NMC-7B-cell-015":  { col:2, row:1 },
    "NMC-7B-cell-016":  { col:2, row:2 },
    // Derivatives (column 3)
    "PM-cell-014-cs":   { col:3, row:0 },
  };

  const samples = LX.SAMPLES;
  const w = COL_W * 4 + PAD * 2;
  const h = ROW_H * 7 + PAD * 2;

  function nodeXY(id) {
    const p = positions[id];
    if (!p) return null;
    return { x: PAD + p.col * COL_W, y: PAD + p.row * ROW_H };
  }

  const openS = (id) => setRoute({view:"entity", entityType:"sample", entityId:id, projectId: project.id});

  // Edges: child.parent → child
  const edges = samples
    .filter(s => s.parent && positions[s.id] && positions[s.parent])
    .map(s => ({ from: s.parent, to: s.id, kind: s.kind === "derivative" ? "derived" : "assembled" }));

  // Color for kind
  const kindColor = (k) => ({
    precursor: "var(--pill-precursor-bg)",
    electrode: "var(--pill-electrode-bg)",
    cell:      "var(--pill-cell-bg)",
    derivative:"var(--pill-deriv-bg)",
  }[k] || "var(--paper-2)");
  const kindBorder = (k) => ({
    precursor: "#6a5a32",
    electrode: "#2c5b6a",
    cell:      "var(--ember)",
    derivative:"#5a3e7a",
  }[k] || "var(--line)");

  return (
    <>
      <div className="lineage-legend">
        <span className="lineage-legend-item"><span className="pill k-precursor">precursor</span> root inputs (powder, electrolyte)</span>
        <span className="lineage-legend-item"><span className="pill k-electrode">electrode</span> coated foils</span>
        <span className="lineage-legend-item"><span className="pill k-cell">cell</span> assembled coin / pouch</span>
        <span className="lineage-legend-item"><span className="pill k-derivative">derivative</span> post-mortem, cross-section</span>
      </div>

      <div className="lineage-card">
        <div className="lineage-svg-wrap">
          <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%", height: h, display:"block"}}>
            {/* Column labels */}
            {["Precursors","Electrodes","Cells","Derivatives"].map((label, i) => (
              <text key={i} x={PAD + i * COL_W + NODE_W/2} y={18}
                    fontFamily="var(--mono)" fontSize="10" fill="var(--muted-2)"
                    textAnchor="middle" letterSpacing=".06em"
                    style={{textTransform:"uppercase"}}>
                {label.toUpperCase()}
              </text>
            ))}

            {/* Edges first so nodes sit on top */}
            {edges.map((e, i) => {
              const from = nodeXY(e.from);
              const to   = nodeXY(e.to);
              if (!from || !to) return null;
              const x1 = from.x + NODE_W;
              const y1 = from.y + NODE_H/2;
              const x2 = to.x;
              const y2 = to.y + NODE_H/2;
              const midX = (x1 + x2) / 2;
              const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
              return (
                <g key={i}>
                  <path d={d} className="ln-edge"/>
                  <text x={midX} y={(y1+y2)/2 - 4} className="ln-edge-label" textAnchor="middle">
                    {e.kind === "derived" ? "DERIVED_FROM" : "ASSEMBLED_INTO"}
                  </text>
                </g>
              );
            })}

            {/* Nodes */}
            {samples.filter(s => positions[s.id]).map(s => {
              const pos = nodeXY(s.id);
              return (
                <g key={s.id} className="ln-node" transform={`translate(${pos.x},${pos.y})`} onClick={() => openS(s.id)} style={{cursor:"default"}}>
                  <rect width={NODE_W} height={NODE_H} rx="6" ry="6"
                    style={{ fill: kindColor(s.kind), stroke: kindBorder(s.kind), strokeWidth: s.status === "failed" ? 1.5 : 1 }}/>
                  {s.status === "failed" && (
                    <line x1="0" y1="0" x2={NODE_W} y2={NODE_H} stroke="var(--bad)" strokeWidth="1" opacity="0.5"/>
                  )}
                  <text x="10" y="18" className="ln-name">{s.id}</text>
                  <text x="10" y="34" className="ln-sub">{(s.chem || s.name).slice(0, 26)}</text>
                  {s.status !== "active" && (
                    <text x={NODE_W - 8} y="14" fontFamily="var(--mono)" fontSize="9"
                          fill={s.status === "failed" ? "var(--bad)" : "var(--muted)"}
                          textAnchor="end" style={{textTransform:"uppercase", letterSpacing:".06em"}}>
                      {s.status}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="set-note" style={{marginTop:14}}>
        Click any node to open the sample page. <code>SampleRelation</code> rows drive this graph (spec §4) — <code>derived_from</code>, <code>assembled_into</code>, <code>split_from</code>, <code>tested_as</code>, <code>duplicate_of</code>.
      </div>
    </>
  );
}

Object.assign(window, { TemplatePage, SamplesCardsView, SamplesLineageView });
