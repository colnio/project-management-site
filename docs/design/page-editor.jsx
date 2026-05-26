// page-editor.jsx — entity pages with inline artifact embeds
// Renders pages for iterations, samples, experiments, and meetings.

const { Avatar: AvE, Icon: IE, LAB: LE } = window;

/* ── Helpers ── */

function statusPillX(s){
  return <span className={"pill s-"+s}><span className={"dot-s "+s}/>{s}</span>;
}

function RefInline({ kind, id, label, glyph }) {
  return (
    <span className={"ref-inline " + kind}>
      <span className="glyph">{glyph}</span>
      <span>{label || id}</span>
    </span>
  );
}

/* ── Reference + embed components ── */

function SampleCard({ id }) {
  const s = LE.SAMPLE_BY_ID[id];
  if (!s) return null;
  return (
    <div className="ref-card">
      <div className="leftcol">
        <span className="row" style={{gap:6}}>
          <span className="glyph">s</span>
          <span className="rtype">sample · {s.kind}</span>
        </span>
        <span className="rid">{s.id}</span>
        <span style={{marginTop:6}} className={"pill s-" + s.status}><span className={"dot-s "+s.status}/>{s.status}</span>
      </div>
      <div className="rbody">
        <div className="rname">{s.name}</div>
        <div className="rprops">
          {s.chem && <span><span className="k">chem</span><span className="v">{s.chem}</span></span>}
          {s.mass && <span><span className="k">mass</span><span className="v">{s.mass}</span></span>}
          {s.cap  && <span><span className="k">capacity</span><span className="v">{s.cap}</span></span>}
          {s.load && <span><span className="k">loading</span><span className="v">{s.load}</span></span>}
          {s.v    && <span><span className="k">V cutoff</span><span className="v">{s.v}</span></span>}
        </div>
        <div className="rfoot">
          {s.parent && <span style={{fontFamily:"var(--mono)", fontSize:11}}>derived from <span style={{color:"var(--ember)"}}>{s.parent}</span></span>}
          <span style={{marginLeft:"auto"}}><a style={{color:"var(--muted)", fontSize:11}}>Open sample →</a></span>
        </div>
      </div>
    </div>
  );
}

function ExpCard({ id }) {
  const e = LE.EXP_BY_ID[id];
  if (!e) return null;
  return (
    <div className="ref-card">
      <div className="leftcol">
        <span className="row" style={{gap:6}}>
          <span className="glyph">e</span>
          <span className="rtype">experiment · {e.method}</span>
        </span>
        <span className="rid">{e.id}</span>
        <span style={{marginTop:6}} className="pill">{e.status.replace("_"," ")}</span>
      </div>
      <div className="rbody">
        <div className="rname">{e.title}</div>
        <div style={{fontSize:13, color:"var(--ink-2)", lineHeight:1.5, textWrap:"pretty"}}>{e.summary}</div>
        <div className="rfoot">
          <span style={{fontFamily:"var(--mono)", fontSize:11}}>samples: {e.samples.join(", ")}</span>
          <span style={{marginLeft:"auto", display:"flex", alignItems:"center", gap:6}}>
            <AvE id={e.by} size={16}/>
            <span style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)"}}>{e.at}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* Inline artifact embeds */

function ArtImage({ id, caption, kind = "sem" }) {
  const a = LE.ART_BY_ID[id];
  if (!a) return null;
  return (
    <figure className="embed-img">
      <div className={"img-frame" + (kind==="photo" ? " full" : "")} style={{
        background: kind === "sem" ? `
          radial-gradient(circle at 28% 32%, rgba(217,194,165,.5) 0, transparent 26%),
          radial-gradient(circle at 55% 60%, rgba(184,158,124,.55) 0, transparent 30%),
          radial-gradient(circle at 78% 28%, rgba(155,128,94,.55) 0, transparent 24%),
          radial-gradient(circle at 18% 78%, rgba(120,98,68,.5) 0, transparent 28%),
          radial-gradient(circle at 70% 80%, rgba(160,128,90,.4) 0, transparent 30%),
          repeating-linear-gradient(35deg, rgba(255,255,255,.04) 0 2px, transparent 2px 5px),
          linear-gradient(180deg, #2a2418 0, #0e0c08 100%)
        ` : `
          linear-gradient(135deg, #c8b89e 0%, #8a7458 35%, #57462f 65%, #2c2418 100%),
          repeating-linear-gradient(45deg, rgba(255,255,255,.04) 0 3px, transparent 3px 7px)
        `,
      }}>
        <div className="badge-magn">{kind === "sem" ? "25 kX · SE" : "Glovebox · Apr 18"}</div>
        {kind === "sem" && (
          <div className="scalebar">
            <div className="bar"/>
            <div>10 µm</div>
          </div>
        )}
      </div>
      <figcaption className="caption">
        <span className="title">{caption || a.name}</span>
        <span className="who">{a.name} · uploaded by {LE.PEOPLE[a.by].name.split(" ")[0]} · {a.at}</span>
      </figcaption>
    </figure>
  );
}

function ArtPDF({ id, summary }) {
  const a = LE.ART_BY_ID[id];
  if (!a) return null;
  return (
    <div className="embed-pdf">
      <div className="pdf-thumb">
        <span className="pdf-tag">PDF</span>
        <div className="doc-h"/>
        <div className="doc-bar" style={{width:"96%"}}/>
        <div className="doc-bar" style={{width:"100%"}}/>
        <div className="doc-bar" style={{width:"88%"}}/>
        <div className="doc-bar" style={{width:"94%"}}/>
        <div className="doc-bar" style={{width:"72%"}}/>
        <div className="doc-spark"/>
      </div>
      <div className="pdf-body">
        <div className="pdf-name">{a.name}</div>
        <div className="pdf-meta">{a.size} · {LE.PEOPLE[a.by].name.split(" ")[0]} · {a.at}</div>
        {summary && <div className="pdf-summary">{summary}</div>}
        <div className="pdf-actions">
          <button className="pdf-btn">Open in viewer →</button>
          <button className="pdf-btn">Download</button>
        </div>
      </div>
    </div>
  );
}

function ArtNotebook({ id, cells }) {
  const a = LE.ART_BY_ID[id];
  if (!a) return null;
  return (
    <div className="embed-nb">
      <div className="nb-head">
        <span className="nb-tag">IPYNB</span>
        <span className="nb-name">{a.name}</span>
        <span className="nb-meta">{LE.PEOPLE[a.by].name.split(" ")[0]} · {a.at}</span>
      </div>
      <div className="nb-cells">
        {(cells || []).map((c, i) => (
          <div key={i} className="nb-cell">
            {c.type === "md" && <div className="nb-md" dangerouslySetInnerHTML={{__html: c.md}}/>}
            {c.type === "code" && <div className="nb-code" dangerouslySetInnerHTML={{__html: c.code}}/>}
            {c.type === "output" && <div className="nb-out">{c.out}</div>}
            {c.type === "plot" && (
              <div className="nb-plot">
                <svg viewBox="0 0 600 200" preserveAspectRatio="none" style={{width:"100%",height:"100%"}}>
                  <line x1="20" y1="180" x2="580" y2="180" style={{stroke:"var(--line-2)"}} strokeWidth="1"/>
                  <line x1="20" y1="10"  x2="20"  y2="180" style={{stroke:"var(--line-2)"}} strokeWidth="1"/>
                  {/* baseline */}
                  <path d="M30 60 L100 70 L200 82 L300 90 L400 96 L500 100 L570 102"
                        fill="none" style={{stroke:"var(--muted)"}} strokeWidth="1.3" strokeDasharray="3 3"/>
                  {/* iter-7 */}
                  <path d="M30 50 L100 56 L200 70 L300 88 L400 110 L500 132 L570 152"
                        fill="none" style={{stroke:"var(--ember)"}} strokeWidth="1.8"/>
                  <text x="540" y="42"  fontFamily="JetBrains Mono" fontSize="9" style={{fill:"var(--ember)"}}>iter-7</text>
                  <text x="540" y="118" fontFamily="JetBrains Mono" fontSize="9" style={{fill:"var(--muted)"}}>iter-6 baseline</text>
                  <text x="25" y="20"   fontFamily="JetBrains Mono" fontSize="9" style={{fill:"var(--muted-2)"}}>200 mAh/g</text>
                  <text x="25" y="195"  fontFamily="JetBrains Mono" fontSize="9" style={{fill:"var(--muted-2)"}}>150 mAh/g · cycle</text>
                  <text x="560" y="195" fontFamily="JetBrains Mono" fontSize="9" style={{fill:"var(--muted-2)"}}>30</text>
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Page chrome (shared) ── */

function PageChrome({ overline, title, breadcrumb, presence, savedRev, children }) {
  return (
    <div className="doc">
      <div className="doc-presence">
        {presence && (
          <>
            <div className="here">
              {presence.map(p => <AvE key={p} id={p} size={20} ring/>)}
            </div>
            <span><strong>{LE.PEOPLE[presence[0]]?.name.split(" ")[0] || "You"}</strong>{presence.length > 1 ? " and " + (LE.PEOPLE[presence[1]]?.name.split(" ")[0] || "...") : ""} {presence.length > 1 ? "are editing" : "is editing"}</span>
          </>
        )}
        <span className="saved">
          <span className="dot"/>Saved · {savedRev}
        </span>
      </div>

      <h1 className="dtitle">
        {overline && <em style={{fontStyle:"italic", color:"var(--muted)"}}>{overline} </em>}
        {title}
      </h1>
      <div className="dmeta">{breadcrumb}</div>
      {children}
    </div>
  );
}

/* ── Entity property strip ── */

function EntityProps({ items }) {
  return (
    <div className="entity-props">
      {items.map((p, i) => (
        <div key={i} className="ep-cell">
          <div className="ep-k">{p.k}</div>
          <div className={"ep-v" + (p.serif ? " serif" : "")}>{p.v}</div>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   ITERATION PAGE (the original Iter-7 page, plus rich content)
──────────────────────────────────────────────────────── */

function IterationPage({ iteration, project }) {
  const it = iteration || LE.ITERATIONS.find(i => i.status === "active");
  return (
    <PageChrome
      overline={"Iter-" + it.num + " ·"}
      title="Week 22 cycling notes"
      breadcrumb={`/ ${project?.name || "NMC811"} / Iterations / Iter-${it.num} / Pages / Week 22`}
      presence={["JR","MT"]}
      savedRev="rev #84 · ETag 7c4a…"
    >
      <p>
        Three coin cells from batch&nbsp;7B started on the 4.30&nbsp;V cutoff schedule on May&nbsp;18. As of cycle&nbsp;22, two cells are tracking 188+&nbsp;mAh/g; one cell shorted on cycle&nbsp;4.
      </p>

      <h2>Cells on test</h2>
      <SampleCard id="NMC-7B-cell-014"/>
      <SampleCard id="NMC-7B-cell-015"/>
      <SampleCard id="NMC-7B-cell-016"/>

      <h2>Cycling trace</h2>
      <p>
        Capacity-vs-cycle overlay for the two surviving channels against the iter-6 4.20 V baseline. Notebook updated each morning by the cycler service.
      </p>
      <ArtNotebook id="ar_12" cells={[
        { type:"md", md:"<em># Capacity overlay — iter-7 vs iter-6 baseline</em>" },
        { type:"code", code:'<span class="k">import</span> pandas <span class="k">as</span> pd<br/><span class="k">from</span> halide <span class="k">import</span> cycling<br/>cells = cycling.load(<span class="s">"7B/iter7"</span>)<br/>baseline = cycling.load(<span class="s">"7A/iter6"</span>)<br/>fig = cycling.plot(cells, baseline, cutoff=<span class="s">"4.30V"</span>)' },
        { type:"plot" },
        { type:"output", out:"3 cells, 22 cycles · mean ΔQ = 188.4 mAh/g (σ 2.1)" },
      ]}/>

      <h2>Failure on cell-016</h2>
      <p>
        <RefInline kind="sample" glyph="s" id="NMC-7B-cell-016"/> shorted on cycle&nbsp;4 during the C/3 step. Post-mortem cross-section confirmed visible lithium plating on the separator — see <RefInline kind="experiment" glyph="e" id="EX-205" label="EX-205 · SEM"/>. Root cause is most likely separator perforation during cell assembly, but the AI flagged the chemistry/cutoff combination as a contributing factor in <RefInline kind="artifact" glyph="a" id="ar_11" label="Safety-review-iter6.pdf"/>.
      </p>
      <ArtImage id="ar_04" caption="Cross-section, 10 kX — dendrite on separator. Cell-016 post-mortem." kind="sem"/>

      <div className="callout">
        <span className="ico">⚠</span>
        <div>
          <strong>Flagged for PI review.</strong> Triggered by <code>overall_rating &gt;= 4</code> in <em>battery_safety_risk_v1</em>. Dr. Tanaka was notified May&nbsp;22 · 14:08.
        </div>
      </div>

      <h2>Impedance shift</h2>
      <p>
        Baseline vs current iteration EIS comparison from <RefInline kind="experiment" glyph="e" id="EX-209"/>. The +12&nbsp;Ω Rct shift is consistent with cathode/electrolyte interface growth at the higher cutoff. Not yet enough cycles to attribute confidently.
      </p>

      <ExpCard id="EX-209"/>

      <ArtPDF id="ar_05" summary="Nyquist plots and equivalent-circuit fits at SoC 50% for cell-014. Rct extracted via Voigt model."/>

      <h3>Open questions</h3>
      <ul>
        <li>Is the Rct trend monotonic with cycle count, or saturating?</li>
        <li>Does the cell-016 short generalize to the rest of batch 7B, or was it isolated?</li>
        <li>Hua Qin's group (Caltech) is seeing similar shift at 4.25 V — request raw cycling data.</li>
      </ul>

      <h2>Next steps</h2>
      <ol>
        <li>Re-build a replacement for cell-016 with a fresh separator from the validated lot.</li>
        <li>Run EIS sweep every 20 cycles on cell-014 / 015 to map Rct(cycle) curve.</li>
        <li>If shift saturates by cycle 50, recommend escalating cutoff to 4.35 V for iter-8 binder comparison.</li>
      </ol>

      <blockquote>
        Watch for the dendrite morphology, not just the voltage curve. The 016 short is a tell.
        <div style={{fontFamily:"var(--sans)", fontSize:12.5, color:"var(--muted)", fontStyle:"normal", marginTop:6}}>— Mei, comment on cycle-4 SEM</div>
      </blockquote>

      <div style={{height:80}}/>
    </PageChrome>
  );
}

/* ──────────────────────────────────────────────────────
   SAMPLE PAGE
──────────────────────────────────────────────────────── */

function SamplePage({ sample, project }) {
  const s = sample;
  const linkedExp = LE.EXPERIMENTS.filter(e => e.samples.includes(s.id));
  return (
    <PageChrome
      overline={s.kind + " ·"}
      title={s.name}
      breadcrumb={`/ ${project?.name || "NMC811"} / Samples / ${s.id}`}
      presence={["JR"]}
      savedRev="rev #12"
    >
      <EntityProps items={[
        { k: "Identifier",  v: s.id },
        { k: "Chemistry",   v: s.chem || "—" },
        { k: "Mass",        v: s.mass || "—" },
        { k: "Capacity",    v: s.cap || "—" },
        { k: "Loading",     v: s.load || "—" },
        { k: "V cutoff",    v: s.v || "—" },
        { k: "Parent",      v: s.parent || "—" },
        { k: "Status",      v: s.status, serif: false },
      ]}/>

      <h2>Description</h2>
      <p>
        Coin-cell built from cathode coating <RefInline kind="sample" glyph="s" id={s.parent || "NMC-7B-cathode-r3"}/> on channel&nbsp;{s.id.slice(-3)} of the cycling rack. Part of iteration&nbsp;7 at the 4.30&nbsp;V upper cutoff. The cell uses the validated LPSCl batch (<RefInline kind="sample" glyph="s" id="LPSCl-batch-22"/>) as the solid electrolyte separator.
      </p>

      <h2>Assembly photo</h2>
      <ArtImage id="ar_10" caption="Coin-cell assembly, May 17 — pre-crimp inspection." kind="photo"/>

      <h2>Lineage</h2>
      <div style={{padding:"14px 16px", border:"1px solid var(--line)", borderRadius:"var(--r-md)", background:"var(--surface)", fontFamily:"var(--mono)", fontSize:12.5, color:"var(--ink-2)", lineHeight:1.8}}>
        <div><span style={{color:"var(--ember)"}}>NMC811-pwd-04</span> <span style={{color:"var(--muted)"}}>(precursor · calcined lot 04)</span></div>
        <div>&nbsp;&nbsp;↓ <em style={{fontFamily:"var(--serif)",fontStyle:"italic",color:"var(--muted)"}}>derived_from</em></div>
        <div><span style={{color:"var(--ember)"}}>NMC-7B-cathode-r3</span> <span style={{color:"var(--muted)"}}>(electrode · 12.4 mg/cm²)</span></div>
        <div>&nbsp;&nbsp;↓ <em style={{fontFamily:"var(--serif)",fontStyle:"italic",color:"var(--muted)"}}>assembled_into</em></div>
        <div><span style={{color:"var(--ember)"}}>{s.id}</span> <span style={{color:"var(--muted)"}}>(this sample · cell on test)</span></div>
      </div>

      <h2>Linked experiments</h2>
      {linkedExp.length > 0 ? linkedExp.map(e => <ExpCard key={e.id} id={e.id}/>) : <p style={{color:"var(--muted)"}}>No experiments yet.</p>}

      <h2>Notes</h2>
      <p>
        Cell built within the validated batch-7B window. No assembly anomalies noted at crimp time. Cycling started May 18 · 11:42 PT on channel {s.id.slice(-3)}.
      </p>

      <div className="callout">
        <span className="ico">i</span>
        <div>
          <strong>Property auto-extraction.</strong> The AI parsed chemistry and capacity from the iter-7 notes and the cycling protocol PDF. Spec §10 flags this as a v1 weakness — review the chemistry field if you spot a mismatch.
        </div>
      </div>

      <div style={{height:80}}/>
    </PageChrome>
  );
}

/* ──────────────────────────────────────────────────────
   EXPERIMENT PAGE
──────────────────────────────────────────────────────── */

function ExperimentPage({ experiment, project }) {
  const e = experiment;
  return (
    <PageChrome
      overline={e.method.toUpperCase() + " ·"}
      title={e.title}
      breadcrumb={`/ ${project?.name || "NMC811"} / Experiments / ${e.id}`}
      presence={[e.by]}
      savedRev="rev #5"
    >
      <EntityProps items={[
        { k: "Identifier",    v: e.id },
        { k: "Method",        v: e.method, serif: true },
        { k: "Performed by",  v: LE.PEOPLE[e.by].name },
        { k: "Performed at",  v: e.at },
        { k: "Samples",       v: String(e.samples.length) },
        { k: "Status",        v: e.status.replace("_"," ") },
      ]}/>

      <h2>Summary</h2>
      <p>{e.summary}</p>

      <h2>Samples involved</h2>
      {e.samples.map(sid => <SampleCard key={sid} id={sid}/>)}

      {e.method === "SEM" && (
        <>
          <h2>Micrographs</h2>
          <p>Top-down and cross-sectional micrographs from the post-mortem dissection of <RefInline kind="sample" glyph="s" id="NMC-7B-cell-014"/>.</p>
          <ArtImage id="ar_03" caption="Top-down view, 25 kX. Cathode particles intact; surface coating unchanged." kind="sem"/>
          <ArtImage id="ar_04" caption="Cross-section, 10 kX. Visible Li dendrite on separator." kind="sem"/>
        </>
      )}
      {e.method === "EIS" && (
        <>
          <h2>Impedance data</h2>
          <p>Nyquist plot at 50% SoC. Equivalent-circuit fit via Voigt model.</p>
          <ArtPDF id="ar_05" summary="Rct = 38 Ω · Rs = 4.2 Ω · CPE-Q = 1.1 mF · χ² < 0.01"/>
          <ArtNotebook id="ar_06" cells={[
            { type:"md", md:'<em># Voigt fit — cell-014 at SoC 50%</em>' },
            { type:"code", code:'<span class="k">from</span> halide <span class="k">import</span> eis<br/>fit = eis.voigt(Z, n_RC=2, freqs=f)<br/>print(fit.summary())' },
            { type:"output", out:"Rs=4.2 Ω · Rct1=14 Ω · Rct2=24 Ω · total Rct=38 Ω · χ²=0.007" },
          ]}/>
        </>
      )}
      {e.method === "cycling" && (
        <>
          <h2>Cycling overlay</h2>
          <ArtNotebook id="ar_12" cells={[
            { type:"md", md:'<em># Capacity vs cycle — iter-7 cells</em>' },
            { type:"plot" },
            { type:"output", out:"Cell 014: 191 mAh/g @ cycle 22 · Cell 015: 188 mAh/g · Cell 016: SHORT cycle 4" },
          ]}/>
        </>
      )}
      {e.method === "XRD" && (
        <>
          <h2>Diffractogram</h2>
          <ArtImage id="ar_09" caption="XRD pattern — sharp (003) at 18.7°. Consistent with α-NaFeO₂ layered phase."/>
        </>
      )}
      {e.method === "drying" && (
        <>
          <h2>Drying protocol</h2>
          <ArtPDF id="ar_08" summary="110°C / 18 h glovebox protocol. Conductivity 1.7 mS/cm post-drying; mass loss 4.2%."/>
        </>
      )}

      <h2>Conclusions</h2>
      <p>
        {e.summary} See linked artifacts above for raw data and analysis notebooks.
      </p>

      <h2>Follow-ups</h2>
      <ul>
        <li>Re-run at SoC 80% to confirm Rct trend isn't SoC-dependent.</li>
        <li>Compare against Caltech (HQ) 4.25 V dataset once MOU is signed.</li>
      </ul>

      <div style={{height:80}}/>
    </PageChrome>
  );
}

/* ──────────────────────────────────────────────────────
   MEETING PAGE
──────────────────────────────────────────────────────── */

function MeetingPage({ meeting }) {
  const m = meeting;
  return (
    <PageChrome
      overline={m.date + " ·"}
      title={m.title}
      breadcrumb={`/ Workspace / Meetings / ${m.date}`}
      presence={[m.chair]}
      savedRev={m.upcoming ? "scheduled · agenda only" : "rev #3 · minutes locked"}
    >
      <div className="meeting-deck">
        <div className="md-cell"><div className="md-k">Date</div><div className="md-v">{m.date}</div></div>
        <div className="md-cell"><div className="md-k">Time</div><div className="md-v">{m.time}</div></div>
        <div className="md-cell"><div className="md-k">Location</div><div className="md-v">{m.location}</div></div>
        <div className="md-cell"><div className="md-k">Chair</div><div className="md-v">{LE.PEOPLE[m.chair].name}</div></div>
        <div className="md-cell">
          <div className="md-k">Attendees</div>
          <div className="md-v attendees">
            {m.attendees.map(id => <AvE key={id} id={id} size={20} ring/>)}
          </div>
        </div>
      </div>

      {m.upcoming && (
        <div className="callout">
          <span className="ico">⌛</span>
          <div><strong>Upcoming meeting.</strong> Pulled from project calendar. Agenda will be finalized 24 h before.</div>
        </div>
      )}

      <h2 className="section-h-serif">Agenda</h2>
      <ol>
        {m.agenda.map((a, i) => <li key={i}>{a}</li>)}
      </ol>

      {m.discussion.length > 0 && !m.upcoming && (
        <>
          <h2 className="section-h-serif">Discussion points</h2>
          {m.discussion.map((d, i) => <p key={i}>{d}</p>)}
        </>
      )}

      {m.decisions.length > 0 && (
        <>
          <h2 className="section-h-serif">Decisions</h2>
          <ul>
            {m.decisions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </>
      )}

      {m.actions.length > 0 && (
        <>
          <h2 className="section-h-serif">Action items</h2>
          <div className="meeting-actions">
            {m.actions.map((a, i) => (
              <div key={i} className="ma-row">
                <span className="ma-who">{a.who}</span>
                <span className="ma-what">{a.what}</span>
                <span className="ma-due">due {a.due}</span>
                <span className="ma-status">
                  <span className={"pill s-" + (a.status === "done" ? "done" : "active")}>
                    <span className={"dot-s " + (a.status === "done" ? "done" : "active")}/>
                    {a.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {m.notes && (
        <>
          <h2 className="section-h-serif">Notes</h2>
          <p>{m.notes}</p>
        </>
      )}

      <div style={{height:80}}/>
    </PageChrome>
  );
}

/* ──────────────────────────────────────────────────────
   MEETINGS LIST
──────────────────────────────────────────────────────── */

function MeetingsList({ onOpen }) {
  const past = LE.MEETINGS.filter(m => !m.upcoming);
  const upcoming = LE.MEETINGS.filter(m => m.upcoming);
  return (
    <div className="meetings-page">
      <div className="cal-head">
        <h2>Meetings</h2>
        <div className="cmode">
          <button className="on">All</button>
          <button>PI weekly</button>
          <button>Handoffs</button>
        </div>
        <div className="right">
          <button className="top-btn"><IE name="filter" size={12}/> Filter</button>
          <button className="top-btn primary"><IE name="plus" size={12}/> New meeting</button>
        </div>
      </div>

      <p style={{color:"var(--muted)", fontSize:13.5, maxWidth:560, lineHeight:1.6, marginTop:0}}>
        Workspace-level meeting log. Minutes, decisions, and action items are searchable across projects.
        Action items roll up to <em style={{fontFamily:"var(--serif)"}}>Inbox</em> and notify the assignee.
      </p>

      {upcoming.length > 0 && (
        <>
          <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--muted-2)", textTransform:"uppercase", letterSpacing:".06em", margin:"24px 0 4px"}}>
            Upcoming
          </div>
          <div className="meeting-list">
            {upcoming.map(m => (
              <div key={m.id} className="meeting-row upcoming" onClick={() => onOpen(m.id)}>
                <div className="mtg-date">
                  {m.date.split(",")[0].split(" ")[0]}
                  <b>{m.date.split(" ")[1].replace(",","")}</b>
                  {m.time.split("–")[0].trim()}
                </div>
                <div>
                  <div className="mtg-title">{m.title}</div>
                  <div className="mtg-sub">{m.kind} · chaired by {LE.PEOPLE[m.chair].name} · {m.agenda.length} agenda items</div>
                </div>
                <div className="mtg-att">
                  {m.attendees.map(id => <AvE key={id} id={id} size={20} ring/>)}
                </div>
                <div><span className="pill s-planned"><span className="dot-s planned"/>scheduled</span></div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--muted-2)", textTransform:"uppercase", letterSpacing:".06em", margin:"24px 0 4px"}}>
        Past · {past.length} meetings
      </div>
      <div className="meeting-list">
        {past.map(m => (
          <div key={m.id} className="meeting-row" onClick={() => onOpen(m.id)}>
            <div className="mtg-date">
              {m.date.split(",")[0].split(" ")[0]}
              <b>{m.date.split(" ")[1].replace(",","")}</b>
              {m.time.split("–")[0].trim()}
            </div>
            <div>
              <div className="mtg-title">{m.title}</div>
              <div className="mtg-sub">{m.kind} · chaired by {LE.PEOPLE[m.chair].name} · {m.actions.length} action item{m.actions.length===1?"":"s"} · {m.decisions.length} decisions</div>
            </div>
            <div className="mtg-att">
              {m.attendees.map(id => <AvE key={id} id={id} size={20} ring/>)}
            </div>
            <div><span className="pill s-done"><span className="dot-s done"/>minutes</span></div>
          </div>
        ))}
      </div>

      <div style={{height:80}}/>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   Dispatcher — kept named PageEditor for back-compat
──────────────────────────────────────────────────────── */

function PageEditor({ project, pageRef }) {
  if (pageRef?.type === "sample") {
    const s = LE.SAMPLE_BY_ID[pageRef.id];
    if (s) return <SamplePage sample={s} project={project}/>;
  }
  if (pageRef?.type === "experiment") {
    const e = LE.EXP_BY_ID[pageRef.id];
    if (e) return <ExperimentPage experiment={e} project={project}/>;
  }
  if (pageRef?.type === "iteration") {
    const it = LE.ITERATIONS.find(i => i.id === pageRef.id);
    if (it) return <IterationPage iteration={it} project={project}/>;
  }
  if (pageRef?.type === "meeting") {
    const m = LE.MEETINGS.find(mt => mt.id === pageRef.id);
    if (m) return <MeetingPage meeting={m}/>;
  }
  // Default: show the iter-7 page for the project Pages tab
  return <IterationPage project={project}/>;
}

window.PageEditor = PageEditor;
window.MeetingsList = MeetingsList;
window.MeetingPage = MeetingPage;
window.SamplePage = SamplePage;
window.ExperimentPage = ExperimentPage;
