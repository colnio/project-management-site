// app.jsx — top-level app + routing + Tweaks

const { useState: uS, useEffect: uE } = React;
const { Sidebar, TopBar, Tabs, AIPanel, ProjectOverview, PageEditor, CalendarView, ArtifactsView, MeetingsList, MeetingPage, SamplePage, ExperimentPage, InboxPage, PeoplePage, AccountPage, AdminPage, NewProjectPage, NewIterationPage, ShareModal, NewSampleModal, NewEventModal, TemplatePage, SamplesCardsView, SamplesLineageView, LAB, Icon } = window;
const { TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakSelect, TweakToggle, TweakColor, TweakSlider } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "overview": "editorial",
  "accent": "#d97757",
  "sidebar": "tree",
  "showAi": true,
  "density": "regular",
  "showPresence": true,
  "aiAutonomy": "suggest_writes",
  "displayFont": "Instrument Serif",
  "theme": "light"
}/*EDITMODE-END*/;

const ACCENTS = ["#d97757", "#2c5b6a", "#5a7d3a", "#7a5aa0", "#1a1a1a"];

function HomeView({ setRoute }) {
  return (
    <div className="page-wrap wide">
      <div style={{paddingTop:8, paddingBottom:20}}>
        <div style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)", letterSpacing:".05em", textTransform:"uppercase"}}>Tuesday · May 26 · 2026</div>
        <h1 style={{fontFamily:"var(--serif)", fontSize:46, letterSpacing:"-.015em", margin:"4px 0 6px", fontWeight:400, lineHeight:1.05}}>
          Good morning, <em style={{color:"var(--muted)"}}>Jules.</em>
        </h1>
        <div style={{color:"var(--muted)", fontSize:14, maxWidth:560, lineHeight:1.55}}>
          You have <strong style={{color:"var(--ink)"}}>3 inbox items</strong>, one <strong style={{color:"var(--ember)"}}>PI review flag</strong> on Iter-7, and Mei left two comments on your Week&nbsp;22 notes.
        </div>
      </div>

      <div className="section-h">
        <h2>Your projects</h2>
        <span className="meta">5 active · 1 private</span>
      </div>
      <div className="records three" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
        {LAB.PROJECTS.map(p => (
          <button key={p.id} className="rec clickable" style={{textAlign:"left"}} onClick={()=>setRoute({view:"project", projectId:p.id, tab:"overview"})}>
            <div className="row" style={{gap:10, alignItems:"flex-start"}}>
              <div style={{width:40, height:40, borderRadius:8, background:"var(--ember-tint)", color:"var(--ember)", display:"grid", placeItems:"center", fontFamily:"var(--serif)", fontSize:24, lineHeight:1, border:"1px solid var(--ember-soft)", flex:"0 0 40px"}}>{p.emblem}</div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontWeight:500, fontSize:14}}>{p.name}</div>
                <div style={{fontSize:12, color:"var(--muted)", marginTop:2, textWrap:"pretty"}}>{p.tagline}</div>
              </div>
            </div>
            <div className="foot">
              <span className={"pill s-"+(p.status||"active")}><span className={"dot-s "+(p.status||"active")}/>{p.status||"active"}</span>
              {p.visibility==="private" && <span className="pill">private</span>}
              <span className="right" style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)"}}>
                {p.samples ? p.samples+" samples" : "—"}
              </span>
            </div>
          </button>
        ))}
        <button className="rec clickable" style={{borderStyle:"dashed", color:"var(--muted)", justifyContent:"center", alignItems:"center", minHeight:120}}>
          <div style={{fontFamily:"var(--serif)", fontSize:32, lineHeight:1}}>＋</div>
          <div style={{fontSize:12.5}}>New project</div>
        </button>
      </div>

      <div className="section-h">
        <h2>Activity across lab</h2>
        <span className="meta">last 24 h</span>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:18}}>
        <div className="feed">
          <div className="feed-item"><div className="mark">⟁</div><div className="what"><span className="who">Assistant</span> flagged <em>cell-016</em> for safety review on <em>NMC</em></div><div className="ts">2h</div></div>
          <div className="feed-item"><div className="mark">e</div><div className="what"><span className="who">Sam</span> ran EX-205 · SEM on PM-cell-014-cs</div><div className="ts">5h</div></div>
          <div className="feed-item"><div className="mark">p</div><div className="what"><span className="who">Mei</span> commented on <em>Iter-7 · Week 22 notes</em></div><div className="ts">7h</div></div>
          <div className="feed-item"><div className="mark">a</div><div className="what"><span className="who">Sam</span> uploaded 2 artifacts to <em>NMC</em></div><div className="ts">y</div></div>
          <div className="feed-item"><div className="mark">i</div><div className="what"><span className="who">Karim</span> closed iteration <em>Iter-4</em> on <em>NMC</em></div><div className="ts">y</div></div>
        </div>
        <div>
          <div style={{padding:"14px 16px", border:"1px solid var(--ember-soft)", borderRadius:8, background:"var(--ember-tint)"}}>
            <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ember)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:6}}>Risk workflow · awaiting your approval</div>
            <div style={{fontFamily:"var(--serif)", fontSize:18, letterSpacing:"-.005em", marginBottom:4}}>Battery safety risk · cell-016 short</div>
            <div style={{color:"var(--ink-2)", fontSize:13, lineHeight:1.5, maxWidth:420}}>
              Workflow <em>battery_safety_risk_v1</em> proposed <strong>overall rating 4 / 5</strong>. Threshold reached; PI notified. AI drafted a remediation plan as a candidate revision.
            </div>
            <div style={{display:"flex", gap:8, marginTop:12}}>
              <button className="top-btn primary">Open review</button>
              <button className="top-btn">View AI draft</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{height:80}}/>
    </div>
  );
}

function ProjectShellContent({ route, setRoute, project }) {
  const tab = route.tab || "overview";
  if (tab === "overview")   return <ProjectOverview project={project} variant={route.variant} setVariant={v=>setRoute({...route, variant:v})}/>;
  if (tab === "pages")      return <PageEditor project={project}/>;
  if (tab === "calendar")   return <CalendarView project={project} embedded/>;
  if (tab === "artifacts")  return <ArtifactsView project={project}/>;
  // generic placeholder lists for remaining tabs (samples / experiments / iterations)
  return <GenericList project={project} kind={tab} setRoute={setRoute}/>;
}

function GenericList({ project, kind, setRoute }) {
  const [smpView, setSmpView] = React.useState("table");
  if (kind === "samples") {
    return (
      <div className="page-wrap wide">
        <div className="cal-head">
          <h2>Samples</h2>
          <div className="cmode">
            <button className={smpView==="table"?"on":""}   onClick={()=>setSmpView("table")}>Table</button>
            <button className={smpView==="cards"?"on":""}   onClick={()=>setSmpView("cards")}>Cards</button>
            <button className={smpView==="lineage"?"on":""} onClick={()=>setSmpView("lineage")}>Lineage</button>
          </div>
          <div className="right">
            <button className="top-btn"><Icon name="filter" size={12}/> Filter</button>
            <button className="top-btn primary" onClick={() => window.__app_setModal && window.__app_setModal("new-sample")}><Icon name="plus" size={12}/> New sample</button>
          </div>
        </div>
        {smpView === "table" && (
        <table style={{width:"100%", borderCollapse:"collapse", fontSize:13}}>
          <thead>
            <tr style={{textAlign:"left", color:"var(--muted-2)", fontFamily:"var(--mono)", fontSize:10.5, textTransform:"uppercase", letterSpacing:".06em"}}>
              <th style={{padding:"8px 8px", borderBottom:"1px solid var(--line)"}}>Identifier</th>
              <th style={{padding:"8px 8px", borderBottom:"1px solid var(--line)"}}>Kind</th>
              <th style={{padding:"8px 8px", borderBottom:"1px solid var(--line)"}}>Name</th>
              <th style={{padding:"8px 8px", borderBottom:"1px solid var(--line)"}}>Chemistry</th>
              <th style={{padding:"8px 8px", borderBottom:"1px solid var(--line)"}}>Mass</th>
              <th style={{padding:"8px 8px", borderBottom:"1px solid var(--line)"}}>Parent</th>
              <th style={{padding:"8px 8px", borderBottom:"1px solid var(--line)"}}>Status</th>
            </tr>
          </thead>
          <tbody>
            {LAB.SAMPLES.map(s => (
              <tr key={s.id} style={{borderBottom:"1px solid var(--line)", cursor:"default"}}
                  onClick={() => setRoute({view:"entity", entityType:"sample", entityId:s.id, projectId:project.id})}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-2)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <td style={{padding:"10px 8px", fontFamily:"var(--mono)", fontSize:12, color:"var(--ember)"}}>{s.id}</td>
                <td style={{padding:"10px 8px"}}><span className={"pill k-"+s.kind}>{s.kind}</span></td>
                <td style={{padding:"10px 8px"}}>{s.name}</td>
                <td style={{padding:"10px 8px", fontFamily:"var(--mono)", fontSize:12, color:"var(--ink-2)"}}>{s.chem || "—"}</td>
                <td style={{padding:"10px 8px", fontFamily:"var(--mono)", fontSize:12, color:"var(--muted)"}}>{s.mass || "—"}</td>
                <td style={{padding:"10px 8px", fontFamily:"var(--mono)", fontSize:12, color:"var(--muted)"}}>{s.parent || "—"}</td>
                <td style={{padding:"10px 8px"}}><span className={"pill s-"+s.status}><span className={"dot-s "+s.status}/>{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
        {smpView === "cards"   && <SamplesCardsView   project={project} setRoute={setRoute}/>}
        {smpView === "lineage" && <SamplesLineageView project={project} setRoute={setRoute}/>}
        <div style={{height:80}}/>
      </div>
    );
  }
  if (kind === "experiments") {
    return (
      <div className="page-wrap wide">
        <div className="cal-head">
          <h2>Experiments</h2>
          <div className="right">
            <button className="top-btn primary"><Icon name="plus" size={12}/> Log experiment</button>
          </div>
        </div>
        <div className="records three">
          {LAB.EXPERIMENTS.map(e => (
            <div key={e.id} className="rec" onClick={() => setRoute({view:"entity", entityType:"experiment", entityId:e.id, projectId:project.id})} style={{cursor:"default"}}>
              <div className="row" style={{gap:8}}>
                <span className="id">{e.id}</span>
                <span style={{marginLeft:"auto"}} className="pill">{e.method}</span>
              </div>
              <div className="name">{e.title}</div>
              <div style={{fontSize:12.5, color:"var(--muted)", lineHeight:1.5}}>{e.summary}</div>
              <div className="foot">
                <span className={"pill s-"+(e.status==="completed"?"done":(e.status==="in_progress"?"active":e.status))}><span className={"dot-s "+(e.status==="completed"?"done":(e.status==="in_progress"?"active":e.status))}/>{e.status.replace("_"," ")}</span>
                <span style={{fontFamily:"var(--mono)", fontSize:11}}>{e.samples.length} sample{e.samples.length>1?"s":""}</span>
                <span className="right" style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)"}}>{e.at}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{height:80}}/>
      </div>
    );
  }
  if (kind === "iterations") {
    const cur = LAB.ITERATIONS.find(i => i.status === "active");
    return (
      <div className="page-wrap">
        <div className="cal-head">
          <h2>Iterations</h2>
          <div className="right">
            <button className="top-btn primary" onClick={() => setRoute({view:"new-iteration", projectId: project.id})}><Icon name="plus" size={12}/> New iteration</button>
          </div>
        </div>
        {cur && (
          <>
            <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--muted-2)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:6}}>
              Current iteration · Iter-{cur.num}
            </div>
            <window.RiskAssessment id={cur.id} scope="iteration"/>
          </>
        )}
        <div className="section-h"><h2 style={{fontSize:20}}>All iterations</h2><span className="meta">{LAB.ITERATIONS.length} total</span></div>
        <div className="iter-list" style={{borderTopColor:"var(--line)"}}>
          {LAB.ITERATIONS.map(it => (
            <div key={it.id} className="iter-row" onClick={() => setRoute({view:"entity", entityType:"iteration", entityId:it.id, projectId:project.id})}>
              <div className="num">Iter-{it.num}</div>
              <div className="title">{it.name}
                <div className="sub">{it.samples} samples · {it.experiments} experiments · {LAB.PEOPLE[it.owner].name}</div>
              </div>
              <div className="dates">{it.start} → {it.end}</div>
              <div className="right">
                <span className={"pill s-"+it.status}><span className={"dot-s "+it.status}/>{it.status}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{height:80}}/>
      </div>
    );
  }
  return (
    <div className="page-wrap">
      <div style={{padding:"40px 0", color:"var(--muted)", fontFamily:"var(--mono)", fontSize:13}}>
            View “{kind}” — not stubbed in this design pass.
      </div>
    </div>
  );
}

function App() {
  const [t, setT] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = uS({ view: "project", projectId: "p_nmc", tab: "overview", variant: "editorial" });
  const [showAi, setShowAi] = uS(true);
  const [modal, setModal] = uS(null); // "share" | "new-sample" | "new-event" | null

  // sync variant tweak <-> route
  uE(() => {
    if (route.view === "project" && route.tab === "overview" && route.variant !== t.overview) {
      setRoute(r => ({ ...r, variant: t.overview }));
    }
  }, [t.overview]);

  // apply accent + density
  uE(() => {
    document.documentElement.style.setProperty("--ember", t.accent || "#d97757");
    document.body.style.setProperty("--ember", t.accent || "#d97757");
    // soft / tint shades derived (simple): keep static for now
  }, [t.accent]);

  uE(() => {
    document.body.style.fontSize = (t.density === "compact" ? 13 : (t.density === "comfy" ? 15 : 14)) + "px";
  }, [t.density]);

  uE(() => {
    document.documentElement.setAttribute("data-theme", t.theme || "light");
    window.__app_setModal = setModal;
  }, [t.theme]);

  const project = LAB.PROJECTS.find(p => p.id === route.projectId) || LAB.PROJECTS[0];

  let body = null;
  if (route.view === "home")     body = <HomeView setRoute={setRoute}/>;
  if (route.view === "calendar") body = <CalendarView/>;
  if (route.view === "project")  body = <ProjectShellContent route={route} setRoute={setRoute} project={project}/>;
  if (route.view === "meetings") body = <MeetingsList onOpen={id => setRoute({view:"meeting", meetingId:id})}/>;
  if (route.view === "meeting")  {
    const m = LAB.MEETINGS.find(mt => mt.id === route.meetingId);
    body = m && <MeetingPage meeting={m}/>;
  }
  if (route.view === "inbox")    body = <InboxPage setRoute={setRoute}/>;
  if (route.view === "people")   body = <PeoplePage setRoute={setRoute}/>;
  if (route.view === "account")  body = <AccountPage/>;
  if (route.view === "admin")    body = <AdminPage setRoute={setRoute}/>;
  if (route.view === "new-project")   body = <NewProjectPage setRoute={setRoute}/>;
  if (route.view === "new-iteration") body = <NewIterationPage setRoute={setRoute} project={project}/>;
  if (route.view === "template") body = <TemplatePage key={route.templateKey} setRoute={setRoute}/>;
  if (route.view === "entity")   {
    const proj = project;
    if (route.entityType === "sample") {
      const s = LAB.SAMPLE_BY_ID[route.entityId];
      body = s && <SamplePage sample={s} project={proj}/>;
    } else if (route.entityType === "experiment") {
      const e = LAB.EXP_BY_ID[route.entityId];
      body = e && <ExperimentPage experiment={e} project={proj}/>;
    } else if (route.entityType === "iteration") {
      const it = LAB.ITERATIONS.find(i => i.id === route.entityId);
      body = it && <PageEditor pageRef={{type:"iteration", id:it.id}} project={proj}/>;
    }
  }

  return (
    <div className={"app" + (showAi ? "" : " no-ai")}>
      <Sidebar route={route} setRoute={setRoute}/>
      <div className="main">
        <TopBar route={route} setRoute={setRoute} project={project} showAi={showAi} setShowAi={setShowAi} setModal={setModal}/>
        <Tabs route={route} setRoute={setRoute} project={project} setRoute2={setRoute}/>
        <div className="content">{body}</div>
      </div>
      {showAi && <AIPanel project={project} route={route}/>}

      {modal === "share"      && <ShareModal      project={project} onClose={() => setModal(null)}/>}
      {modal === "new-sample" && <NewSampleModal  project={project} onClose={() => setModal(null)}/>}
      {modal === "new-event"  && <NewEventModal                   onClose={() => setModal(null)}/>}

      <TweaksPanel>
        <TweakSection label="Project overview"/>
        <TweakRadio label="Layout" value={t.overview} options={["editorial","dashboard","stream"]}
          onChange={v => setT({ overview: v, ...(route.view==="project" ? {} : {}) }) || setRoute(r => ({...r, view:"project", tab:"overview", variant:v}))}/>

        <TweakSection label="Theme"/>
        <TweakRadio label="Mode" value={t.theme} options={["light","dark"]} onChange={v => setT("theme", v)}/>
        <TweakColor label="Accent" value={t.accent} options={ACCENTS} onChange={v => setT("accent", v)}/>
        <TweakRadio label="Density" value={t.density} options={["compact","regular","comfy"]} onChange={v => setT("density", v)}/>

        <TweakSection label="AI panel"/>
        <TweakToggle label="Show panel" value={showAi} onChange={v => setShowAi(v)}/>
        <TweakSelect label="Autonomy" value={t.aiAutonomy}
          options={["read_only","suggest_writes","auto_routine","full"]}
          onChange={v => setT("aiAutonomy", v)}/>

        <TweakSection label="Jump to"/>
        <div style={{display:"flex", flexDirection:"column", gap:5}}>
          {[
            ["Home",                ()=>setRoute({view:"home"})],
            ["Inbox",               ()=>setRoute({view:"inbox"})],
            ["People",              ()=>setRoute({view:"people"})],
            ["Workspace admin",     ()=>setRoute({view:"admin"})],
            ["Account settings",    ()=>setRoute({view:"account"})],
            ["New project",         ()=>setRoute({view:"new-project"})],
            ["New iteration",       ()=>setRoute({view:"new-iteration", projectId:"p_nmc"})],
            ["Project · Overview",  ()=>setRoute({view:"project", projectId:"p_nmc", tab:"overview", variant:t.overview})],
            ["Project · Page editor", ()=>setRoute({view:"project", projectId:"p_nmc", tab:"pages"})],
            ["Project · Iterations", ()=>setRoute({view:"project", projectId:"p_nmc", tab:"iterations"})],
            ["Project · Samples",   ()=>setRoute({view:"project", projectId:"p_nmc", tab:"samples"})],
            ["Project · Experiments", ()=>setRoute({view:"project", projectId:"p_nmc", tab:"experiments"})],
            ["Project · Artifacts", ()=>setRoute({view:"project", projectId:"p_nmc", tab:"artifacts"})],
            ["Calendar (all projects)", ()=>setRoute({view:"calendar"})],
            ["Meetings · list",       ()=>setRoute({view:"meetings"})],
            ["Meeting · PI weekly W22",()=>setRoute({view:"meeting", meetingId:"mtg_2026_05_21"})],
            ["Sample page · cell-014",()=>setRoute({view:"entity", entityType:"sample", entityId:"NMC-7B-cell-014", projectId:"p_nmc"})],
            ["Experiment page · EX-205 (SEM)",()=>setRoute({view:"entity", entityType:"experiment", entityId:"EX-205", projectId:"p_nmc"})],
            ["Iteration page · Iter-7",()=>setRoute({view:"entity", entityType:"iteration", entityId:"it_7", projectId:"p_nmc"})],
          ].map(([l, fn]) => (
            <button key={l} onClick={fn} style={{
              textAlign:"left", padding:"5px 8px", borderRadius:5,
              background:"rgba(255,255,255,.5)", border:"1px solid rgba(0,0,0,.05)",
              fontSize:11.5, color:"var(--ink-2)", fontFamily:"var(--mono)",
            }}>{l}</button>
          ))}
        </div>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
