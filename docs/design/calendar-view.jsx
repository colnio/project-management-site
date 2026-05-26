// calendar-view.jsx — Gantt + upcoming events

const { Icon: IC, LAB: LC } = window;

function CalendarView({ project, embedded }) {
  return (
    <div className={"page-wrap" + (embedded ? " wide" : " wide")}>
      <div className="cal-head">
        <h2>{embedded ? project.name + " · Timeline" : "Calendar"}</h2>
        <div className="cmode">
          <button className="on">Timeline</button>
          <button>Calendar</button>
          <button>Agenda</button>
        </div>
        <div className="nav">
          <button className="arr">‹</button>
          <span>March → October 2026</span>
          <button className="arr">›</button>
        </div>
        <div className="right">
          <div className="ics">
            <IC name="link" size={11}/>
            <span>halide.app/cal/jules/4f7c2a.ics</span>
            <button style={{color:"var(--ink)"}}>copy</button>
          </div>
          <button className="top-btn primary" onClick={() => window.__app_setModal && window.__app_setModal("new-event")}><IC name="plus" size={12}/> New event</button>
        </div>
      </div>

      {/* GANTT */}
      <div className="gantt-full">
        <div className="gf-head">
          <div>Project / Iteration</div>
          <div>Mar</div><div>Apr</div><div>May</div><div>Jun</div><div>Jul</div><div>Aug</div><div>Sep</div><div>Oct</div>
          <div>Nov</div><div>Dec</div><div>Jan</div><div>Feb</div>
        </div>

        {/* NMC project group */}
        <div className="gf-row group">
          <div className="lbl">
            <span style={{fontFamily:"var(--serif)", color:"var(--ember)"}}>N</span>
            <span>NMC811 Cathode Optimization</span>
            <span className="sub">10 iters</span>
          </div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gtoday" style={{left:"24%"}}/>
          </div>
        </div>

        <div className="gf-row">
          <div className="lbl indent">Iter-4 · Coater calib</div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gbar done" style={{left:"1.5%", width:"5%"}}>Iter-4</div>
          </div>
        </div>
        <div className="gf-row">
          <div className="lbl indent">Iter-5 · LPSCl drying</div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gbar done" style={{left:"7%", width:"6%"}}>Iter-5</div>
          </div>
        </div>
        <div className="gf-row">
          <div className="lbl indent">Iter-6 · 4.20 V baseline</div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gbar done" style={{left:"13%", width:"7%"}}>Iter-6</div>
          </div>
        </div>
        <div className="gf-row">
          <div className="lbl indent">Iter-7 · 4.30 V cycling</div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gbar active" style={{left:"20%", width:"8.5%"}}>Iter-7 · active</div>
            <div className="gtoday" style={{left:"24%"}}/>
            <div className="gevt dl" title="DOE-BES report" style={{left:"23%"}}>!</div>
          </div>
        </div>
        <div className="gf-row">
          <div className="lbl indent">Iter-8 · Binder compare</div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gbar planned" style={{left:"29%", width:"6%"}}>Iter-8</div>
          </div>
        </div>
        <div className="gf-row">
          <div className="lbl indent">Iter-9 · Pouch scale-up</div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gbar planned" style={{left:"36%", width:"8%"}}>Iter-9</div>
          </div>
        </div>

        {/* sulfide project group */}
        {!embedded && (
        <>
        <div className="gf-row group">
          <div className="lbl">
            <span style={{fontFamily:"var(--serif)", color:"var(--ember)"}}>S</span>
            <span>Sulfide Electrolyte Stability</span>
            <span className="sub">4 iters</span>
          </div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gtoday" style={{left:"24%"}}/>
          </div>
        </div>
        <div className="gf-row">
          <div className="lbl indent">Iter-2 · Moisture exposure</div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gbar done" style={{left:"5%", width:"8%"}}>Iter-2</div>
          </div>
        </div>
        <div className="gf-row">
          <div className="lbl indent">Iter-3 · Dry-room SOPs</div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gbar active" style={{left:"17%", width:"10%"}}>Iter-3 · active</div>
          </div>
        </div>

        {/* anode free */}
        <div className="gf-row group">
          <div className="lbl">
            <span style={{fontFamily:"var(--serif)", color:"var(--ember)"}}>A</span>
            <span>Anode-Free Cell Architecture</span>
            <span className="sub">2 iters</span>
          </div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gtoday" style={{left:"24%"}}/>
          </div>
        </div>
        <div className="gf-row">
          <div className="lbl indent">Iter-1 · Cu substrate prep</div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gbar active" style={{left:"22%", width:"7%"}}>Iter-1 · active</div>
          </div>
        </div>
        <div className="gf-row">
          <div className="lbl indent">Iter-2 · First plating cycles</div>
          <div className="track">
            {Array.from({length:12}).map((_,i)=><div key={i} className="gcell"/>)}
            <div className="gbar planned" style={{left:"30%", width:"9%"}}>Iter-2</div>
          </div>
        </div>
        </>
        )}
      </div>

      {/* legend + events */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1.4fr", gap:24, marginTop:24}}>
        <div>
          <div className="section-h" style={{margin:"0 0 10px"}}>
            <h2 style={{fontSize:20}}>Subscribe</h2>
          </div>
          <p style={{color:"var(--muted)", fontSize:13, lineHeight:1.6, maxWidth:420}}>
            Subscribe to your personal feed of project events, iteration boundaries, and deadlines. The URL is per-user, signed, and can be rotated from Settings.
          </p>
          <div style={{display:"flex", flexDirection:"column", gap:8, marginTop:14, maxWidth:420}}>
            <div className="row" style={{padding:"9px 12px", border:"1px solid var(--line)", borderRadius:6, gap:10, background:"var(--surface)"}}>
              <div style={{width:24, height:24, borderRadius:5, background:"var(--surface)", border:"1px solid var(--line)", display:"grid", placeItems:"center", fontFamily:"var(--serif)", fontSize:14, color:"var(--ember)"}}>G</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:500, fontSize:13}}>Google Calendar</div>
                <div style={{fontSize:11.5, color:"var(--muted)"}}>refresh ≈ every 12 h</div>
              </div>
              <button className="top-btn">Add by URL</button>
            </div>
            <div className="row" style={{padding:"9px 12px", border:"1px solid var(--line)", borderRadius:6, gap:10, background:"var(--surface)"}}>
              <div style={{width:24, height:24, borderRadius:5, background:"var(--surface)", border:"1px solid var(--line)", display:"grid", placeItems:"center", fontFamily:"var(--serif)", fontSize:14, color:"var(--ember)"}}>A</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:500, fontSize:13}}>Apple Calendar</div>
                <div style={{fontSize:11.5, color:"var(--muted)"}}>refresh ≈ every 15 min</div>
              </div>
              <button className="top-btn">Subscribe…</button>
            </div>
            <div className="row" style={{padding:"9px 12px", border:"1px solid var(--line)", borderRadius:6, gap:10, background:"var(--surface)"}}>
              <div style={{width:24, height:24, borderRadius:5, background:"var(--surface)", border:"1px solid var(--line)", display:"grid", placeItems:"center", fontFamily:"var(--serif)", fontSize:14, color:"var(--ember)"}}>O</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:500, fontSize:13}}>Outlook</div>
                <div style={{fontSize:11.5, color:"var(--muted)"}}>refresh ≈ every 1 h</div>
              </div>
              <button className="top-btn">Add from internet</button>
            </div>
          </div>
        </div>

        <div>
          <div className="section-h" style={{margin:"0 0 4px"}}>
            <h2 style={{fontSize:20}}>Upcoming</h2>
            <span className="meta">next 30 days</span>
          </div>
          <div className="events">
            {LC.EVENTS.map(e => (
              <div key={e.d+e.t} className="e">
                <div className="when">
                  {e.w}
                  <b>{e.d.split(" ")[1]}</b>
                  {e.d.split(" ")[0]}
                </div>
                <div className="what">
                  <span className="marker" style={{background: e.kind==="deadline" ? "var(--ink)" : (e.kind==="milestone" ? "var(--ember)" : (e.kind==="meeting" ? "#7d8db5" : "var(--muted-2)"))}}/>
                  {e.t}
                  <div className="sub">{e.sub}</div>
                </div>
                <div>
                  <span className="pill" style={{textTransform:"capitalize"}}>{e.kind}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{height:80}}/>
    </div>
  );
}

window.CalendarView = CalendarView;
