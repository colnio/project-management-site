// inbox-people.jsx — Inbox and People views (workspace-level)

const { Avatar: AvIP, Icon: IIP, LAB: LIP } = window;

/* ──────────────────────────────────────────────────────
   Inbox
──────────────────────────────────────────────────────── */

function InboxKindBadge({ kind }) {
  const meta = {
    pi_flag:     { label: "PI flag",      cls: "ibk-flag",     glyph: "⚑" },
    mention:     { label: "Mention",      cls: "ibk-mention",  glyph: "@" },
    ai_proposal: { label: "AI proposal",  cls: "ibk-ai",       glyph: "◉" },
    action:      { label: "Action item",  cls: "ibk-action",   glyph: "✓" },
    comment:     { label: "Comment",      cls: "ibk-comment",  glyph: "“" },
    system:      { label: "System",       cls: "ibk-system",   glyph: "·" },
  }[kind] || { label: kind, cls: "ibk-system", glyph: "·" };
  return <span className={"inbox-kind " + meta.cls}><span className="ibk-glyph">{meta.glyph}</span> {meta.label}</span>;
}

function InboxRow({ item, onOpen }) {
  return (
    <button className={"inbox-row" + (item.unread ? " unread" : "")} onClick={() => onOpen && onOpen(item)}>
      <div className="inbox-dot" aria-hidden>{item.unread ? "●" : ""}</div>
      <div className="inbox-from">
        {item.actor === "AI" ? <span className="ai-orb" style={{width:20,height:20}}/>
          : item.actor === "H" ? <span className="inbox-h">H</span>
          : <AvIP id={item.actor} size={20} ring/>}
      </div>
      <div className="inbox-body">
        <div className="inbox-top">
          <span className="inbox-title">{item.title}</span>
          <InboxKindBadge kind={item.kind}/>
          {item.project && (
            <span className="inbox-proj">
              {LIP.PROJECTS.find(p => p.id === item.project)?.name.split(" ").slice(0,2).join(" ") || "Project"}
            </span>
          )}
        </div>
        <div className="inbox-sub">{item.subtitle}</div>
      </div>
      <div className="inbox-ts">{item.ts}</div>
    </button>
  );
}

function InboxPage({ setRoute }) {
  const [filter, setFilter] = React.useState("all");
  const items = LIP.INBOX.filter(i => filter === "all" ? true : i.kind === filter);
  const today    = items.filter(i => i.bucket === "today");
  const earlier  = items.filter(i => i.bucket === "earlier");
  const older    = items.filter(i => i.bucket === "older");
  const unreadN = LIP.INBOX.filter(i => i.unread).length;

  const open = (item) => {
    if (!item.target) return;
    if (item.target.type === "iteration") setRoute({view:"entity", entityType:"iteration", entityId:item.target.id, projectId: item.project});
    else if (item.target.type === "experiment") setRoute({view:"entity", entityType:"experiment", entityId:item.target.id, projectId: item.project});
    else if (item.target.type === "sample") setRoute({view:"entity", entityType:"sample", entityId:item.target.id, projectId: item.project});
    else if (item.target.type === "meeting") setRoute({view:"meeting", meetingId: item.target.id});
    else if (item.target.type === "project") setRoute({view:"project", projectId: item.target.id, tab:"overview", variant:"editorial"});
  };

  return (
    <div className="page-wrap wide">
      <div className="cal-head">
        <h2>Inbox</h2>
        <span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--muted-2)",textTransform:"uppercase",letterSpacing:".06em"}}>{unreadN} unread · {LIP.INBOX.length} total</span>
        <div className="right">
          <button className="top-btn">Mark all read</button>
          <button className="top-btn"><IIP name="filter" size={12}/> Notification settings</button>
        </div>
      </div>

      <div className="inbox-filters">
        {[
          {k:"all",        l:"All",          n: LIP.INBOX.length},
          {k:"pi_flag",    l:"PI flags",     n: LIP.INBOX.filter(i=>i.kind==="pi_flag").length},
          {k:"mention",    l:"Mentions",     n: LIP.INBOX.filter(i=>i.kind==="mention").length},
          {k:"ai_proposal",l:"AI proposals", n: LIP.INBOX.filter(i=>i.kind==="ai_proposal").length},
          {k:"action",     l:"Action items", n: LIP.INBOX.filter(i=>i.kind==="action").length},
          {k:"comment",    l:"Comments",     n: LIP.INBOX.filter(i=>i.kind==="comment").length},
        ].map(f => (
          <button key={f.k} className={"filt"+(filter===f.k?" on":"")} onClick={()=>setFilter(f.k)}>
            {f.l} <span style={{fontFamily:"var(--mono)", marginLeft:4, opacity:.6}}>{f.n}</span>
          </button>
        ))}
      </div>

      {today.length > 0 && <>
        <div className="inbox-bucket">Today</div>
        <div className="inbox-list">{today.map(i => <InboxRow key={i.id} item={i} onOpen={open}/>)}</div>
      </>}
      {earlier.length > 0 && <>
        <div className="inbox-bucket">Earlier this week</div>
        <div className="inbox-list">{earlier.map(i => <InboxRow key={i.id} item={i} onOpen={open}/>)}</div>
      </>}
      {older.length > 0 && <>
        <div className="inbox-bucket">Older</div>
        <div className="inbox-list">{older.map(i => <InboxRow key={i.id} item={i} onOpen={open}/>)}</div>
      </>}

      <div style={{height:80}}/>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   People
──────────────────────────────────────────────────────── */

function rolePill(role) {
  return <span className={"role-pill role-" + role}>{role}</span>;
}

function PersonCard({ m, onOpen }) {
  const onProjects = m.projects.map(pid => LIP.PROJECTS.find(p=>p.id===pid)).filter(Boolean);
  return (
    <div className="person-card" onClick={onOpen}>
      <div className="person-head">
        <AvIP id={m.id} size={48}/>
        <div style={{flex:1, minWidth:0}}>
          <div className="person-name">{m.name}</div>
          <div className="person-title">{m.title}</div>
          <div className="person-email">{m.email}</div>
        </div>
        {rolePill(m.role)}
      </div>
      <div className="person-projects">
        {onProjects.map(p => (
          <span key={p.id} className="person-proj">
            <span className="person-proj-glyph">{p.emblem}</span>
            {p.name.split(" ").slice(0,2).join(" ")}
          </span>
        ))}
      </div>
      <div className="person-foot">
        <span><span className="person-foot-k">Last active</span> {m.lastActive}</span>
        <span><span className="person-foot-k">Since</span> {m.since}</span>
        <span>{m.twofa ? "2FA ✓" : "2FA off"}</span>
      </div>
    </div>
  );
}

function PeoplePage({ setRoute }) {
  const owners   = LIP.MEMBERS.filter(m => m.role === "owner");
  const admins   = LIP.MEMBERS.filter(m => m.role === "admin");
  const members  = LIP.MEMBERS.filter(m => m.role === "member");
  const external = LIP.MEMBERS.filter(m => m.role === "external");

  return (
    <div className="page-wrap wide">
      <div className="cal-head">
        <h2>People</h2>
        <span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--muted-2)",textTransform:"uppercase",letterSpacing:".06em"}}>
          {LIP.MEMBERS.length} members · {LIP.INVITES.length} invites pending
        </span>
        <div className="right">
          <button className="top-btn"><IIP name="filter" size={12}/> Filter</button>
          <button className="top-btn primary"><IIP name="plus" size={12}/> Invite external</button>
        </div>
      </div>

      <p style={{color:"var(--muted)", fontSize:13.5, maxWidth:620, lineHeight:1.6, marginTop:0}}>
        Workspace directory for <em style={{fontFamily:"var(--serif)"}}>Halide</em>. University accounts use Microsoft Entra SSO; external collaborators are admin-invited and use local password accounts (spec §6.1, §6.2).
      </p>

      {[
        ["Owners / PI",  owners],
        ["Admins",       admins],
        ["Members",      members],
        ["External collaborators", external],
      ].map(([label, set]) => set.length > 0 && (
        <React.Fragment key={label}>
          <div className="people-bucket">
            <span>{label}</span>
            <span className="people-bucket-n">{set.length}</span>
          </div>
          <div className="people-grid">
            {set.map(m => <PersonCard key={m.id} m={m}/>)}
          </div>
        </React.Fragment>
      ))}

      {LIP.INVITES.length > 0 && <>
        <div className="people-bucket">
          <span>Pending invites</span>
          <span className="people-bucket-n">{LIP.INVITES.length}</span>
        </div>
        <div className="invites-table">
          <div className="inv-head">
            <div>Email</div>
            <div>Invited by</div>
            <div>Project</div>
            <div>Expires</div>
            <div></div>
          </div>
          {LIP.INVITES.map(i => (
            <div key={i.id} className="inv-row">
              <div className="inv-email">{i.email}</div>
              <div><AvIP id={i.invitedBy} size={16}/></div>
              <div>{LIP.PROJECTS.find(p=>p.id===i.project)?.name.split(" ").slice(0,2).join(" ") || "—"}</div>
              <div>{i.expires}</div>
              <div className="inv-actions">
                <button>Resend</button>
                <button>Revoke</button>
              </div>
            </div>
          ))}
        </div>
      </>}

      <div style={{height:80}}/>
    </div>
  );
}

Object.assign(window, { InboxPage, PeoplePage });
