// create-flows.jsx — Two-page wizard for new project/iteration
// Page 1 = description, Page 2 = AI risk-assessment walkthrough.

const { Avatar: AvC, Icon: IC2, LAB: LC2 } = window;

/* ─── shared primitives ───────────────────────────────────────── */

function WizardStepper({ step, steps }) {
  return (
    <div className="wiz-stepper">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className={"wiz-step" + (i+1 === step ? " on" : (i+1 < step ? " done" : ""))}>
            <span className="wiz-step-n">{i+1 < step ? "✓" : (i+1)}</span>
            <span className="wiz-step-l">{s}</span>
          </div>
          {i < steps.length - 1 && <div className="wiz-step-sep"/>}
        </React.Fragment>
      ))}
    </div>
  );
}

function FormSection({ n, title, hint, children }) {
  return (
    <div className="cf-sect">
      <div className="cf-sect-h">
        {n != null && <span className="cf-sect-n">{n}</span>}
        <div style={{flex:1}}>
          <h3>{title}</h3>
          {hint && <div className="cf-sect-hint">{hint}</div>}
        </div>
      </div>
      <div className="cf-sect-body">{children}</div>
    </div>
  );
}

function FieldRow({ label, sublabel, children }) {
  return (
    <div className="cf-field">
      <div className="cf-field-l">
        <div className="cf-field-label">{label}</div>
        {sublabel && <div className="cf-field-sub">{sublabel}</div>}
      </div>
      <div className="cf-field-r">{children}</div>
    </div>
  );
}

/* ─── AI walkthrough renderer ─────────────────────────────────── */

function WalkthroughStep({ n, kind, title, status, durMs, expanded, onToggle, children }) {
  const kindMeta = {
    gather_context: { l:"gather_context", c:"step-ctx" },
    ai_question:    { l:"ai_question",    c:"step-q"   },
    ai_synthesis:   { l:"ai_synthesis",   c:"step-s"   },
  }[kind] || { l: kind, c: "step-ctx" };
  return (
    <div className={"wt-step wt-"+(status||"done")}>
      <button className="wt-head" onClick={onToggle}>
        <span className="wt-n">{n}</span>
        <span className="wt-name">{title}</span>
        <span className={"wt-kind " + kindMeta.c}>{kindMeta.l}</span>
        <span className="wt-meta">
          {status === "done" && <span className="wt-done">✓ done</span>}
          {durMs != null && <span className="wt-dur">{(durMs/1000).toFixed(1)}s</span>}
        </span>
        <span className="wt-chev">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && <div className="wt-body">{children}</div>}
    </div>
  );
}

function RiskWalkthrough({ flavor, finalTable }) {
  // flavor: "project" | "iteration"
  const [open, setOpen] = React.useState({ s1: true, s2: false, s3: false, s4: false, s5: true });
  const tog = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));

  return (
    <div className="walkthrough">
      <div className="wt-head-card">
        <span className="ai-orb" style={{width:20,height:20,flex:"0 0 20px"}}/>
        <div style={{flex:1,minWidth:0}}>
          <div className="wt-wf">
            <strong>{flavor === "project" ? "project_risk_v1" : "battery_safety_risk_v1"}</strong>
            <span className="wt-sep">·</span>
            <span>claude-sonnet-4.5</span>
            <span className="wt-sep">·</span>
            <span>15.6 s total</span>
            <span className="wt-sep">·</span>
            <span>$0.07</span>
          </div>
          <div className="wt-sub">Walkthrough below shows every step the workflow ran. Open any step to inspect or override the AI's reasoning.</div>
        </div>
        <button className="top-btn"><span className="ai-orb" style={{width:11,height:11}}/> Re-run workflow</button>
      </div>

      <WalkthroughStep n={1} kind="gather_context" title="Pull context from the project" durMs={2100} status="done" expanded={open.s1} onToggle={()=>tog("s1")}>
        <div className="wt-ctx-grid">
          {[
            { k:"sample", l:"3 cells on test", v:"NMC-7B-cell-014 · 015 · 016" },
            { k:"sample", l:"Cathode coating",  v:"NMC-7B-cathode-r3 (12.4 mg/cm²)" },
            { k:"experiment", l:"Recent experiments", v:"EX-211 cycling · EX-209 EIS · EX-205 SEM" },
            { k:"artifact",   l:"Linked artifacts", v:"Maxwell cycling report w22 · post-mortem SEM × 2 · EIS notebook" },
            { k:"page",       l:"Iteration page", v:"Iter-7 · Week 22 cycling notes (rev #84)" },
            { k:"page",       l:"Prior risk register", v:"iter-6 (overall pass) · iter-5 (drying SOP only)" },
            { k:"meeting",    l:"PI weekly · Week 22", v:"Discussion: cell-016 short, batch-7B QA gap" },
            { k:"audit",      l:"Recent audit", v:"page.update × 4 · risk.run × 1 · workflow approved by JR" },
          ].map((c, i) => (
            <div key={i} className={"wt-ctx wt-ctx-"+c.k}>
              <div className="wt-ctx-k">{c.l}</div>
              <div className="wt-ctx-v">{c.v}</div>
            </div>
          ))}
        </div>
      </WalkthroughStep>

      <WalkthroughStep n={2} kind="ai_question" title={flavor==="iteration" ? "Voltage cutoff vs validated window" : "Reproducibility risk"} durMs={4800} status="done" expanded={open.s2} onToggle={()=>tog("s2")}>
        <div className="wt-prompt">
          <span className="wt-prompt-l">Prompt</span>
          <p>
            {flavor==="iteration"
              ? <>Given the sample chemistry (NMC811 · LPSCl · Li-In), recent cycling artifacts showing +12&nbsp;Ω Rct shift at 4.30&nbsp;V, and the requested 4.35&nbsp;V upper cutoff, assess <strong>thermal-runaway risk on a 1–5 scale</strong> and list mitigations. Cite the artifact IDs you used.</>
              : <>Given that this is an early-stage LFP baseline project with three intended cells and no prior in-lab LFP synthesis, assess <strong>reproducibility risk (sample-to-sample variation)</strong> on a 1–5 scale and frame the worst-case publishing impact.</>}
          </p>
        </div>
        <div className="wt-out">
          <div className="wt-out-h">Structured output</div>
          <pre className="wt-out-pre">
{flavor==="iteration"
? `{
  "rating": 5,
  "likelihood": "high",
  "impact_tone": "bad",
  "impact_headline": "Kills the project",
  "rationale": "Each 50 mV step past the validated window roughly doubles dendrite probability per published Caltech data; iter-7 already at +12 Ω.",
  "mitigations": [
    "Cycle in thermal chamber with auto-abort at +2 °C delta",
    "PI sign-off required before first formation cycle"
  ],
  "citations": ["EX-209", "EX-205", "ar_11 (Safety-review-iter6.pdf)"]
}`
: `{
  "rating": 3,
  "likelihood": "medium",
  "impact_tone": "warn",
  "impact_headline": "Lowers paper rigor",
  "rationale": "Without an in-house LFP synthesis the lab depends on a single commercial source; lot-to-lot variation will be the dominant noise term.",
  "mitigations": [
    "Source from single MTI Corp lot for paper 1",
    "Run 6+ cells per condition"
  ],
  "citations": ["batch-7B-QA-note", "p_nmc/iter-4 coater-calibration"]
}`}
          </pre>
        </div>
        <div className="wt-actions">
          <button className="top-btn">Edit answer</button>
          <button className="top-btn">Re-ask with more context</button>
        </div>
      </WalkthroughStep>

      <WalkthroughStep n={3} kind="ai_question" title={flavor==="iteration" ? "Reproducibility of iter-7 result" : "Bandwidth conflict with active work"} durMs={3700} status="done" expanded={open.s3} onToggle={()=>tog("s3")}>
        <div className="wt-prompt">
          <span className="wt-prompt-l">Prompt</span>
          <p>
            {flavor==="iteration"
              ? "Iter-7 closes Jun 12 and the impedance saturation criterion is not yet locked. Iter-10 is scheduled to start Jul 28. Assess the timing risk if iter-7 doesn't conclusively settle the trend."
              : "Project lead JR is also iter-7 lead; cycling channels 1–8 are booked through Jun 12 (~3 weeks of overlap). Assess the bandwidth-conflict risk for this new LFP project."}
          </p>
        </div>
        <div className="wt-out">
          <div className="wt-out-h">Structured output</div>
          <pre className="wt-out-pre">
{flavor==="iteration"
? `{
  "rating": 3,
  "likelihood": "medium",
  "impact_tone": "warn",
  "impact_headline": "Lowers paper rigor",
  "rationale": "Reviewers will ask 'did iter-7 justify the escalation?' If iter-7 trend changes mid-iter-10, the result looks reactive.",
  "mitigations": [
    "Pre-register the iter-7 saturation criterion",
    "Drop iter-10 to 4.32 V if iter-7 doesn't settle"
  ],
  "citations": ["iter-7 risk register #2", "EX-209"]
}`
: `{
  "rating": 3,
  "likelihood": "medium",
  "impact_tone": "warn",
  "impact_headline": "Lowers paper rigor",
  "rationale": "Squeezed timelines lead to rushed cell builds; sample variation creeps up.",
  "mitigations": [
    "Move LFP cycling to channels 9–16 (currently idle)",
    "Stagger build week with iter-7 close-out"
  ],
  "citations": ["cycling-rig-schedule"]
}`}
          </pre>
        </div>
        <div className="wt-actions">
          <button className="top-btn">Edit answer</button>
          <button className="top-btn">Re-ask</button>
        </div>
      </WalkthroughStep>

      <WalkthroughStep n={4} kind="ai_question" title={flavor==="iteration" ? "Caltech replication extrapolation" : "Sourcing / supplier risk"} durMs={3000} status="done" expanded={open.s4} onToggle={()=>tog("s4")}>
        <div className="wt-prompt">
          <span className="wt-prompt-l">Prompt</span>
          <p>
            {flavor==="iteration"
              ? "Caltech (HQ) has 4.25 V data; iter-7 has 4.30 V data. The proposal extrapolates to 4.35 V — assess linearity assumption risk."
              : "No in-house LFP synthesis. Commercial sources: MTI Corp LFP-A2 (used at Caltech), Targray (untested in-lab). Assess sourcing risk."}
          </p>
        </div>
        <div className="wt-out">
          <div className="wt-out-h">Structured output</div>
          <pre className="wt-out-pre">
{flavor==="iteration"
? `{
  "rating": 2,
  "likelihood": "low",
  "impact_tone": "warn",
  "impact_headline": "Lowers novelty",
  "rationale": "Two data points (4.25 V, 4.30 V) is thin for linear extrapolation; nonlinearity would mute the headline finding.",
  "mitigations": ["Pull Caltech raw data via MOU before iter-10 start", "Plan B: pivot to 4.32 V"]
}`
: `{
  "rating": 2,
  "likelihood": "low",
  "impact_tone": "warn",
  "impact_headline": "Delays kickoff by 1–2 weeks",
  "rationale": "Schedule slip, no safety or scientific impact.",
  "mitigations": ["MTI Corp LFP-A2 for first batch", "Targray in parallel evaluation"]
}`}
          </pre>
        </div>
      </WalkthroughStep>

      <WalkthroughStep n={5} kind="ai_synthesis" title="Synthesize risk register" durMs={2000} status="done" expanded={open.s5} onToggle={()=>tog("s5")}>
        <div className="wt-prompt">
          <span className="wt-prompt-l">Prompt</span>
          <p>
            Combine the three structured ratings above into a single register row per risk. Drop overlapping items, order by impact severity then likelihood. Emit a <code>flagged_for_PI_review</code> boolean per the workflow's rule (any HIGH+KILLS triggers it).
          </p>
        </div>
        <div className="wt-out">
          <div className="wt-out-h">Validated output (matches outputSchema)</div>
          <div className="wt-syn-meta">
            <span>{flavor==="iteration" ? "3" : "3"} items · {flavor==="iteration" ? "1 HIGH" : "2 MEDIUM"} · {flavor==="iteration" ? "flagged for PI ⚑" : "no PI escalation"}</span>
          </div>
        </div>
        <div className="wt-final-label">Final risk register · ready to save</div>
        {finalTable}
      </WalkthroughStep>
    </div>
  );
}

/* ─── final risk tables for the two flows ─────────────────────── */

function NewProjectRiskTable() {
  return (
    <div className="risk-card" style={{marginTop:12}}>
      <table className="risk-table">
        <thead>
          <tr><th className="rt-col-num">#</th><th className="rt-col-risk">Risk</th><th className="rt-col-like">Likelihood</th><th className="rt-col-impact">Impact if it hits</th><th className="rt-col-mit">Mitigation / Plan B</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="rt-col-num"><span className="rt-num">1</span></td>
            <td><div className="rt-risk-title">Project is too obvious to publish</div><div className="rt-risk-desc">LFP at 4.0 V is well-trodden; reviewers may ask "what's new?"</div></td>
            <td className="rt-col-like"><span className="like-pill like-medium">MEDIUM</span></td>
            <td><div className="rt-impact-head rt-impact-warn">Lowers novelty</div><div className="rt-impact-desc">Falls back to a methods paper or supplementary material to NMC811.</div></td>
            <td>Position as the baseline for the NMC811 paper, not a standalone result. ACS Applied Energy Materials instead of Nature Energy.</td>
          </tr>
          <tr>
            <td className="rt-col-num"><span className="rt-num">2</span></td>
            <td><div className="rt-risk-title">Bandwidth conflict with iter-7 cycling</div><div className="rt-risk-desc">JR is iter-7 lead; cycling channels 1–8 booked through Jun 12.</div></td>
            <td className="rt-col-like"><span className="like-pill like-medium">MEDIUM</span></td>
            <td><div className="rt-impact-head rt-impact-warn">Lowers paper rigor</div><div className="rt-impact-desc">Squeezed timelines lead to rushed cell builds; sample-to-sample variation spreads.</div></td>
            <td>Move LFP cycling to channels 9–16 (currently idle). Stagger build week with iter-7 close-out.</td>
          </tr>
          <tr>
            <td className="rt-col-num"><span className="rt-num">3</span></td>
            <td><div className="rt-risk-title">No baseline LFP supplier identified</div><div className="rt-risk-desc">Lab has no in-house LFP synthesis; commercial source not yet sourced.</div></td>
            <td className="rt-col-like"><span className="like-pill like-low">LOW</span></td>
            <td><div className="rt-impact-head rt-impact-warn">Delays kickoff by 1–2 weeks</div><div className="rt-impact-desc">Schedule slip; no impact on safety or scientific claim.</div></td>
            <td>Source MTI Corp LFP-A2 (used by Caltech) for first batch. In parallel, evaluate Targray.</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function NewIterationRiskTable() {
  return (
    <div className="risk-card" style={{marginTop:12}}>
      <table className="risk-table">
        <thead>
          <tr><th className="rt-col-num">#</th><th className="rt-col-risk">Risk</th><th className="rt-col-like">Likelihood</th><th className="rt-col-impact">Impact if it hits</th><th className="rt-col-mit">Mitigation / Plan B</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="rt-col-num"><span className="rt-num">1</span></td>
            <td><div className="rt-risk-title">4.35 V exceeds the validated NMC811 window</div><div className="rt-risk-desc">Iter-7 already saw +12 Ω Rct at 4.30 V. Each 50 mV step doubles dendrite probability per published Caltech data.</div></td>
            <td className="rt-col-like"><span className="like-pill like-high">HIGH</span></td>
            <td><div className="rt-impact-head rt-impact-bad">Kills the project</div><div className="rt-impact-desc">A short-induced thermal event in the dry-room halts iter-9 and forces a multi-week safety review.</div></td>
            <td>Cycle in thermal chamber with auto-abort at +2 °C delta. Mandatory PI sign-off before first formation cycle (already flagged ↗).</td>
          </tr>
          <tr>
            <td className="rt-col-num"><span className="rt-num">2</span></td>
            <td><div className="rt-risk-title">Iter-7 data isn't yet conclusive</div><div className="rt-risk-desc">Iter-7 closes Jun 12; you're scheduling iter-10 before the impedance trend is settled.</div></td>
            <td className="rt-col-like"><span className="like-pill like-medium">MEDIUM</span></td>
            <td><div className="rt-impact-head rt-impact-warn">Lowers paper rigor</div><div className="rt-impact-desc">Reviewers will ask "did iter-7 justify the escalation?" If the trend changes, iter-10 looks reactive.</div></td>
            <td>Pre-register the iter-7 saturation criterion. If Rct saturates by cycle 50, proceed. If not, drop iter-10 to 4.32 V.</td>
          </tr>
          <tr>
            <td className="rt-col-num"><span className="rt-num">3</span></td>
            <td><div className="rt-risk-title">Caltech 4.25 V data may not replicate at 4.35 V</div><div className="rt-risk-desc">Extrapolating two data points (4.25 V, 4.30 V) to 4.35 V — Rct shift may be non-linear.</div></td>
            <td className="rt-col-like"><span className="like-pill like-low">LOW</span></td>
            <td><div className="rt-impact-head rt-impact-warn">Lowers novelty</div><div className="rt-impact-desc">If trend doesn't extrapolate, this is an unremarkable null result.</div></td>
            <td>Pull HQ's raw cycling data via MOU before iter-10 start. Plan B: pivot to 4.32 V if Caltech sees nonlinearity.</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ─── NEW PROJECT (2-page wizard) ──────────────────────────────── */

function NewProjectPage({ setRoute }) {
  const [step, setStep] = React.useState(1);

  return (
    <div className="page-wrap" style={{maxWidth:980}}>
      <div className="cf-head">
        <div className="cf-overline">New project</div>
        <h1>Set up a research project</h1>
      </div>

      <WizardStepper step={step} steps={["Description","AI risk assessment"]}/>

      {step === 1 && <>
        <p className="cf-subhead">Start with the basics: who, what, when. The next step runs <em style={{fontFamily:"var(--serif)"}}>project_risk_v1</em> against your description and lab history to generate a baseline risk register.</p>

        <FormSection n="1" title="Identity">
          <FieldRow label="Emblem" sublabel="One character — shown as the project glyph in the sidebar.">
            <input className="set-input" defaultValue="L" style={{width:60, textAlign:"center", fontFamily:"var(--serif)", fontSize:20}}/>
          </FieldRow>
          <FieldRow label="Name" sublabel="Short, descriptive.">
            <input className="set-input" defaultValue="LiFePO₄ cathode reference study"/>
          </FieldRow>
          <FieldRow label="Tagline" sublabel="One sentence — what's the hypothesis or goal?">
            <input className="set-input" defaultValue="Build an LFP baseline to compare against the NMC811 high-cutoff work."/>
          </FieldRow>
        </FormSection>

        <FormSection n="2" title="Description" hint="Be as detailed as you'd like. The AI uses this to generate the risk register on the next step.">
          <FieldRow label="Background">
            <textarea className="set-input" rows={4} defaultValue={"The NMC811 project at 4.30 V cutoff has hit a +12 Ω Rct shift vs the 4.20 V baseline. To frame that result fairly we need an LFP control: a cathode chemistry well-understood by the community, at a benign cutoff, against which the NMC811 high-cutoff curves can be normalized.\n\nThe lab has no in-house LFP synthesis and will source from MTI Corp LFP-A2 for the first batch."}/>
          </FieldRow>
          <FieldRow label="Hypothesis">
            <textarea className="set-input" rows={2} defaultValue="LFP cells at 4.0 V cutoff will show < 2 Ω Rct shift over 80 cycles, providing a clean control curve that frames the NMC811 4.30 V result."/>
          </FieldRow>
          <FieldRow label="Success criteria" sublabel="What does 'project complete' look like? Used by the AI to grade publishing risk.">
            <textarea className="set-input" rows={3} defaultValue={"• 3+ LFP cells reach cycle 80 within the iter-6 baseline window for capacity retention.\n• Rct(cycle) curve published as Figure 1 in the NMC811 paper.\n• Final dataset reproduces MTI Corp's product-sheet curve within 5%."}/>
          </FieldRow>
          <FieldRow label="Visibility">
            <div className="cf-radio-group">
              <label className="cf-radio on">
                <span className="cf-radio-dot"/>
                <span><strong>Workspace</strong><span className="cf-radio-sub">All Halide members can read; explicit collaborators can edit.</span></span>
              </label>
              <label className="cf-radio">
                <span className="cf-radio-dot"/>
                <span><strong>Private</strong><span className="cf-radio-sub">Only explicit collaborators can see this project.</span></span>
              </label>
            </div>
          </FieldRow>
        </FormSection>

        <FormSection n="3" title="Team" hint="Project-level roles compose with workspace roles via max() (spec §5).">
          <FieldRow label="Leads" sublabel="Owners of the project. Get all notifications, plus PI flag escalation.">
            <div className="cf-people">
              <span className="cf-person on"><AvC id="JR" size={20}/> Jules Reyes <button>×</button></span>
              <span className="cf-person on"><AvC id="MT" size={20}/> Mei Tanaka <button>×</button></span>
              <button className="cf-person add"><IC2 name="plus" size={11}/> Add lead</button>
            </div>
          </FieldRow>
          <FieldRow label="Editors" sublabel="Can edit content; cannot change project settings or invite externals.">
            <div className="cf-people">
              <span className="cf-person on"><AvC id="KB" size={20}/> Karim Bah <button>×</button></span>
              <span className="cf-person on"><AvC id="SP" size={20}/> Sam Patel <button>×</button></span>
              <button className="cf-person add"><IC2 name="plus" size={11}/> Add editor</button>
            </div>
          </FieldRow>
        </FormSection>

        <FormSection n="4" title="First iteration (optional)" hint="Spin up Iter-1 alongside the project. You can skip and add iterations later.">
          <FieldRow label="Iteration name"><input className="set-input" defaultValue="Iter-1 · LFP baseline cells, 4.0 V cutoff"/></FieldRow>
          <FieldRow label="Schedule">
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input className="set-input" defaultValue="Jun 02" style={{width:120}}/>
              <span style={{fontFamily:"var(--mono)",color:"var(--muted)"}}>→</span>
              <input className="set-input" defaultValue="Jun 20" style={{width:120}}/>
            </div>
          </FieldRow>
          <FieldRow label="Owner">
            <div className="cf-people"><span className="cf-person on"><AvC id="KB" size={20}/> Karim Bah <button>×</button></span></div>
          </FieldRow>
        </FormSection>

        <div className="cf-footer">
          <button className="top-btn" onClick={() => setRoute({view:"home"})}>Cancel</button>
          <div style={{flex:1}}/>
          <button className="top-btn">Save as draft</button>
          <button className="top-btn primary" onClick={() => setStep(2)}>Continue to risk assessment →</button>
        </div>
      </>}

      {step === 2 && <>
        <p className="cf-subhead">Walkthrough below shows every step <em style={{fontFamily:"var(--serif)"}}>project_risk_v1</em> ran. Open any step to inspect or override the AI's reasoning. Save when you're satisfied with the final risk register.</p>

        <RiskWalkthrough flavor="project" finalTable={<NewProjectRiskTable/>}/>

        <div className="cf-footer">
          <button className="top-btn" onClick={() => setStep(1)}>← Back to description</button>
          <div style={{flex:1}}/>
          <button className="top-btn">Save as draft</button>
          <button className="top-btn primary" onClick={() => setRoute({view:"project", projectId:"p_nmc", tab:"overview", variant:"editorial"})}>Create project →</button>
        </div>
      </>}

      <div style={{height:60}}/>
    </div>
  );
}

/* ─── NEW ITERATION (2-page wizard) ─────────────────────────────── */

function NewIterationPage({ setRoute, project }) {
  const p = project || LC2.PROJECTS[0];
  const [step, setStep] = React.useState(1);

  return (
    <div className="page-wrap" style={{maxWidth:980}}>
      <div className="cf-head">
        <div className="cf-overline">New iteration · {p.name}</div>
        <h1>Plan an iteration</h1>
      </div>

      <WizardStepper step={step} steps={["Description","AI risk assessment"]}/>

      {step === 1 && <>
        <p className="cf-subhead">Define the iteration's protocol, samples, and hypothesis. The next step runs <em style={{fontFamily:"var(--serif)"}}>battery_safety_risk_v1</em> with this iteration's context plus the project's prior iterations.</p>

        <FormSection n="1" title="Identity">
          <FieldRow label="Number" sublabel="Auto-incremented. Editable for parallel branches.">
            <input className="set-input" defaultValue="10" style={{width:80, fontFamily:"var(--mono)"}}/>
          </FieldRow>
          <FieldRow label="Name" sublabel="Short title — referenced everywhere else.">
            <input className="set-input" defaultValue="Iter-10 · 4.35 V escalation study"/>
          </FieldRow>
          <FieldRow label="Schedule">
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input className="set-input" defaultValue="Jul 28" style={{width:120}}/>
              <span style={{fontFamily:"var(--mono)",color:"var(--muted)"}}>→</span>
              <input className="set-input" defaultValue="Aug 22" style={{width:120}}/>
              <span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--muted)",marginLeft:8}}>25 days</span>
            </div>
          </FieldRow>
          <FieldRow label="Owner">
            <div className="cf-people"><span className="cf-person on"><AvC id="JR" size={20}/> Jules Reyes <button>×</button></span></div>
          </FieldRow>
        </FormSection>

        <FormSection n="2" title="Hypothesis & description" hint="The AI reads this to generate the risk register. Be specific about what's new vs prior iterations.">
          <FieldRow label="Hypothesis">
            <textarea className="set-input" rows={2} defaultValue="If the iter-7 Rct(cycle) curve saturates by cycle 50, the 4.35 V cutoff yields measurable additional capacity without runaway impedance growth."/>
          </FieldRow>
          <FieldRow label="Description" sublabel="What's the change relative to iter-7? What's the risk of pushing further?">
            <textarea className="set-input" rows={5} defaultValue={"Iter-7 is mid-flight at 4.30 V upper cutoff and cell-014 / 015 are tracking the iter-6 baseline within ±2% through cycle 22 — but with a +12 Ω Rct shift at SoC 50%. If the shift saturates by cycle 50, that's evidence the cathode/electrolyte interface stabilizes at the new cutoff.\n\nIter-10 tests whether one more 50 mV step (to 4.35 V) yields additional capacity, or whether the Rct shift becomes nonlinear and runaway."}/>
          </FieldRow>
          <FieldRow label="Success criteria">
            <textarea className="set-input" rows={2} defaultValue="Capacity retention at cycle 80 ≥ 88% of iter-7's 4.30 V result, with Rct shift bounded under +20 Ω vs iter-7 at SoC 50%."/>
          </FieldRow>
        </FormSection>

        <FormSection n="3" title="Cycling protocol">
          <FieldRow label="Upper cutoff (V)"><input className="set-input" defaultValue="4.35" style={{width:100, fontFamily:"var(--mono)"}}/></FieldRow>
          <FieldRow label="Lower cutoff (V)"><input className="set-input" defaultValue="3.00" style={{width:100, fontFamily:"var(--mono)"}}/></FieldRow>
          <FieldRow label="C-rate"><input className="set-input" defaultValue="C/3" style={{width:100, fontFamily:"var(--mono)"}}/></FieldRow>
          <FieldRow label="Cycles"><input className="set-input" defaultValue="80" style={{width:100, fontFamily:"var(--mono)"}}/></FieldRow>
        </FormSection>

        <FormSection n="4" title="Samples" hint="Pulled from this project's roster. Pick what enters this iteration.">
          <div className="cf-samples">
            {LC2.SAMPLES.filter(s => s.kind === "cell").map(s => {
              const on = s.id.includes("014") || s.id.includes("015");
              return (
                <label key={s.id} className={"cf-sample"+(on?" on":"")}>
                  <span className="cf-sample-check"><span className="cf-sample-mark">{on ? "✓" : ""}</span></span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--ember)"}}>{s.id}</div>
                    <div style={{fontSize:13}}>{s.name}</div>
                  </div>
                  <span className={"pill k-"+s.kind}>{s.kind}</span>
                  <span className={"pill s-"+s.status}><span className={"dot-s "+s.status}/>{s.status}</span>
                </label>
              );
            })}
            <button className="cf-sample add"><IC2 name="plus" size={12}/> Add new sample for this iteration</button>
          </div>
        </FormSection>

        <div className="cf-footer">
          <button className="top-btn" onClick={() => setRoute({view:"project", projectId:p.id, tab:"iterations"})}>Cancel</button>
          <div style={{flex:1}}/>
          <button className="top-btn">Save as draft</button>
          <button className="top-btn primary" onClick={() => setStep(2)}>Continue to risk assessment →</button>
        </div>
      </>}

      {step === 2 && <>
        <p className="cf-subhead">
          <em style={{fontFamily:"var(--serif)"}}>battery_safety_risk_v1</em> ran with your description plus iter-7 / iter-6 cycling data and the prior risk registers. Item #1 below is HIGH likelihood + KILLS the project — workflow flagged the iteration for PI sign-off.
        </p>

        <RiskWalkthrough flavor="iteration" finalTable={<NewIterationRiskTable/>}/>

        <div className="cf-pi-callout" style={{marginTop:18}}>
          <IC2 name="flag" size={12}/>
          <strong>PI sign-off required</strong> — item #1 is HIGH likelihood + KILLS THE PROJECT impact. The workflow has emailed Mei. Iteration cannot transition to <em>active</em> until she approves.
        </div>

        <div className="cf-footer">
          <button className="top-btn" onClick={() => setStep(1)}>← Back to description</button>
          <div style={{flex:1}}/>
          <button className="top-btn">Save as planned</button>
          <button className="top-btn primary">Send to Mei for sign-off</button>
        </div>
      </>}

      <div style={{height:60}}/>
    </div>
  );
}

Object.assign(window, { NewProjectPage, NewIterationPage });
