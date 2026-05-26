// modals.jsx — Share dialog · New sample form · New event form

const { Avatar: AvM, Icon: IM, LAB: LM } = window;

function ModalShell({ title, subtitle, onClose, children, footer, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={"modal" + (wide ? " modal-wide" : "")} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{flex:1, minWidth:0}}>
            <h2 className="modal-title">{title}</h2>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close"><IM name="x" size={14}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ─── Share dialog ─────────────────────────────────────────────── */

function ShareModal({ project, onClose }) {
  const p = project || LM.PROJECTS[0];
  const collabs = (p.collaborators || ["MT","JR","SP","KB","DV"]).map(id => LM.MEMBERS.find(m => m.id === id) || LM.PEOPLE[id]);
  return (
    <ModalShell
      title={"Share " + p.name}
      subtitle="Spec §5 — workspace + project roles compose by max(). Externals get local password accounts."
      onClose={onClose}
      footer={<>
        <button className="top-btn" onClick={onClose}>Close</button>
        <div style={{flex:1}}/>
        <button className="top-btn">Copy link</button>
        <button className="top-btn primary">Send invites</button>
      </>}
    >
      <div className="share-vis">
        <div className="share-vis-row">
          <div>
            <div className="share-vis-h"><span className="share-vis-glyph">⏣</span> Workspace · all members can read</div>
            <div className="share-vis-sub">Everyone in Halide sees this project. Explicit collaborators below can edit.</div>
          </div>
          <button className="top-btn">Change visibility</button>
        </div>
      </div>

      <div className="share-add">
        <input className="set-input" placeholder="invite by email or pick a member…" style={{flex:1, maxWidth:"none"}}/>
        <select className="set-input" style={{maxWidth:130}}>
          <option>Editor</option>
          <option>Viewer</option>
        </select>
        <button className="top-btn primary">Invite</button>
      </div>
      <div className="share-hint">
        Allow-listed domains for SSO: <span className="set-chip">halide-lab.org</span> <span className="set-chip">stanford.edu</span> <span className="set-chip">caltech.edu</span>. Other emails will receive an external invite (local password).
      </div>

      <div className="share-table">
        <div className="share-th">
          <div>Member</div><div>Access</div><div>Last active</div><div></div>
        </div>
        {collabs.filter(Boolean).map(m => (
          <div key={m.id} className="share-tr">
            <div className="share-who">
              <AvM id={m.id} size={26}/>
              <div style={{minWidth:0}}>
                <div className="share-name">{m.name}</div>
                <div className="share-email">{m.email || (m.id + "@halide-lab.org")}</div>
              </div>
            </div>
            <div>
              <select className="set-input" style={{maxWidth:120, padding:"3px 8px", fontSize:12.5}}>
                <option selected={m.role === "owner"}>Lead</option>
                <option selected={m.role === "admin" || m.role === "member"}>Editor</option>
                <option>Viewer</option>
                <option>Remove</option>
              </select>
            </div>
            <div style={{fontFamily:"var(--mono)",fontSize:11.5,color:"var(--muted)"}}>{m.lastActive || "—"}</div>
            <div style={{textAlign:"right"}}>
              {m.role === "external" && <span className="pill" style={{color:"var(--muted)"}}>external</span>}
            </div>
          </div>
        ))}
        <div className="share-tr share-pending">
          <div className="share-who">
            <div className="share-pending-av">@</div>
            <div style={{minWidth:0}}>
              <div className="share-name">rae.kim@stanford.edu</div>
              <div className="share-email">Invited May 23 · expires in 3 days</div>
            </div>
          </div>
          <div><span className="pill">Editor (pending)</span></div>
          <div style={{fontFamily:"var(--mono)",fontSize:11.5,color:"var(--muted)"}}>—</div>
          <div style={{textAlign:"right"}}>
            <button className="top-btn" style={{fontSize:11.5}}>Resend</button>
            <button className="top-btn" style={{fontSize:11.5, color:"var(--bad)"}}>Revoke</button>
          </div>
        </div>
      </div>

      <div className="share-foot-block">
        <div className="share-vis-h" style={{marginBottom:6}}><IM name="link" size={12}/> Share-by-link</div>
        <div className="share-vis-sub" style={{marginBottom:10}}>Anyone with the link can view (read-only). Disable to keep the project invite-only.</div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <code className="share-link">halide.app/p/{p.id}?share=4f7c2a6e9d83</code>
          <button className="top-btn">Copy</button>
          <button className="top-btn">Rotate</button>
          <span style={{flex:1}}/>
          <span className="sw-toggle on"><span className="sw-knob"/></span>
        </div>
      </div>
    </ModalShell>
  );
}

/* ─── New sample form ──────────────────────────────────────────── */

function NewSampleModal({ project, onClose }) {
  const p = project || LM.PROJECTS[0];
  const [kind, setKind] = React.useState("cell");
  const idPreview = {
    cell: "NMC-7B-cell-017",
    electrode: "NMC-7B-cathode-r4",
    precursor: "LPSCl-batch-23",
    derivative: "PM-cell-014-cs",
    module: "MOD-7B-01",
    other: "OTHER-001",
  }[kind];

  return (
    <ModalShell
      title="New sample"
      subtitle={p.name + " · auto-id, freeform properties (spec §10)"}
      onClose={onClose}
      wide
      footer={<>
        <button className="top-btn" onClick={onClose}>Cancel</button>
        <div style={{flex:1}}/>
        <button className="top-btn">Save & add another</button>
        <button className="top-btn primary">Create sample</button>
      </>}
    >
      <FieldRow label="Kind" sublabel="Determines lineage role and default properties.">
        <div className="kind-picker">
          {["precursor","electrode","cell","derivative","module","other"].map(k => (
            <button key={k} className={"kind-card kind-"+k + (kind===k?" on":"")} onClick={()=>setKind(k)}>
              <span className={"pill k-"+k}>{k}</span>
              <span className="kind-card-eg">
                {k==="cell" && "e.g. coin cell, 2032"}
                {k==="electrode" && "e.g. cathode slurry, coated foil"}
                {k==="precursor" && "e.g. NMC powder, electrolyte"}
                {k==="derivative" && "e.g. post-mortem cross-section"}
                {k==="module" && "e.g. 4-cell pouch stack"}
                {k==="other" && "e.g. reference electrode, custom"}
              </span>
            </button>
          ))}
        </div>
      </FieldRow>

      <FieldRow label="Identifier" sublabel="Auto-suggested from kind + project + next sequence. Editable.">
        <input className="set-input" defaultValue={idPreview} style={{fontFamily:"var(--mono)"}}/>
      </FieldRow>
      <FieldRow label="Name" sublabel="Short, human-readable.">
        <input className="set-input" defaultValue={kind === "cell" ? "Coin cell, batch 7B, channel 17" : ""} placeholder="e.g. Coin cell, batch 7C, channel 1"/>
      </FieldRow>
      <FieldRow label="Description" sublabel="Optional. The AI extracts canonical fields from this prose (spec §10).">
        <textarea className="set-input" rows={3} placeholder="What's special about this sample? Where in the lineage does it sit?"/>
      </FieldRow>

      <div className="ns-properties">
        <div className="ns-properties-h">
          Properties
          <span className="ns-properties-hint">freeform JSONB · key/value · canonical schemas in v2</span>
        </div>
        {kind === "cell" && <>
          <FieldRow label="Chemistry"><input className="set-input" defaultValue="NMC811 // LPSCl // Li-In" style={{fontFamily:"var(--mono)"}}/></FieldRow>
          <FieldRow label="Mass (g)"><input className="set-input" defaultValue="11.4" style={{maxWidth:160,fontFamily:"var(--mono)"}}/></FieldRow>
          <FieldRow label="Capacity (mAh/g)"><input className="set-input" placeholder="— measured after first formation cycle" style={{maxWidth:280,fontFamily:"var(--mono)"}}/></FieldRow>
          <FieldRow label="V cutoff"><input className="set-input" defaultValue="4.30 V" style={{maxWidth:160,fontFamily:"var(--mono)"}}/></FieldRow>
        </>}
        {kind === "electrode" && <>
          <FieldRow label="Chemistry"><input className="set-input" defaultValue="NMC811 + PVDF + Super C65" style={{fontFamily:"var(--mono)"}}/></FieldRow>
          <FieldRow label="Loading (mg/cm²)"><input className="set-input" defaultValue="12.4" style={{maxWidth:160,fontFamily:"var(--mono)"}}/></FieldRow>
        </>}
        {kind === "precursor" && <>
          <FieldRow label="Chemistry"><input className="set-input" placeholder="e.g. Li₆PS₅Cl" style={{fontFamily:"var(--mono)"}}/></FieldRow>
          <FieldRow label="Mass (g)"><input className="set-input" placeholder="—" style={{maxWidth:160,fontFamily:"var(--mono)"}}/></FieldRow>
        </>}
      </div>

      <FieldRow label="Parent (derived from)" sublabel="Sets up the lineage edge. Leave blank for root samples like precursors.">
        <div className="sample-picker">
          <input className="set-input" placeholder="search sample id…" style={{flex:1, maxWidth:"none"}}/>
          <span className="sample-suggested">Suggested: <button className="cf-person">NMC-7B-cathode-r3</button></span>
        </div>
      </FieldRow>

      <FieldRow label="Initial status">
        <div className="cf-radio-group" style={{flexDirection:"row", gap:8}}>
          {["active","planned","consumed","failed"].map(s => (
            <label key={s} className={"cf-radio" + (s==="active"?" on":"")} style={{minWidth:0, padding:"6px 10px"}}>
              <span className="cf-radio-dot"/>
              <span><strong style={{fontSize:13}}>{s}</strong></span>
            </label>
          ))}
        </div>
      </FieldRow>
    </ModalShell>
  );
}

/* ─── New event form ───────────────────────────────────────────── */

function NewEventModal({ onClose }) {
  const [kind, setKind] = React.useState("meeting");
  const [recur, setRecur] = React.useState(false);
  return (
    <ModalShell
      title="New event"
      subtitle="Adds a row to your calendar. Lands in your .ics feed within ~12 h (Google) / ~15 min (Apple)."
      onClose={onClose}
      footer={<>
        <button className="top-btn" onClick={onClose}>Cancel</button>
        <div style={{flex:1}}/>
        <button className="top-btn">Save & add another</button>
        <button className="top-btn primary">Create event</button>
      </>}
    >
      <FieldRow label="Kind">
        <div className="kind-picker">
          {[
            {k:"meeting",  l:"Meeting",  d:"Group sync, PI weekly, handoff review"},
            {k:"deadline", l:"Deadline", d:"Hard cutoff — report, submission"},
            {k:"milestone",l:"Milestone",d:"Iteration boundary, project gate"},
            {k:"reminder", l:"Reminder", d:"Maintenance window, calibration"},
            {k:"custom",   l:"Custom",   d:"Anything else"},
          ].map(o => (
            <button key={o.k} className={"kind-card kind-"+o.k+(kind===o.k?" on":"")} onClick={()=>setKind(o.k)}>
              <span style={{fontFamily:"var(--serif)",fontSize:15,color:"var(--ink)"}}>{o.l}</span>
              <span className="kind-card-eg">{o.d}</span>
            </button>
          ))}
        </div>
      </FieldRow>

      <FieldRow label="Title"><input className="set-input" defaultValue="Iter-7 cycling debrief" placeholder="What is this event?"/></FieldRow>
      <FieldRow label="Project" sublabel="Optional. Tags the event for project-scoped calendar feeds.">
        <select className="set-input" style={{maxWidth:340}}>
          <option>NMC811 Cathode Optimization</option>
          <option>Sulfide Electrolyte Stability</option>
          <option>Anode-Free Cell Architecture</option>
          <option>SEI Formation Protocols</option>
          <option>Post-Mortem Methodology</option>
          <option value="">— No project (workspace-only event)</option>
        </select>
      </FieldRow>

      <FieldRow label="When">
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <input className="set-input" defaultValue="Jun 12, 2026" style={{maxWidth:160}}/>
          <input className="set-input" defaultValue="10:00" style={{maxWidth:90, fontFamily:"var(--mono)"}}/>
          <span style={{color:"var(--muted)"}}>→</span>
          <input className="set-input" defaultValue="11:00" style={{maxWidth:90, fontFamily:"var(--mono)"}}/>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12.5,color:"var(--muted)"}}>
            <input type="checkbox"/> All-day
          </label>
        </div>
      </FieldRow>

      <FieldRow label="Location" sublabel="Optional. Building / room / Zoom link.">
        <input className="set-input" defaultValue="Building 3, Room 207 + Zoom"/>
      </FieldRow>

      <FieldRow label="Attendees">
        <div className="cf-people">
          <span className="cf-person on"><AvM id="MT" size={20}/> Mei Tanaka <button>×</button></span>
          <span className="cf-person on"><AvM id="JR" size={20}/> Jules Reyes <button>×</button></span>
          <span className="cf-person on"><AvM id="SP" size={20}/> Sam Patel <button>×</button></span>
          <button className="cf-person add"><IM name="plus" size={11}/> Add attendee</button>
        </div>
      </FieldRow>

      <FieldRow label="Recurrence" sublabel="RFC 5545. Falls into everyone's .ics feed as a recurring entry.">
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}>
            <input type="checkbox" checked={recur} onChange={e => setRecur(e.target.checked)}/> Repeats
          </label>
          {recur && <>
            <select className="set-input" style={{maxWidth:160}}>
              <option>weekly</option>
              <option>biweekly</option>
              <option>monthly</option>
              <option>custom</option>
            </select>
            <span style={{fontSize:12.5,color:"var(--muted)"}}>on</span>
            <div className="dow-picker">
              {["S","M","T","W","T","F","S"].map((d,i) => (
                <button key={i} className={"dow"+(i===3?" on":"")}>{d}</button>
              ))}
            </div>
            <span style={{fontSize:12.5,color:"var(--muted)"}}>until</span>
            <input className="set-input" defaultValue="Aug 28, 2026" style={{maxWidth:160}}/>
          </>}
        </div>
      </FieldRow>

      <FieldRow label="Description">
        <textarea className="set-input" rows={3} placeholder="Agenda preview, prep links, etc."/>
      </FieldRow>

      <FieldRow label="Reminders">
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <span className="set-chip">24 h before <button>×</button></span>
          <span className="set-chip">10 min before <button>×</button></span>
          <button className="set-chip add">+ Add reminder</button>
        </div>
      </FieldRow>
    </ModalShell>
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

Object.assign(window, { ShareModal, NewSampleModal, NewEventModal });
