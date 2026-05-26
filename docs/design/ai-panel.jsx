// ai-panel.jsx — always-on AI side panel

const { Icon: _Icon, LAB: _LAB, Avatar: _Av } = window;

function AIPanel({ project, route }) {
  const proj = project || LAB.PROJECTS[0];

  return (
    <aside className="ai">
      <div className="ai-head">
        <div className="ai-orb"/>
        <div className="ai-title">Assistant</div>
        <div className="ai-mode">suggest&nbsp;writes</div>
      </div>

      <div className="ai-body">
        <div className="msg ai">
          <div className="who">assistant · {proj.name}</div>
          <div className="bubble">
            Good morning, Jules. <strong>Iteration&nbsp;7</strong> is on day&nbsp;5 of&nbsp;25. Three cells from batch&nbsp;7B are currently cycling at 4.30&nbsp;V cutoff.
            <div style={{marginTop:8}}>
              I noticed <strong>NMC-7B-cell-016</strong> shorted on cycle&nbsp;4 <span className="citation">[1]</span>. The other two cells are tracking the 4.20&nbsp;V baseline within ±2%.
            </div>
          </div>
          <div className="tool-call">
            <div><span className="tname">search_project_content</span><span className="targ">(</span><span className="targ">q</span><span className="targ">: </span>"recent cycling failures"<span className="targ">)</span></div>
            <div className="tresult">→ 3 results · cell-016, cell-014 EIS, post-mortem-cs</div>
          </div>
        </div>

        <div className="msg user">
          <div className="who">jules · 9:42</div>
          <div className="bubble">What's the impedance trend looking like vs. iter-6? And should I flag 016 for the safety review?</div>
        </div>

        <div className="msg ai">
          <div className="who">assistant · streaming</div>
          <div className="bubble">
            Impedance is up modestly. From <strong>EX-209</strong>:
            <div style={{margin:"8px 0", padding:"8px 10px", background:"var(--paper-2)", borderRadius:6, fontFamily:"var(--mono)", fontSize:11.5, color:"var(--ink-2)"}}>
              Rct (50% SoC) = 38 Ω<br/>
              vs. iter-6 baseline = 26 Ω<br/>
              Δ = +12 Ω (+46%) <span className="citation">[2]</span>
            </div>
            On the short — yes. A cell that fails on cycle&nbsp;4 with visible dendrite formation <span className="citation">[3]</span> is exactly the trigger condition in the <em style={{fontFamily:"var(--serif)"}}>battery_safety_risk_v1</em> workflow.
            <div style={{marginTop:10}}>
              I drafted a flag note (below) and a candidate revision to <strong>Iter-7 · Week 22 notes</strong>. Both are <em>candidates</em> — nothing has been written yet.
            </div>
          </div>

          {/* proposed write */}
          <div className="tool-call" style={{background:"var(--ember-tint)", borderColor:"var(--ember-soft)"}}>
            <div><span className="tname">flag_for_review</span><span className="targ">(</span><span className="targ">reason</span><span className="targ">: </span>"cell-016 short, cycle 4"<span className="targ">)</span></div>
            <div className="tresult" style={{color:"var(--ember)"}}>⌐ awaiting approval · recipient: Dr. Tanaka (PI)</div>
            <div style={{display:"flex", gap:6, marginTop:6, fontFamily:"var(--sans)"}}>
              <button style={{padding:"3px 9px", borderRadius:4, background:"var(--ink)", color:"var(--paper)", fontSize:11}}>Approve</button>
              <button style={{padding:"3px 9px", borderRadius:4, background:"transparent", color:"var(--muted)", fontSize:11, border:"1px solid var(--line)"}}>Reject</button>
              <button style={{padding:"3px 9px", borderRadius:4, background:"transparent", color:"var(--muted)", fontSize:11}}>Diff…</button>
            </div>
          </div>
        </div>

        <div className="msg ai">
          <div className="who">citations</div>
          <div style={{fontSize:11.5, color:"var(--muted)", fontFamily:"var(--mono)", lineHeight:1.7}}>
            [1]&nbsp;EX-211 · cycle log, May&nbsp;22<br/>
            [2]&nbsp;EX-209 · impedance fit<br/>
            [3]&nbsp;PM-cell-014-cs · SEM cross-section
          </div>
        </div>
      </div>

      <div className="ai-input">
        <div className="box">
          <textarea placeholder="Ask, summarize, or draft a page…" defaultValue=""></textarea>
          <div className="ai-controls">
            <button className="model">claude-sonnet-4 · $0.31 spent today</button>
            <span style={{color:"var(--muted-2)"}}>·</span>
            <button title="Attach"><_Icon name="paperclip" size={12}/></button>
            <button title="Browse tools"><_Icon name="atom" size={12}/></button>
            <button className="send"><_Icon name="send" size={11}/> Send</button>
          </div>
        </div>
        <div style={{fontSize:10.5, color:"var(--muted-2)", marginTop:6, fontFamily:"var(--mono)"}}>
          Autonomy: <strong style={{color:"var(--ink-2)"}}>suggest_writes</strong> · 3 tools enabled · workspace cap $200/mo (24%)
        </div>
      </div>
    </aside>
  );
}

window.AIPanel = AIPanel;
