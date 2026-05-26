// settings.jsx — Account settings + Admin panel

const { Avatar: AvS, Icon: IS, LAB: LS } = window;

/* shared section primitives */
function SettingsSection({ title, hint, children }) {
  return (
    <section className="set-sect">
      <div className="set-sect-h">
        <h3>{title}</h3>
        {hint && <span className="set-hint">{hint}</span>}
      </div>
      <div className="set-sect-body">{children}</div>
    </section>
  );
}

function SettingsRow({ label, sublabel, children, align = "center" }) {
  return (
    <div className={"set-row align-" + align}>
      <div className="set-row-l">
        <div className="set-row-label">{label}</div>
        {sublabel && <div className="set-row-sub">{sublabel}</div>}
      </div>
      <div className="set-row-r">{children}</div>
    </div>
  );
}

function SwitchToggle({ on }) {
  return <span className={"sw-toggle"+(on?" on":"")}><span className="sw-knob"/></span>;
}

/* ──────────────────────────────────────────────────────
   ACCOUNT SETTINGS
──────────────────────────────────────────────────────── */

function AccountPage() {
  const me = LS.MEMBERS.find(m => m.id === "JR");
  return (
    <div className="page-wrap" style={{maxWidth:820}}>
      <div className="set-head">
        <h1>Account settings</h1>
        <div className="set-sub">{me.email} · signed in via Microsoft Entra</div>
      </div>

      <SettingsSection title="Profile">
        <SettingsRow label="Photo" sublabel="Used in your avatar across the workspace.">
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <AvS id="JR" size={56}/>
            <button className="top-btn">Replace</button>
            <button className="top-btn" style={{color:"var(--muted)"}}>Remove</button>
          </div>
        </SettingsRow>
        <SettingsRow label="Name" sublabel="Display name shown on mentions, comments, and audit log.">
          <input className="set-input" defaultValue={me.name}/>
        </SettingsRow>
        <SettingsRow label="Title" sublabel="Optional. Helps teammates know your lab role.">
          <input className="set-input" defaultValue={me.title}/>
        </SettingsRow>
        <SettingsRow label="Email" sublabel="Tied to your Microsoft Entra account. Cannot be changed here.">
          <input className="set-input" defaultValue={me.email} disabled/>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Calendar subscription" hint="Per-user signed .ics URL · refreshable by Google / Apple / Outlook">
        <div className="set-ics-card">
          <div className="set-ics-url"><IS name="link" size={11}/> halide.app/cal/jules/4f7c2a6e9d83.ics</div>
          <div className="set-ics-actions">
            <button className="top-btn">Copy</button>
            <button className="top-btn">Rotate token</button>
            <button className="top-btn" style={{color:"var(--bad)"}}>Revoke</button>
          </div>
        </div>
        <SettingsRow label="Scope" sublabel="Which events appear in your feed.">
          <select className="set-input" style={{maxWidth:320}}>
            <option>All visible projects</option>
            <option>Only projects I lead</option>
            <option>Custom — choose projects…</option>
          </select>
        </SettingsRow>
        <p className="set-note">
          Google refreshes subscribed feeds every ~12 h; Apple every 5–60 min; Outlook every ~1 h. Real-time push is a v2 candidate.
        </p>
      </SettingsSection>

      <SettingsSection title="API tokens (PATs)" hint="Personal access tokens for agents and scripts · scoped, revokable">
        <div className="pat-list">
          {LS.PATS.map(t => (
            <div key={t.id} className={"pat-row"+(t.revoked?" pat-revoked":"")}>
              <div className="pat-l">
                <div className="pat-name">{t.name}</div>
                <div className="pat-prefix">{t.prefix}</div>
                <div className="pat-scopes">
                  {t.scopes.map(s => <span key={s} className="pat-scope">{s}</span>)}
                </div>
              </div>
              <div className="pat-meta">
                <div><span className="pat-meta-k">created</span> {t.created}</div>
                <div><span className="pat-meta-k">last used</span> {t.lastUsed}</div>
                <div><span className="pat-meta-k">expires</span> {t.expires}</div>
              </div>
              <div className="pat-actions">
                {t.revoked
                  ? <span className="pill" style={{color:"var(--muted)"}}>revoked</span>
                  : <><button>Edit scopes</button><button style={{color:"var(--bad)"}}>Revoke</button></>}
              </div>
            </div>
          ))}
        </div>
        <button className="top-btn primary" style={{marginTop:10}}><IS name="plus" size={12}/> New token</button>
      </SettingsSection>

      <SettingsSection title="Notifications" hint="Per-channel · per-category">
        <table className="notif-table">
          <thead>
            <tr><th></th><th>In-app</th><th>Email</th></tr>
          </thead>
          <tbody>
            <tr><td>Mentions</td><td><SwitchToggle on={true}/></td><td><SwitchToggle on={true}/></td></tr>
            <tr><td>PI flags on projects I'm in</td><td><SwitchToggle on={true}/></td><td><SwitchToggle on={true}/></td></tr>
            <tr><td>AI proposals (suggest_writes)</td><td><SwitchToggle on={true}/></td><td><SwitchToggle on={false}/></td></tr>
            <tr><td>Iteration boundary reminders</td><td><SwitchToggle on={true}/></td><td><SwitchToggle on={false}/></td></tr>
            <tr><td>Meeting reminders (24 h)</td><td><SwitchToggle on={true}/></td><td><SwitchToggle on={true}/></td></tr>
            <tr><td>Workspace digest (weekly)</td><td><SwitchToggle on={false}/></td><td><SwitchToggle on={true}/></td></tr>
          </tbody>
        </table>
      </SettingsSection>

      <SettingsSection title="Security" hint="Local accounts only · SSO accounts manage password & 2FA in Entra">
        <SettingsRow label="Two-factor authentication (TOTP)" sublabel="Available for local accounts in v1.1 (post-launch).">
          <SwitchToggle on={true}/>
        </SettingsRow>
        <SettingsRow label="Active sessions" sublabel="Sign out of all other sessions if you suspect a leak.">
          <button className="top-btn">Sign out other sessions (2)</button>
        </SettingsRow>
      </SettingsSection>

      <div style={{height:80}}/>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   ADMIN PANEL
──────────────────────────────────────────────────────── */

function AISpark({ values }) {
  const max = Math.max(...values);
  return (
    <div className="ai-spark">
      {values.map((v,i) => <div key={i} className={"b"+(i===values.length-1?" on":"")} style={{height: Math.max(8, (v/max)*100) + "%"}}/>)}
    </div>
  );
}

function AdminPage({ setRoute }) {
  const u = LS.AI_USAGE;
  return (
    <div className="page-wrap wide" style={{maxWidth:1100}}>
      <div className="set-head">
        <h1>Workspace admin</h1>
        <div className="set-sub">Halide · halide-lab.org · Owner Dr. Mei Tanaka</div>
      </div>

      <SettingsSection title="Workspace" hint="Visible to all members">
        <SettingsRow label="Workspace name">
          <input className="set-input" defaultValue="Halide"/>
        </SettingsRow>
        <SettingsRow label="Subdomain">
          <input className="set-input" defaultValue="halide-lab.org" disabled/>
        </SettingsRow>
        <SettingsRow label="Allow-listed sign-in domains" sublabel="University SSO is restricted to these domains.">
          <div className="set-chips">
            <span className="set-chip">halide-lab.org <button>×</button></span>
            <span className="set-chip">stanford.edu <button>×</button></span>
            <span className="set-chip">caltech.edu <button>×</button></span>
            <button className="set-chip add">+ add domain</button>
          </div>
        </SettingsRow>
        <SettingsRow label="External invites" sublabel="Admins may invite emails outside the allow-listed domains. They sign in with a local password.">
          <SwitchToggle on={true}/>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="AI" hint="Workspace-level configuration · §7.5.1">
        <div className="ai-overview">
          <div className="ai-stat">
            <div className="ai-stat-k">Spend, this month</div>
            <div className="ai-stat-v">${u.spent.toFixed(2)}<small>/ ${u.cap}</small></div>
            <div className="ai-stat-d">{u.pctOfCap}% of cap · {u.daysLeft} days remaining</div>
            <div className="ai-bar"><div className="ai-bar-fill" style={{width: u.pctOfCap + "%"}}/></div>
          </div>
          <div className="ai-stat">
            <div className="ai-stat-k">Daily, last 14 days</div>
            <AISpark values={u.daily}/>
            <div className="ai-stat-d">Median $3.10 / day · trending up</div>
          </div>
          <div className="ai-stat">
            <div className="ai-stat-k">By feature</div>
            {u.byFeature.map(f => (
              <div key={f.k} className="ai-feature">
                <div className="ai-feat-l">{f.k}</div>
                <div className="ai-feat-bar"><div style={{width: (f.v/Math.max(...u.byFeature.map(x=>x.v)))*100 + "%"}}/></div>
                <div className="ai-feat-r">${f.v.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>

        <SettingsRow label="Monthly spend cap (USD)" sublabel="Orchestrator refuses new requests once exceeded; soft-warn at 80%.">
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontFamily:"var(--mono)", color:"var(--muted)"}}>$</span>
            <input className="set-input" defaultValue="200" style={{maxWidth:120}}/>
            <span style={{fontFamily:"var(--mono)", color:"var(--muted)"}}>/ month</span>
          </div>
        </SettingsRow>
        <SettingsRow label="Default model — workflows" sublabel="Used for risk-assessment + analysis steps.">
          <select className="set-input" style={{maxWidth:280}}>
            <option>claude-sonnet-4.5</option>
            <option>claude-opus-4.5</option>
            <option>gpt-5</option>
          </select>
        </SettingsRow>
        <SettingsRow label="Default model — chat" sublabel="Used for the in-project assistant.">
          <select className="set-input" style={{maxWidth:280}}>
            <option>claude-haiku-4.5</option>
            <option>claude-sonnet-4.5</option>
            <option>gpt-5-mini</option>
          </select>
        </SettingsRow>
        <SettingsRow label="Default autonomy" sublabel="Workspace default. Projects may override (never more permissive).">
          <select className="set-input" style={{maxWidth:280}}>
            <option>read_only</option>
            <option selected>suggest_writes</option>
            <option>auto_routine</option>
            <option>full</option>
          </select>
        </SettingsRow>
        <SettingsRow label="Per-user usage" sublabel="Top consumers this month.">
          <table className="usage-table">
            <thead><tr><th></th><th>Calls</th><th>Spend</th><th>Share</th></tr></thead>
            <tbody>
              {u.byUser.map(b => (
                <tr key={b.id}>
                  <td><AvS id={b.id} size={18}/> <span style={{marginLeft:8}}>{LS.PEOPLE[b.id].name}</span></td>
                  <td style={{fontFamily:"var(--mono)"}}>{b.calls}</td>
                  <td style={{fontFamily:"var(--mono)"}}>${b.spent.toFixed(2)}</td>
                  <td><div className="usage-bar"><div style={{width: (b.spent/u.spent*100) + "%"}}/></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Members" hint={`${LS.MEMBERS.length} members · ${LS.INVITES.length} pending invites`}>
        <table className="member-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Auth</th>
              <th>2FA</th>
              <th>Last active</th>
              <th>Since</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {LS.MEMBERS.map(m => (
              <tr key={m.id}>
                <td><div style={{display:"flex",alignItems:"center",gap:10}}><AvS id={m.id} size={22}/> <div><div style={{fontWeight:500}}>{m.name}</div><div style={{fontSize:11.5, color:"var(--muted)"}}>{m.email}</div></div></div></td>
                <td><span className={"role-pill role-"+m.role}>{m.role}</span></td>
                <td style={{fontFamily:"var(--mono)",fontSize:11.5,color:"var(--muted)"}}>{m.auth}</td>
                <td>{m.twofa ? <span className="pill s-active"><span className="dot-s active"/>on</span> : <span className="pill" style={{color:"var(--muted)"}}>off</span>}</td>
                <td style={{fontFamily:"var(--mono)",fontSize:11.5,color:"var(--muted)"}}>{m.lastActive}</td>
                <td style={{fontFamily:"var(--mono)",fontSize:11.5,color:"var(--muted)"}}>{m.since}</td>
                <td><button className="top-btn" style={{padding:"3px 8px"}}>Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button className="top-btn primary"><IS name="plus" size={12}/> Invite external</button>
          <button className="top-btn">Export member list</button>
        </div>
      </SettingsSection>

      <SettingsSection title="Risk-workflow library" hint="JSON files in repo · §7.4">
        <div className="workflow-list">
          {[
            { key:"battery_safety_risk_v1", title:"Battery cell safety risk assessment", desc:"Walks through thermal runaway, electrolyte, voltage, and storage risks for cycling batches.", runs: 14, lastRun: "May 21" },
            { key:"experimental_risk_v1",   title:"Experimental risk assessment", desc:"Generic per-experiment risk: hazards, PPE, instrument scheduling, escalation.", runs: 22, lastRun: "May 24" },
            { key:"project_risk_v1",        title:"Project risk assessment", desc:"Scope, novelty, reproducibility, publication strategy, Plan B framing.", runs: 6, lastRun: "May 11" },
          ].map(w => (
            <div key={w.key} className="workflow-row">
              <div>
                <div className="wf-title">{w.title} <span className="wf-key">{w.key}</span></div>
                <div className="wf-desc">{w.desc}</div>
              </div>
              <div className="wf-stats">
                <div><span className="wf-stat-k">runs</span> {w.runs}</div>
                <div><span className="wf-stat-k">last</span> {w.lastRun}</div>
              </div>
              <div>
                <button className="top-btn">Inspect JSON</button>
              </div>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Audit log" hint="Every API call · every AI tool call · every admin override · kept forever">
        <table className="audit-table">
          <thead><tr><th>When</th><th>Actor</th><th>Via</th><th>Action</th><th>Resource</th><th>Status</th></tr></thead>
          <tbody>
            {LS.AUDIT.map((a, i) => (
              <tr key={i}>
                <td style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--muted)"}}>{a.ts}</td>
                <td>{a.actor === "AI" ? <span className="ai-orb" style={{width:16,height:16,display:"inline-block",verticalAlign:-3}}/> : <AvS id={a.actor} size={16}/>} <span style={{marginLeft:6}}>{a.actor}</span></td>
                <td style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--muted)"}}>{a.via}</td>
                <td style={{fontFamily:"var(--mono)",fontSize:11.5,color:"var(--ember)"}}>{a.action}</td>
                <td style={{fontSize:12.5}}>{a.resource}</td>
                <td style={{fontFamily:"var(--mono)",fontSize:11.5,color: a.status >= 400 ? "var(--bad)":"var(--good)"}}>{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="top-btn" style={{marginTop:10}}>View full audit log →</button>
      </SettingsSection>

      <SettingsSection title="Backups" hint="Nightly EBS snapshots · 7-day retention">
        <SettingsRow label="Last successful backup" sublabel="Crash-consistent snapshot of the database EBS volume.">
          <span style={{fontFamily:"var(--mono)",color:"var(--good)"}}><span className="dot-s active"/>May 26 · 03:14 UTC</span>
        </SettingsRow>
        <SettingsRow label="RPO target" sublabel="Worst-case data loss window.">
          <span style={{fontFamily:"var(--mono)"}}>24 h</span>
        </SettingsRow>
        <SettingsRow label="Restore drill" sublabel="Last verified restore from snapshot.">
          <span style={{fontFamily:"var(--mono)"}}>Apr 12, 2026</span>
        </SettingsRow>
        <p className="set-note">
          Upgrade path: switch to nightly <code>pg_dump → S3</code> (or <code>pgBackRest</code> WAL archiving) when data &gt; 20 GB or uptime SLA matters (spec §8.1).
        </p>
      </SettingsSection>

      <div style={{height:80}}/>
    </div>
  );
}

Object.assign(window, { AccountPage, AdminPage });
