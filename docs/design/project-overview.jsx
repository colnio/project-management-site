// project-overview.jsx — hero screen with 3 layout variants

const { Avatar: Av, Icon: I } = window;

function statusPill(s){
  return <span className={"pill s-"+s}><span className={"dot-s "+s}/>{s}</span>;
}

function kindPill(k){
  return <span className={"pill k-"+k}>{k}</span>;
}

function SampleRecord({ s, compact }) {
  return (
    <div className="rec">
      <div className="row" style={{gap:8}}>
        <span className="id">{s.id}</span>
        <span style={{marginLeft:"auto"}}>{kindPill(s.kind)}</span>
      </div>
      <div className="name">{s.name}</div>
      <div className="props">
        {s.chem && <span><span className="k">chem</span><span className="v">{s.chem}</span></span>}
        {s.mass && <span><span className="k">m</span><span className="v">{s.mass}</span></span>}
        {s.cap  && <span><span className="k">Q</span><span className="v">{s.cap}</span></span>}
        {s.load && <span><span className="k">load</span><span className="v">{s.load}</span></span>}
        {s.v    && <span><span className="k">V↑</span><span className="v">{s.v}</span></span>}
      </div>
      <div className="foot">
        {statusPill(s.status)}
        {s.parent && <span style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--muted-2)"}}>← {s.parent}</span>}
      </div>
    </div>
  );
}

function ExperimentRecord({ e }) {
  const ppl = LAB.PEOPLE[e.by];
  return (
    <div className="rec">
      <div className="row" style={{gap:8}}>
        <span className="id">{e.id}</span>
        <span style={{marginLeft:"auto"}} className="pill">{e.method}</span>
      </div>
      <div className="name">{e.title}</div>
      <div style={{fontSize:12.5, color:"var(--muted)", lineHeight:1.4, textWrap:"pretty"}}>{e.summary}</div>
      <div className="foot">
        {statusPill(e.status === "in_progress" ? "active" : (e.status === "completed" ? "done" : e.status))}
        <span style={{fontFamily:"var(--mono)", fontSize:11}}>{e.samples.length} sample{e.samples.length>1?"s":""}</span>
        <span className="right" style={{display:"flex",alignItems:"center",gap:6}}>
          <Av id={e.by} size={16}/> <span style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)"}}>{e.at}</span>
        </span>
      </div>
    </div>
  );
}

function IterRow({ it }) {
  return (
    <div className="iter-row">
      <div className="num">Iter-{it.num}</div>
      <div className="title">
        {it.name}
        <div className="sub">{it.samples} samples · {it.experiments} experiments · {LAB.PEOPLE[it.owner].name}</div>
      </div>
      <div className="dates">{it.start} → {it.end}</div>
      <div className="right">
        {statusPill(it.status)}
      </div>
    </div>
  );
}

function ProjectHead({ p, variant, setVariant }) {
  return (
    <div className="proj-head">
      <div className="proj-emblem">{p.emblem}</div>
      <div className="proj-main">
        <div className="proj-title">{p.name}</div>
        <div className="proj-meta">
          <span><I name="globe" size={11}/> Workspace · all members can read</span>
          <span className="who">
            Leads
            <span className="avatars">
              <span className="a" style={{background:LAB.PEOPLE.MT.color}}>MT</span>
              <span className="a" style={{background:LAB.PEOPLE.JR.color}}>JR</span>
            </span>
          </span>
          <span>updated 14 min ago · Jules</span>
        </div>
      </div>
      <div className="proj-right">
        <div className="var-picker">
          {[
            {id:"editorial", l:"Editorial"},
            {id:"dashboard", l:"Dashboard"},
            {id:"stream",    l:"Stream"},
          ].map(o => (
            <button key={o.id} onClick={()=>setVariant(o.id)} className={variant===o.id?"on":""}>{o.l}</button>
          ))}
        </div>
        <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--muted-2)"}}>Overview layout · tweakable</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Variant A — EDITORIAL (page-like, vertical narrative)
// ──────────────────────────────────────────────────────
function OverviewEditorial({ p }) {
  return (
    <>
      <div className="summary-prose">
        <p>{p.tagline} Iteration&nbsp;7 ships three coin cells from batch&nbsp;7B at a 4.30&nbsp;V upper cutoff, instrumented against the iter-6 4.20&nbsp;V baseline. The hypothesis is that the marginal capacity gain at the high cutoff is offset by accelerated impedance growth at the cathode/electrolyte interface.</p>
        <p>Lead questions for this iteration: <em style={{fontFamily:"var(--serif)", color:"var(--ink)"}}>Does the +12&nbsp;Ω Rct shift observed on cell-014 generalize? Is the cell-016 short a manufacturing defect or chemistry-related?</em></p>
      </div>

      <window.RiskAssessment id={p.id} scope="project"/>

      <div className="section-h">
        <h2>Iterations</h2>
        <span className="meta">10 total · 1 active · 5 done · 2 planned</span>
        <span className="right"><a>View all →</a></span>
      </div>
      <div className="iter-list">
        {LAB.ITERATIONS.slice(0,5).map(it => <IterRow key={it.id} it={it}/>)}
      </div>

      <div className="section-h">
        <h2>Recent samples</h2>
        <span className="meta">{p.samples} total · 28 active · 4 consumed · 2 failed</span>
        <span className="right"><a>All samples →</a></span>
      </div>
      <div className="records">
        {LAB.SAMPLES.slice(0,4).map(s => <SampleRecord key={s.id} s={s}/>)}
      </div>

      <div className="section-h">
        <h2>Recent experiments</h2>
        <span className="meta">{p.experiments} total · 1 in progress</span>
        <span className="right"><a>All experiments →</a></span>
      </div>
      <div className="records">
        {LAB.EXPERIMENTS.slice(0,4).map(e => <ExperimentRecord key={e.id} e={e}/>)}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────
// Variant B — DASHBOARD (12-col dense grid)
// ──────────────────────────────────────────────────────
function MiniSpark({ values, highlight }) {
  return (
    <div className="spark-row">
      {values.map((v,i) => <div key={i} className={"b" + (i===highlight?" on":"")} style={{height: v+"%"}}/>)}
    </div>
  );
}

function CycleChart() {
  // fake cycling capacity retention plot
  const pts = [];
  const N = 24;
  for (let i = 0; i < N; i++) {
    const x = 30 + (i/(N-1)) * 340;
    const y = 30 + (1 - (1 - i*0.004)) * 8 + i*0.6 + Math.sin(i*.4)*1.5;
    pts.push([x, 30 + i*1.1 + Math.sin(i*.5)*2]);
  }
  const path1 = pts.map((p,i)=> (i===0?"M":"L") + p[0]+" "+p[1]).join(" ");
  const path2 = pts.map((p,i)=> (i===0?"M":"L") + p[0]+" "+(p[1]+8 + Math.sin(i*.3)*2)).join(" ");
  return (
    <svg viewBox="0 0 400 150" style={{width:"100%",height:150}}>
      <defs>
        <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 20" fill="none" style={{stroke:"var(--paper-3)"}} strokeWidth="1"/>
        </pattern>
      </defs>
      <rect x="20" y="10" width="370" height="120" fill="url(#grid)"/>
      <line x1="20" y1="130" x2="390" y2="130" style={{stroke:"var(--line-2)"}} strokeWidth="1"/>
      <line x1="20" y1="10"  x2="20" y2="130" style={{stroke:"var(--line-2)"}} strokeWidth="1"/>
      <path d={path1} fill="none" style={{stroke:"var(--ember)"}} strokeWidth="1.6"/>
      <path d={path2} fill="none" style={{stroke:"var(--muted)"}} strokeWidth="1.2" strokeDasharray="3 3"/>
      <text x="26" y="22" fontFamily="JetBrains Mono" fontSize="9" style={{fill:"var(--muted-2)"}}>200 mAh/g</text>
      <text x="26" y="128" fontFamily="JetBrains Mono" fontSize="9" style={{fill:"var(--muted-2)"}}>150 mAh/g</text>
      <text x="356" y="143" fontFamily="JetBrains Mono" fontSize="9" style={{fill:"var(--muted-2)"}}>cycle 24</text>
      <text x="200" y="58" fontFamily="JetBrains Mono" fontSize="10" style={{fill:"var(--ember)"}}>iter-7 · 4.30V</text>
      <text x="200" y="120" fontFamily="JetBrains Mono" fontSize="10" style={{fill:"var(--muted)"}}>iter-6 · 4.20V (baseline)</text>
    </svg>
  );
}

function OverviewDashboard({ p }) {
  return (
    <>
      <window.RiskAssessment id={p.id} scope="project"/>
      <div className="dash" style={{marginTop:18}}>

      {/* row 1 — KPI tiles */}
      <div className="panel c-3">
        <div className="stat">
          <div className="l">Active iteration</div>
          <div className="v">07 <small>/ 10</small></div>
          <div className="d">Day 5 of 25 · ends Jun 12</div>
        </div>
      </div>
      <div className="panel c-3">
        <div className="stat">
          <div className="l">Cells cycling</div>
          <div className="v">2 <small>of 3</small></div>
          <div className="d down">1 failure · cell-016</div>
        </div>
        <MiniSpark values={[40,60,80,55,75,90,65]} highlight={6}/>
      </div>
      <div className="panel c-3">
        <div className="stat">
          <div className="l">Mean Rct (50% SoC)</div>
          <div className="v">38<small>Ω</small></div>
          <div className="d down">+12 Ω vs iter-6</div>
        </div>
      </div>
      <div className="panel c-3">
        <div className="stat">
          <div className="l">AI spend, this month</div>
          <div className="v">$48 <small>/ $200</small></div>
          <div className="d">24% of cap · 14 days remaining</div>
        </div>
      </div>

      {/* row 2 — cycling chart big, activity */}
      <div className="panel c-8">
        <div className="ph">
          <h3>Capacity retention — iter-7 vs iter-6</h3>
          <span className="meta">C/3 · 3 cells avg</span>
        </div>
        <CycleChart/>
      </div>
      <div className="panel c-4">
        <div className="ph">
          <h3>Activity</h3>
          <span className="meta">last 48 h</span>
        </div>
        <div className="feed">
          <div className="feed-item">
            <div className="mark">e</div>
            <div className="what"><span className="who">Jules</span> finished EX-209 · EIS at 50% SoC on cell-014</div>
            <div className="ts">2h</div>
          </div>
          <div className="feed-item">
            <div className="mark">s</div>
            <div className="what"><span className="who">Jules</span> updated NMC-7B-cell-016 → <em>failed</em></div>
            <div className="ts">4h</div>
          </div>
          <div className="feed-item">
            <div className="mark">p</div>
            <div className="what"><span className="who">Mei</span> commented on Iter-7 · Week 22 notes</div>
            <div className="ts">5h</div>
          </div>
          <div className="feed-item">
            <div className="mark">a</div>
            <div className="what"><span className="who">Sam</span> attached <em>SEM_cross_cell014_10kx.png</em></div>
            <div className="ts">y</div>
          </div>
          <div className="feed-item">
            <div className="mark">⟁</div>
            <div className="what"><span className="who">Assistant</span> flagged cell-016 for PI review</div>
            <div className="ts">y</div>
          </div>
          <div className="feed-item">
            <div className="mark">e</div>
            <div className="what"><span className="who">Karim</span> opened EX-200 · XRD baseline</div>
            <div className="ts">2d</div>
          </div>
        </div>
      </div>

      {/* row 3 — gantt summary */}
      <div className="panel c-12">
        <div className="ph">
          <h3>Iteration timeline</h3>
          <span className="meta">5 of 10 visible</span>
        </div>
        <div className="gantt">
          <div className="axis"><span/><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span></div>
          <div className="row"><div className="lbl">Iter-4 · Coater calib</div><div className="track"><div className="bar done" style={{left:"0%",width:"10%"}}/></div></div>
          <div className="row"><div className="lbl">Iter-5 · LPSCl drying</div><div className="track"><div className="bar done" style={{left:"10%",width:"12%"}}/></div></div>
          <div className="row"><div className="lbl">Iter-6 · 4.20V baseline</div><div className="track"><div className="bar done" style={{left:"22%",width:"14%"}}/></div></div>
          <div className="row"><div className="lbl">Iter-7 · 4.30V cycling</div><div className="track"><div className="bar active" style={{left:"36%",width:"15%"}}/><div className="marker" style={{left:"40%"}}/></div></div>
          <div className="row"><div className="lbl">Iter-8 · Binder compare</div><div className="track"><div className="bar planned" style={{left:"51%",width:"13%"}}/></div></div>
          <div className="row"><div className="lbl">Iter-9 · Pouch scale-up</div><div className="track"><div className="bar planned" style={{left:"64%",width:"14%"}}/></div></div>
        </div>
      </div>

      {/* row 4 — samples summary + experiments summary */}
      <div className="panel c-6">
        <div className="ph">
          <h3>Sample roster</h3>
          <span className="meta">{p.samples} total</span>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:10}}>
          {[
            {k:"precursor", n:6},
            {k:"electrode", n:8},
            {k:"cell", n:14},
            {k:"derivative", n:4},
            {k:"module", n:2},
          ].map(x=>(
            <div key={x.k} style={{padding:"8px 10px", border:"1px solid var(--line)", borderRadius:6, background:"var(--paper)"}}>
              <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--muted-2)",textTransform:"uppercase",letterSpacing:".05em"}}>{x.k}</div>
              <div style={{fontFamily:"var(--serif)",fontSize:22,letterSpacing:"-.01em"}}>{x.n}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex", flexDirection:"column", gap:6}}>
          {LAB.SAMPLES.slice(0,3).map(s => (
            <div key={s.id} className="row" style={{justifyContent:"space-between", fontSize:12.5}}>
              <span className="row" style={{gap:8}}>
                <span style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--ember)"}}>{s.id}</span>
                <span style={{color:"var(--muted)"}}>{s.chem}</span>
              </span>
              {statusPill(s.status)}
            </div>
          ))}
        </div>
      </div>

      <div className="panel c-6">
        <div className="ph">
          <h3>Experiments by method</h3>
          <span className="meta">{p.experiments} total</span>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
          {[
            {m:"cycling",   n:18, c:18},
            {m:"EIS",       n:12, c:12},
            {m:"SEM",       n:9,  c:9},
            {m:"XRD",       n:7,  c:7},
            {m:"synthesis", n:6,  c:6},
            {m:"drying",    n:4,  c:4},
          ].map(x=>(
            <div key={x.m} style={{padding:"8px 12px", border:"1px solid var(--line)", borderRadius:6, display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--ink-2)"}}>{x.m}</div>
                <div style={{width:"100%", height:4, background:"var(--paper-2)", borderRadius:2, marginTop:6, overflow:"hidden"}}>
                  <div style={{height:"100%", width:(x.n/18*100)+"%", background:"var(--ember)"}}/>
                </div>
              </div>
              <div style={{fontFamily:"var(--serif)", fontSize:20, color:"var(--ink)", lineHeight:1}}>{x.n}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}

// ──────────────────────────────────────────────────────
// Variant C — STREAM (current iteration hero + past timeline)
// ──────────────────────────────────────────────────────
function OverviewStream({ p }) {
  const cur = LAB.ITERATIONS.find(i => i.status === "active");
  const past = LAB.ITERATIONS.filter(i => i.status === "done").sort((a,b)=> b.num - a.num);
  const planned = LAB.ITERATIONS.filter(i => i.status === "planned").sort((a,b)=> a.num - b.num);

  return (
    <>
      <window.RiskAssessment id={p.id} scope="project"/>
      <div className="stream">
      <aside className="stream-side">
        <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--muted-2)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8,paddingLeft:6}}>
          Iteration history
        </div>
        {planned.map(it => (
          <div key={it.id} className="si">
            <div>Iter-{it.num} · {it.name.split(" — ")[0]}</div>
            <div className="d">{it.start} · planned</div>
          </div>
        ))}
        <div className="si cur">
          <div>Iter-{cur.num} · current</div>
          <div className="d">{cur.start} → {cur.end}</div>
        </div>
        {past.map(it => (
          <div key={it.id} className="si">
            <div>Iter-{it.num} · {it.name.split(" — ")[0]}</div>
            <div className="d">{it.start} → {it.end}</div>
          </div>
        ))}
      </aside>

      <div className="stream-main">
        <div className="cur-iter">
          <div className="num">▸ Current iteration · Day 5 of 25</div>
          <h2>{cur.name}</h2>
          <div className="iter-meta">
            <span>{cur.start} → {cur.end}</span>
            <span>·</span>
            <span>Lead: {LAB.PEOPLE[cur.owner].name}</span>
            <span>·</span>
            <span>{cur.samples} samples · {cur.experiments} experiments</span>
            <span style={{marginLeft:"auto"}}>{statusPill(cur.status)}</span>
          </div>
          <p style={{margin:"0 0 14px", color:"var(--ink-2)", fontSize:14, lineHeight:1.6, maxWidth:620}}>
            {cur.desc}
          </p>

          <div className="iter-cols">
            <div>
              <h4>Samples in this iteration</h4>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {LAB.SAMPLES.slice(0,3).map(s=>(
                  <div key={s.id} className="row" style={{justifyContent:"space-between", padding:"7px 9px", border:"1px solid var(--line)", borderRadius:6, background:"var(--paper)"}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--ember)"}}>{s.id}</div>
                      <div style={{fontSize:12.5, color:"var(--ink-2)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:240}}>{s.name}</div>
                    </div>
                    {statusPill(s.status)}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4>In-flight experiments</h4>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {LAB.EXPERIMENTS.slice(0,3).map(e=>(
                  <div key={e.id} className="row" style={{padding:"7px 9px", border:"1px solid var(--line)", borderRadius:6, background:"var(--paper)", gap:9}}>
                    <span className="pill" style={{fontSize:10}}>{e.method}</span>
                    <div style={{minWidth:0, flex:1}}>
                      <div style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)"}}>{e.id}</div>
                      <div style={{fontSize:12.5, color:"var(--ink-2)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{e.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <window.RiskAssessment id={cur.id} scope="iteration"/>
        </div>

        <div className="section-h" style={{marginTop:30}}>
          <h2>Past iterations</h2>
          <span className="meta">5 completed · expand for full history</span>
        </div>

        {past.map(it => (
          <div key={it.id} className="past-iter">
            <div className="pnum">
              Iter-{it.num}
              <span className="d">{it.start} → {it.end}</span>
            </div>
            <div>
              <h3>{it.name}</h3>
              <p>{it.desc}</p>
              <div className="pmini">
                <span className="pill">{it.samples} samples</span>
                <span className="pill">{it.experiments} experiments</span>
                <span className="pill">lead · {LAB.PEOPLE[it.owner].name}</span>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              {statusPill(it.status)}
            </div>
          </div>
        ))}
      </div>
    </div>
    </>
  );
}

// ──────────────────────────────────────────────────────
// Wrapper
// ──────────────────────────────────────────────────────
function ProjectOverview({ project, variant, setVariant }) {
  const v = variant || "editorial";
  return (
    <div className={"page-wrap" + (v === "dashboard" ? " wide" : "")}>
      <ProjectHead p={project} variant={v} setVariant={setVariant}/>
      {v === "editorial" && <OverviewEditorial p={project}/>}
      {v === "dashboard" && <OverviewDashboard p={project}/>}
      {v === "stream"    && <OverviewStream p={project}/>}
    </div>
  );
}

window.ProjectOverview = ProjectOverview;
