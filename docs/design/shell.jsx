// shell.jsx — app shell: sidebar, top bar, tabs

const { useState } = React;
const { Icon, LAB } = window;

function Avatar({ id, size = 22, ring }) {
  const p = LAB.PEOPLE[id] || { name: id, color: "#666" };
  const init = p.name.split(" ").map(s => s[0]).join("").slice(0,2);
  return (
    <div className="a" style={{
      width: size, height: size,
      background: p.color, color: "#fff",
      borderRadius: "50%",
      display: "grid", placeItems: "center",
      fontSize: Math.max(9, size * 0.42), fontWeight: 600,
      letterSpacing: ".02em",
      boxShadow: ring ? "0 0 0 2px var(--paper)" : "none",
    }} title={p.name}>{init}</div>
  );
}

function Sidebar({ route, setRoute }) {
  const projects = LAB.PROJECTS;
  return (
    <aside className="side">
      <div className="side-head">
        <div className="ws-badge">H</div>
        <div style={{minWidth:0}}>
          <div className="ws-name">Halide</div>
          <div className="ws-sub">{LAB.WORKSPACE.sub}</div>
        </div>
        <button className="ws-pick"><Icon name="chev-d" size={12}/></button>
      </div>

      <div className="side-search">
        <Icon name="search" size={13}/>
        <span>Search or jump to…</span>
        <span className="kbd">⌘K</span>
      </div>

      <nav className="side-nav">
        <button className={"side-item" + (route.view==="home"?" active":"")} onClick={()=>setRoute({view:"home"})}>
          <span className="ic"><Icon name="home" size={13}/></span>
          Home
        </button>
        <button className={"side-item" + (route.view==="inbox"?" active":"")} onClick={()=>setRoute({view:"inbox"})}>
          <span className="ic"><Icon name="inbox" size={13}/></span>
          Inbox
          <span className="count">{LAB.INBOX.filter(i=>i.unread).length}</span>
        </button>
        <button className={"side-item" + (route.view==="calendar"?" active":"")} onClick={()=>setRoute({view:"calendar"})}>
          <span className="ic"><Icon name="calendar" size={13}/></span>
          Calendar
        </button>
        <button className={"side-item" + ((route.view==="meetings"||route.view==="meeting")?" active":"")} onClick={()=>setRoute({view:"meetings"})}>
          <span className="ic"><Icon name="book" size={13}/></span>
          Meetings
          <span className="count">{LAB.MEETINGS.length}</span>
        </button>
        <button className={"side-item" + (route.view==="people"?" active":"")} onClick={()=>setRoute({view:"people"})}>
          <span className="ic"><Icon name="users" size={13}/></span>
          People
          <span className="count">{LAB.MEMBERS.length}</span>
        </button>
        <button className={"side-item" + (route.view==="admin"?" active":"")} onClick={()=>setRoute({view:"admin"})}>
          <span className="ic"><Icon name="shield" size={13}/></span>
          Admin
          <span className="count" style={{color:"var(--ember)"}}>PI</span>
        </button>
      </nav>

      <div className="side-sect">
        <span>Projects</span>
        <button className="add" title="New project" onClick={()=>setRoute({view:"new-project"})}>＋</button>
      </div>
      <div className="side-tree">
        {projects.map(p => {
          const isActive = route.view==="project" && route.projectId === p.id;
          const isExpanded = isActive;
          return (
            <React.Fragment key={p.id}>
              <button className={"tree-item" + (isActive ? " active" : "")} onClick={()=>setRoute({view:"project", projectId:p.id, tab:"overview"})}>
                <span className="chev"><Icon name={isExpanded?"chev-d":"chev-r"} size={10}/></span>
                <span className="glyph">{p.emblem}</span>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                {p.visibility==="private" && <span style={{marginLeft:"auto",color:"var(--muted-2)"}}><Icon name="lock" size={11}/></span>}
              </button>
              {isExpanded && (
                <div className="tree-children">
                  <button className={"tree-item"+(route.tab==="overview"?" active":"")} onClick={()=>setRoute({...route, tab:"overview"})}>
                    <span style={{width:10}}/><span className="dot"/>Overview
                  </button>
                  <button className={"tree-item"+(route.tab==="iterations"?" active":"")} onClick={()=>setRoute({...route, tab:"iterations"})}>
                    <span style={{width:10}}/><span className="dot"/>Iterations
                  </button>
                  <button className={"tree-item"+(route.tab==="samples"?" active":"")} onClick={()=>setRoute({...route, tab:"samples"})}>
                    <span style={{width:10}}/><span className="dot"/>Samples
                  </button>
                  <button className={"tree-item"+(route.tab==="experiments"?" active":"")} onClick={()=>setRoute({...route, tab:"experiments"})}>
                    <span style={{width:10}}/><span className="dot"/>Experiments
                  </button>
                  <button className={"tree-item"+(route.tab==="pages"?" active":"")} onClick={()=>setRoute({...route, tab:"pages"})}>
                    <span style={{width:10}}/><span className="dot"/>Pages
                  </button>
                  <button className={"tree-item"+(route.tab==="artifacts"?" active":"")} onClick={()=>setRoute({...route, tab:"artifacts"})}>
                    <span style={{width:10}}/><span className="dot"/>Artifacts
                  </button>
                  <button className={"tree-item"+(route.tab==="calendar"?" active":"")} onClick={()=>setRoute({...route, tab:"calendar"})}>
                    <span style={{width:10}}/><span className="dot"/>Calendar
                  </button>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="side-sect">
        <span>Templates</span>
      </div>
      <div className="side-tree">
        <button className={"tree-item" + (route.view==="template" && route.templateKey==="battery_safety_risk_v1" ? " active" : "")} onClick={()=>setRoute({view:"template", templateKey:"battery_safety_risk_v1"})}>
          <span className="chev"/><span className="glyph">⌗</span>
          <span className="label">Battery safety risk</span>
        </button>
        <button className={"tree-item" + (route.view==="template" && route.templateKey==="experimental_risk_v1" ? " active" : "")} onClick={()=>setRoute({view:"template", templateKey:"experimental_risk_v1"})}>
          <span className="chev"/><span className="glyph">⌗</span>
          <span className="label">Experimental risk</span>
        </button>
        <button className={"tree-item" + (route.view==="template" && route.templateKey==="project_risk_v1" ? " active" : "")} onClick={()=>setRoute({view:"template", templateKey:"project_risk_v1"})}>
          <span className="chev"/><span className="glyph">⌗</span>
          <span className="label">Project risk</span>
        </button>
      </div>

      <div className="side-foot">
        <div className="avatar">JR</div>
        <div style={{minWidth:0}}>
          <div className="me-name">Jules Reyes</div>
          <div className="me-sub">jules@halide-lab.org</div>
        </div>
        <button className="icon-btn" style={{marginLeft:"auto"}} onClick={()=>setRoute({view:"account"})} title="Account settings"><Icon name="settings" size={14}/></button>
      </div>
    </aside>
  );
}

function TopBar({ route, setRoute, project, page, showAi, setShowAi, setModal }) {
  let crumbs = [];
  if (route.view === "home")     crumbs = [{label:"Halide"}, {label:"Home", cur:true}];
  if (route.view === "calendar") crumbs = [{label:"Halide"}, {label:"Calendar", cur:true}];
  if (route.view === "project")  crumbs = [{label:"Halide"}, {label:"Projects"}, {label: project?.name, cur:true}];
  if (route.view === "meetings") crumbs = [{label:"Halide"}, {label:"Meetings", cur:true}];
  if (route.view === "inbox")    crumbs = [{label:"Halide"}, {label:"Inbox", cur:true}];
  if (route.view === "people")   crumbs = [{label:"Halide"}, {label:"People", cur:true}];
  if (route.view === "account")  crumbs = [{label:"Halide"}, {label:"Settings"}, {label:"Account", cur:true}];
  if (route.view === "admin")    crumbs = [{label:"Halide"}, {label:"Workspace admin", cur:true}];
  if (route.view === "new-project")   crumbs = [{label:"Halide"}, {label:"Projects"}, {label:"New project", cur:true}];
  if (route.view === "new-iteration") crumbs = [{label:"Halide"}, {label: project?.name || "Project"}, {label:"Iterations"}, {label:"New iteration", cur:true}];
  if (route.view === "meeting")  {
    const m = LAB.MEETINGS.find(mt => mt.id === route.meetingId);
    crumbs = [{label:"Halide"}, {label:"Meetings", cur:false}, {label: m?.title || "Meeting", cur:true}];
  }
  if (route.view === "entity")   {
    const proj = project;
    let label = "Entity";
    if (route.entityType === "sample")     label = LAB.SAMPLE_BY_ID[route.entityId]?.id || "Sample";
    if (route.entityType === "experiment") label = LAB.EXP_BY_ID[route.entityId]?.id || "Experiment";
    if (route.entityType === "iteration") {
      const it = LAB.ITERATIONS.find(i => i.id === route.entityId);
      label = it ? "Iter-" + it.num : "Iteration";
    }
    crumbs = [{label:"Halide"}, {label: proj?.name || "Project"}, {label: route.entityType+"s"}, {label, cur:true}];
  }
  if (route.view === "page")     crumbs = [{label:"Halide"}, {label: project?.name}, {label:"Pages"}, {label: page?.title || "Iter-7 · Week 22 notes", cur:true}];

  return (
    <header className="top">
      <button className="icon-btn" onClick={()=>history.back && history.back()}><Icon name="side" size={14}/></button>
      <div className="crumbs">
        {crumbs.map((c,i)=>(
          <React.Fragment key={i}>
            <span className={c.cur ? "cur" : ""}
              onClick={() => {
                // Lightweight back-nav: if crumb is "Meetings" or project, route to it
                if (c.label === "Meetings" && !c.cur) setRoute({view:"meetings"});
                if (c.label === project?.name && !c.cur) setRoute({view:"project", projectId:project.id, tab:"overview"});
              }}
              style={{cursor: c.cur ? "default" : "default"}}
            >{c.label}</span>
            {i < crumbs.length-1 && <span className="sep">/</span>}
          </React.Fragment>
        ))}
      </div>

      <div className="top-actions">
        {route.view==="project" && (
          <div className="row" style={{gap:6, marginRight:6}}>
            <div className="row" style={{gap:0}}>
              {(project?.collaborators || ["MT","JR","SP","KB","DV"]).map((id,i)=>(
                <div key={id} style={{marginLeft: i===0?0:-6}}><Avatar id={id} ring/></div>
              ))}
            </div>
            <button className="top-btn" onClick={() => setModal && setModal("share")}><Icon name="users" size={12}/> Share</button>
          </div>
        )}
        <button className="top-btn"><Icon name="history" size={12}/></button>
        <button className="top-btn"><Icon name="more" size={14}/></button>
        <button className={"top-btn" + (showAi ? "" : "")} onClick={()=>setShowAi(!showAi)} title="Toggle AI panel">
          <span className="ai-orb" style={{width:14, height:14}}/> AI
        </button>
      </div>
    </header>
  );
}

function Tabs({ route, setRoute, project }) {
  if (route.view !== "project") return null;
  const items = [
    { id:"overview",    label:"Overview" },
    { id:"iterations",  label:"Iterations",  badge: project ? project.activeIter || 4 : null },
    { id:"samples",     label:"Samples",     badge: project?.samples || 34 },
    { id:"experiments", label:"Experiments", badge: project?.experiments || 58 },
    { id:"pages",       label:"Pages" },
    { id:"artifacts",   label:"Artifacts",   badge: project?.artifacts || 142 },
    { id:"calendar",    label:"Calendar" },
  ];
  return (
    <div className="tabs">
      {items.map(t => (
        <button key={t.id} className={"tab" + (route.tab===t.id ? " active" : "")} onClick={()=>setRoute({...route, tab:t.id})}>
          {t.label}
          {t.badge != null && <span className="badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

Object.assign(window, { Sidebar, TopBar, Tabs, Avatar });
