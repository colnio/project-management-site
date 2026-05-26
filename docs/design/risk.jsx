// risk.jsx — Risk register (table-form), used on Project Overview and Iteration cards

const { Icon: RI } = window;

function likelihoodPill(lvl) {
  // lvl: "high" | "medium" | "low"
  const label = lvl.toUpperCase();
  return <span className={"like-pill like-" + lvl}>{label}</span>;
}

function RiskAssessment({ id, scope = "project", compact = false }) {
  const r = LAB.RISK[id];

  // Not yet run
  if (!r || !r.items || r.items.length === 0) {
    return (
      <div className="risk-card risk-empty">
        <div className="risk-empty-head">
          <span className="risk-glyph">⌗</span>
          <div style={{flex:1, minWidth:0}}>
            <div className="risk-empty-title">Risk register — not yet generated</div>
            <div className="risk-empty-sub">
              {scope === "iteration"
                ? "Runs automatically when the iteration enters active status, or manually below. Drafts a structured table of risks, their likelihood, impact, and Plan B."
                : "No risk profile on file. Run the workflow to baseline it — drafts a structured table of risks, their likelihood, impact, and Plan B."}
            </div>
          </div>
          <button className="risk-run">
            <span className="ai-orb" style={{width:12,height:12}}/>
            Run workflow
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={"risk-card" + (r.candidate ? " risk-candidate" : "")}>
      <div className="risk-head">
        <div className="risk-head-l">
          <span className="risk-glyph">⌗</span>
          <span className="risk-title">Risk register</span>
        </div>
        <div className="risk-head-r">
          <span className="risk-workflow">{r.workflow}</span>
          {r.flaggedForPI && (
            <span className="risk-flag" title={r.flagReason || "Flagged for PI review"}>
              <RI name="flag" size={10}/> PI review
            </span>
          )}
          {r.candidate && (
            <span className="risk-candidate-pill">
              <span className="ai-orb" style={{width:10,height:10}}/>
              AI draft · awaiting approval
            </span>
          )}
          <span className="risk-stamp">{r.runAt}</span>
        </div>
      </div>

      <table className="risk-table">
        <thead>
          <tr>
            <th className="rt-col-num">#</th>
            <th className="rt-col-risk">Risk</th>
            <th className="rt-col-like">Likelihood</th>
            <th className="rt-col-impact">Impact if it hits</th>
            <th className="rt-col-mit">Mitigation / Plan B</th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((it, i) => (
            <tr key={i}>
              <td className="rt-col-num"><span className="rt-num">{i + 1}</span></td>
              <td className="rt-col-risk">
                <div className="rt-risk-title">{it.risk.title}</div>
                <div className="rt-risk-desc">{it.risk.description}</div>
              </td>
              <td className="rt-col-like">{likelihoodPill(it.likelihood)}</td>
              <td className="rt-col-impact">
                <div className={"rt-impact-head rt-impact-" + (it.impact.tone || "warn")}>{it.impact.headline}</div>
                <div className="rt-impact-desc">{it.impact.description}</div>
              </td>
              <td className="rt-col-mit">{it.mitigation}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="risk-foot">
        <div className="risk-foot-summary">
          <span className="risk-foot-glyph">{'"'}</span>
          {r.summary}
        </div>
        <div className="risk-foot-actions">
          <span className="risk-foot-by">{r.runBy}</span>
          <button className="risk-link">View full report →</button>
          <button className="risk-rerun" title="Re-run assessment">
            <span className="ai-orb" style={{width:10,height:10}}/> Re-run
          </button>
        </div>
      </div>
    </div>
  );
}

window.RiskAssessment = RiskAssessment;
