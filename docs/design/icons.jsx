// icons.jsx — tiny SVG icon set. Names match Lucide where reasonable.

function Icon({ name, size = 14, stroke = 1.5, style }) {
  const s = { width: size, height: size, ...style };
  const sw = stroke;
  const p = { fill: "none", stroke: "currentColor", strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "search":     return (<svg viewBox="0 0 24 24" style={s}><circle cx="11" cy="11" r="7" {...p}/><path d="m20 20-3.5-3.5" {...p}/></svg>);
    case "plus":       return (<svg viewBox="0 0 24 24" style={s}><path d="M12 5v14M5 12h14" {...p}/></svg>);
    case "home":       return (<svg viewBox="0 0 24 24" style={s}><path d="M3 11 12 4l9 7v8a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" {...p}/></svg>);
    case "inbox":      return (<svg viewBox="0 0 24 24" style={s}><path d="M22 12h-6l-2 3h-4l-2-3H2" {...p}/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" {...p}/></svg>);
    case "calendar":   return (<svg viewBox="0 0 24 24" style={s}><rect x="3" y="4.5" width="18" height="16" rx="2" {...p}/><path d="M3 9h18M8 3v3M16 3v3" {...p}/></svg>);
    case "flask":      return (<svg viewBox="0 0 24 24" style={s}><path d="M9 3h6M10 3v6L4.5 19.2A1.5 1.5 0 0 0 5.8 21.5h12.4a1.5 1.5 0 0 0 1.3-2.3L14 9V3" {...p}/><path d="M7 14h10" {...p}/></svg>);
    case "atom":       return (<svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="1.5" {...p}/><path d="M12 4c5 0 9 3.6 9 8s-4 8-9 8-9-3.6-9-8 4-8 9-8Z" {...p}/><path d="M4.7 7c2.6 4.5 9.5 11.4 14.6 11.4M4.7 17C7.3 12.5 14.2 5.6 19.3 5.6" {...p}/></svg>);
    case "book":       return (<svg viewBox="0 0 24 24" style={s}><path d="M4 4v15a1 1 0 0 0 1 1h15V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2Z" {...p}/><path d="M8 4v16" {...p}/></svg>);
    case "file":       return (<svg viewBox="0 0 24 24" style={s}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...p}/><path d="M14 3v5h5" {...p}/></svg>);
    case "chev-r":     return (<svg viewBox="0 0 24 24" style={s}><path d="m9 6 6 6-6 6" {...p}/></svg>);
    case "chev-d":     return (<svg viewBox="0 0 24 24" style={s}><path d="m6 9 6 6 6-6" {...p}/></svg>);
    case "chev-l":     return (<svg viewBox="0 0 24 24" style={s}><path d="m15 6-6 6 6 6" {...p}/></svg>);
    case "settings":   return (<svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="2.5" {...p}/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.06-.4.1-.8.1-1.2Z" {...p}/></svg>);
    case "more":       return (<svg viewBox="0 0 24 24" style={s}><circle cx="6"  cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/></svg>);
    case "share":      return (<svg viewBox="0 0 24 24" style={s}><path d="M12 3v12M8 7l4-4 4 4M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" {...p}/></svg>);
    case "image":      return (<svg viewBox="0 0 24 24" style={s}><rect x="3" y="4" width="18" height="16" rx="2" {...p}/><circle cx="9" cy="10" r="1.6" {...p}/><path d="m4 19 5-5 4 4 3-2 4 4" {...p}/></svg>);
    case "code":       return (<svg viewBox="0 0 24 24" style={s}><path d="m9 8-4 4 4 4M15 8l4 4-4 4" {...p}/></svg>);
    case "doc":        return (<svg viewBox="0 0 24 24" style={s}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...p}/><path d="M14 3v5h5M9 13h6M9 17h4" {...p}/></svg>);
    case "users":      return (<svg viewBox="0 0 24 24" style={s}><circle cx="9" cy="9" r="3.5" {...p}/><path d="M3 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M21 20a5 5 0 0 0-4-4.9" {...p}/></svg>);
    case "git":        return (<svg viewBox="0 0 24 24" style={s}><circle cx="6"  cy="6"  r="2" {...p}/><circle cx="6"  cy="18" r="2" {...p}/><circle cx="18" cy="12" r="2" {...p}/><path d="M6 8v8M8 18h4a4 4 0 0 0 4-4v-2" {...p}/></svg>);
    case "spark":      return (<svg viewBox="0 0 24 24" style={s}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2" {...p}/></svg>);
    case "send":       return (<svg viewBox="0 0 24 24" style={s}><path d="m4 12 16-8-6 18-3-7-7-3Z" {...p}/></svg>);
    case "paperclip":  return (<svg viewBox="0 0 24 24" style={s}><path d="M21 12.5 12 21a5 5 0 0 1-7-7l9.5-9.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3l8-8" {...p}/></svg>);
    case "filter":     return (<svg viewBox="0 0 24 24" style={s}><path d="M4 5h16l-6 8v5l-4-2v-3Z" {...p}/></svg>);
    case "grid":       return (<svg viewBox="0 0 24 24" style={s}><rect x="4" y="4" width="7" height="7" {...p}/><rect x="13" y="4" width="7" height="7" {...p}/><rect x="4" y="13" width="7" height="7" {...p}/><rect x="13" y="13" width="7" height="7" {...p}/></svg>);
    case "list":       return (<svg viewBox="0 0 24 24" style={s}><path d="M4 6h16M4 12h16M4 18h16" {...p}/></svg>);
    case "history":    return (<svg viewBox="0 0 24 24" style={s}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" {...p}/></svg>);
    case "shield":     return (<svg viewBox="0 0 24 24" style={s}><path d="M12 3 4 6v6c0 4.5 3.2 8.4 8 9 4.8-.6 8-4.5 8-9V6Z" {...p}/></svg>);
    case "globe":      return (<svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="9" {...p}/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" {...p}/></svg>);
    case "lock":       return (<svg viewBox="0 0 24 24" style={s}><rect x="4" y="11" width="16" height="10" rx="2" {...p}/><path d="M8 11V8a4 4 0 0 1 8 0v3" {...p}/></svg>);
    case "check":      return (<svg viewBox="0 0 24 24" style={s}><path d="m5 12 5 5 9-11" {...p}/></svg>);
    case "x":          return (<svg viewBox="0 0 24 24" style={s}><path d="M6 6l12 12M6 18 18 6" {...p}/></svg>);
    case "side":       return (<svg viewBox="0 0 24 24" style={s}><rect x="3" y="4" width="18" height="16" rx="2" {...p}/><path d="M9 4v16" {...p}/></svg>);
    case "ai":         return (<svg viewBox="0 0 24 24" style={s}><path d="M12 3v3M5 6l2 2M19 6l-2 2M12 9a3 3 0 1 0 3 3M12 21v-3M21 12h-3M3 12h3" {...p}/></svg>);
    case "flag":       return (<svg viewBox="0 0 24 24" style={s}><path d="M5 21V4h12l-2 4 2 4H5" {...p}/></svg>);
    case "link":       return (<svg viewBox="0 0 24 24" style={s}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" {...p}/></svg>);
    default: return null;
  }
}

window.Icon = Icon;
