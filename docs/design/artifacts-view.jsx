// artifacts-view.jsx — artifact gallery

const { Icon: IA, LAB: LA } = window;

function Thumb({ a }) {
  if (a.thumb === "plot") {
    // fake plot
    const pts = [];
    for (let i = 0; i < 22; i++) {
      const x = 14 + i * 8;
      const y = 70 - Math.min(60, 6 + i*1.6 - Math.sin(i*0.6)*4);
      pts.push([x,y]);
    }
    const path = pts.map((p,i)=> (i===0?"M":"L")+p[0]+" "+p[1]).join(" ");
    return (
      <div className="ahead" style={{background:"var(--surface)"}}>
        <div className="tt">{a.type}</div>
        <svg viewBox="0 0 200 90" style={{width:"86%",height:"82%"}}>
          <rect x="6" y="6" width="188" height="76" fill="none" stroke="var(--line)"/>
          <path d={path} fill="none" stroke="var(--ember)" strokeWidth="1.6"/>
          <path d={pts.map((p,i)=>(i===0?"M":"L")+p[0]+" "+(p[1]+10)).join(" ")} fill="none" stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3"/>
        </svg>
      </div>
    );
  }
  if (a.thumb === "sem") {
    return (
      <div className="ahead" style={{background:"#1f1c14", color:"#fff"}}>
        <div className="tt" style={{background:"rgba(0,0,0,.4)",color:"#f2dccf",borderColor:"transparent"}}>{a.type}</div>
        <div style={{position:"absolute", inset:0, background:`
          radial-gradient(circle at 28% 32%, rgba(217,194,165,.6) 0, transparent 24%),
          radial-gradient(circle at 55% 60%, rgba(184,158,124,.5) 0, transparent 28%),
          radial-gradient(circle at 78% 28%, rgba(155,128,94,.55) 0, transparent 22%),
          radial-gradient(circle at 18% 78%, rgba(120,98,68,.45) 0, transparent 26%),
          repeating-linear-gradient(35deg, rgba(255,255,255,.04) 0 2px, transparent 2px 5px),
          linear-gradient(180deg, #2a2418 0, #0e0c08 100%)
        `}}/>
        <div style={{position:"absolute", bottom:6, left:8, fontFamily:"var(--mono)", fontSize:9, color:"rgba(255,255,255,.7)"}}>10 µm</div>
        <div style={{position:"absolute", bottom:6, right:8, fontFamily:"var(--mono)", fontSize:9, color:"rgba(255,255,255,.7)"}}>25 kX</div>
      </div>
    );
  }
  if (a.thumb === "code") {
    return (
      <div className="ahead" style={{background:"var(--surface)", alignItems:"flex-start", justifyContent:"flex-start", padding:10}}>
        <div className="tt">{a.type}</div>
        <div style={{position:"absolute", inset:14, fontFamily:"var(--mono)", fontSize:9.5, color:"var(--muted)", lineHeight:1.55, overflow:"hidden"}}>
          <div><span style={{color:"var(--code-fg)"}}>import</span> numpy <span style={{color:"var(--code-fg)"}}>as</span> np</div>
          <div><span style={{color:"var(--code-fg)"}}>import</span> matplotlib.pyplot <span style={{color:"var(--code-fg)"}}>as</span> plt</div>
          <div>&nbsp;</div>
          <div><span style={{color:"var(--muted-2)"}}># Load cycling data for cell-014</span></div>
          <div>data = pd.read_csv(<span style={{color:"var(--ref-exp-fg)"}}>"7B/cell014.csv"</span>)</div>
          <div>cap = data[<span style={{color:"var(--ref-exp-fg)"}}>"discharge_mAh"</span>] / mass</div>
          <div>plt.plot(data.cycle, cap, <span style={{color:"var(--ref-exp-fg)"}}>"o-"</span>)</div>
          <div>plt.xlabel(<span style={{color:"var(--ref-exp-fg)"}}>"cycle"</span>); plt.ylabel(<span style={{color:"var(--ref-exp-fg)"}}>"Q (mAh/g)"</span>)</div>
          <div>plt.show()</div>
        </div>
      </div>
    );
  }
  if (a.thumb === "doc") {
    return (
      <div className="ahead" style={{background:"var(--surface)", alignItems:"flex-start", padding:14}}>
        <div className="tt">{a.type}</div>
        <div style={{position:"absolute", left:14, right:14, top:34, display:"flex", flexDirection:"column", gap:5}}>
          <div style={{height:6, background:"var(--ink)", width:"55%", borderRadius:1}}/>
          <div style={{height:3, background:"var(--line-2)", width:"100%"}}/>
          <div style={{height:3, background:"var(--line-2)", width:"94%"}}/>
          <div style={{height:3, background:"var(--line-2)", width:"88%"}}/>
          <div style={{height:3, background:"var(--line-2)", width:"96%"}}/>
          <div style={{height:3, background:"var(--line-2)", width:"60%"}}/>
          <div style={{height:6}}/>
          <div style={{height:4, background:"var(--muted)", width:"35%", borderRadius:1}}/>
          <div style={{height:3, background:"var(--line-2)", width:"100%"}}/>
          <div style={{height:3, background:"var(--line-2)", width:"92%"}}/>
          <div style={{height:3, background:"var(--line-2)", width:"80%"}}/>
        </div>
      </div>
    );
  }
  if (a.thumb === "photo") {
    return (
      <div className="ahead" style={{background:`
        linear-gradient(145deg, #c8b89e 0%, #8a7458 35%, #57462f 65%, #2c2418 100%),
        repeating-linear-gradient(45deg, rgba(255,255,255,.04) 0 3px, transparent 3px 7px)
      `}}>
        <div className="tt" style={{background:"rgba(255,255,255,.85)"}}>{a.type}</div>
        <div style={{position:"absolute", inset:0, background:"radial-gradient(circle at 60% 45%, rgba(217,119,87,.18) 0, transparent 40%)"}}/>
      </div>
    );
  }
  return (
    <div className="ahead">
      <div className="tt">{a.type}</div>
      <div className="ph-stripes"/>
    </div>
  );
}

function ArtifactsView({ project }) {
  return (
    <div className="page-wrap wide">
      <div className="cal-head">
        <h2>Artifacts</h2>
        <div className="cmode">
          <button className="on"><IA name="grid" size={11}/> Grid</button>
          <button><IA name="list" size={11}/> List</button>
        </div>
        <div className="right">
          <button className="top-btn"><IA name="filter" size={12}/> Filter</button>
          <button className="top-btn primary"><IA name="plus" size={12}/> Upload</button>
        </div>
      </div>

      <div className="arti-bar">
        <button className="filt on">All <span style={{fontFamily:"var(--mono)", marginLeft:4, opacity:.6}}>142</span></button>
        <button className="filt">PDF <span style={{fontFamily:"var(--mono)", marginLeft:4, opacity:.6}}>48</span></button>
        <button className="filt">Notebooks <span style={{fontFamily:"var(--mono)", marginLeft:4, opacity:.6}}>22</span></button>
        <button className="filt">Images <span style={{fontFamily:"var(--mono)", marginLeft:4, opacity:.6}}>68</span></button>
        <button className="filt">Other <span style={{fontFamily:"var(--mono)", marginLeft:4, opacity:.6}}>4</span></button>
        <span style={{marginLeft:"auto", fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)"}}>Sorted by recently added</span>
      </div>

      <div className="arti-grid">
        {LA.ARTIFACTS.map(a => (
          <div key={a.id} className="arti">
            <Thumb a={a}/>
            <div className="ameta">
              <div className="aname">{a.name}</div>
              <div className="asub">{a.size} · {LA.PEOPLE[a.by].name.split(" ")[0]} · {a.at}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{height:80}}/>
    </div>
  );
}

window.ArtifactsView = ArtifactsView;
