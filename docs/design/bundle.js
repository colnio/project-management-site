// AUTO-GENERATED

/* === tweaks-panel.jsx === */
(function(){
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : {
      [keyOrEdits]: val
    };
    setValues(prev => ({
      ...prev,
      ...edits
    }));
    window.parent.postMessage({
      type: '__edit_mode_set_keys',
      edits
    }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', {
      detail: edits
    }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({
  title = 'Tweaks',
  children
}) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({
    x: 16,
    y: 16
  });
  const PAD = 16;
  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth,
      h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y))
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);
  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);
  React.useEffect(() => {
    const onMsg = e => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({
      type: '__edit_mode_available'
    }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({
      type: '__edit_mode_dismissed'
    }, '*');
  };
  const onDragStart = e => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX,
      sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = ev => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy)
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  if (!open) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, __TWEAKS_STYLE), /*#__PURE__*/React.createElement("div", {
    ref: dragRef,
    className: "twk-panel",
    "data-omelette-chrome": "",
    style: {
      right: offsetRef.current.x,
      bottom: offsetRef.current.y
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-hd",
    onMouseDown: onDragStart
  }, /*#__PURE__*/React.createElement("b", null, title), /*#__PURE__*/React.createElement("button", {
    className: "twk-x",
    "aria-label": "Close tweaks",
    onMouseDown: e => e.stopPropagation(),
    onClick: dismiss
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "twk-body"
  }, children)));
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "twk-sect"
  }, label), children);
}
function TweakRow({
  label,
  value,
  children,
  inline = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: inline ? 'twk-row twk-row-h' : 'twk-row'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label), value != null && /*#__PURE__*/React.createElement("span", {
    className: "twk-val"
  }, value)), children);
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label,
    value: `${value}${unit}`
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "twk-slider",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: e => onChange(Number(e.target.value))
  }));
}
function TweakToggle({
  label,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-row twk-row-h"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "twk-toggle",
    "data-on": value ? '1' : '0',
    role: "switch",
    "aria-checked": !!value,
    onClick: () => onChange(!value)
  }, /*#__PURE__*/React.createElement("i", null)));
}
function TweakRadio({
  label,
  value,
  options,
  onChange
}) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = o => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({
    2: 16,
    3: 10
  }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = s => {
      const m = options.find(o => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return /*#__PURE__*/React.createElement(TweakSelect, {
      label: label,
      value: value,
      options: options,
      onChange: s => onChange(resolve(s))
    });
  }
  const opts = options.map(o => typeof o === 'object' ? o : {
    value: o,
    label: o
  });
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;
  const segAt = clientX => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor((clientX - r.left - 2) / inner * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };
  const onPointerDown = e => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = ev => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    role: "radiogroup",
    onPointerDown: onPointerDown,
    className: dragging ? 'twk-seg dragging' : 'twk-seg'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-seg-thumb",
    style: {
      left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
      width: `calc((100% - 4px) / ${n})`
    }
  }), opts.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    role: "radio",
    "aria-checked": o.value === value
  }, o.label))));
}
function TweakSelect({
  label,
  value,
  options,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("select", {
    className: "twk-field",
    value: value,
    onChange: e => onChange(e.target.value)
  }, options.map(o => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })));
}
function TweakText({
  label,
  value,
  placeholder,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("input", {
    className: "twk-field",
    type: "text",
    value: value,
    placeholder: placeholder,
    onChange: e => onChange(e.target.value)
  }));
}
function TweakNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange
}) {
  const clamp = n => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({
    x: 0,
    val: 0
  });
  const onScrubStart = e => {
    e.preventDefault();
    startRef.current = {
      x: e.clientX,
      val: value
    };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = ev => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "twk-num-lbl",
    onPointerDown: onScrubStart
  }, label), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: value,
    min: min,
    max: max,
    step: step,
    onChange: e => onChange(clamp(Number(e.target.value)))
  }), unit && /*#__PURE__*/React.createElement("span", {
    className: "twk-num-unit"
  }, unit));
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, c => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = n >> 16 & 255,
    g = n >> 8 & 255,
    b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
const __TwkCheck = ({
  light
}) => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 14 14",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 7.2 5.8 10 11 4.2",
  fill: "none",
  strokeWidth: "2.2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  stroke: light ? 'rgba(0,0,0,.78)' : '#fff'
}));

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({
  label,
  value,
  options,
  onChange
}) {
  if (!options || !options.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "twk-row twk-row-h"
    }, /*#__PURE__*/React.createElement("div", {
      className: "twk-lbl"
    }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("input", {
      type: "color",
      className: "twk-swatch",
      value: value,
      onChange: e => onChange(e.target.value)
    }));
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = o => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-chips",
    role: "radiogroup"
  }, options.map((o, i) => {
    const colors = Array.isArray(o) ? o : [o];
    const [hero, ...rest] = colors;
    const sup = rest.slice(0, 4);
    const on = key(o) === cur;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      className: "twk-chip",
      role: "radio",
      "aria-checked": on,
      "data-on": on ? '1' : '0',
      "aria-label": colors.join(', '),
      title: colors.join(' · '),
      style: {
        background: hero
      },
      onClick: () => onChange(o)
    }, sup.length > 0 && /*#__PURE__*/React.createElement("span", null, sup.map((c, j) => /*#__PURE__*/React.createElement("i", {
      key: j,
      style: {
        background: c
      }
    }))), on && /*#__PURE__*/React.createElement(__TwkCheck, {
      light: __twkIsLight(hero)
    }));
  })));
}
function TweakButton({
  label,
  onClick,
  secondary = false
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: secondary ? 'twk-btn secondary' : 'twk-btn',
    onClick: onClick
  }, label);
}
Object.assign(window, {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton
});
})();

/* === data.jsx === */
(function(){
// data.jsx — fake lab data for the prototype

const WORKSPACE = {
  name: "Solid-State Battery Lab",
  sub: "halide-lab.org",
  pi: "Dr. Mei Tanaka"
};
const PROJECTS = [{
  id: "p_nmc",
  emblem: "N",
  name: "NMC811 Cathode Optimization",
  tagline: "Pushing high-Ni cycling stability past 200 cycles at 4.3 V.",
  visibility: "workspace",
  activeIter: 7,
  samples: 34,
  experiments: 58,
  artifacts: 142,
  collaborators: ["MT", "JR", "SP", "KB", "DV"],
  status: "active"
}, {
  id: "p_sulf",
  emblem: "S",
  name: "Sulfide Electrolyte Stability",
  tagline: "LPSCl moisture sensitivity & dry-room handling.",
  visibility: "workspace",
  status: "active"
}, {
  id: "p_af",
  emblem: "A",
  name: "Anode-Free Cell Architecture",
  tagline: "Lithium-metal plating uniformity on copper.",
  visibility: "workspace",
  status: "active"
}, {
  id: "p_sei",
  emblem: "F",
  name: "SEI Formation Protocols",
  tagline: "Low-rate formation cycles vs. impedance growth.",
  visibility: "private",
  status: "planned"
}, {
  id: "p_pmm",
  emblem: "P",
  name: "Post-Mortem Methodology",
  tagline: "Cross-sectional SEM workflow.",
  visibility: "workspace",
  status: "active"
}];
const ITERATIONS = [{
  id: "it_7",
  num: 7,
  name: "High-Ni Cycling Window — 4.30 V cutoff",
  status: "active",
  start: "May 18",
  end: "Jun 12",
  samples: 6,
  experiments: 11,
  owner: "JR",
  desc: "Cells from batch 7B at 4.30 V upper cutoff; tracking impedance growth and gas evolution against the 4.20 V baseline."
}, {
  id: "it_6",
  num: 6,
  name: "Baseline 4.20 V Reference",
  status: "done",
  start: "Apr 28",
  end: "May 17",
  samples: 5,
  experiments: 9,
  owner: "JR",
  desc: "Reference dataset for batch 7A. Capacity retention 94.2% at C/3 over 80 cycles."
}, {
  id: "it_5",
  num: 5,
  name: "LPSCl Precursor Drying Sweep",
  status: "done",
  start: "Apr 06",
  end: "Apr 27",
  samples: 12,
  experiments: 14,
  owner: "SP",
  desc: "Three drying protocols evaluated; 110°C / 18 h selected for downstream cells."
}, {
  id: "it_4",
  num: 4,
  name: "Electrode Coating Calibration",
  status: "done",
  start: "Mar 18",
  end: "Apr 05",
  samples: 8,
  experiments: 7,
  owner: "KB",
  desc: "Coater slot-die at 40 µm wet; loading 12.4 mg/cm² ± 0.3."
}, {
  id: "it_8",
  num: 8,
  name: "Cross-Polymer Binder Comparison",
  status: "planned",
  start: "Jun 15",
  end: "Jul 03",
  samples: 4,
  experiments: 8,
  owner: "DV",
  desc: "PVDF vs. CMC/SBR aqueous binders on 7B cathodes."
}, {
  id: "it_9",
  num: 9,
  name: "Pouch-Cell Scale-Up Trial",
  status: "planned",
  start: "Jul 06",
  end: "Jul 28",
  samples: 2,
  experiments: 5,
  owner: "MT",
  desc: "Move best 7B formulation from coin to 200 mAh pouch geometry."
}];
const SAMPLES = [{
  id: "NMC-7B-cell-014",
  kind: "cell",
  name: "Coin cell, batch 7B, channel 14",
  chem: "NMC811 // LPSCl // Li-In",
  mass: "11.42 g",
  cap: "192 mAh/g",
  v: "4.30 V",
  status: "active",
  parent: "NMC-7B-cathode-r3"
}, {
  id: "NMC-7B-cell-015",
  kind: "cell",
  name: "Coin cell, batch 7B, channel 15",
  chem: "NMC811 // LPSCl // Li-In",
  mass: "11.38 g",
  cap: "189 mAh/g",
  v: "4.30 V",
  status: "active",
  parent: "NMC-7B-cathode-r3"
}, {
  id: "NMC-7B-cell-016",
  kind: "cell",
  name: "Coin cell, batch 7B, channel 16",
  chem: "NMC811 // LPSCl // Li-In",
  mass: "11.45 g",
  cap: "—",
  v: "4.30 V",
  status: "failed",
  parent: "NMC-7B-cathode-r3",
  note: "Short on cycle 4."
}, {
  id: "NMC-7B-cathode-r3",
  kind: "electrode",
  name: "Cathode coating r3, 12.4 mg/cm²",
  chem: "NMC811 + PVDF + Super C65",
  load: "12.4 mg/cm²",
  status: "active",
  parent: "NMC811-pwd-04"
}, {
  id: "LPSCl-batch-22",
  kind: "precursor",
  name: "LPSCl electrolyte, 110°C dried",
  chem: "Li₆PS₅Cl",
  mass: "3.20 g",
  status: "active",
  parent: null
}, {
  id: "NMC811-pwd-04",
  kind: "precursor",
  name: "NMC811 powder, calcined lot 04",
  chem: "LiNi₀.₈Mn₀.₁Co₀.₁O₂",
  mass: "48.6 g",
  status: "active",
  parent: null
}, {
  id: "PM-cell-014-cs",
  kind: "derivative",
  name: "Cross-section, post-mortem",
  chem: "(from cell-014)",
  status: "active",
  parent: "NMC-7B-cell-014"
}];
const EXPERIMENTS = [{
  id: "EX-211",
  method: "cycling",
  title: "Galvanostatic cycling, C/3, 4.30 V cutoff",
  samples: ["NMC-7B-cell-014", "NMC-7B-cell-015", "NMC-7B-cell-016"],
  by: "JR",
  at: "May 22 · 11:42",
  status: "in_progress",
  summary: "Channel 16 shorted on cycle 4. 014 & 015 holding 188+ mAh/g through cycle 22."
}, {
  id: "EX-209",
  method: "EIS",
  title: "Impedance spectroscopy at SoC 50%",
  samples: ["NMC-7B-cell-014"],
  by: "JR",
  at: "May 21 · 09:10",
  status: "completed",
  summary: "Rct = 38 Ω, +12 Ω vs baseline 7A. Suggests minor interface growth."
}, {
  id: "EX-205",
  method: "SEM",
  title: "Post-mortem SEM, top-down + cross-section",
  samples: ["PM-cell-014-cs"],
  by: "SP",
  at: "May 19 · 15:30",
  status: "completed",
  summary: "Cathode particles intact; visible Li dendrite on separator."
}, {
  id: "EX-200",
  method: "XRD",
  title: "Baseline XRD on NMC811 powder",
  samples: ["NMC811-pwd-04"],
  by: "KB",
  at: "May 12 · 10:00",
  status: "completed",
  summary: "Sharp (003) at 18.7°; consistent with calcined α-NaFeO₂."
}, {
  id: "EX-196",
  method: "drying",
  title: "LPSCl drying — 110°C / 18 h, glovebox",
  samples: ["LPSCl-batch-22"],
  by: "SP",
  at: "May 04 · 18:00",
  status: "completed",
  summary: "Mass loss 4.2%. Conductivity 1.7 mS/cm at 25°C."
}];
const ARTIFACTS = [{
  id: "ar_01",
  type: "pdf",
  name: "Maxwell-cycling-report-w22.pdf",
  size: "1.2 MB",
  by: "JR",
  at: "2 hours ago",
  thumb: "plot"
}, {
  id: "ar_02",
  type: "ipynb",
  name: "post_mortem_analysis.ipynb",
  size: "284 KB",
  by: "SP",
  at: "yesterday",
  thumb: "code"
}, {
  id: "ar_03",
  type: "image",
  name: "SEM_top_cell014_25kx.png",
  size: "8.4 MB",
  by: "SP",
  at: "yesterday",
  thumb: "sem"
}, {
  id: "ar_04",
  type: "image",
  name: "SEM_cross_cell014_10kx.png",
  size: "9.1 MB",
  by: "SP",
  at: "yesterday",
  thumb: "sem"
}, {
  id: "ar_05",
  type: "pdf",
  name: "EIS-summary-week22.pdf",
  size: "640 KB",
  by: "JR",
  at: "2 days ago",
  thumb: "plot"
}, {
  id: "ar_06",
  type: "ipynb",
  name: "impedance_fitting.ipynb",
  size: "172 KB",
  by: "JR",
  at: "2 days ago",
  thumb: "code"
}, {
  id: "ar_07",
  type: "image",
  name: "coater_setup_apr18.jpg",
  size: "3.8 MB",
  by: "KB",
  at: "Apr 18",
  thumb: "photo"
}, {
  id: "ar_08",
  type: "pdf",
  name: "LPSCl-drying-protocol-v2.pdf",
  size: "420 KB",
  by: "SP",
  at: "May 04",
  thumb: "doc"
}, {
  id: "ar_09",
  type: "image",
  name: "XRD_NMC811_pwd04.png",
  size: "1.9 MB",
  by: "KB",
  at: "May 12",
  thumb: "plot"
}, {
  id: "ar_10",
  type: "image",
  name: "cell014_assembly.jpg",
  size: "2.4 MB",
  by: "JR",
  at: "May 17",
  thumb: "photo"
}, {
  id: "ar_11",
  type: "pdf",
  name: "Safety-review-iter6.pdf",
  size: "780 KB",
  by: "MT",
  at: "May 18",
  thumb: "doc"
}, {
  id: "ar_12",
  type: "ipynb",
  name: "voltage_curve_overlay.ipynb",
  size: "96 KB",
  by: "JR",
  at: "May 21",
  thumb: "code"
}];
const PEOPLE = {
  MT: {
    name: "Mei Tanaka",
    role: "PI",
    color: "#a64a2a"
  },
  JR: {
    name: "Jules Reyes",
    role: "PhD",
    color: "#3d6b8a"
  },
  SP: {
    name: "Sam Patel",
    role: "PhD",
    color: "#5a7d3a"
  },
  KB: {
    name: "Karim Bah",
    role: "Postdoc",
    color: "#8a6a3a"
  },
  DV: {
    name: "Dara Vance",
    role: "MSc",
    color: "#7a5aa0"
  },
  HQ: {
    name: "Hua Qin",
    role: "Collaborator (Caltech)",
    color: "#6a5a3a"
  }
};
const EVENTS = [{
  d: "May 28",
  w: "Wed",
  t: "Iter-6 → Iter-7 handoff review",
  sub: "Standup · 30 min · JR + SP + MT",
  kind: "milestone"
}, {
  d: "May 30",
  w: "Fri",
  t: "PI weekly · Cycling data debrief",
  sub: "Office hours · 45 min · MT",
  kind: "meeting"
}, {
  d: "Jun 02",
  w: "Mon",
  t: "Deadline · Quarterly DOE-BES report",
  sub: "Hard deadline · all hands",
  kind: "deadline"
}, {
  d: "Jun 05",
  w: "Thu",
  t: "Glovebox maintenance window",
  sub: "Building 3 · 2 h downtime",
  kind: "reminder"
}, {
  d: "Jun 12",
  w: "Wed",
  t: "Iter-7 end · cycling cutoff",
  sub: "Auto-marker · iterations",
  kind: "milestone"
}, {
  d: "Jun 15",
  w: "Sat",
  t: "Iter-8 start · binder comparison",
  sub: "Auto-marker · iterations",
  kind: "milestone"
}, {
  d: "Jun 20",
  w: "Thu",
  t: "Hua Qin (Caltech) site visit",
  sub: "Meeting · 3 h · MT + JR",
  kind: "meeting"
}];

// ──────────────────────────────────────────────────────
// Regular meetings — workspace-scoped notebook of past meetings.
// Historical record + ongoing minutes. Each meeting has attendees,
// agenda, discussion points, decisions, and action items.
// ──────────────────────────────────────────────────────
const MEETINGS = [{
  id: "mtg_2026_05_21",
  title: "PI weekly · Week 22",
  kind: "PI weekly",
  date: "May 21, 2026",
  time: "10:00 – 10:45 PT",
  location: "Building 3, Room 207 + Zoom",
  chair: "MT",
  attendees: ["MT", "JR", "SP", "KB", "DV", "HQ"],
  agenda: ["Iter-7 mid-iteration cycling status", "cell-016 failure — root cause + safety review", "DOE-BES quarterly report — outline review", "Iter-8 binder comparison — kickoff", "Caltech collaboration: data exchange + visit"],
  discussion: ["JR walked through iter-7 cycling data. Cells 014 and 015 are tracking 188+ mAh/g at C/3 through cycle 22. Cell 016 shorted on cycle 4; SEM cross-section showed visible Li dendrite on separator.", "SP flagged that the separator-lot QA records for cell 016 are missing. Consensus: separator lot is the likely culprit, not chemistry. Action to follow.", "MT recommended pausing 4.30 V cycling on remaining batch 7B until separator validation is complete. Group agreed.", "DV presented iter-8 binder comparison protocol. PVDF vs CMC/SBR on 7B cathodes. ICP-MS validation step added based on SP feedback.", "HQ shared preliminary 4.25 V results from Caltech — similar Rct shift pattern. Agreed to formalize a data-exchange MOU."],
  decisions: ["Iter-7 cycling continues on cells 014/015 only; cell 016 replacement gated on separator-lot QA.", "PI review on cell-016 short closed — root cause: manufacturing defect (separator).", "Iter-8 kickoff approved, starts Jun 15.", "Quarterly report draft due May 28 (JR lead)."],
  actions: [{
    who: "JR",
    what: "Draft DOE-BES quarterly report section 3 (cycling).",
    due: "May 28",
    status: "open"
  }, {
    who: "SP",
    what: "Audit separator-lot QA for batch 7B and document findings.",
    due: "May 25",
    status: "open"
  }, {
    who: "DV",
    what: "Confirm aqueous slurry exposure protocol for iter-8.",
    due: "Jun 03",
    status: "open"
  }, {
    who: "MT",
    what: "Sign data-exchange MOU with Caltech (Qin group).",
    due: "Jun 10",
    status: "open"
  }, {
    who: "KB",
    what: "Coater calibration check before iter-8 binder runs.",
    due: "Jun 12",
    status: "open"
  }],
  notes: "Next meeting: May 28 at 10:00 PT. Standing agenda for handoff review iter-6 → iter-7 close-out."
}, {
  id: "mtg_2026_05_14",
  title: "PI weekly · Week 21",
  kind: "PI weekly",
  date: "May 14, 2026",
  time: "10:00 – 10:40 PT",
  location: "Building 3, Room 207",
  chair: "MT",
  attendees: ["MT", "JR", "SP", "KB", "DV"],
  agenda: ["Iter-6 close-out · 4.20 V baseline", "Iter-7 kickoff readiness", "Dry-room humidity excursion on May 14 — incident review", "Cycling instrument scheduling"],
  discussion: ["JR closed iter-6 — capacity retention 94.2% at C/3 over 80 cycles, baseline confirmed.", "SP raised the dry-room dewpoint spike to -25°C on May 14 morning. LPSCl precursor was sealed; estimated exposure 12 min before HVAC corrected.", "Discussion of whether to re-validate LPSCl batch 22 with FT-IR. SP volunteered to run.", "KB confirmed cycling channels 1–8 available for iter-7 starting May 18."],
  decisions: ["Iter-6 baseline accepted as reference for iter-7 comparison.", "LPSCl batch 22 will be re-validated; iter-5 drying SOPs reviewed.", "Glovebox maintenance window scheduled for Jun 05."],
  actions: [{
    who: "SP",
    what: "Run FT-IR re-validation on LPSCl batch 22.",
    due: "May 17",
    status: "done"
  }, {
    who: "JR",
    what: "Post iter-7 cycling kickoff protocol to Pages.",
    due: "May 18",
    status: "done"
  }, {
    who: "KB",
    what: "Reserve cycling channels 1–8 for iter-7.",
    due: "May 17",
    status: "done"
  }],
  notes: "All May-14 action items closed by May 18 standup."
}, {
  id: "mtg_2026_05_07",
  title: "Iter-5 → Iter-6 handoff",
  kind: "Handoff review",
  date: "May 07, 2026",
  time: "14:00 – 14:30 PT",
  location: "Building 3, Room 207",
  chair: "SP",
  attendees: ["SP", "JR", "KB", "MT"],
  agenda: ["Iter-5 LPSCl drying results recap", "Drying SOP finalization", "Iter-6 baseline cycling kickoff"],
  discussion: ["SP presented final drying-sweep results. 110°C / 18 h selected based on conductivity 1.7 mS/cm and 4.2% mass loss.", "JR aligned iter-6 baseline cell prep to use the selected SOP.", "MT signed off on the SOP for downstream cells."],
  decisions: ["LPSCl drying SOP v2 locked: 110°C / 18 h in glovebox.", "Iter-6 starts May 09 with 5 baseline cells."],
  actions: [{
    who: "SP",
    what: "Publish drying SOP v2 to Pages.",
    due: "May 09",
    status: "done"
  }, {
    who: "JR",
    what: "Build 5 baseline cells for iter-6.",
    due: "May 11",
    status: "done"
  }],
  notes: "Clean handoff. No outstanding items."
}, {
  id: "mtg_2026_05_28",
  title: "Iter-6 → Iter-7 handoff review",
  kind: "Handoff review",
  date: "May 28, 2026",
  time: "10:30 – 11:00 PT",
  location: "Building 3, Room 207",
  chair: "JR",
  attendees: ["JR", "SP", "MT"],
  agenda: ["Iter-6 final numbers", "Iter-7 mid-iteration check-in", "DOE-BES report status"],
  discussion: ["[Upcoming meeting — agenda preview]"],
  decisions: [],
  actions: [],
  notes: "Scheduled · auto-pulled from project calendar.",
  upcoming: true
}];
const RISK = {
  // Projects
  p_nmc: {
    workflow: "battery_safety_risk_v1",
    runAt: "May 22 · 14:08",
    runBy: "AI · approved by JR",
    flaggedForPI: true,
    flagReason: "Item #2 — likelihood high + impact kills cycle-life claim · PI notified May 22",
    summary: "High-Ni cycling at 4.30 V upper cutoff carries elevated thermal-runaway risk vs the iter-6 4.20 V baseline. Cell-016 short on cycle 4 is a separate handling concern, not chemistry. Two HIGH-likelihood items below; mitigations are in flight.",
    items: [{
      risk: {
        title: "High-cutoff Rct growth runs away",
        description: "Cycling at 4.30 V accelerates the cathode/electrolyte interface beyond the iter-6 4.20 V baseline. +12 Ω already at SoC 50% on cell-014."
      },
      likelihood: "high",
      impact: {
        tone: "warn",
        headline: "Lowers paper rigor",
        description: "Capacity-retention curve diverges from iter-6 by cycle 50; the iter-7 hypothesis weakens and reviewers will flag selection bias."
      },
      mitigation: "EIS sweep every 20 cycles on cells 014 / 015 to track Rct(cycle). Escalate to 4.35 V only if shift saturates by cycle 50. Pre-register the saturation criterion before we look at the data."
    }, {
      risk: {
        title: "Batch-7B separator defect generalizes",
        description: "Cell-016 shorted on cycle 4 with visible Li dendrite on the separator. Separator-lot QA records for the cell were missing."
      },
      likelihood: "high",
      impact: {
        tone: "bad",
        headline: "Kills the cycle-life claim",
        description: "If batch 7B has systematic separator perforation we cannot defend a fair iter-6 → iter-7 comparison, and the safety story has to be retracted."
      },
      mitigation: "Quarantine batch 7B coin-cell stack from 4.30 V cycling until the separator-lot QA audit (SP) finishes. Re-build cell-016 replacement only from the validated separator lot."
    }, {
      risk: {
        title: "Thermal runaway at elevated cutoff",
        description: "Thermal-runaway probability scales with cutoff; we are at the edge of the validated 4.20 V window without a chamber abort interlock."
      },
      likelihood: "low",
      impact: {
        tone: "bad",
        headline: "Kills the project",
        description: "Low probability but catastrophic — a thermal event in the dry-room would force a multi-week safety review and likely halt iter-8 / iter-9."
      },
      mitigation: "Cycling restricted to in-glovebox channels 1–8 only. Per-channel thermistor with auto-abort at +2 °C over chamber baseline. Daily eyes-on inspection on first 10 cycles."
    }, {
      risk: {
        title: "Caltech 4.25 V results don't replicate",
        description: "HQ's group reports a similar Rct shift at 4.25 V. We are betting on their data to justify the elevated cutoff in the DOE-BES report."
      },
      likelihood: "medium",
      impact: {
        tone: "warn",
        headline: "Lowers novelty",
        description: "Without an independent replication our 4.30 V finding is a single-lab result; report falls back to iter-6 baseline framing."
      },
      mitigation: "MOU with Qin group signed by Jun 10. Data-exchange covers raw cycling CSVs and EIS. Plan B: reframe paper around mechanism (Rct vs cycle) using iter-6 baseline + iter-7 high-cutoff, skip the novelty claim."
    }]
  },
  p_sulf: {
    workflow: "experimental_risk_v1",
    runAt: "May 18 · 09:30",
    runBy: "AI · approved by SP",
    flaggedForPI: true,
    flagReason: "Dry-room humidity excursion (#1) hits both likelihood high and impact high · PI notified May 18",
    summary: "LPSCl is moisture-sensitive; recent humidity excursion in the dry-room raises handling risk. PI review recommended before next batch.",
    items: [{
      risk: {
        title: "Dry-room humidity excursion repeats",
        description: "Dewpoint spike to -25 °C on May 14 morning. LPSCl precursor was sealed; estimated exposure 12 min before HVAC corrected."
      },
      likelihood: "high",
      impact: {
        tone: "bad",
        headline: "Kills the synthesis batch",
        description: "Decomposed LPSCl evolves H₂S and loses ionic conductivity. Every downstream cell built from a compromised batch must be discarded."
      },
      mitigation: "Re-validate dry-room dewpoint before next synthesis batch. Install secondary dewpoint logger with alarm. FT-IR validation on every new LPSCl batch before downstream use."
    }, {
      risk: {
        title: "H₂S evolution during open-air handling",
        description: "Decomposition products if exposed. Operator PPE adequate inside glovebox but transfer to fume hood is the failure mode."
      },
      likelihood: "medium",
      impact: {
        tone: "bad",
        headline: "Operator hazard",
        description: "H₂S is acutely toxic at low concentrations; an unmonitored leak in the synthesis area is a building-evac event."
      },
      mitigation: "Mandatory H₂S monitor in synthesis area. Restrict open-air handling to fume hood with active scrubber. Two-person rule for any open transfer."
    }]
  },
  p_af: {
    workflow: "battery_safety_risk_v1",
    runAt: "May 11 · 16:42",
    runBy: "AI · approved by MT",
    flaggedForPI: true,
    flagReason: "Inherent dendrite risk in anode-free architecture",
    summary: "Anode-free architecture with lithium plating on copper. High thermal-runaway risk if plating becomes uneven; visually inspect cells after every formation cycle.",
    items: [{
      risk: {
        title: "Uneven Li plating → dendrite",
        description: "Inherent to the anode-free architecture; Cu surface prep can only mitigate, not eliminate."
      },
      likelihood: "high",
      impact: {
        tone: "bad",
        headline: "Kills the project",
        description: "A dendrite short during cycling in the dry-room is the worst-case incident scenario."
      },
      mitigation: "Visual inspection of Cu surface after every formation cycle. Cycle in thermal chamber with abort on >2 °C delta. Halt at first sign of CE < 99.0%."
    }, {
      risk: {
        title: "Cu substrate surface variability",
        description: "Plating uniformity depends on Cu surface energy and roughness. Lot-to-lot variation is hard to control with COTS Cu foil."
      },
      likelihood: "medium",
      impact: {
        tone: "warn",
        headline: "Lowers reproducibility",
        description: "Sample-to-sample variation will be high; need many cells to argue trends."
      },
      mitigation: "Source from single Cu lot for paper 1. Document surface treatment SOP. Run 6+ cells per condition."
    }]
  },
  p_sei: {
    workflow: "experimental_risk_v1",
    runAt: null,
    summary: "Not yet assessed.",
    items: []
  },
  p_pmm: {
    workflow: "experimental_risk_v1",
    runAt: "Apr 29 · 11:00",
    runBy: "AI · approved by SP",
    flaggedForPI: false,
    summary: "Post-mortem dissection of cycled cells in glovebox. Standard procedures cover most risks.",
    items: [{
      risk: {
        title: "Sharp / cut hazards during dissection",
        description: "Razor disassembly of cycled coin cells in glovebox."
      },
      likelihood: "medium",
      impact: {
        tone: "warn",
        headline: "Operator injury",
        description: "Cut-glove protocol covers most but glovebox dexterity limits make slips more likely."
      },
      mitigation: "Cut-resistant gloves under glovebox gloves. Single-person dissection only; spotter outside."
    }, {
      risk: {
        title: "Residual electrolyte exposure",
        description: "Sealed cells, glovebox dissection. Most risk eliminated by environment."
      },
      likelihood: "low",
      impact: {
        tone: "warn",
        headline: "Skin / eye irritant",
        description: "LP30 residue can cause mild burns if seal is broken outside glovebox."
      },
      mitigation: "Discharge any cells > 3.0 V before dissection. PPE protocol unchanged."
    }]
  },
  // Iterations
  it_7: {
    workflow: "battery_safety_risk_v1",
    runAt: "May 21 · 18:22",
    runBy: "AI · approved by JR",
    flaggedForPI: true,
    flagReason: "Cell-016 short + dendrite finding (#1) · Mei notified May 21 18:24",
    summary: "Cell-016 cycle-4 short combined with the 4.30 V cutoff pushes this iteration into elevated territory. Mei was auto-notified; visual SEM confirmed dendrite on separator. Cycling continues on cells 014 and 015 only.",
    items: [{
      risk: {
        title: "Cell-016 short re-occurs in 014 / 015",
        description: "Same batch, same cutoff. If the 016 failure was batch-level, the remaining cells are at risk."
      },
      likelihood: "medium",
      impact: {
        tone: "bad",
        headline: "Kills this iteration",
        description: "Two more shorts → iter-7 has zero comparable cells against the iter-6 baseline; restart required."
      },
      mitigation: "Auto-abort if Rct grows > 30 % in any 20-cycle window. Daily eyes-on inspection. Hold cell-016 replacement until separator-lot QA passes."
    }, {
      risk: {
        title: "4.30 V cutoff is too aggressive",
        description: "The +12 Ω Rct shift could be the upper-tail of the validated 4.20 V window — we may already be past safe."
      },
      likelihood: "low",
      impact: {
        tone: "bad",
        headline: "Pulls the iteration result",
        description: "If we have to retreat to 4.25 V mid-cycle, the dataset is no longer apples-to-apples with iter-6."
      },
      mitigation: "Pre-register the saturation criterion. EIS at every 20-cycle checkpoint. If shift exceeds 50 % over baseline at any point, halt and convert to a 4.25 V iteration."
    }, {
      risk: {
        title: "Cycling instrument scheduling slip",
        description: "Channels 1–8 booked through iter-7 close, but glovebox maintenance window (Jun 05) overlaps with cycle 40–50 critical region."
      },
      likelihood: "medium",
      impact: {
        tone: "warn",
        headline: "Loses 2 days of data",
        description: "Gap in the Rct(cycle) curve right at the saturation inflection. Reviewers will ask about it."
      },
      mitigation: "Coordinate with KB to extend maintenance window to a low-information segment (cycle 30 plateau). If unavoidable, document gap and interpolate."
    }]
  },
  it_8: {
    workflow: "battery_safety_risk_v1",
    runAt: "May 24 · 10:15",
    runBy: "AI draft · pending PI approval",
    flaggedForPI: false,
    summary: "Binder swap to CMC/SBR introduces aqueous processing variables. Risk is process-side, not chemistry-side. Approve before iter-8 kickoff.",
    candidate: true,
    items: [{
      risk: {
        title: "Aqueous slurry → Ni leaching",
        description: "Ni-rich cathode + water → possible Li/Ni dissolution during slurry-coat exposure window."
      },
      likelihood: "medium",
      impact: {
        tone: "warn",
        headline: "Lowers novelty",
        description: "If leaching is detectable by ICP-MS, the binder claim becomes 'process-controlled', not 'binder-independent'."
      },
      mitigation: "Time-limit aqueous slurry exposure to < 30 min before coating. ICP-MS validation after first batch."
    }, {
      risk: {
        title: "Coater purge between solvents incomplete",
        description: "PVDF and CMC/SBR slurries have different rheology; residual on the slot-die contaminates the next batch."
      },
      likelihood: "low",
      impact: {
        tone: "warn",
        headline: "Lowers paper rigor",
        description: "Cross-contamination is a single-blind issue — reviewers will ask."
      },
      mitigation: "Document purge protocol. Visually inspect die after each switch. Run a sacrificial coat between binders."
    }]
  },
  it_9: {
    workflow: "battery_safety_risk_v1",
    runAt: null,
    summary: "Scheduled when iter-7 closes.",
    items: []
  }
};

// ──────────────────────────────────────────────────────
// Block content for the "page editor" screen
// (One sample notebook-style page: "Iteration 7 — Week 22 notes")
// ──────────────────────────────────────────────────────
const SAMPLE_BY_ID = Object.fromEntries(SAMPLES.map(s => [s.id, s]));
const EXP_BY_ID = Object.fromEntries(EXPERIMENTS.map(e => [e.id, e]));
const ART_BY_ID = Object.fromEntries(ARTIFACTS.map(a => [a.id, a]));

// ──────────────────────────────────────────────────────
// Inbox — surface for mentions, PI flags, action items, AI proposals
// ──────────────────────────────────────────────────────
const INBOX = [{
  id: "in_01",
  kind: "pi_flag",
  bucket: "today",
  from: "Assistant",
  actor: "AI",
  title: "Risk register item #2 escalated",
  subtitle: "Batch-7B separator defect — likelihood HIGH, impact KILLS the cycle-life claim. Mei was notified May 21 · 18:24.",
  project: "p_nmc",
  target: {
    type: "iteration",
    id: "it_7"
  },
  ts: "8 min ago",
  unread: true
}, {
  id: "in_02",
  kind: "mention",
  bucket: "today",
  from: "Mei Tanaka",
  actor: "MT",
  title: "@you on Iter-7 · Week 22 cycling notes",
  subtitle: "Watch for the dendrite morphology, not just the voltage curve. The 016 short is a tell.",
  project: "p_nmc",
  target: {
    type: "page",
    id: "page_iter7_w22"
  },
  ts: "2 h ago",
  unread: true
}, {
  id: "in_03",
  kind: "ai_proposal",
  bucket: "today",
  from: "Assistant",
  actor: "AI",
  title: "Draft revision proposed: Iter-7 risk-register row #2 update",
  subtitle: "Adds the separator-lot QA audit findings under mitigations. Awaiting approval (suggest_writes).",
  project: "p_nmc",
  target: {
    type: "iteration",
    id: "it_7"
  },
  ts: "3 h ago",
  unread: true
}, {
  id: "in_04",
  kind: "action",
  bucket: "today",
  from: "Mei Tanaka",
  actor: "MT",
  title: "Action item due May 28 — DOE-BES report §3 (cycling)",
  subtitle: "From PI weekly · Week 22 meeting. Draft and circulate by EOD May 28.",
  project: "p_nmc",
  target: {
    type: "meeting",
    id: "mtg_2026_05_21"
  },
  ts: "yesterday",
  unread: false
}, {
  id: "in_05",
  kind: "comment",
  bucket: "earlier",
  from: "Sam Patel",
  actor: "SP",
  title: "Comment on cell-014 post-mortem",
  subtitle: "Cathode particles look intact, but check the (003) intensity in the XRD from EX-200 before publishing.",
  project: "p_nmc",
  target: {
    type: "experiment",
    id: "EX-205"
  },
  ts: "May 22",
  unread: false
}, {
  id: "in_06",
  kind: "ai_proposal",
  bucket: "earlier",
  from: "Assistant",
  actor: "AI",
  title: "Iter-8 risk register draft ready",
  subtitle: "Two items: aqueous Ni leaching (MED / Lowers novelty), coater purge (LOW / Lowers paper rigor).",
  project: "p_nmc",
  target: {
    type: "iteration",
    id: "it_8"
  },
  ts: "May 24",
  unread: false
}, {
  id: "in_07",
  kind: "mention",
  bucket: "earlier",
  from: "Hua Qin",
  actor: "HQ",
  title: "@you on Caltech data-exchange MOU",
  subtitle: "Sent draft for review. Two paragraphs on data scope — please flag anything I missed.",
  project: null,
  target: {
    type: "page",
    id: "caltech_mou"
  },
  ts: "May 21",
  unread: false
}, {
  id: "in_08",
  kind: "system",
  bucket: "earlier",
  from: "Halide",
  actor: "H",
  title: "Calendar subscription URL was rotated",
  subtitle: "Your previous .ics URL was revoked. Update your Google / Apple / Outlook subscription in Settings.",
  project: null,
  target: null,
  ts: "May 20",
  unread: false
}, {
  id: "in_09",
  kind: "pi_flag",
  bucket: "older",
  from: "Assistant",
  actor: "AI",
  title: "Sulfide project · risk register item #1 — PI review",
  subtitle: "Dry-room humidity excursion hits both likelihood HIGH and impact HIGH.",
  project: "p_sulf",
  target: {
    type: "project",
    id: "p_sulf"
  },
  ts: "May 18",
  unread: false
}];

// ──────────────────────────────────────────────────────
// Workspace members — extended PEOPLE with role, status, last active
// ──────────────────────────────────────────────────────
const MEMBERS = [{
  id: "MT",
  name: "Dr. Mei Tanaka",
  role: "owner",
  title: "PI",
  email: "mei.tanaka@halide-lab.org",
  access: "Workspace owner · admin override",
  since: "Sep 2024",
  lastActive: "8 min ago",
  auth: "Entra SSO · entra:tanaka@halide.edu",
  twofa: true,
  projects: ["p_nmc", "p_sulf", "p_af", "p_sei", "p_pmm"],
  status: "active"
}, {
  id: "JR",
  name: "Jules Reyes",
  role: "admin",
  title: "PhD candidate",
  email: "jules@halide-lab.org",
  access: "Workspace admin",
  since: "Jan 2025",
  lastActive: "now",
  auth: "Entra SSO",
  twofa: true,
  projects: ["p_nmc", "p_pmm"],
  status: "active"
}, {
  id: "SP",
  name: "Sam Patel",
  role: "member",
  title: "PhD candidate",
  email: "sam.patel@halide-lab.org",
  access: "Standard member",
  since: "Sep 2024",
  lastActive: "23 min ago",
  auth: "Entra SSO",
  twofa: false,
  projects: ["p_nmc", "p_sulf", "p_pmm"],
  status: "active"
}, {
  id: "KB",
  name: "Karim Bah",
  role: "member",
  title: "Postdoc",
  email: "karim.bah@halide-lab.org",
  access: "Standard member",
  since: "Mar 2024",
  lastActive: "1 h ago",
  auth: "Entra SSO",
  twofa: true,
  projects: ["p_nmc", "p_sulf", "p_af"],
  status: "active"
}, {
  id: "DV",
  name: "Dara Vance",
  role: "member",
  title: "MSc candidate",
  email: "dara.v@halide-lab.org",
  access: "Standard member",
  since: "Sep 2025",
  lastActive: "yesterday",
  auth: "Entra SSO",
  twofa: false,
  projects: ["p_nmc"],
  status: "active"
}, {
  id: "HQ",
  name: "Hua Qin",
  role: "external",
  title: "Collaborator · Caltech",
  email: "hua.qin@caltech.edu",
  access: "External · invited by MT",
  since: "Apr 2026",
  lastActive: "May 21",
  auth: "Local password · invited",
  twofa: false,
  projects: ["p_nmc"],
  status: "active"
}];

// ──────────────────────────────────────────────────────
// Pending invites (external users)
// ──────────────────────────────────────────────────────
const INVITES = [{
  id: "inv_01",
  email: "rae.kim@stanford.edu",
  invitedBy: "MT",
  workspace: "Halide",
  project: "p_nmc",
  expires: "in 3 days",
  sentAt: "May 23"
}, {
  id: "inv_02",
  email: "andre.lopes@anl.gov",
  invitedBy: "MT",
  workspace: "Halide",
  project: "p_sulf",
  expires: "in 5 days",
  sentAt: "May 24"
}, {
  id: "inv_03",
  email: "j.nakamura@u-tokyo.ac.jp",
  invitedBy: "JR",
  workspace: "Halide",
  project: "p_nmc",
  expires: "in 6 days",
  sentAt: "May 25"
}];

// ──────────────────────────────────────────────────────
// Personal Access Tokens
// ──────────────────────────────────────────────────────
const PATS = [{
  id: "pat_01",
  name: "Local notebooks (laptop)",
  prefix: "pat_3f8a…",
  scopes: ["read:projects", "read:samples", "read:experiments", "read:pages", "read:artifacts"],
  created: "Jan 18",
  lastUsed: "12 min ago",
  expires: "Jan 18, 2027"
}, {
  id: "pat_02",
  name: "Claude Code · MCP",
  prefix: "pat_b21c…",
  scopes: ["read:*", "write:pages", "write:samples", "ai:converse"],
  created: "Feb 04",
  lastUsed: "1 h ago",
  expires: "never"
}, {
  id: "pat_03",
  name: "Cycling rig auto-uploader",
  prefix: "pat_d094…",
  scopes: ["write:artifacts", "write:experiments"],
  created: "Apr 12",
  lastUsed: "5 min ago",
  expires: "Apr 12, 2027"
}, {
  id: "pat_04",
  name: "Old laptop · revoked",
  prefix: "pat_e54f…",
  scopes: ["read:projects"],
  created: "Mar 02",
  lastUsed: "Mar 24",
  expires: "—",
  revoked: true
}];

// ──────────────────────────────────────────────────────
// Audit log (recent)
// ──────────────────────────────────────────────────────
const AUDIT = [{
  ts: "May 26 · 09:42",
  actor: "JR",
  via: "session",
  action: "page.update",
  resource: "Iter-7 · Week 22 notes (rev #84)",
  status: 200
}, {
  ts: "May 26 · 09:31",
  actor: "AI",
  via: "iai_4a2f… (JR)",
  action: "page.candidate.create",
  resource: "Iter-7 · Week 22 notes (cand #c7)",
  status: 201
}, {
  ts: "May 26 · 08:55",
  actor: "JR",
  via: "pat_b21c…",
  action: "experiment.create",
  resource: "EX-211 (cycling)",
  status: 201
}, {
  ts: "May 26 · 08:10",
  actor: "MT",
  via: "session",
  action: "admin.override.read",
  resource: "p_af / pages",
  status: 200
}, {
  ts: "May 25 · 22:14",
  actor: "AI",
  via: "iai_91b3… (SP)",
  action: "risk.run",
  resource: "p_sulf · battery_safety_risk_v1",
  status: 201
}, {
  ts: "May 25 · 18:02",
  actor: "KB",
  via: "session",
  action: "sample.update",
  resource: "NMC-7B-cathode-r3",
  status: 200
}, {
  ts: "May 25 · 17:40",
  actor: "AI",
  via: "iai_91b3… (JR)",
  action: "page.update",
  resource: "p_nmc / risk register",
  status: 200
}, {
  ts: "May 25 · 12:30",
  actor: "DV",
  via: "session",
  action: "page.create",
  resource: "Iter-8 · binder protocol",
  status: 201
}];

// ──────────────────────────────────────────────────────
// AI usage rollup
// ──────────────────────────────────────────────────────
const AI_USAGE = {
  cap: 200,
  spent: 48.12,
  pctOfCap: 24,
  daysIn: 14,
  daysLeft: 12,
  byUser: [{
    id: "JR",
    spent: 24.4,
    calls: 142
  }, {
    id: "SP",
    spent: 11.0,
    calls: 88
  }, {
    id: "MT",
    spent: 6.2,
    calls: 41
  }, {
    id: "KB",
    spent: 4.3,
    calls: 36
  }, {
    id: "DV",
    spent: 2.2,
    calls: 24
  }],
  byFeature: [{
    k: "Chat",
    v: 18.2
  }, {
    k: "Workflows",
    v: 21.4
  }, {
    k: "Tool calls",
    v: 8.5
  }],
  daily: [1.1, 2.3, 1.8, 2.6, 3.4, 2.9, 4.1, 3.2, 4.5, 5.1, 4.3, 5.6, 4.8, 4.2] // last 14 days
};
window.LAB = {
  WORKSPACE,
  PROJECTS,
  ITERATIONS,
  SAMPLES,
  EXPERIMENTS,
  ARTIFACTS,
  PEOPLE,
  EVENTS,
  RISK,
  MEETINGS,
  INBOX,
  INVITES,
  PATS,
  AUDIT,
  AI_USAGE,
  MEMBERS,
  SAMPLE_BY_ID,
  EXP_BY_ID,
  ART_BY_ID
};
})();

/* === icons.jsx === */
(function(){
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// icons.jsx — tiny SVG icon set. Names match Lucide where reasonable.

function Icon({
  name,
  size = 14,
  stroke = 1.5,
  style
}) {
  const s = {
    width: size,
    height: size,
    ...style
  };
  const sw = stroke;
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: sw,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };
  switch (name) {
    case "search":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("circle", _extends({
        cx: "11",
        cy: "11",
        r: "7"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "m20 20-3.5-3.5"
      }, p)));
    case "plus":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M12 5v14M5 12h14"
      }, p)));
    case "home":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M3 11 12 4l9 7v8a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z"
      }, p)));
    case "inbox":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M22 12h-6l-2 3h-4l-2-3H2"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"
      }, p)));
    case "calendar":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("rect", _extends({
        x: "3",
        y: "4.5",
        width: "18",
        height: "16",
        rx: "2"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M3 9h18M8 3v3M16 3v3"
      }, p)));
    case "flask":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M9 3h6M10 3v6L4.5 19.2A1.5 1.5 0 0 0 5.8 21.5h12.4a1.5 1.5 0 0 0 1.3-2.3L14 9V3"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M7 14h10"
      }, p)));
    case "atom":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("circle", _extends({
        cx: "12",
        cy: "12",
        r: "1.5"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M12 4c5 0 9 3.6 9 8s-4 8-9 8-9-3.6-9-8 4-8 9-8Z"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M4.7 7c2.6 4.5 9.5 11.4 14.6 11.4M4.7 17C7.3 12.5 14.2 5.6 19.3 5.6"
      }, p)));
    case "book":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M4 4v15a1 1 0 0 0 1 1h15V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2Z"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M8 4v16"
      }, p)));
    case "file":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M14 3v5h5"
      }, p)));
    case "chev-r":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "m9 6 6 6-6 6"
      }, p)));
    case "chev-d":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "m6 9 6 6 6-6"
      }, p)));
    case "chev-l":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "m15 6-6 6 6 6"
      }, p)));
    case "settings":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("circle", _extends({
        cx: "12",
        cy: "12",
        r: "2.5"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.06-.4.1-.8.1-1.2Z"
      }, p)));
    case "more":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("circle", {
        cx: "6",
        cy: "12",
        r: "1.2",
        fill: "currentColor"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12",
        r: "1.2",
        fill: "currentColor"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "18",
        cy: "12",
        r: "1.2",
        fill: "currentColor"
      }));
    case "share":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M12 3v12M8 7l4-4 4 4M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"
      }, p)));
    case "image":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("rect", _extends({
        x: "3",
        y: "4",
        width: "18",
        height: "16",
        rx: "2"
      }, p)), /*#__PURE__*/React.createElement("circle", _extends({
        cx: "9",
        cy: "10",
        r: "1.6"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "m4 19 5-5 4 4 3-2 4 4"
      }, p)));
    case "code":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "m9 8-4 4 4 4M15 8l4 4-4 4"
      }, p)));
    case "doc":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M14 3v5h5M9 13h6M9 17h4"
      }, p)));
    case "users":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("circle", _extends({
        cx: "9",
        cy: "9",
        r: "3.5"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M3 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M21 20a5 5 0 0 0-4-4.9"
      }, p)));
    case "git":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("circle", _extends({
        cx: "6",
        cy: "6",
        r: "2"
      }, p)), /*#__PURE__*/React.createElement("circle", _extends({
        cx: "6",
        cy: "18",
        r: "2"
      }, p)), /*#__PURE__*/React.createElement("circle", _extends({
        cx: "18",
        cy: "12",
        r: "2"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M6 8v8M8 18h4a4 4 0 0 0 4-4v-2"
      }, p)));
    case "spark":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"
      }, p)));
    case "send":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "m4 12 16-8-6 18-3-7-7-3Z"
      }, p)));
    case "paperclip":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M21 12.5 12 21a5 5 0 0 1-7-7l9.5-9.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3l8-8"
      }, p)));
    case "filter":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M4 5h16l-6 8v5l-4-2v-3Z"
      }, p)));
    case "grid":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("rect", _extends({
        x: "4",
        y: "4",
        width: "7",
        height: "7"
      }, p)), /*#__PURE__*/React.createElement("rect", _extends({
        x: "13",
        y: "4",
        width: "7",
        height: "7"
      }, p)), /*#__PURE__*/React.createElement("rect", _extends({
        x: "4",
        y: "13",
        width: "7",
        height: "7"
      }, p)), /*#__PURE__*/React.createElement("rect", _extends({
        x: "13",
        y: "13",
        width: "7",
        height: "7"
      }, p)));
    case "list":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M4 6h16M4 12h16M4 18h16"
      }, p)));
    case "history":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"
      }, p)));
    case "shield":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M12 3 4 6v6c0 4.5 3.2 8.4 8 9 4.8-.6 8-4.5 8-9V6Z"
      }, p)));
    case "globe":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("circle", _extends({
        cx: "12",
        cy: "12",
        r: "9"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"
      }, p)));
    case "lock":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("rect", _extends({
        x: "4",
        y: "11",
        width: "16",
        height: "10",
        rx: "2"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M8 11V8a4 4 0 0 1 8 0v3"
      }, p)));
    case "check":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "m5 12 5 5 9-11"
      }, p)));
    case "x":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M6 6l12 12M6 18 18 6"
      }, p)));
    case "side":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("rect", _extends({
        x: "3",
        y: "4",
        width: "18",
        height: "16",
        rx: "2"
      }, p)), /*#__PURE__*/React.createElement("path", _extends({
        d: "M9 4v16"
      }, p)));
    case "ai":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M12 3v3M5 6l2 2M19 6l-2 2M12 9a3 3 0 1 0 3 3M12 21v-3M21 12h-3M3 12h3"
      }, p)));
    case "flag":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M5 21V4h12l-2 4 2 4H5"
      }, p)));
    case "link":
      return /*#__PURE__*/React.createElement("svg", {
        viewBox: "0 0 24 24",
        style: s
      }, /*#__PURE__*/React.createElement("path", _extends({
        d: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"
      }, p)));
    default:
      return null;
  }
}
window.Icon = Icon;
})();

/* === shell.jsx === */
(function(){
// shell.jsx — app shell: sidebar, top bar, tabs

const {
  useState
} = React;
const {
  Icon,
  LAB
} = window;
function Avatar({
  id,
  size = 22,
  ring
}) {
  const p = LAB.PEOPLE[id] || {
    name: id,
    color: "#666"
  };
  const init = p.name.split(" ").map(s => s[0]).join("").slice(0, 2);
  return /*#__PURE__*/React.createElement("div", {
    className: "a",
    style: {
      width: size,
      height: size,
      background: p.color,
      color: "#fff",
      borderRadius: "50%",
      display: "grid",
      placeItems: "center",
      fontSize: Math.max(9, size * 0.42),
      fontWeight: 600,
      letterSpacing: ".02em",
      boxShadow: ring ? "0 0 0 2px var(--paper)" : "none"
    },
    title: p.name
  }, init);
}
function Sidebar({
  route,
  setRoute
}) {
  const projects = LAB.PROJECTS;
  return /*#__PURE__*/React.createElement("aside", {
    className: "side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "side-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ws-badge"
  }, "H"), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ws-name"
  }, "Halide"), /*#__PURE__*/React.createElement("div", {
    className: "ws-sub"
  }, LAB.WORKSPACE.sub)), /*#__PURE__*/React.createElement("button", {
    className: "ws-pick"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chev-d",
    size: 12
  }))), /*#__PURE__*/React.createElement("div", {
    className: "side-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 13
  }), /*#__PURE__*/React.createElement("span", null, "Search or jump to\u2026"), /*#__PURE__*/React.createElement("span", {
    className: "kbd"
  }, "\u2318K")), /*#__PURE__*/React.createElement("nav", {
    className: "side-nav"
  }, /*#__PURE__*/React.createElement("button", {
    className: "side-item" + (route.view === "home" ? " active" : ""),
    onClick: () => setRoute({
      view: "home"
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "home",
    size: 13
  })), "Home"), /*#__PURE__*/React.createElement("button", {
    className: "side-item" + (route.view === "inbox" ? " active" : ""),
    onClick: () => setRoute({
      view: "inbox"
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "inbox",
    size: 13
  })), "Inbox", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, LAB.INBOX.filter(i => i.unread).length)), /*#__PURE__*/React.createElement("button", {
    className: "side-item" + (route.view === "calendar" ? " active" : ""),
    onClick: () => setRoute({
      view: "calendar"
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar",
    size: 13
  })), "Calendar"), /*#__PURE__*/React.createElement("button", {
    className: "side-item" + (route.view === "meetings" || route.view === "meeting" ? " active" : ""),
    onClick: () => setRoute({
      view: "meetings"
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "book",
    size: 13
  })), "Meetings", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, LAB.MEETINGS.length)), /*#__PURE__*/React.createElement("button", {
    className: "side-item" + (route.view === "people" ? " active" : ""),
    onClick: () => setRoute({
      view: "people"
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 13
  })), "People", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, LAB.MEMBERS.length)), /*#__PURE__*/React.createElement("button", {
    className: "side-item" + (route.view === "admin" ? " active" : ""),
    onClick: () => setRoute({
      view: "admin"
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield",
    size: 13
  })), "Admin", /*#__PURE__*/React.createElement("span", {
    className: "count",
    style: {
      color: "var(--ember)"
    }
  }, "PI"))), /*#__PURE__*/React.createElement("div", {
    className: "side-sect"
  }, /*#__PURE__*/React.createElement("span", null, "Projects"), /*#__PURE__*/React.createElement("button", {
    className: "add",
    title: "New project",
    onClick: () => setRoute({
      view: "new-project"
    })
  }, "\uFF0B")), /*#__PURE__*/React.createElement("div", {
    className: "side-tree"
  }, projects.map(p => {
    const isActive = route.view === "project" && route.projectId === p.id;
    const isExpanded = isActive;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: p.id
    }, /*#__PURE__*/React.createElement("button", {
      className: "tree-item" + (isActive ? " active" : ""),
      onClick: () => setRoute({
        view: "project",
        projectId: p.id,
        tab: "overview"
      })
    }, /*#__PURE__*/React.createElement("span", {
      className: "chev"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: isExpanded ? "chev-d" : "chev-r",
      size: 10
    })), /*#__PURE__*/React.createElement("span", {
      className: "glyph"
    }, p.emblem), /*#__PURE__*/React.createElement("span", {
      style: {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, p.name), p.visibility === "private" && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        color: "var(--muted-2)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "lock",
      size: 11
    }))), isExpanded && /*#__PURE__*/React.createElement("div", {
      className: "tree-children"
    }, /*#__PURE__*/React.createElement("button", {
      className: "tree-item" + (route.tab === "overview" ? " active" : ""),
      onClick: () => setRoute({
        ...route,
        tab: "overview"
      })
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "dot"
    }), "Overview"), /*#__PURE__*/React.createElement("button", {
      className: "tree-item" + (route.tab === "iterations" ? " active" : ""),
      onClick: () => setRoute({
        ...route,
        tab: "iterations"
      })
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "dot"
    }), "Iterations"), /*#__PURE__*/React.createElement("button", {
      className: "tree-item" + (route.tab === "samples" ? " active" : ""),
      onClick: () => setRoute({
        ...route,
        tab: "samples"
      })
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "dot"
    }), "Samples"), /*#__PURE__*/React.createElement("button", {
      className: "tree-item" + (route.tab === "experiments" ? " active" : ""),
      onClick: () => setRoute({
        ...route,
        tab: "experiments"
      })
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "dot"
    }), "Experiments"), /*#__PURE__*/React.createElement("button", {
      className: "tree-item" + (route.tab === "pages" ? " active" : ""),
      onClick: () => setRoute({
        ...route,
        tab: "pages"
      })
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "dot"
    }), "Pages"), /*#__PURE__*/React.createElement("button", {
      className: "tree-item" + (route.tab === "artifacts" ? " active" : ""),
      onClick: () => setRoute({
        ...route,
        tab: "artifacts"
      })
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "dot"
    }), "Artifacts"), /*#__PURE__*/React.createElement("button", {
      className: "tree-item" + (route.tab === "calendar" ? " active" : ""),
      onClick: () => setRoute({
        ...route,
        tab: "calendar"
      })
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "dot"
    }), "Calendar")));
  })), /*#__PURE__*/React.createElement("div", {
    className: "side-sect"
  }, /*#__PURE__*/React.createElement("span", null, "Templates")), /*#__PURE__*/React.createElement("div", {
    className: "side-tree"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tree-item" + (route.view === "template" && route.templateKey === "battery_safety_risk_v1" ? " active" : ""),
    onClick: () => setRoute({
      view: "template",
      templateKey: "battery_safety_risk_v1"
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "chev"
  }), /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\u2317"), /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Battery safety risk")), /*#__PURE__*/React.createElement("button", {
    className: "tree-item" + (route.view === "template" && route.templateKey === "experimental_risk_v1" ? " active" : ""),
    onClick: () => setRoute({
      view: "template",
      templateKey: "experimental_risk_v1"
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "chev"
  }), /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\u2317"), /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Experimental risk")), /*#__PURE__*/React.createElement("button", {
    className: "tree-item" + (route.view === "template" && route.templateKey === "project_risk_v1" ? " active" : ""),
    onClick: () => setRoute({
      view: "template",
      templateKey: "project_risk_v1"
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "chev"
  }), /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\u2317"), /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Project risk"))), /*#__PURE__*/React.createElement("div", {
    className: "side-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "avatar"
  }, "JR"), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "me-name"
  }, "Jules Reyes"), /*#__PURE__*/React.createElement("div", {
    className: "me-sub"
  }, "jules@halide-lab.org")), /*#__PURE__*/React.createElement("button", {
    className: "icon-btn",
    style: {
      marginLeft: "auto"
    },
    onClick: () => setRoute({
      view: "account"
    }),
    title: "Account settings"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "settings",
    size: 14
  }))));
}
function TopBar({
  route,
  setRoute,
  project,
  page,
  showAi,
  setShowAi,
  setModal
}) {
  let crumbs = [];
  if (route.view === "home") crumbs = [{
    label: "Halide"
  }, {
    label: "Home",
    cur: true
  }];
  if (route.view === "calendar") crumbs = [{
    label: "Halide"
  }, {
    label: "Calendar",
    cur: true
  }];
  if (route.view === "project") crumbs = [{
    label: "Halide"
  }, {
    label: "Projects"
  }, {
    label: project?.name,
    cur: true
  }];
  if (route.view === "meetings") crumbs = [{
    label: "Halide"
  }, {
    label: "Meetings",
    cur: true
  }];
  if (route.view === "inbox") crumbs = [{
    label: "Halide"
  }, {
    label: "Inbox",
    cur: true
  }];
  if (route.view === "people") crumbs = [{
    label: "Halide"
  }, {
    label: "People",
    cur: true
  }];
  if (route.view === "account") crumbs = [{
    label: "Halide"
  }, {
    label: "Settings"
  }, {
    label: "Account",
    cur: true
  }];
  if (route.view === "admin") crumbs = [{
    label: "Halide"
  }, {
    label: "Workspace admin",
    cur: true
  }];
  if (route.view === "new-project") crumbs = [{
    label: "Halide"
  }, {
    label: "Projects"
  }, {
    label: "New project",
    cur: true
  }];
  if (route.view === "new-iteration") crumbs = [{
    label: "Halide"
  }, {
    label: project?.name || "Project"
  }, {
    label: "Iterations"
  }, {
    label: "New iteration",
    cur: true
  }];
  if (route.view === "meeting") {
    const m = LAB.MEETINGS.find(mt => mt.id === route.meetingId);
    crumbs = [{
      label: "Halide"
    }, {
      label: "Meetings",
      cur: false
    }, {
      label: m?.title || "Meeting",
      cur: true
    }];
  }
  if (route.view === "entity") {
    const proj = project;
    let label = "Entity";
    if (route.entityType === "sample") label = LAB.SAMPLE_BY_ID[route.entityId]?.id || "Sample";
    if (route.entityType === "experiment") label = LAB.EXP_BY_ID[route.entityId]?.id || "Experiment";
    if (route.entityType === "iteration") {
      const it = LAB.ITERATIONS.find(i => i.id === route.entityId);
      label = it ? "Iter-" + it.num : "Iteration";
    }
    crumbs = [{
      label: "Halide"
    }, {
      label: proj?.name || "Project"
    }, {
      label: route.entityType + "s"
    }, {
      label,
      cur: true
    }];
  }
  if (route.view === "page") crumbs = [{
    label: "Halide"
  }, {
    label: project?.name
  }, {
    label: "Pages"
  }, {
    label: page?.title || "Iter-7 · Week 22 notes",
    cur: true
  }];
  return /*#__PURE__*/React.createElement("header", {
    className: "top"
  }, /*#__PURE__*/React.createElement("button", {
    className: "icon-btn",
    onClick: () => history.back && history.back()
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "side",
    size: 14
  })), /*#__PURE__*/React.createElement("div", {
    className: "crumbs"
  }, crumbs.map((c, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: c.cur ? "cur" : "",
    onClick: () => {
      // Lightweight back-nav: if crumb is "Meetings" or project, route to it
      if (c.label === "Meetings" && !c.cur) setRoute({
        view: "meetings"
      });
      if (c.label === project?.name && !c.cur) setRoute({
        view: "project",
        projectId: project.id,
        tab: "overview"
      });
    },
    style: {
      cursor: c.cur ? "default" : "default"
    }
  }, c.label), i < crumbs.length - 1 && /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "/")))), /*#__PURE__*/React.createElement("div", {
    className: "top-actions"
  }, route.view === "project" && /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      gap: 6,
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      gap: 0
    }
  }, (project?.collaborators || ["MT", "JR", "SP", "KB", "DV"]).map((id, i) => /*#__PURE__*/React.createElement("div", {
    key: id,
    style: {
      marginLeft: i === 0 ? 0 : -6
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    id: id,
    ring: true
  })))), /*#__PURE__*/React.createElement("button", {
    className: "top-btn",
    onClick: () => setModal && setModal("share")
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 12
  }), " Share")), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "history",
    size: 12
  })), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more",
    size: 14
  })), /*#__PURE__*/React.createElement("button", {
    className: "top-btn" + (showAi ? "" : ""),
    onClick: () => setShowAi(!showAi),
    title: "Toggle AI panel"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ai-orb",
    style: {
      width: 14,
      height: 14
    }
  }), " AI")));
}
function Tabs({
  route,
  setRoute,
  project
}) {
  if (route.view !== "project") return null;
  const items = [{
    id: "overview",
    label: "Overview"
  }, {
    id: "iterations",
    label: "Iterations",
    badge: project ? project.activeIter || 4 : null
  }, {
    id: "samples",
    label: "Samples",
    badge: project?.samples || 34
  }, {
    id: "experiments",
    label: "Experiments",
    badge: project?.experiments || 58
  }, {
    id: "pages",
    label: "Pages"
  }, {
    id: "artifacts",
    label: "Artifacts",
    badge: project?.artifacts || 142
  }, {
    id: "calendar",
    label: "Calendar"
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "tabs"
  }, items.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    className: "tab" + (route.tab === t.id ? " active" : ""),
    onClick: () => setRoute({
      ...route,
      tab: t.id
    })
  }, t.label, t.badge != null && /*#__PURE__*/React.createElement("span", {
    className: "badge"
  }, t.badge))));
}
Object.assign(window, {
  Sidebar,
  TopBar,
  Tabs,
  Avatar
});
})();

/* === ai-panel.jsx === */
(function(){
// ai-panel.jsx — always-on AI side panel

const {
  Icon: _Icon,
  LAB: _LAB,
  Avatar: _Av
} = window;
function AIPanel({
  project,
  route
}) {
  const proj = project || LAB.PROJECTS[0];
  return /*#__PURE__*/React.createElement("aside", {
    className: "ai"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ai-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ai-orb"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ai-title"
  }, "Assistant"), /*#__PURE__*/React.createElement("div", {
    className: "ai-mode"
  }, "suggest\xA0writes")), /*#__PURE__*/React.createElement("div", {
    className: "ai-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "msg ai"
  }, /*#__PURE__*/React.createElement("div", {
    className: "who"
  }, "assistant \xB7 ", proj.name), /*#__PURE__*/React.createElement("div", {
    className: "bubble"
  }, "Good morning, Jules. ", /*#__PURE__*/React.createElement("strong", null, "Iteration\xA07"), " is on day\xA05 of\xA025. Three cells from batch\xA07B are currently cycling at 4.30\xA0V cutoff.", /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, "I noticed ", /*#__PURE__*/React.createElement("strong", null, "NMC-7B-cell-016"), " shorted on cycle\xA04 ", /*#__PURE__*/React.createElement("span", {
    className: "citation"
  }, "[1]"), ". The other two cells are tracking the 4.20\xA0V baseline within \xB12%.")), /*#__PURE__*/React.createElement("div", {
    className: "tool-call"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "tname"
  }, "search_project_content"), /*#__PURE__*/React.createElement("span", {
    className: "targ"
  }, "("), /*#__PURE__*/React.createElement("span", {
    className: "targ"
  }, "q"), /*#__PURE__*/React.createElement("span", {
    className: "targ"
  }, ": "), "\"recent cycling failures\"", /*#__PURE__*/React.createElement("span", {
    className: "targ"
  }, ")")), /*#__PURE__*/React.createElement("div", {
    className: "tresult"
  }, "\u2192 3 results \xB7 cell-016, cell-014 EIS, post-mortem-cs"))), /*#__PURE__*/React.createElement("div", {
    className: "msg user"
  }, /*#__PURE__*/React.createElement("div", {
    className: "who"
  }, "jules \xB7 9:42"), /*#__PURE__*/React.createElement("div", {
    className: "bubble"
  }, "What's the impedance trend looking like vs. iter-6? And should I flag 016 for the safety review?")), /*#__PURE__*/React.createElement("div", {
    className: "msg ai"
  }, /*#__PURE__*/React.createElement("div", {
    className: "who"
  }, "assistant \xB7 streaming"), /*#__PURE__*/React.createElement("div", {
    className: "bubble"
  }, "Impedance is up modestly. From ", /*#__PURE__*/React.createElement("strong", null, "EX-209"), ":", /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "8px 0",
      padding: "8px 10px",
      background: "var(--paper-2)",
      borderRadius: 6,
      fontFamily: "var(--mono)",
      fontSize: 11.5,
      color: "var(--ink-2)"
    }
  }, "Rct (50% SoC) = 38 \u03A9", /*#__PURE__*/React.createElement("br", null), "vs. iter-6 baseline = 26 \u03A9", /*#__PURE__*/React.createElement("br", null), "\u0394 = +12 \u03A9 (+46%) ", /*#__PURE__*/React.createElement("span", {
    className: "citation"
  }, "[2]")), "On the short \u2014 yes. A cell that fails on cycle\xA04 with visible dendrite formation ", /*#__PURE__*/React.createElement("span", {
    className: "citation"
  }, "[3]"), " is exactly the trigger condition in the ", /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--serif)"
    }
  }, "battery_safety_risk_v1"), " workflow.", /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, "I drafted a flag note (below) and a candidate revision to ", /*#__PURE__*/React.createElement("strong", null, "Iter-7 \xB7 Week 22 notes"), ". Both are ", /*#__PURE__*/React.createElement("em", null, "candidates"), " \u2014 nothing has been written yet.")), /*#__PURE__*/React.createElement("div", {
    className: "tool-call",
    style: {
      background: "var(--ember-tint)",
      borderColor: "var(--ember-soft)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "tname"
  }, "flag_for_review"), /*#__PURE__*/React.createElement("span", {
    className: "targ"
  }, "("), /*#__PURE__*/React.createElement("span", {
    className: "targ"
  }, "reason"), /*#__PURE__*/React.createElement("span", {
    className: "targ"
  }, ": "), "\"cell-016 short, cycle 4\"", /*#__PURE__*/React.createElement("span", {
    className: "targ"
  }, ")")), /*#__PURE__*/React.createElement("div", {
    className: "tresult",
    style: {
      color: "var(--ember)"
    }
  }, "\u2310 awaiting approval \xB7 recipient: Dr. Tanaka (PI)"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginTop: 6,
      fontFamily: "var(--sans)"
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      padding: "3px 9px",
      borderRadius: 4,
      background: "var(--ink)",
      color: "var(--paper)",
      fontSize: 11
    }
  }, "Approve"), /*#__PURE__*/React.createElement("button", {
    style: {
      padding: "3px 9px",
      borderRadius: 4,
      background: "transparent",
      color: "var(--muted)",
      fontSize: 11,
      border: "1px solid var(--line)"
    }
  }, "Reject"), /*#__PURE__*/React.createElement("button", {
    style: {
      padding: "3px 9px",
      borderRadius: 4,
      background: "transparent",
      color: "var(--muted)",
      fontSize: 11
    }
  }, "Diff\u2026")))), /*#__PURE__*/React.createElement("div", {
    className: "msg ai"
  }, /*#__PURE__*/React.createElement("div", {
    className: "who"
  }, "citations"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "var(--muted)",
      fontFamily: "var(--mono)",
      lineHeight: 1.7
    }
  }, "[1]\xA0EX-211 \xB7 cycle log, May\xA022", /*#__PURE__*/React.createElement("br", null), "[2]\xA0EX-209 \xB7 impedance fit", /*#__PURE__*/React.createElement("br", null), "[3]\xA0PM-cell-014-cs \xB7 SEM cross-section"))), /*#__PURE__*/React.createElement("div", {
    className: "ai-input"
  }, /*#__PURE__*/React.createElement("div", {
    className: "box"
  }, /*#__PURE__*/React.createElement("textarea", {
    placeholder: "Ask, summarize, or draft a page\u2026",
    defaultValue: ""
  }), /*#__PURE__*/React.createElement("div", {
    className: "ai-controls"
  }, /*#__PURE__*/React.createElement("button", {
    className: "model"
  }, "claude-sonnet-4 \xB7 $0.31 spent today"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--muted-2)"
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("button", {
    title: "Attach"
  }, /*#__PURE__*/React.createElement(_Icon, {
    name: "paperclip",
    size: 12
  })), /*#__PURE__*/React.createElement("button", {
    title: "Browse tools"
  }, /*#__PURE__*/React.createElement(_Icon, {
    name: "atom",
    size: 12
  })), /*#__PURE__*/React.createElement("button", {
    className: "send"
  }, /*#__PURE__*/React.createElement(_Icon, {
    name: "send",
    size: 11
  }), " Send"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: "var(--muted-2)",
      marginTop: 6,
      fontFamily: "var(--mono)"
    }
  }, "Autonomy: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--ink-2)"
    }
  }, "suggest_writes"), " \xB7 3 tools enabled \xB7 workspace cap $200/mo (24%)")));
}
window.AIPanel = AIPanel;
})();

/* === risk.jsx === */
(function(){
// risk.jsx — Risk register (table-form), used on Project Overview and Iteration cards

const {
  Icon: RI
} = window;
function likelihoodPill(lvl) {
  // lvl: "high" | "medium" | "low"
  const label = lvl.toUpperCase();
  return /*#__PURE__*/React.createElement("span", {
    className: "like-pill like-" + lvl
  }, label);
}
function RiskAssessment({
  id,
  scope = "project",
  compact = false
}) {
  const r = LAB.RISK[id];

  // Not yet run
  if (!r || !r.items || r.items.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      className: "risk-card risk-empty"
    }, /*#__PURE__*/React.createElement("div", {
      className: "risk-empty-head"
    }, /*#__PURE__*/React.createElement("span", {
      className: "risk-glyph"
    }, "\u2317"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "risk-empty-title"
    }, "Risk register \u2014 not yet generated"), /*#__PURE__*/React.createElement("div", {
      className: "risk-empty-sub"
    }, scope === "iteration" ? "Runs automatically when the iteration enters active status, or manually below. Drafts a structured table of risks, their likelihood, impact, and Plan B." : "No risk profile on file. Run the workflow to baseline it — drafts a structured table of risks, their likelihood, impact, and Plan B.")), /*#__PURE__*/React.createElement("button", {
      className: "risk-run"
    }, /*#__PURE__*/React.createElement("span", {
      className: "ai-orb",
      style: {
        width: 12,
        height: 12
      }
    }), "Run workflow")));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "risk-card" + (r.candidate ? " risk-candidate" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "risk-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "risk-head-l"
  }, /*#__PURE__*/React.createElement("span", {
    className: "risk-glyph"
  }, "\u2317"), /*#__PURE__*/React.createElement("span", {
    className: "risk-title"
  }, "Risk register")), /*#__PURE__*/React.createElement("div", {
    className: "risk-head-r"
  }, /*#__PURE__*/React.createElement("span", {
    className: "risk-workflow"
  }, r.workflow), r.flaggedForPI && /*#__PURE__*/React.createElement("span", {
    className: "risk-flag",
    title: r.flagReason || "Flagged for PI review"
  }, /*#__PURE__*/React.createElement(RI, {
    name: "flag",
    size: 10
  }), " PI review"), r.candidate && /*#__PURE__*/React.createElement("span", {
    className: "risk-candidate-pill"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ai-orb",
    style: {
      width: 10,
      height: 10
    }
  }), "AI draft \xB7 awaiting approval"), /*#__PURE__*/React.createElement("span", {
    className: "risk-stamp"
  }, r.runAt))), /*#__PURE__*/React.createElement("table", {
    className: "risk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "rt-col-num"
  }, "#"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-risk"
  }, "Risk"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-like"
  }, "Likelihood"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-impact"
  }, "Impact if it hits"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-mit"
  }, "Mitigation / Plan B"))), /*#__PURE__*/React.createElement("tbody", null, r.items.map((it, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", {
    className: "rt-col-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rt-num"
  }, i + 1)), /*#__PURE__*/React.createElement("td", {
    className: "rt-col-risk"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-title"
  }, it.risk.title), /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-desc"
  }, it.risk.description)), /*#__PURE__*/React.createElement("td", {
    className: "rt-col-like"
  }, likelihoodPill(it.likelihood)), /*#__PURE__*/React.createElement("td", {
    className: "rt-col-impact"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-head rt-impact-" + (it.impact.tone || "warn")
  }, it.impact.headline), /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-desc"
  }, it.impact.description)), /*#__PURE__*/React.createElement("td", {
    className: "rt-col-mit"
  }, it.mitigation))))), /*#__PURE__*/React.createElement("div", {
    className: "risk-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "risk-foot-summary"
  }, /*#__PURE__*/React.createElement("span", {
    className: "risk-foot-glyph"
  }, '"'), r.summary), /*#__PURE__*/React.createElement("div", {
    className: "risk-foot-actions"
  }, /*#__PURE__*/React.createElement("span", {
    className: "risk-foot-by"
  }, r.runBy), /*#__PURE__*/React.createElement("button", {
    className: "risk-link"
  }, "View full report \u2192"), /*#__PURE__*/React.createElement("button", {
    className: "risk-rerun",
    title: "Re-run assessment"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ai-orb",
    style: {
      width: 10,
      height: 10
    }
  }), " Re-run"))));
}
window.RiskAssessment = RiskAssessment;
})();

/* === project-overview.jsx === */
(function(){
// project-overview.jsx — hero screen with 3 layout variants

const {
  Avatar: Av,
  Icon: I
} = window;
function statusPill(s) {
  return /*#__PURE__*/React.createElement("span", {
    className: "pill s-" + s
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot-s " + s
  }), s);
}
function kindPill(k) {
  return /*#__PURE__*/React.createElement("span", {
    className: "pill k-" + k
  }, k);
}
function SampleRecord({
  s,
  compact
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "rec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "id"
  }, s.id), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto"
    }
  }, kindPill(s.kind))), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, s.name), /*#__PURE__*/React.createElement("div", {
    className: "props"
  }, s.chem && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "chem"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.chem)), s.mass && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "m"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.mass)), s.cap && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Q"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.cap)), s.load && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "load"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.load)), s.v && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "V\u2191"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.v))), /*#__PURE__*/React.createElement("div", {
    className: "foot"
  }, statusPill(s.status), s.parent && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted-2)"
    }
  }, "\u2190 ", s.parent)));
}
function ExperimentRecord({
  e
}) {
  const ppl = LAB.PEOPLE[e.by];
  return /*#__PURE__*/React.createElement("div", {
    className: "rec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "id"
  }, e.id), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto"
    },
    className: "pill"
  }, e.method)), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, e.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--muted)",
      lineHeight: 1.4,
      textWrap: "pretty"
    }
  }, e.summary), /*#__PURE__*/React.createElement("div", {
    className: "foot"
  }, statusPill(e.status === "in_progress" ? "active" : e.status === "completed" ? "done" : e.status), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11
    }
  }, e.samples.length, " sample", e.samples.length > 1 ? "s" : ""), /*#__PURE__*/React.createElement("span", {
    className: "right",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Av, {
    id: e.by,
    size: 16
  }), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted)"
    }
  }, e.at))));
}
function IterRow({
  it
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "iter-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "num"
  }, "Iter-", it.num), /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, it.name, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, it.samples, " samples \xB7 ", it.experiments, " experiments \xB7 ", LAB.PEOPLE[it.owner].name)), /*#__PURE__*/React.createElement("div", {
    className: "dates"
  }, it.start, " \u2192 ", it.end), /*#__PURE__*/React.createElement("div", {
    className: "right"
  }, statusPill(it.status)));
}
function ProjectHead({
  p,
  variant,
  setVariant
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "proj-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "proj-emblem"
  }, p.emblem), /*#__PURE__*/React.createElement("div", {
    className: "proj-main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "proj-title"
  }, p.name), /*#__PURE__*/React.createElement("div", {
    className: "proj-meta"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(I, {
    name: "globe",
    size: 11
  }), " Workspace \xB7 all members can read"), /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Leads", /*#__PURE__*/React.createElement("span", {
    className: "avatars"
  }, /*#__PURE__*/React.createElement("span", {
    className: "a",
    style: {
      background: LAB.PEOPLE.MT.color
    }
  }, "MT"), /*#__PURE__*/React.createElement("span", {
    className: "a",
    style: {
      background: LAB.PEOPLE.JR.color
    }
  }, "JR"))), /*#__PURE__*/React.createElement("span", null, "updated 14 min ago \xB7 Jules"))), /*#__PURE__*/React.createElement("div", {
    className: "proj-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "var-picker"
  }, [{
    id: "editorial",
    l: "Editorial"
  }, {
    id: "dashboard",
    l: "Dashboard"
  }, {
    id: "stream",
    l: "Stream"
  }].map(o => /*#__PURE__*/React.createElement("button", {
    key: o.id,
    onClick: () => setVariant(o.id),
    className: variant === o.id ? "on" : ""
  }, o.l))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 10.5,
      color: "var(--muted-2)"
    }
  }, "Overview layout \xB7 tweakable")));
}

// ──────────────────────────────────────────────────────
// Variant A — EDITORIAL (page-like, vertical narrative)
// ──────────────────────────────────────────────────────
function OverviewEditorial({
  p
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "summary-prose"
  }, /*#__PURE__*/React.createElement("p", null, p.tagline, " Iteration\xA07 ships three coin cells from batch\xA07B at a 4.30\xA0V upper cutoff, instrumented against the iter-6 4.20\xA0V baseline. The hypothesis is that the marginal capacity gain at the high cutoff is offset by accelerated impedance growth at the cathode/electrolyte interface."), /*#__PURE__*/React.createElement("p", null, "Lead questions for this iteration: ", /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--serif)",
      color: "var(--ink)"
    }
  }, "Does the +12\xA0\u03A9 Rct shift observed on cell-014 generalize? Is the cell-016 short a manufacturing defect or chemistry-related?"))), /*#__PURE__*/React.createElement(window.RiskAssessment, {
    id: p.id,
    scope: "project"
  }), /*#__PURE__*/React.createElement("div", {
    className: "section-h"
  }, /*#__PURE__*/React.createElement("h2", null, "Iterations"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "10 total \xB7 1 active \xB7 5 done \xB7 2 planned"), /*#__PURE__*/React.createElement("span", {
    className: "right"
  }, /*#__PURE__*/React.createElement("a", null, "View all \u2192"))), /*#__PURE__*/React.createElement("div", {
    className: "iter-list"
  }, LAB.ITERATIONS.slice(0, 5).map(it => /*#__PURE__*/React.createElement(IterRow, {
    key: it.id,
    it: it
  }))), /*#__PURE__*/React.createElement("div", {
    className: "section-h"
  }, /*#__PURE__*/React.createElement("h2", null, "Recent samples"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, p.samples, " total \xB7 28 active \xB7 4 consumed \xB7 2 failed"), /*#__PURE__*/React.createElement("span", {
    className: "right"
  }, /*#__PURE__*/React.createElement("a", null, "All samples \u2192"))), /*#__PURE__*/React.createElement("div", {
    className: "records"
  }, LAB.SAMPLES.slice(0, 4).map(s => /*#__PURE__*/React.createElement(SampleRecord, {
    key: s.id,
    s: s
  }))), /*#__PURE__*/React.createElement("div", {
    className: "section-h"
  }, /*#__PURE__*/React.createElement("h2", null, "Recent experiments"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, p.experiments, " total \xB7 1 in progress"), /*#__PURE__*/React.createElement("span", {
    className: "right"
  }, /*#__PURE__*/React.createElement("a", null, "All experiments \u2192"))), /*#__PURE__*/React.createElement("div", {
    className: "records"
  }, LAB.EXPERIMENTS.slice(0, 4).map(e => /*#__PURE__*/React.createElement(ExperimentRecord, {
    key: e.id,
    e: e
  }))));
}

// ──────────────────────────────────────────────────────
// Variant B — DASHBOARD (12-col dense grid)
// ──────────────────────────────────────────────────────
function MiniSpark({
  values,
  highlight
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "spark-row"
  }, values.map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "b" + (i === highlight ? " on" : ""),
    style: {
      height: v + "%"
    }
  })));
}
function CycleChart() {
  // fake cycling capacity retention plot
  const pts = [];
  const N = 24;
  for (let i = 0; i < N; i++) {
    const x = 30 + i / (N - 1) * 340;
    const y = 30 + (1 - (1 - i * 0.004)) * 8 + i * 0.6 + Math.sin(i * .4) * 1.5;
    pts.push([x, 30 + i * 1.1 + Math.sin(i * .5) * 2]);
  }
  const path1 = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + " " + p[1]).join(" ");
  const path2 = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + " " + (p[1] + 8 + Math.sin(i * .3) * 2)).join(" ");
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 400 150",
    style: {
      width: "100%",
      height: 150
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("pattern", {
    id: "grid",
    width: "40",
    height: "20",
    patternUnits: "userSpaceOnUse"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 40 0 L 0 0 0 20",
    fill: "none",
    style: {
      stroke: "var(--paper-3)"
    },
    strokeWidth: "1"
  }))), /*#__PURE__*/React.createElement("rect", {
    x: "20",
    y: "10",
    width: "370",
    height: "120",
    fill: "url(#grid)"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "130",
    x2: "390",
    y2: "130",
    style: {
      stroke: "var(--line-2)"
    },
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "10",
    x2: "20",
    y2: "130",
    style: {
      stroke: "var(--line-2)"
    },
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: path1,
    fill: "none",
    style: {
      stroke: "var(--ember)"
    },
    strokeWidth: "1.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: path2,
    fill: "none",
    style: {
      stroke: "var(--muted)"
    },
    strokeWidth: "1.2",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("text", {
    x: "26",
    y: "22",
    fontFamily: "JetBrains Mono",
    fontSize: "9",
    style: {
      fill: "var(--muted-2)"
    }
  }, "200 mAh/g"), /*#__PURE__*/React.createElement("text", {
    x: "26",
    y: "128",
    fontFamily: "JetBrains Mono",
    fontSize: "9",
    style: {
      fill: "var(--muted-2)"
    }
  }, "150 mAh/g"), /*#__PURE__*/React.createElement("text", {
    x: "356",
    y: "143",
    fontFamily: "JetBrains Mono",
    fontSize: "9",
    style: {
      fill: "var(--muted-2)"
    }
  }, "cycle 24"), /*#__PURE__*/React.createElement("text", {
    x: "200",
    y: "58",
    fontFamily: "JetBrains Mono",
    fontSize: "10",
    style: {
      fill: "var(--ember)"
    }
  }, "iter-7 \xB7 4.30V"), /*#__PURE__*/React.createElement("text", {
    x: "200",
    y: "120",
    fontFamily: "JetBrains Mono",
    fontSize: "10",
    style: {
      fill: "var(--muted)"
    }
  }, "iter-6 \xB7 4.20V (baseline)"));
}
function OverviewDashboard({
  p
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(window.RiskAssessment, {
    id: p.id,
    scope: "project"
  }), /*#__PURE__*/React.createElement("div", {
    className: "dash",
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel c-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "Active iteration"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "07 ", /*#__PURE__*/React.createElement("small", null, "/ 10")), /*#__PURE__*/React.createElement("div", {
    className: "d"
  }, "Day 5 of 25 \xB7 ends Jun 12"))), /*#__PURE__*/React.createElement("div", {
    className: "panel c-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "Cells cycling"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "2 ", /*#__PURE__*/React.createElement("small", null, "of 3")), /*#__PURE__*/React.createElement("div", {
    className: "d down"
  }, "1 failure \xB7 cell-016")), /*#__PURE__*/React.createElement(MiniSpark, {
    values: [40, 60, 80, 55, 75, 90, 65],
    highlight: 6
  })), /*#__PURE__*/React.createElement("div", {
    className: "panel c-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "Mean Rct (50% SoC)"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "38", /*#__PURE__*/React.createElement("small", null, "\u03A9")), /*#__PURE__*/React.createElement("div", {
    className: "d down"
  }, "+12 \u03A9 vs iter-6"))), /*#__PURE__*/React.createElement("div", {
    className: "panel c-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "AI spend, this month"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "$48 ", /*#__PURE__*/React.createElement("small", null, "/ $200")), /*#__PURE__*/React.createElement("div", {
    className: "d"
  }, "24% of cap \xB7 14 days remaining"))), /*#__PURE__*/React.createElement("div", {
    className: "panel c-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph"
  }, /*#__PURE__*/React.createElement("h3", null, "Capacity retention \u2014 iter-7 vs iter-6"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "C/3 \xB7 3 cells avg")), /*#__PURE__*/React.createElement(CycleChart, null)), /*#__PURE__*/React.createElement("div", {
    className: "panel c-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph"
  }, /*#__PURE__*/React.createElement("h3", null, "Activity"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "last 48 h")), /*#__PURE__*/React.createElement("div", {
    className: "feed"
  }, /*#__PURE__*/React.createElement("div", {
    className: "feed-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, "e"), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Jules"), " finished EX-209 \xB7 EIS at 50% SoC on cell-014"), /*#__PURE__*/React.createElement("div", {
    className: "ts"
  }, "2h")), /*#__PURE__*/React.createElement("div", {
    className: "feed-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, "s"), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Jules"), " updated NMC-7B-cell-016 \u2192 ", /*#__PURE__*/React.createElement("em", null, "failed")), /*#__PURE__*/React.createElement("div", {
    className: "ts"
  }, "4h")), /*#__PURE__*/React.createElement("div", {
    className: "feed-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, "p"), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Mei"), " commented on Iter-7 \xB7 Week 22 notes"), /*#__PURE__*/React.createElement("div", {
    className: "ts"
  }, "5h")), /*#__PURE__*/React.createElement("div", {
    className: "feed-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, "a"), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Sam"), " attached ", /*#__PURE__*/React.createElement("em", null, "SEM_cross_cell014_10kx.png")), /*#__PURE__*/React.createElement("div", {
    className: "ts"
  }, "y")), /*#__PURE__*/React.createElement("div", {
    className: "feed-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, "\u27C1"), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Assistant"), " flagged cell-016 for PI review"), /*#__PURE__*/React.createElement("div", {
    className: "ts"
  }, "y")), /*#__PURE__*/React.createElement("div", {
    className: "feed-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, "e"), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Karim"), " opened EX-200 \xB7 XRD baseline"), /*#__PURE__*/React.createElement("div", {
    className: "ts"
  }, "2d")))), /*#__PURE__*/React.createElement("div", {
    className: "panel c-12"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph"
  }, /*#__PURE__*/React.createElement("h3", null, "Iteration timeline"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "5 of 10 visible")), /*#__PURE__*/React.createElement("div", {
    className: "gantt"
  }, /*#__PURE__*/React.createElement("div", {
    className: "axis"
  }, /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", null, "Mar"), /*#__PURE__*/React.createElement("span", null, "Apr"), /*#__PURE__*/React.createElement("span", null, "May"), /*#__PURE__*/React.createElement("span", null, "Jun"), /*#__PURE__*/React.createElement("span", null, "Jul"), /*#__PURE__*/React.createElement("span", null, "Aug"), /*#__PURE__*/React.createElement("span", null, "Sep"), /*#__PURE__*/React.createElement("span", null, "Oct")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Iter-4 \xB7 Coater calib"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar done",
    style: {
      left: "0%",
      width: "10%"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Iter-5 \xB7 LPSCl drying"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar done",
    style: {
      left: "10%",
      width: "12%"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Iter-6 \xB7 4.20V baseline"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar done",
    style: {
      left: "22%",
      width: "14%"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Iter-7 \xB7 4.30V cycling"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar active",
    style: {
      left: "36%",
      width: "15%"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "marker",
    style: {
      left: "40%"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Iter-8 \xB7 Binder compare"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar planned",
    style: {
      left: "51%",
      width: "13%"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Iter-9 \xB7 Pouch scale-up"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar planned",
    style: {
      left: "64%",
      width: "14%"
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "panel c-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph"
  }, /*#__PURE__*/React.createElement("h3", null, "Sample roster"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, p.samples, " total")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5,1fr)",
      gap: 8,
      marginBottom: 10
    }
  }, [{
    k: "precursor",
    n: 6
  }, {
    k: "electrode",
    n: 8
  }, {
    k: "cell",
    n: 14
  }, {
    k: "derivative",
    n: 4
  }, {
    k: "module",
    n: 2
  }].map(x => /*#__PURE__*/React.createElement("div", {
    key: x.k,
    style: {
      padding: "8px 10px",
      border: "1px solid var(--line)",
      borderRadius: 6,
      background: "var(--paper)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 10,
      color: "var(--muted-2)",
      textTransform: "uppercase",
      letterSpacing: ".05em"
    }
  }, x.k), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: 22,
      letterSpacing: "-.01em"
    }
  }, x.n)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, LAB.SAMPLES.slice(0, 3).map(s => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    className: "row",
    style: {
      justifyContent: "space-between",
      fontSize: 12.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "row",
    style: {
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--ember)"
    }
  }, s.id), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--muted)"
    }
  }, s.chem)), statusPill(s.status))))), /*#__PURE__*/React.createElement("div", {
    className: "panel c-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph"
  }, /*#__PURE__*/React.createElement("h3", null, "Experiments by method"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, p.experiments, " total")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, [{
    m: "cycling",
    n: 18,
    c: 18
  }, {
    m: "EIS",
    n: 12,
    c: 12
  }, {
    m: "SEM",
    n: 9,
    c: 9
  }, {
    m: "XRD",
    n: 7,
    c: 7
  }, {
    m: "synthesis",
    n: 6,
    c: 6
  }, {
    m: "drying",
    n: 4,
    c: 4
  }].map(x => /*#__PURE__*/React.createElement("div", {
    key: x.m,
    style: {
      padding: "8px 12px",
      border: "1px solid var(--line)",
      borderRadius: 6,
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--ink-2)"
    }
  }, x.m), /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      height: 4,
      background: "var(--paper-2)",
      borderRadius: 2,
      marginTop: 6,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: x.n / 18 * 100 + "%",
      background: "var(--ember)"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: 20,
      color: "var(--ink)",
      lineHeight: 1
    }
  }, x.n)))))));
}

// ──────────────────────────────────────────────────────
// Variant C — STREAM (current iteration hero + past timeline)
// ──────────────────────────────────────────────────────
function OverviewStream({
  p
}) {
  const cur = LAB.ITERATIONS.find(i => i.status === "active");
  const past = LAB.ITERATIONS.filter(i => i.status === "done").sort((a, b) => b.num - a.num);
  const planned = LAB.ITERATIONS.filter(i => i.status === "planned").sort((a, b) => a.num - b.num);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(window.RiskAssessment, {
    id: p.id,
    scope: "project"
  }), /*#__PURE__*/React.createElement("div", {
    className: "stream"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "stream-side"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 10,
      color: "var(--muted-2)",
      textTransform: "uppercase",
      letterSpacing: ".06em",
      marginBottom: 8,
      paddingLeft: 6
    }
  }, "Iteration history"), planned.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.id,
    className: "si"
  }, /*#__PURE__*/React.createElement("div", null, "Iter-", it.num, " \xB7 ", it.name.split(" — ")[0]), /*#__PURE__*/React.createElement("div", {
    className: "d"
  }, it.start, " \xB7 planned"))), /*#__PURE__*/React.createElement("div", {
    className: "si cur"
  }, /*#__PURE__*/React.createElement("div", null, "Iter-", cur.num, " \xB7 current"), /*#__PURE__*/React.createElement("div", {
    className: "d"
  }, cur.start, " \u2192 ", cur.end)), past.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.id,
    className: "si"
  }, /*#__PURE__*/React.createElement("div", null, "Iter-", it.num, " \xB7 ", it.name.split(" — ")[0]), /*#__PURE__*/React.createElement("div", {
    className: "d"
  }, it.start, " \u2192 ", it.end)))), /*#__PURE__*/React.createElement("div", {
    className: "stream-main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cur-iter"
  }, /*#__PURE__*/React.createElement("div", {
    className: "num"
  }, "\u25B8 Current iteration \xB7 Day 5 of 25"), /*#__PURE__*/React.createElement("h2", null, cur.name), /*#__PURE__*/React.createElement("div", {
    className: "iter-meta"
  }, /*#__PURE__*/React.createElement("span", null, cur.start, " \u2192 ", cur.end), /*#__PURE__*/React.createElement("span", null, "\xB7"), /*#__PURE__*/React.createElement("span", null, "Lead: ", LAB.PEOPLE[cur.owner].name), /*#__PURE__*/React.createElement("span", null, "\xB7"), /*#__PURE__*/React.createElement("span", null, cur.samples, " samples \xB7 ", cur.experiments, " experiments"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto"
    }
  }, statusPill(cur.status))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 14px",
      color: "var(--ink-2)",
      fontSize: 14,
      lineHeight: 1.6,
      maxWidth: 620
    }
  }, cur.desc), /*#__PURE__*/React.createElement("div", {
    className: "iter-cols"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "Samples in this iteration"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, LAB.SAMPLES.slice(0, 3).map(s => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    className: "row",
    style: {
      justifyContent: "space-between",
      padding: "7px 9px",
      border: "1px solid var(--line)",
      borderRadius: 6,
      background: "var(--paper)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--ember)"
    }
  }, s.id), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--ink-2)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: 240
    }
  }, s.name)), statusPill(s.status))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "In-flight experiments"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, LAB.EXPERIMENTS.slice(0, 3).map(e => /*#__PURE__*/React.createElement("div", {
    key: e.id,
    className: "row",
    style: {
      padding: "7px 9px",
      border: "1px solid var(--line)",
      borderRadius: 6,
      background: "var(--paper)",
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill",
    style: {
      fontSize: 10
    }
  }, e.method), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted)"
    }
  }, e.id), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--ink-2)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, e.title))))))), /*#__PURE__*/React.createElement(window.RiskAssessment, {
    id: cur.id,
    scope: "iteration"
  })), /*#__PURE__*/React.createElement("div", {
    className: "section-h",
    style: {
      marginTop: 30
    }
  }, /*#__PURE__*/React.createElement("h2", null, "Past iterations"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "5 completed \xB7 expand for full history")), past.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.id,
    className: "past-iter"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pnum"
  }, "Iter-", it.num, /*#__PURE__*/React.createElement("span", {
    className: "d"
  }, it.start, " \u2192 ", it.end)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, it.name), /*#__PURE__*/React.createElement("p", null, it.desc), /*#__PURE__*/React.createElement("div", {
    className: "pmini"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill"
  }, it.samples, " samples"), /*#__PURE__*/React.createElement("span", {
    className: "pill"
  }, it.experiments, " experiments"), /*#__PURE__*/React.createElement("span", {
    className: "pill"
  }, "lead \xB7 ", LAB.PEOPLE[it.owner].name))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, statusPill(it.status)))))));
}

// ──────────────────────────────────────────────────────
// Wrapper
// ──────────────────────────────────────────────────────
function ProjectOverview({
  project,
  variant,
  setVariant
}) {
  const v = variant || "editorial";
  return /*#__PURE__*/React.createElement("div", {
    className: "page-wrap" + (v === "dashboard" ? " wide" : "")
  }, /*#__PURE__*/React.createElement(ProjectHead, {
    p: project,
    variant: v,
    setVariant: setVariant
  }), v === "editorial" && /*#__PURE__*/React.createElement(OverviewEditorial, {
    p: project
  }), v === "dashboard" && /*#__PURE__*/React.createElement(OverviewDashboard, {
    p: project
  }), v === "stream" && /*#__PURE__*/React.createElement(OverviewStream, {
    p: project
  }));
}
window.ProjectOverview = ProjectOverview;
})();

/* === page-editor.jsx === */
(function(){
// page-editor.jsx — entity pages with inline artifact embeds
// Renders pages for iterations, samples, experiments, and meetings.

const {
  Avatar: AvE,
  Icon: IE,
  LAB: LE
} = window;

/* ── Helpers ── */

function statusPillX(s) {
  return /*#__PURE__*/React.createElement("span", {
    className: "pill s-" + s
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot-s " + s
  }), s);
}
function RefInline({
  kind,
  id,
  label,
  glyph
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "ref-inline " + kind
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, glyph), /*#__PURE__*/React.createElement("span", null, label || id));
}

/* ── Reference + embed components ── */

function SampleCard({
  id
}) {
  const s = LE.SAMPLE_BY_ID[id];
  if (!s) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "ref-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "leftcol"
  }, /*#__PURE__*/React.createElement("span", {
    className: "row",
    style: {
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "s"), /*#__PURE__*/React.createElement("span", {
    className: "rtype"
  }, "sample \xB7 ", s.kind)), /*#__PURE__*/React.createElement("span", {
    className: "rid"
  }, s.id), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 6
    },
    className: "pill s-" + s.status
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot-s " + s.status
  }), s.status)), /*#__PURE__*/React.createElement("div", {
    className: "rbody"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rname"
  }, s.name), /*#__PURE__*/React.createElement("div", {
    className: "rprops"
  }, s.chem && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "chem"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.chem)), s.mass && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "mass"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.mass)), s.cap && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "capacity"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.cap)), s.load && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "loading"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.load)), s.v && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "V cutoff"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.v))), /*#__PURE__*/React.createElement("div", {
    className: "rfoot"
  }, s.parent && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11
    }
  }, "derived from ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ember)"
    }
  }, s.parent)), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto"
    }
  }, /*#__PURE__*/React.createElement("a", {
    style: {
      color: "var(--muted)",
      fontSize: 11
    }
  }, "Open sample \u2192")))));
}
function ExpCard({
  id
}) {
  const e = LE.EXP_BY_ID[id];
  if (!e) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "ref-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "leftcol"
  }, /*#__PURE__*/React.createElement("span", {
    className: "row",
    style: {
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "e"), /*#__PURE__*/React.createElement("span", {
    className: "rtype"
  }, "experiment \xB7 ", e.method)), /*#__PURE__*/React.createElement("span", {
    className: "rid"
  }, e.id), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 6
    },
    className: "pill"
  }, e.status.replace("_", " "))), /*#__PURE__*/React.createElement("div", {
    className: "rbody"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rname"
  }, e.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink-2)",
      lineHeight: 1.5,
      textWrap: "pretty"
    }
  }, e.summary), /*#__PURE__*/React.createElement("div", {
    className: "rfoot"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11
    }
  }, "samples: ", e.samples.join(", ")), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(AvE, {
    id: e.by,
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted)"
    }
  }, e.at)))));
}

/* Inline artifact embeds */

function ArtImage({
  id,
  caption,
  kind = "sem"
}) {
  const a = LE.ART_BY_ID[id];
  if (!a) return null;
  return /*#__PURE__*/React.createElement("figure", {
    className: "embed-img"
  }, /*#__PURE__*/React.createElement("div", {
    className: "img-frame" + (kind === "photo" ? " full" : ""),
    style: {
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
        `
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "badge-magn"
  }, kind === "sem" ? "25 kX · SE" : "Glovebox · Apr 18"), kind === "sem" && /*#__PURE__*/React.createElement("div", {
    className: "scalebar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar"
  }), /*#__PURE__*/React.createElement("div", null, "10 \xB5m"))), /*#__PURE__*/React.createElement("figcaption", {
    className: "caption"
  }, /*#__PURE__*/React.createElement("span", {
    className: "title"
  }, caption || a.name), /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, a.name, " \xB7 uploaded by ", LE.PEOPLE[a.by].name.split(" ")[0], " \xB7 ", a.at)));
}
function ArtPDF({
  id,
  summary
}) {
  const a = LE.ART_BY_ID[id];
  if (!a) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "embed-pdf"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pdf-thumb"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pdf-tag"
  }, "PDF"), /*#__PURE__*/React.createElement("div", {
    className: "doc-h"
  }), /*#__PURE__*/React.createElement("div", {
    className: "doc-bar",
    style: {
      width: "96%"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "doc-bar",
    style: {
      width: "100%"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "doc-bar",
    style: {
      width: "88%"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "doc-bar",
    style: {
      width: "94%"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "doc-bar",
    style: {
      width: "72%"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "doc-spark"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pdf-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pdf-name"
  }, a.name), /*#__PURE__*/React.createElement("div", {
    className: "pdf-meta"
  }, a.size, " \xB7 ", LE.PEOPLE[a.by].name.split(" ")[0], " \xB7 ", a.at), summary && /*#__PURE__*/React.createElement("div", {
    className: "pdf-summary"
  }, summary), /*#__PURE__*/React.createElement("div", {
    className: "pdf-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pdf-btn"
  }, "Open in viewer \u2192"), /*#__PURE__*/React.createElement("button", {
    className: "pdf-btn"
  }, "Download"))));
}
function ArtNotebook({
  id,
  cells
}) {
  const a = LE.ART_BY_ID[id];
  if (!a) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "embed-nb"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nb-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nb-tag"
  }, "IPYNB"), /*#__PURE__*/React.createElement("span", {
    className: "nb-name"
  }, a.name), /*#__PURE__*/React.createElement("span", {
    className: "nb-meta"
  }, LE.PEOPLE[a.by].name.split(" ")[0], " \xB7 ", a.at)), /*#__PURE__*/React.createElement("div", {
    className: "nb-cells"
  }, (cells || []).map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "nb-cell"
  }, c.type === "md" && /*#__PURE__*/React.createElement("div", {
    className: "nb-md",
    dangerouslySetInnerHTML: {
      __html: c.md
    }
  }), c.type === "code" && /*#__PURE__*/React.createElement("div", {
    className: "nb-code",
    dangerouslySetInnerHTML: {
      __html: c.code
    }
  }), c.type === "output" && /*#__PURE__*/React.createElement("div", {
    className: "nb-out"
  }, c.out), c.type === "plot" && /*#__PURE__*/React.createElement("div", {
    className: "nb-plot"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 600 200",
    preserveAspectRatio: "none",
    style: {
      width: "100%",
      height: "100%"
    }
  }, /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "180",
    x2: "580",
    y2: "180",
    style: {
      stroke: "var(--line-2)"
    },
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "10",
    x2: "20",
    y2: "180",
    style: {
      stroke: "var(--line-2)"
    },
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M30 60 L100 70 L200 82 L300 90 L400 96 L500 100 L570 102",
    fill: "none",
    style: {
      stroke: "var(--muted)"
    },
    strokeWidth: "1.3",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M30 50 L100 56 L200 70 L300 88 L400 110 L500 132 L570 152",
    fill: "none",
    style: {
      stroke: "var(--ember)"
    },
    strokeWidth: "1.8"
  }), /*#__PURE__*/React.createElement("text", {
    x: "540",
    y: "42",
    fontFamily: "JetBrains Mono",
    fontSize: "9",
    style: {
      fill: "var(--ember)"
    }
  }, "iter-7"), /*#__PURE__*/React.createElement("text", {
    x: "540",
    y: "118",
    fontFamily: "JetBrains Mono",
    fontSize: "9",
    style: {
      fill: "var(--muted)"
    }
  }, "iter-6 baseline"), /*#__PURE__*/React.createElement("text", {
    x: "25",
    y: "20",
    fontFamily: "JetBrains Mono",
    fontSize: "9",
    style: {
      fill: "var(--muted-2)"
    }
  }, "200 mAh/g"), /*#__PURE__*/React.createElement("text", {
    x: "25",
    y: "195",
    fontFamily: "JetBrains Mono",
    fontSize: "9",
    style: {
      fill: "var(--muted-2)"
    }
  }, "150 mAh/g \xB7 cycle"), /*#__PURE__*/React.createElement("text", {
    x: "560",
    y: "195",
    fontFamily: "JetBrains Mono",
    fontSize: "9",
    style: {
      fill: "var(--muted-2)"
    }
  }, "30")))))));
}

/* ── Page chrome (shared) ── */

function PageChrome({
  overline,
  title,
  breadcrumb,
  presence,
  savedRev,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "doc"
  }, /*#__PURE__*/React.createElement("div", {
    className: "doc-presence"
  }, presence && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "here"
  }, presence.map(p => /*#__PURE__*/React.createElement(AvE, {
    key: p,
    id: p,
    size: 20,
    ring: true
  }))), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, LE.PEOPLE[presence[0]]?.name.split(" ")[0] || "You"), presence.length > 1 ? " and " + (LE.PEOPLE[presence[1]]?.name.split(" ")[0] || "...") : "", " ", presence.length > 1 ? "are editing" : "is editing")), /*#__PURE__*/React.createElement("span", {
    className: "saved"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Saved \xB7 ", savedRev)), /*#__PURE__*/React.createElement("h1", {
    className: "dtitle"
  }, overline && /*#__PURE__*/React.createElement("em", {
    style: {
      fontStyle: "italic",
      color: "var(--muted)"
    }
  }, overline, " "), title), /*#__PURE__*/React.createElement("div", {
    className: "dmeta"
  }, breadcrumb), children);
}

/* ── Entity property strip ── */

function EntityProps({
  items
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "entity-props"
  }, items.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "ep-cell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ep-k"
  }, p.k), /*#__PURE__*/React.createElement("div", {
    className: "ep-v" + (p.serif ? " serif" : "")
  }, p.v))));
}

/* ──────────────────────────────────────────────────────
   ITERATION PAGE (the original Iter-7 page, plus rich content)
──────────────────────────────────────────────────────── */

function IterationPage({
  iteration,
  project
}) {
  const it = iteration || LE.ITERATIONS.find(i => i.status === "active");
  return /*#__PURE__*/React.createElement(PageChrome, {
    overline: "Iter-" + it.num + " ·",
    title: "Week 22 cycling notes",
    breadcrumb: `/ ${project?.name || "NMC811"} / Iterations / Iter-${it.num} / Pages / Week 22`,
    presence: ["JR", "MT"],
    savedRev: "rev #84 \xB7 ETag 7c4a\u2026"
  }, /*#__PURE__*/React.createElement("p", null, "Three coin cells from batch\xA07B started on the 4.30\xA0V cutoff schedule on May\xA018. As of cycle\xA022, two cells are tracking 188+\xA0mAh/g; one cell shorted on cycle\xA04."), /*#__PURE__*/React.createElement("h2", null, "Cells on test"), /*#__PURE__*/React.createElement(SampleCard, {
    id: "NMC-7B-cell-014"
  }), /*#__PURE__*/React.createElement(SampleCard, {
    id: "NMC-7B-cell-015"
  }), /*#__PURE__*/React.createElement(SampleCard, {
    id: "NMC-7B-cell-016"
  }), /*#__PURE__*/React.createElement("h2", null, "Cycling trace"), /*#__PURE__*/React.createElement("p", null, "Capacity-vs-cycle overlay for the two surviving channels against the iter-6 4.20 V baseline. Notebook updated each morning by the cycler service."), /*#__PURE__*/React.createElement(ArtNotebook, {
    id: "ar_12",
    cells: [{
      type: "md",
      md: "<em># Capacity overlay — iter-7 vs iter-6 baseline</em>"
    }, {
      type: "code",
      code: '<span class="k">import</span> pandas <span class="k">as</span> pd<br/><span class="k">from</span> halide <span class="k">import</span> cycling<br/>cells = cycling.load(<span class="s">"7B/iter7"</span>)<br/>baseline = cycling.load(<span class="s">"7A/iter6"</span>)<br/>fig = cycling.plot(cells, baseline, cutoff=<span class="s">"4.30V"</span>)'
    }, {
      type: "plot"
    }, {
      type: "output",
      out: "3 cells, 22 cycles · mean ΔQ = 188.4 mAh/g (σ 2.1)"
    }]
  }), /*#__PURE__*/React.createElement("h2", null, "Failure on cell-016"), /*#__PURE__*/React.createElement("p", null, /*#__PURE__*/React.createElement(RefInline, {
    kind: "sample",
    glyph: "s",
    id: "NMC-7B-cell-016"
  }), " shorted on cycle\xA04 during the C/3 step. Post-mortem cross-section confirmed visible lithium plating on the separator \u2014 see ", /*#__PURE__*/React.createElement(RefInline, {
    kind: "experiment",
    glyph: "e",
    id: "EX-205",
    label: "EX-205 \xB7 SEM"
  }), ". Root cause is most likely separator perforation during cell assembly, but the AI flagged the chemistry/cutoff combination as a contributing factor in ", /*#__PURE__*/React.createElement(RefInline, {
    kind: "artifact",
    glyph: "a",
    id: "ar_11",
    label: "Safety-review-iter6.pdf"
  }), "."), /*#__PURE__*/React.createElement(ArtImage, {
    id: "ar_04",
    caption: "Cross-section, 10 kX \u2014 dendrite on separator. Cell-016 post-mortem.",
    kind: "sem"
  }), /*#__PURE__*/React.createElement("div", {
    className: "callout"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ico"
  }, "\u26A0"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Flagged for PI review."), " Triggered by ", /*#__PURE__*/React.createElement("code", null, "overall_rating >= 4"), " in ", /*#__PURE__*/React.createElement("em", null, "battery_safety_risk_v1"), ". Dr. Tanaka was notified May\xA022 \xB7 14:08.")), /*#__PURE__*/React.createElement("h2", null, "Impedance shift"), /*#__PURE__*/React.createElement("p", null, "Baseline vs current iteration EIS comparison from ", /*#__PURE__*/React.createElement(RefInline, {
    kind: "experiment",
    glyph: "e",
    id: "EX-209"
  }), ". The +12\xA0\u03A9 Rct shift is consistent with cathode/electrolyte interface growth at the higher cutoff. Not yet enough cycles to attribute confidently."), /*#__PURE__*/React.createElement(ExpCard, {
    id: "EX-209"
  }), /*#__PURE__*/React.createElement(ArtPDF, {
    id: "ar_05",
    summary: "Nyquist plots and equivalent-circuit fits at SoC 50% for cell-014. Rct extracted via Voigt model."
  }), /*#__PURE__*/React.createElement("h3", null, "Open questions"), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, "Is the Rct trend monotonic with cycle count, or saturating?"), /*#__PURE__*/React.createElement("li", null, "Does the cell-016 short generalize to the rest of batch 7B, or was it isolated?"), /*#__PURE__*/React.createElement("li", null, "Hua Qin's group (Caltech) is seeing similar shift at 4.25 V \u2014 request raw cycling data.")), /*#__PURE__*/React.createElement("h2", null, "Next steps"), /*#__PURE__*/React.createElement("ol", null, /*#__PURE__*/React.createElement("li", null, "Re-build a replacement for cell-016 with a fresh separator from the validated lot."), /*#__PURE__*/React.createElement("li", null, "Run EIS sweep every 20 cycles on cell-014 / 015 to map Rct(cycle) curve."), /*#__PURE__*/React.createElement("li", null, "If shift saturates by cycle 50, recommend escalating cutoff to 4.35 V for iter-8 binder comparison.")), /*#__PURE__*/React.createElement("blockquote", null, "Watch for the dendrite morphology, not just the voltage curve. The 016 short is a tell.", /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 12.5,
      color: "var(--muted)",
      fontStyle: "normal",
      marginTop: 6
    }
  }, "\u2014 Mei, comment on cycle-4 SEM")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}

/* ──────────────────────────────────────────────────────
   SAMPLE PAGE
──────────────────────────────────────────────────────── */

function SamplePage({
  sample,
  project
}) {
  const s = sample;
  const linkedExp = LE.EXPERIMENTS.filter(e => e.samples.includes(s.id));
  return /*#__PURE__*/React.createElement(PageChrome, {
    overline: s.kind + " ·",
    title: s.name,
    breadcrumb: `/ ${project?.name || "NMC811"} / Samples / ${s.id}`,
    presence: ["JR"],
    savedRev: "rev #12"
  }, /*#__PURE__*/React.createElement(EntityProps, {
    items: [{
      k: "Identifier",
      v: s.id
    }, {
      k: "Chemistry",
      v: s.chem || "—"
    }, {
      k: "Mass",
      v: s.mass || "—"
    }, {
      k: "Capacity",
      v: s.cap || "—"
    }, {
      k: "Loading",
      v: s.load || "—"
    }, {
      k: "V cutoff",
      v: s.v || "—"
    }, {
      k: "Parent",
      v: s.parent || "—"
    }, {
      k: "Status",
      v: s.status,
      serif: false
    }]
  }), /*#__PURE__*/React.createElement("h2", null, "Description"), /*#__PURE__*/React.createElement("p", null, "Coin-cell built from cathode coating ", /*#__PURE__*/React.createElement(RefInline, {
    kind: "sample",
    glyph: "s",
    id: s.parent || "NMC-7B-cathode-r3"
  }), " on channel\xA0", s.id.slice(-3), " of the cycling rack. Part of iteration\xA07 at the 4.30\xA0V upper cutoff. The cell uses the validated LPSCl batch (", /*#__PURE__*/React.createElement(RefInline, {
    kind: "sample",
    glyph: "s",
    id: "LPSCl-batch-22"
  }), ") as the solid electrolyte separator."), /*#__PURE__*/React.createElement("h2", null, "Assembly photo"), /*#__PURE__*/React.createElement(ArtImage, {
    id: "ar_10",
    caption: "Coin-cell assembly, May 17 \u2014 pre-crimp inspection.",
    kind: "photo"
  }), /*#__PURE__*/React.createElement("h2", null, "Lineage"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px",
      border: "1px solid var(--line)",
      borderRadius: "var(--r-md)",
      background: "var(--surface)",
      fontFamily: "var(--mono)",
      fontSize: 12.5,
      color: "var(--ink-2)",
      lineHeight: 1.8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ember)"
    }
  }, "NMC811-pwd-04"), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--muted)"
    }
  }, "(precursor \xB7 calcined lot 04)")), /*#__PURE__*/React.createElement("div", null, "\xA0\xA0\u2193 ", /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--serif)",
      fontStyle: "italic",
      color: "var(--muted)"
    }
  }, "derived_from")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ember)"
    }
  }, "NMC-7B-cathode-r3"), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--muted)"
    }
  }, "(electrode \xB7 12.4 mg/cm\xB2)")), /*#__PURE__*/React.createElement("div", null, "\xA0\xA0\u2193 ", /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--serif)",
      fontStyle: "italic",
      color: "var(--muted)"
    }
  }, "assembled_into")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ember)"
    }
  }, s.id), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--muted)"
    }
  }, "(this sample \xB7 cell on test)"))), /*#__PURE__*/React.createElement("h2", null, "Linked experiments"), linkedExp.length > 0 ? linkedExp.map(e => /*#__PURE__*/React.createElement(ExpCard, {
    key: e.id,
    id: e.id
  })) : /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--muted)"
    }
  }, "No experiments yet."), /*#__PURE__*/React.createElement("h2", null, "Notes"), /*#__PURE__*/React.createElement("p", null, "Cell built within the validated batch-7B window. No assembly anomalies noted at crimp time. Cycling started May 18 \xB7 11:42 PT on channel ", s.id.slice(-3), "."), /*#__PURE__*/React.createElement("div", {
    className: "callout"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ico"
  }, "i"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Property auto-extraction."), " The AI parsed chemistry and capacity from the iter-7 notes and the cycling protocol PDF. Spec \xA710 flags this as a v1 weakness \u2014 review the chemistry field if you spot a mismatch.")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}

/* ──────────────────────────────────────────────────────
   EXPERIMENT PAGE
──────────────────────────────────────────────────────── */

function ExperimentPage({
  experiment,
  project
}) {
  const e = experiment;
  return /*#__PURE__*/React.createElement(PageChrome, {
    overline: e.method.toUpperCase() + " ·",
    title: e.title,
    breadcrumb: `/ ${project?.name || "NMC811"} / Experiments / ${e.id}`,
    presence: [e.by],
    savedRev: "rev #5"
  }, /*#__PURE__*/React.createElement(EntityProps, {
    items: [{
      k: "Identifier",
      v: e.id
    }, {
      k: "Method",
      v: e.method,
      serif: true
    }, {
      k: "Performed by",
      v: LE.PEOPLE[e.by].name
    }, {
      k: "Performed at",
      v: e.at
    }, {
      k: "Samples",
      v: String(e.samples.length)
    }, {
      k: "Status",
      v: e.status.replace("_", " ")
    }]
  }), /*#__PURE__*/React.createElement("h2", null, "Summary"), /*#__PURE__*/React.createElement("p", null, e.summary), /*#__PURE__*/React.createElement("h2", null, "Samples involved"), e.samples.map(sid => /*#__PURE__*/React.createElement(SampleCard, {
    key: sid,
    id: sid
  })), e.method === "SEM" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Micrographs"), /*#__PURE__*/React.createElement("p", null, "Top-down and cross-sectional micrographs from the post-mortem dissection of ", /*#__PURE__*/React.createElement(RefInline, {
    kind: "sample",
    glyph: "s",
    id: "NMC-7B-cell-014"
  }), "."), /*#__PURE__*/React.createElement(ArtImage, {
    id: "ar_03",
    caption: "Top-down view, 25 kX. Cathode particles intact; surface coating unchanged.",
    kind: "sem"
  }), /*#__PURE__*/React.createElement(ArtImage, {
    id: "ar_04",
    caption: "Cross-section, 10 kX. Visible Li dendrite on separator.",
    kind: "sem"
  })), e.method === "EIS" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Impedance data"), /*#__PURE__*/React.createElement("p", null, "Nyquist plot at 50% SoC. Equivalent-circuit fit via Voigt model."), /*#__PURE__*/React.createElement(ArtPDF, {
    id: "ar_05",
    summary: "Rct = 38 \u03A9 \xB7 Rs = 4.2 \u03A9 \xB7 CPE-Q = 1.1 mF \xB7 \u03C7\xB2 < 0.01"
  }), /*#__PURE__*/React.createElement(ArtNotebook, {
    id: "ar_06",
    cells: [{
      type: "md",
      md: '<em># Voigt fit — cell-014 at SoC 50%</em>'
    }, {
      type: "code",
      code: '<span class="k">from</span> halide <span class="k">import</span> eis<br/>fit = eis.voigt(Z, n_RC=2, freqs=f)<br/>print(fit.summary())'
    }, {
      type: "output",
      out: "Rs=4.2 Ω · Rct1=14 Ω · Rct2=24 Ω · total Rct=38 Ω · χ²=0.007"
    }]
  })), e.method === "cycling" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Cycling overlay"), /*#__PURE__*/React.createElement(ArtNotebook, {
    id: "ar_12",
    cells: [{
      type: "md",
      md: '<em># Capacity vs cycle — iter-7 cells</em>'
    }, {
      type: "plot"
    }, {
      type: "output",
      out: "Cell 014: 191 mAh/g @ cycle 22 · Cell 015: 188 mAh/g · Cell 016: SHORT cycle 4"
    }]
  })), e.method === "XRD" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Diffractogram"), /*#__PURE__*/React.createElement(ArtImage, {
    id: "ar_09",
    caption: "XRD pattern \u2014 sharp (003) at 18.7\xB0. Consistent with \u03B1-NaFeO\u2082 layered phase."
  })), e.method === "drying" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Drying protocol"), /*#__PURE__*/React.createElement(ArtPDF, {
    id: "ar_08",
    summary: "110\xB0C / 18 h glovebox protocol. Conductivity 1.7 mS/cm post-drying; mass loss 4.2%."
  })), /*#__PURE__*/React.createElement("h2", null, "Conclusions"), /*#__PURE__*/React.createElement("p", null, e.summary, " See linked artifacts above for raw data and analysis notebooks."), /*#__PURE__*/React.createElement("h2", null, "Follow-ups"), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, "Re-run at SoC 80% to confirm Rct trend isn't SoC-dependent."), /*#__PURE__*/React.createElement("li", null, "Compare against Caltech (HQ) 4.25 V dataset once MOU is signed.")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}

/* ──────────────────────────────────────────────────────
   MEETING PAGE
──────────────────────────────────────────────────────── */

function MeetingPage({
  meeting
}) {
  const m = meeting;
  return /*#__PURE__*/React.createElement(PageChrome, {
    overline: m.date + " ·",
    title: m.title,
    breadcrumb: `/ Workspace / Meetings / ${m.date}`,
    presence: [m.chair],
    savedRev: m.upcoming ? "scheduled · agenda only" : "rev #3 · minutes locked"
  }, /*#__PURE__*/React.createElement("div", {
    className: "meeting-deck"
  }, /*#__PURE__*/React.createElement("div", {
    className: "md-cell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "md-k"
  }, "Date"), /*#__PURE__*/React.createElement("div", {
    className: "md-v"
  }, m.date)), /*#__PURE__*/React.createElement("div", {
    className: "md-cell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "md-k"
  }, "Time"), /*#__PURE__*/React.createElement("div", {
    className: "md-v"
  }, m.time)), /*#__PURE__*/React.createElement("div", {
    className: "md-cell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "md-k"
  }, "Location"), /*#__PURE__*/React.createElement("div", {
    className: "md-v"
  }, m.location)), /*#__PURE__*/React.createElement("div", {
    className: "md-cell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "md-k"
  }, "Chair"), /*#__PURE__*/React.createElement("div", {
    className: "md-v"
  }, LE.PEOPLE[m.chair].name)), /*#__PURE__*/React.createElement("div", {
    className: "md-cell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "md-k"
  }, "Attendees"), /*#__PURE__*/React.createElement("div", {
    className: "md-v attendees"
  }, m.attendees.map(id => /*#__PURE__*/React.createElement(AvE, {
    key: id,
    id: id,
    size: 20,
    ring: true
  }))))), m.upcoming && /*#__PURE__*/React.createElement("div", {
    className: "callout"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ico"
  }, "\u231B"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Upcoming meeting."), " Pulled from project calendar. Agenda will be finalized 24 h before.")), /*#__PURE__*/React.createElement("h2", {
    className: "section-h-serif"
  }, "Agenda"), /*#__PURE__*/React.createElement("ol", null, m.agenda.map((a, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, a))), m.discussion.length > 0 && !m.upcoming && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", {
    className: "section-h-serif"
  }, "Discussion points"), m.discussion.map((d, i) => /*#__PURE__*/React.createElement("p", {
    key: i
  }, d))), m.decisions.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", {
    className: "section-h-serif"
  }, "Decisions"), /*#__PURE__*/React.createElement("ul", null, m.decisions.map((d, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, d)))), m.actions.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", {
    className: "section-h-serif"
  }, "Action items"), /*#__PURE__*/React.createElement("div", {
    className: "meeting-actions"
  }, m.actions.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "ma-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ma-who"
  }, a.who), /*#__PURE__*/React.createElement("span", {
    className: "ma-what"
  }, a.what), /*#__PURE__*/React.createElement("span", {
    className: "ma-due"
  }, "due ", a.due), /*#__PURE__*/React.createElement("span", {
    className: "ma-status"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill s-" + (a.status === "done" ? "done" : "active")
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot-s " + (a.status === "done" ? "done" : "active")
  }), a.status)))))), m.notes && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", {
    className: "section-h-serif"
  }, "Notes"), /*#__PURE__*/React.createElement("p", null, m.notes)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}

/* ──────────────────────────────────────────────────────
   MEETINGS LIST
──────────────────────────────────────────────────────── */

function MeetingsList({
  onOpen
}) {
  const past = LE.MEETINGS.filter(m => !m.upcoming);
  const upcoming = LE.MEETINGS.filter(m => m.upcoming);
  return /*#__PURE__*/React.createElement("div", {
    className: "meetings-page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cal-head"
  }, /*#__PURE__*/React.createElement("h2", null, "Meetings"), /*#__PURE__*/React.createElement("div", {
    className: "cmode"
  }, /*#__PURE__*/React.createElement("button", {
    className: "on"
  }, "All"), /*#__PURE__*/React.createElement("button", null, "PI weekly"), /*#__PURE__*/React.createElement("button", null, "Handoffs")), /*#__PURE__*/React.createElement("div", {
    className: "right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, /*#__PURE__*/React.createElement(IE, {
    name: "filter",
    size: 12
  }), " Filter"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary"
  }, /*#__PURE__*/React.createElement(IE, {
    name: "plus",
    size: 12
  }), " New meeting"))), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--muted)",
      fontSize: 13.5,
      maxWidth: 560,
      lineHeight: 1.6,
      marginTop: 0
    }
  }, "Workspace-level meeting log. Minutes, decisions, and action items are searchable across projects. Action items roll up to ", /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--serif)"
    }
  }, "Inbox"), " and notify the assignee."), upcoming.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 10.5,
      color: "var(--muted-2)",
      textTransform: "uppercase",
      letterSpacing: ".06em",
      margin: "24px 0 4px"
    }
  }, "Upcoming"), /*#__PURE__*/React.createElement("div", {
    className: "meeting-list"
  }, upcoming.map(m => /*#__PURE__*/React.createElement("div", {
    key: m.id,
    className: "meeting-row upcoming",
    onClick: () => onOpen(m.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: "mtg-date"
  }, m.date.split(",")[0].split(" ")[0], /*#__PURE__*/React.createElement("b", null, m.date.split(" ")[1].replace(",", "")), m.time.split("–")[0].trim()), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mtg-title"
  }, m.title), /*#__PURE__*/React.createElement("div", {
    className: "mtg-sub"
  }, m.kind, " \xB7 chaired by ", LE.PEOPLE[m.chair].name, " \xB7 ", m.agenda.length, " agenda items")), /*#__PURE__*/React.createElement("div", {
    className: "mtg-att"
  }, m.attendees.map(id => /*#__PURE__*/React.createElement(AvE, {
    key: id,
    id: id,
    size: 20,
    ring: true
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "pill s-planned"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot-s planned"
  }), "scheduled")))))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 10.5,
      color: "var(--muted-2)",
      textTransform: "uppercase",
      letterSpacing: ".06em",
      margin: "24px 0 4px"
    }
  }, "Past \xB7 ", past.length, " meetings"), /*#__PURE__*/React.createElement("div", {
    className: "meeting-list"
  }, past.map(m => /*#__PURE__*/React.createElement("div", {
    key: m.id,
    className: "meeting-row",
    onClick: () => onOpen(m.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: "mtg-date"
  }, m.date.split(",")[0].split(" ")[0], /*#__PURE__*/React.createElement("b", null, m.date.split(" ")[1].replace(",", "")), m.time.split("–")[0].trim()), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mtg-title"
  }, m.title), /*#__PURE__*/React.createElement("div", {
    className: "mtg-sub"
  }, m.kind, " \xB7 chaired by ", LE.PEOPLE[m.chair].name, " \xB7 ", m.actions.length, " action item", m.actions.length === 1 ? "" : "s", " \xB7 ", m.decisions.length, " decisions")), /*#__PURE__*/React.createElement("div", {
    className: "mtg-att"
  }, m.attendees.map(id => /*#__PURE__*/React.createElement(AvE, {
    key: id,
    id: id,
    size: 20,
    ring: true
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "pill s-done"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot-s done"
  }), "minutes"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}

/* ──────────────────────────────────────────────────────
   Dispatcher — kept named PageEditor for back-compat
──────────────────────────────────────────────────────── */

function PageEditor({
  project,
  pageRef
}) {
  if (pageRef?.type === "sample") {
    const s = LE.SAMPLE_BY_ID[pageRef.id];
    if (s) return /*#__PURE__*/React.createElement(SamplePage, {
      sample: s,
      project: project
    });
  }
  if (pageRef?.type === "experiment") {
    const e = LE.EXP_BY_ID[pageRef.id];
    if (e) return /*#__PURE__*/React.createElement(ExperimentPage, {
      experiment: e,
      project: project
    });
  }
  if (pageRef?.type === "iteration") {
    const it = LE.ITERATIONS.find(i => i.id === pageRef.id);
    if (it) return /*#__PURE__*/React.createElement(IterationPage, {
      iteration: it,
      project: project
    });
  }
  if (pageRef?.type === "meeting") {
    const m = LE.MEETINGS.find(mt => mt.id === pageRef.id);
    if (m) return /*#__PURE__*/React.createElement(MeetingPage, {
      meeting: m
    });
  }
  // Default: show the iter-7 page for the project Pages tab
  return /*#__PURE__*/React.createElement(IterationPage, {
    project: project
  });
}
window.PageEditor = PageEditor;
window.MeetingsList = MeetingsList;
window.MeetingPage = MeetingPage;
window.SamplePage = SamplePage;
window.ExperimentPage = ExperimentPage;
})();

/* === calendar-view.jsx === */
(function(){
// calendar-view.jsx — Gantt + upcoming events

const {
  Icon: IC,
  LAB: LC
} = window;
function CalendarView({
  project,
  embedded
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "page-wrap" + (embedded ? " wide" : " wide")
  }, /*#__PURE__*/React.createElement("div", {
    className: "cal-head"
  }, /*#__PURE__*/React.createElement("h2", null, embedded ? project.name + " · Timeline" : "Calendar"), /*#__PURE__*/React.createElement("div", {
    className: "cmode"
  }, /*#__PURE__*/React.createElement("button", {
    className: "on"
  }, "Timeline"), /*#__PURE__*/React.createElement("button", null, "Calendar"), /*#__PURE__*/React.createElement("button", null, "Agenda")), /*#__PURE__*/React.createElement("div", {
    className: "nav"
  }, /*#__PURE__*/React.createElement("button", {
    className: "arr"
  }, "\u2039"), /*#__PURE__*/React.createElement("span", null, "March \u2192 October 2026"), /*#__PURE__*/React.createElement("button", {
    className: "arr"
  }, "\u203A")), /*#__PURE__*/React.createElement("div", {
    className: "right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ics"
  }, /*#__PURE__*/React.createElement(IC, {
    name: "link",
    size: 11
  }), /*#__PURE__*/React.createElement("span", null, "halide.app/cal/jules/4f7c2a.ics"), /*#__PURE__*/React.createElement("button", {
    style: {
      color: "var(--ink)"
    }
  }, "copy")), /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary",
    onClick: () => window.__app_setModal && window.__app_setModal("new-event")
  }, /*#__PURE__*/React.createElement(IC, {
    name: "plus",
    size: 12
  }), " New event"))), /*#__PURE__*/React.createElement("div", {
    className: "gantt-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gf-head"
  }, /*#__PURE__*/React.createElement("div", null, "Project / Iteration"), /*#__PURE__*/React.createElement("div", null, "Mar"), /*#__PURE__*/React.createElement("div", null, "Apr"), /*#__PURE__*/React.createElement("div", null, "May"), /*#__PURE__*/React.createElement("div", null, "Jun"), /*#__PURE__*/React.createElement("div", null, "Jul"), /*#__PURE__*/React.createElement("div", null, "Aug"), /*#__PURE__*/React.createElement("div", null, "Sep"), /*#__PURE__*/React.createElement("div", null, "Oct"), /*#__PURE__*/React.createElement("div", null, "Nov"), /*#__PURE__*/React.createElement("div", null, "Dec"), /*#__PURE__*/React.createElement("div", null, "Jan"), /*#__PURE__*/React.createElement("div", null, "Feb")), /*#__PURE__*/React.createElement("div", {
    className: "gf-row group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      color: "var(--ember)"
    }
  }, "N"), /*#__PURE__*/React.createElement("span", null, "NMC811 Cathode Optimization"), /*#__PURE__*/React.createElement("span", {
    className: "sub"
  }, "10 iters")), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gtoday",
    style: {
      left: "24%"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "gf-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl indent"
  }, "Iter-4 \xB7 Coater calib"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gbar done",
    style: {
      left: "1.5%",
      width: "5%"
    }
  }, "Iter-4"))), /*#__PURE__*/React.createElement("div", {
    className: "gf-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl indent"
  }, "Iter-5 \xB7 LPSCl drying"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gbar done",
    style: {
      left: "7%",
      width: "6%"
    }
  }, "Iter-5"))), /*#__PURE__*/React.createElement("div", {
    className: "gf-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl indent"
  }, "Iter-6 \xB7 4.20 V baseline"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gbar done",
    style: {
      left: "13%",
      width: "7%"
    }
  }, "Iter-6"))), /*#__PURE__*/React.createElement("div", {
    className: "gf-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl indent"
  }, "Iter-7 \xB7 4.30 V cycling"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gbar active",
    style: {
      left: "20%",
      width: "8.5%"
    }
  }, "Iter-7 \xB7 active"), /*#__PURE__*/React.createElement("div", {
    className: "gtoday",
    style: {
      left: "24%"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "gevt dl",
    title: "DOE-BES report",
    style: {
      left: "23%"
    }
  }, "!"))), /*#__PURE__*/React.createElement("div", {
    className: "gf-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl indent"
  }, "Iter-8 \xB7 Binder compare"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gbar planned",
    style: {
      left: "29%",
      width: "6%"
    }
  }, "Iter-8"))), /*#__PURE__*/React.createElement("div", {
    className: "gf-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl indent"
  }, "Iter-9 \xB7 Pouch scale-up"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gbar planned",
    style: {
      left: "36%",
      width: "8%"
    }
  }, "Iter-9"))), !embedded && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "gf-row group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      color: "var(--ember)"
    }
  }, "S"), /*#__PURE__*/React.createElement("span", null, "Sulfide Electrolyte Stability"), /*#__PURE__*/React.createElement("span", {
    className: "sub"
  }, "4 iters")), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gtoday",
    style: {
      left: "24%"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "gf-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl indent"
  }, "Iter-2 \xB7 Moisture exposure"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gbar done",
    style: {
      left: "5%",
      width: "8%"
    }
  }, "Iter-2"))), /*#__PURE__*/React.createElement("div", {
    className: "gf-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl indent"
  }, "Iter-3 \xB7 Dry-room SOPs"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gbar active",
    style: {
      left: "17%",
      width: "10%"
    }
  }, "Iter-3 \xB7 active"))), /*#__PURE__*/React.createElement("div", {
    className: "gf-row group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      color: "var(--ember)"
    }
  }, "A"), /*#__PURE__*/React.createElement("span", null, "Anode-Free Cell Architecture"), /*#__PURE__*/React.createElement("span", {
    className: "sub"
  }, "2 iters")), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gtoday",
    style: {
      left: "24%"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "gf-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl indent"
  }, "Iter-1 \xB7 Cu substrate prep"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gbar active",
    style: {
      left: "22%",
      width: "7%"
    }
  }, "Iter-1 \xB7 active"))), /*#__PURE__*/React.createElement("div", {
    className: "gf-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl indent"
  }, "Iter-2 \xB7 First plating cycles"), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "gcell"
  })), /*#__PURE__*/React.createElement("div", {
    className: "gbar planned",
    style: {
      left: "30%",
      width: "9%"
    }
  }, "Iter-2"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1.4fr",
      gap: 24,
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "section-h",
    style: {
      margin: "0 0 10px"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 20
    }
  }, "Subscribe")), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--muted)",
      fontSize: 13,
      lineHeight: 1.6,
      maxWidth: 420
    }
  }, "Subscribe to your personal feed of project events, iteration boundaries, and deadlines. The URL is per-user, signed, and can be rotated from Settings."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      marginTop: 14,
      maxWidth: 420
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      padding: "9px 12px",
      border: "1px solid var(--line)",
      borderRadius: 6,
      gap: 10,
      background: "var(--surface)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 24,
      height: 24,
      borderRadius: 5,
      background: "var(--surface)",
      border: "1px solid var(--line)",
      display: "grid",
      placeItems: "center",
      fontFamily: "var(--serif)",
      fontSize: 14,
      color: "var(--ember)"
    }
  }, "G"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 500,
      fontSize: 13
    }
  }, "Google Calendar"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "var(--muted)"
    }
  }, "refresh \u2248 every 12 h")), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Add by URL")), /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      padding: "9px 12px",
      border: "1px solid var(--line)",
      borderRadius: 6,
      gap: 10,
      background: "var(--surface)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 24,
      height: 24,
      borderRadius: 5,
      background: "var(--surface)",
      border: "1px solid var(--line)",
      display: "grid",
      placeItems: "center",
      fontFamily: "var(--serif)",
      fontSize: 14,
      color: "var(--ember)"
    }
  }, "A"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 500,
      fontSize: 13
    }
  }, "Apple Calendar"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "var(--muted)"
    }
  }, "refresh \u2248 every 15 min")), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Subscribe\u2026")), /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      padding: "9px 12px",
      border: "1px solid var(--line)",
      borderRadius: 6,
      gap: 10,
      background: "var(--surface)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 24,
      height: 24,
      borderRadius: 5,
      background: "var(--surface)",
      border: "1px solid var(--line)",
      display: "grid",
      placeItems: "center",
      fontFamily: "var(--serif)",
      fontSize: 14,
      color: "var(--ember)"
    }
  }, "O"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 500,
      fontSize: 13
    }
  }, "Outlook"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "var(--muted)"
    }
  }, "refresh \u2248 every 1 h")), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Add from internet")))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "section-h",
    style: {
      margin: "0 0 4px"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 20
    }
  }, "Upcoming"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "next 30 days")), /*#__PURE__*/React.createElement("div", {
    className: "events"
  }, LC.EVENTS.map(e => /*#__PURE__*/React.createElement("div", {
    key: e.d + e.t,
    className: "e"
  }, /*#__PURE__*/React.createElement("div", {
    className: "when"
  }, e.w, /*#__PURE__*/React.createElement("b", null, e.d.split(" ")[1]), e.d.split(" ")[0]), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "marker",
    style: {
      background: e.kind === "deadline" ? "var(--ink)" : e.kind === "milestone" ? "var(--ember)" : e.kind === "meeting" ? "#7d8db5" : "var(--muted-2)"
    }
  }), e.t, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, e.sub)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "pill",
    style: {
      textTransform: "capitalize"
    }
  }, e.kind))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}
window.CalendarView = CalendarView;
})();

/* === artifacts-view.jsx === */
(function(){
// artifacts-view.jsx — artifact gallery

const {
  Icon: IA,
  LAB: LA
} = window;
function Thumb({
  a
}) {
  if (a.thumb === "plot") {
    // fake plot
    const pts = [];
    for (let i = 0; i < 22; i++) {
      const x = 14 + i * 8;
      const y = 70 - Math.min(60, 6 + i * 1.6 - Math.sin(i * 0.6) * 4);
      pts.push([x, y]);
    }
    const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + " " + p[1]).join(" ");
    return /*#__PURE__*/React.createElement("div", {
      className: "ahead",
      style: {
        background: "var(--surface)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "tt"
    }, a.type), /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 200 90",
      style: {
        width: "86%",
        height: "82%"
      }
    }, /*#__PURE__*/React.createElement("rect", {
      x: "6",
      y: "6",
      width: "188",
      height: "76",
      fill: "none",
      stroke: "var(--line)"
    }), /*#__PURE__*/React.createElement("path", {
      d: path,
      fill: "none",
      stroke: "var(--ember)",
      strokeWidth: "1.6"
    }), /*#__PURE__*/React.createElement("path", {
      d: pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + " " + (p[1] + 10)).join(" "),
      fill: "none",
      stroke: "var(--muted)",
      strokeWidth: "1",
      strokeDasharray: "3 3"
    })));
  }
  if (a.thumb === "sem") {
    return /*#__PURE__*/React.createElement("div", {
      className: "ahead",
      style: {
        background: "#1f1c14",
        color: "#fff"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "tt",
      style: {
        background: "rgba(0,0,0,.4)",
        color: "#f2dccf",
        borderColor: "transparent"
      }
    }, a.type), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        inset: 0,
        background: `
          radial-gradient(circle at 28% 32%, rgba(217,194,165,.6) 0, transparent 24%),
          radial-gradient(circle at 55% 60%, rgba(184,158,124,.5) 0, transparent 28%),
          radial-gradient(circle at 78% 28%, rgba(155,128,94,.55) 0, transparent 22%),
          radial-gradient(circle at 18% 78%, rgba(120,98,68,.45) 0, transparent 26%),
          repeating-linear-gradient(35deg, rgba(255,255,255,.04) 0 2px, transparent 2px 5px),
          linear-gradient(180deg, #2a2418 0, #0e0c08 100%)
        `
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        bottom: 6,
        left: 8,
        fontFamily: "var(--mono)",
        fontSize: 9,
        color: "rgba(255,255,255,.7)"
      }
    }, "10 \xB5m"), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        bottom: 6,
        right: 8,
        fontFamily: "var(--mono)",
        fontSize: 9,
        color: "rgba(255,255,255,.7)"
      }
    }, "25 kX"));
  }
  if (a.thumb === "code") {
    return /*#__PURE__*/React.createElement("div", {
      className: "ahead",
      style: {
        background: "var(--surface)",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        padding: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "tt"
    }, a.type), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        inset: 14,
        fontFamily: "var(--mono)",
        fontSize: 9.5,
        color: "var(--muted)",
        lineHeight: 1.55,
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--code-fg)"
      }
    }, "import"), " numpy ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--code-fg)"
      }
    }, "as"), " np"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--code-fg)"
      }
    }, "import"), " matplotlib.pyplot ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--code-fg)"
      }
    }, "as"), " plt"), /*#__PURE__*/React.createElement("div", null, "\xA0"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--muted-2)"
      }
    }, "# Load cycling data for cell-014")), /*#__PURE__*/React.createElement("div", null, "data = pd.read_csv(", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--ref-exp-fg)"
      }
    }, "\"7B/cell014.csv\""), ")"), /*#__PURE__*/React.createElement("div", null, "cap = data[", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--ref-exp-fg)"
      }
    }, "\"discharge_mAh\""), "] / mass"), /*#__PURE__*/React.createElement("div", null, "plt.plot(data.cycle, cap, ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--ref-exp-fg)"
      }
    }, "\"o-\""), ")"), /*#__PURE__*/React.createElement("div", null, "plt.xlabel(", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--ref-exp-fg)"
      }
    }, "\"cycle\""), "); plt.ylabel(", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--ref-exp-fg)"
      }
    }, "\"Q (mAh/g)\""), ")"), /*#__PURE__*/React.createElement("div", null, "plt.show()")));
  }
  if (a.thumb === "doc") {
    return /*#__PURE__*/React.createElement("div", {
      className: "ahead",
      style: {
        background: "var(--surface)",
        alignItems: "flex-start",
        padding: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "tt"
    }, a.type), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        left: 14,
        right: 14,
        top: 34,
        display: "flex",
        flexDirection: "column",
        gap: 5
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: 6,
        background: "var(--ink)",
        width: "55%",
        borderRadius: 1
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 3,
        background: "var(--line-2)",
        width: "100%"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 3,
        background: "var(--line-2)",
        width: "94%"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 3,
        background: "var(--line-2)",
        width: "88%"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 3,
        background: "var(--line-2)",
        width: "96%"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 3,
        background: "var(--line-2)",
        width: "60%"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 6
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 4,
        background: "var(--muted)",
        width: "35%",
        borderRadius: 1
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 3,
        background: "var(--line-2)",
        width: "100%"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 3,
        background: "var(--line-2)",
        width: "92%"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 3,
        background: "var(--line-2)",
        width: "80%"
      }
    })));
  }
  if (a.thumb === "photo") {
    return /*#__PURE__*/React.createElement("div", {
      className: "ahead",
      style: {
        background: `
        linear-gradient(145deg, #c8b89e 0%, #8a7458 35%, #57462f 65%, #2c2418 100%),
        repeating-linear-gradient(45deg, rgba(255,255,255,.04) 0 3px, transparent 3px 7px)
      `
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "tt",
      style: {
        background: "rgba(255,255,255,.85)"
      }
    }, a.type), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        inset: 0,
        background: "radial-gradient(circle at 60% 45%, rgba(217,119,87,.18) 0, transparent 40%)"
      }
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "ahead"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tt"
  }, a.type), /*#__PURE__*/React.createElement("div", {
    className: "ph-stripes"
  }));
}
function ArtifactsView({
  project
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "page-wrap wide"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cal-head"
  }, /*#__PURE__*/React.createElement("h2", null, "Artifacts"), /*#__PURE__*/React.createElement("div", {
    className: "cmode"
  }, /*#__PURE__*/React.createElement("button", {
    className: "on"
  }, /*#__PURE__*/React.createElement(IA, {
    name: "grid",
    size: 11
  }), " Grid"), /*#__PURE__*/React.createElement("button", null, /*#__PURE__*/React.createElement(IA, {
    name: "list",
    size: 11
  }), " List")), /*#__PURE__*/React.createElement("div", {
    className: "right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, /*#__PURE__*/React.createElement(IA, {
    name: "filter",
    size: 12
  }), " Filter"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary"
  }, /*#__PURE__*/React.createElement(IA, {
    name: "plus",
    size: 12
  }), " Upload"))), /*#__PURE__*/React.createElement("div", {
    className: "arti-bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "filt on"
  }, "All ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      marginLeft: 4,
      opacity: .6
    }
  }, "142")), /*#__PURE__*/React.createElement("button", {
    className: "filt"
  }, "PDF ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      marginLeft: 4,
      opacity: .6
    }
  }, "48")), /*#__PURE__*/React.createElement("button", {
    className: "filt"
  }, "Notebooks ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      marginLeft: 4,
      opacity: .6
    }
  }, "22")), /*#__PURE__*/React.createElement("button", {
    className: "filt"
  }, "Images ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      marginLeft: 4,
      opacity: .6
    }
  }, "68")), /*#__PURE__*/React.createElement("button", {
    className: "filt"
  }, "Other ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      marginLeft: 4,
      opacity: .6
    }
  }, "4")), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted)"
    }
  }, "Sorted by recently added")), /*#__PURE__*/React.createElement("div", {
    className: "arti-grid"
  }, LA.ARTIFACTS.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.id,
    className: "arti"
  }, /*#__PURE__*/React.createElement(Thumb, {
    a: a
  }), /*#__PURE__*/React.createElement("div", {
    className: "ameta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "aname"
  }, a.name), /*#__PURE__*/React.createElement("div", {
    className: "asub"
  }, a.size, " \xB7 ", LA.PEOPLE[a.by].name.split(" ")[0], " \xB7 ", a.at))))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}
window.ArtifactsView = ArtifactsView;
})();

/* === inbox-people.jsx === */
(function(){
// inbox-people.jsx — Inbox and People views (workspace-level)

const {
  Avatar: AvIP,
  Icon: IIP,
  LAB: LIP
} = window;

/* ──────────────────────────────────────────────────────
   Inbox
──────────────────────────────────────────────────────── */

function InboxKindBadge({
  kind
}) {
  const meta = {
    pi_flag: {
      label: "PI flag",
      cls: "ibk-flag",
      glyph: "⚑"
    },
    mention: {
      label: "Mention",
      cls: "ibk-mention",
      glyph: "@"
    },
    ai_proposal: {
      label: "AI proposal",
      cls: "ibk-ai",
      glyph: "◉"
    },
    action: {
      label: "Action item",
      cls: "ibk-action",
      glyph: "✓"
    },
    comment: {
      label: "Comment",
      cls: "ibk-comment",
      glyph: "“"
    },
    system: {
      label: "System",
      cls: "ibk-system",
      glyph: "·"
    }
  }[kind] || {
    label: kind,
    cls: "ibk-system",
    glyph: "·"
  };
  return /*#__PURE__*/React.createElement("span", {
    className: "inbox-kind " + meta.cls
  }, /*#__PURE__*/React.createElement("span", {
    className: "ibk-glyph"
  }, meta.glyph), " ", meta.label);
}
function InboxRow({
  item,
  onOpen
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: "inbox-row" + (item.unread ? " unread" : ""),
    onClick: () => onOpen && onOpen(item)
  }, /*#__PURE__*/React.createElement("div", {
    className: "inbox-dot",
    "aria-hidden": true
  }, item.unread ? "●" : ""), /*#__PURE__*/React.createElement("div", {
    className: "inbox-from"
  }, item.actor === "AI" ? /*#__PURE__*/React.createElement("span", {
    className: "ai-orb",
    style: {
      width: 20,
      height: 20
    }
  }) : item.actor === "H" ? /*#__PURE__*/React.createElement("span", {
    className: "inbox-h"
  }, "H") : /*#__PURE__*/React.createElement(AvIP, {
    id: item.actor,
    size: 20,
    ring: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "inbox-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inbox-top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inbox-title"
  }, item.title), /*#__PURE__*/React.createElement(InboxKindBadge, {
    kind: item.kind
  }), item.project && /*#__PURE__*/React.createElement("span", {
    className: "inbox-proj"
  }, LIP.PROJECTS.find(p => p.id === item.project)?.name.split(" ").slice(0, 2).join(" ") || "Project")), /*#__PURE__*/React.createElement("div", {
    className: "inbox-sub"
  }, item.subtitle)), /*#__PURE__*/React.createElement("div", {
    className: "inbox-ts"
  }, item.ts));
}
function InboxPage({
  setRoute
}) {
  const [filter, setFilter] = React.useState("all");
  const items = LIP.INBOX.filter(i => filter === "all" ? true : i.kind === filter);
  const today = items.filter(i => i.bucket === "today");
  const earlier = items.filter(i => i.bucket === "earlier");
  const older = items.filter(i => i.bucket === "older");
  const unreadN = LIP.INBOX.filter(i => i.unread).length;
  const open = item => {
    if (!item.target) return;
    if (item.target.type === "iteration") setRoute({
      view: "entity",
      entityType: "iteration",
      entityId: item.target.id,
      projectId: item.project
    });else if (item.target.type === "experiment") setRoute({
      view: "entity",
      entityType: "experiment",
      entityId: item.target.id,
      projectId: item.project
    });else if (item.target.type === "sample") setRoute({
      view: "entity",
      entityType: "sample",
      entityId: item.target.id,
      projectId: item.project
    });else if (item.target.type === "meeting") setRoute({
      view: "meeting",
      meetingId: item.target.id
    });else if (item.target.type === "project") setRoute({
      view: "project",
      projectId: item.target.id,
      tab: "overview",
      variant: "editorial"
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "page-wrap wide"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cal-head"
  }, /*#__PURE__*/React.createElement("h2", null, "Inbox"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted-2)",
      textTransform: "uppercase",
      letterSpacing: ".06em"
    }
  }, unreadN, " unread \xB7 ", LIP.INBOX.length, " total"), /*#__PURE__*/React.createElement("div", {
    className: "right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Mark all read"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, /*#__PURE__*/React.createElement(IIP, {
    name: "filter",
    size: 12
  }), " Notification settings"))), /*#__PURE__*/React.createElement("div", {
    className: "inbox-filters"
  }, [{
    k: "all",
    l: "All",
    n: LIP.INBOX.length
  }, {
    k: "pi_flag",
    l: "PI flags",
    n: LIP.INBOX.filter(i => i.kind === "pi_flag").length
  }, {
    k: "mention",
    l: "Mentions",
    n: LIP.INBOX.filter(i => i.kind === "mention").length
  }, {
    k: "ai_proposal",
    l: "AI proposals",
    n: LIP.INBOX.filter(i => i.kind === "ai_proposal").length
  }, {
    k: "action",
    l: "Action items",
    n: LIP.INBOX.filter(i => i.kind === "action").length
  }, {
    k: "comment",
    l: "Comments",
    n: LIP.INBOX.filter(i => i.kind === "comment").length
  }].map(f => /*#__PURE__*/React.createElement("button", {
    key: f.k,
    className: "filt" + (filter === f.k ? " on" : ""),
    onClick: () => setFilter(f.k)
  }, f.l, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      marginLeft: 4,
      opacity: .6
    }
  }, f.n)))), today.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "inbox-bucket"
  }, "Today"), /*#__PURE__*/React.createElement("div", {
    className: "inbox-list"
  }, today.map(i => /*#__PURE__*/React.createElement(InboxRow, {
    key: i.id,
    item: i,
    onOpen: open
  })))), earlier.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "inbox-bucket"
  }, "Earlier this week"), /*#__PURE__*/React.createElement("div", {
    className: "inbox-list"
  }, earlier.map(i => /*#__PURE__*/React.createElement(InboxRow, {
    key: i.id,
    item: i,
    onOpen: open
  })))), older.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "inbox-bucket"
  }, "Older"), /*#__PURE__*/React.createElement("div", {
    className: "inbox-list"
  }, older.map(i => /*#__PURE__*/React.createElement(InboxRow, {
    key: i.id,
    item: i,
    onOpen: open
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}

/* ──────────────────────────────────────────────────────
   People
──────────────────────────────────────────────────────── */

function rolePill(role) {
  return /*#__PURE__*/React.createElement("span", {
    className: "role-pill role-" + role
  }, role);
}
function PersonCard({
  m,
  onOpen
}) {
  const onProjects = m.projects.map(pid => LIP.PROJECTS.find(p => p.id === pid)).filter(Boolean);
  return /*#__PURE__*/React.createElement("div", {
    className: "person-card",
    onClick: onOpen
  }, /*#__PURE__*/React.createElement("div", {
    className: "person-head"
  }, /*#__PURE__*/React.createElement(AvIP, {
    id: m.id,
    size: 48
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "person-name"
  }, m.name), /*#__PURE__*/React.createElement("div", {
    className: "person-title"
  }, m.title), /*#__PURE__*/React.createElement("div", {
    className: "person-email"
  }, m.email)), rolePill(m.role)), /*#__PURE__*/React.createElement("div", {
    className: "person-projects"
  }, onProjects.map(p => /*#__PURE__*/React.createElement("span", {
    key: p.id,
    className: "person-proj"
  }, /*#__PURE__*/React.createElement("span", {
    className: "person-proj-glyph"
  }, p.emblem), p.name.split(" ").slice(0, 2).join(" ")))), /*#__PURE__*/React.createElement("div", {
    className: "person-foot"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "person-foot-k"
  }, "Last active"), " ", m.lastActive), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "person-foot-k"
  }, "Since"), " ", m.since), /*#__PURE__*/React.createElement("span", null, m.twofa ? "2FA ✓" : "2FA off")));
}
function PeoplePage({
  setRoute
}) {
  const owners = LIP.MEMBERS.filter(m => m.role === "owner");
  const admins = LIP.MEMBERS.filter(m => m.role === "admin");
  const members = LIP.MEMBERS.filter(m => m.role === "member");
  const external = LIP.MEMBERS.filter(m => m.role === "external");
  return /*#__PURE__*/React.createElement("div", {
    className: "page-wrap wide"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cal-head"
  }, /*#__PURE__*/React.createElement("h2", null, "People"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted-2)",
      textTransform: "uppercase",
      letterSpacing: ".06em"
    }
  }, LIP.MEMBERS.length, " members \xB7 ", LIP.INVITES.length, " invites pending"), /*#__PURE__*/React.createElement("div", {
    className: "right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, /*#__PURE__*/React.createElement(IIP, {
    name: "filter",
    size: 12
  }), " Filter"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary"
  }, /*#__PURE__*/React.createElement(IIP, {
    name: "plus",
    size: 12
  }), " Invite external"))), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--muted)",
      fontSize: 13.5,
      maxWidth: 620,
      lineHeight: 1.6,
      marginTop: 0
    }
  }, "Workspace directory for ", /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--serif)"
    }
  }, "Halide"), ". University accounts use Microsoft Entra SSO; external collaborators are admin-invited and use local password accounts (spec \xA76.1, \xA76.2)."), [["Owners / PI", owners], ["Admins", admins], ["Members", members], ["External collaborators", external]].map(([label, set]) => set.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, {
    key: label
  }, /*#__PURE__*/React.createElement("div", {
    className: "people-bucket"
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", {
    className: "people-bucket-n"
  }, set.length)), /*#__PURE__*/React.createElement("div", {
    className: "people-grid"
  }, set.map(m => /*#__PURE__*/React.createElement(PersonCard, {
    key: m.id,
    m: m
  }))))), LIP.INVITES.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "people-bucket"
  }, /*#__PURE__*/React.createElement("span", null, "Pending invites"), /*#__PURE__*/React.createElement("span", {
    className: "people-bucket-n"
  }, LIP.INVITES.length)), /*#__PURE__*/React.createElement("div", {
    className: "invites-table"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inv-head"
  }, /*#__PURE__*/React.createElement("div", null, "Email"), /*#__PURE__*/React.createElement("div", null, "Invited by"), /*#__PURE__*/React.createElement("div", null, "Project"), /*#__PURE__*/React.createElement("div", null, "Expires"), /*#__PURE__*/React.createElement("div", null)), LIP.INVITES.map(i => /*#__PURE__*/React.createElement("div", {
    key: i.id,
    className: "inv-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inv-email"
  }, i.email), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(AvIP, {
    id: i.invitedBy,
    size: 16
  })), /*#__PURE__*/React.createElement("div", null, LIP.PROJECTS.find(p => p.id === i.project)?.name.split(" ").slice(0, 2).join(" ") || "—"), /*#__PURE__*/React.createElement("div", null, i.expires), /*#__PURE__*/React.createElement("div", {
    className: "inv-actions"
  }, /*#__PURE__*/React.createElement("button", null, "Resend"), /*#__PURE__*/React.createElement("button", null, "Revoke")))))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}
Object.assign(window, {
  InboxPage,
  PeoplePage
});
})();

/* === settings.jsx === */
(function(){
// settings.jsx — Account settings + Admin panel

const {
  Avatar: AvS,
  Icon: IS,
  LAB: LS
} = window;

/* shared section primitives */
function SettingsSection({
  title,
  hint,
  children
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "set-sect"
  }, /*#__PURE__*/React.createElement("div", {
    className: "set-sect-h"
  }, /*#__PURE__*/React.createElement("h3", null, title), hint && /*#__PURE__*/React.createElement("span", {
    className: "set-hint"
  }, hint)), /*#__PURE__*/React.createElement("div", {
    className: "set-sect-body"
  }, children));
}
function SettingsRow({
  label,
  sublabel,
  children,
  align = "center"
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "set-row align-" + align
  }, /*#__PURE__*/React.createElement("div", {
    className: "set-row-l"
  }, /*#__PURE__*/React.createElement("div", {
    className: "set-row-label"
  }, label), sublabel && /*#__PURE__*/React.createElement("div", {
    className: "set-row-sub"
  }, sublabel)), /*#__PURE__*/React.createElement("div", {
    className: "set-row-r"
  }, children));
}
function SwitchToggle({
  on
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "sw-toggle" + (on ? " on" : "")
  }, /*#__PURE__*/React.createElement("span", {
    className: "sw-knob"
  }));
}

/* ──────────────────────────────────────────────────────
   ACCOUNT SETTINGS
──────────────────────────────────────────────────────── */

function AccountPage() {
  const me = LS.MEMBERS.find(m => m.id === "JR");
  return /*#__PURE__*/React.createElement("div", {
    className: "page-wrap",
    style: {
      maxWidth: 820
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "set-head"
  }, /*#__PURE__*/React.createElement("h1", null, "Account settings"), /*#__PURE__*/React.createElement("div", {
    className: "set-sub"
  }, me.email, " \xB7 signed in via Microsoft Entra")), /*#__PURE__*/React.createElement(SettingsSection, {
    title: "Profile"
  }, /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Photo",
    sublabel: "Used in your avatar across the workspace."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(AvS, {
    id: "JR",
    size: 56
  }), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Replace"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn",
    style: {
      color: "var(--muted)"
    }
  }, "Remove"))), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Name",
    sublabel: "Display name shown on mentions, comments, and audit log."
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: me.name
  })), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Title",
    sublabel: "Optional. Helps teammates know your lab role."
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: me.title
  })), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Email",
    sublabel: "Tied to your Microsoft Entra account. Cannot be changed here."
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: me.email,
    disabled: true
  }))), /*#__PURE__*/React.createElement(SettingsSection, {
    title: "Calendar subscription",
    hint: "Per-user signed .ics URL \xB7 refreshable by Google / Apple / Outlook"
  }, /*#__PURE__*/React.createElement("div", {
    className: "set-ics-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "set-ics-url"
  }, /*#__PURE__*/React.createElement(IS, {
    name: "link",
    size: 11
  }), " halide.app/cal/jules/4f7c2a6e9d83.ics"), /*#__PURE__*/React.createElement("div", {
    className: "set-ics-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Copy"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Rotate token"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn",
    style: {
      color: "var(--bad)"
    }
  }, "Revoke"))), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Scope",
    sublabel: "Which events appear in your feed."
  }, /*#__PURE__*/React.createElement("select", {
    className: "set-input",
    style: {
      maxWidth: 320
    }
  }, /*#__PURE__*/React.createElement("option", null, "All visible projects"), /*#__PURE__*/React.createElement("option", null, "Only projects I lead"), /*#__PURE__*/React.createElement("option", null, "Custom \u2014 choose projects\u2026"))), /*#__PURE__*/React.createElement("p", {
    className: "set-note"
  }, "Google refreshes subscribed feeds every ~12 h; Apple every 5\u201360 min; Outlook every ~1 h. Real-time push is a v2 candidate.")), /*#__PURE__*/React.createElement(SettingsSection, {
    title: "API tokens (PATs)",
    hint: "Personal access tokens for agents and scripts \xB7 scoped, revokable"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pat-list"
  }, LS.PATS.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    className: "pat-row" + (t.revoked ? " pat-revoked" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "pat-l"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pat-name"
  }, t.name), /*#__PURE__*/React.createElement("div", {
    className: "pat-prefix"
  }, t.prefix), /*#__PURE__*/React.createElement("div", {
    className: "pat-scopes"
  }, t.scopes.map(s => /*#__PURE__*/React.createElement("span", {
    key: s,
    className: "pat-scope"
  }, s)))), /*#__PURE__*/React.createElement("div", {
    className: "pat-meta"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "pat-meta-k"
  }, "created"), " ", t.created), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "pat-meta-k"
  }, "last used"), " ", t.lastUsed), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "pat-meta-k"
  }, "expires"), " ", t.expires)), /*#__PURE__*/React.createElement("div", {
    className: "pat-actions"
  }, t.revoked ? /*#__PURE__*/React.createElement("span", {
    className: "pill",
    style: {
      color: "var(--muted)"
    }
  }, "revoked") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", null, "Edit scopes"), /*#__PURE__*/React.createElement("button", {
    style: {
      color: "var(--bad)"
    }
  }, "Revoke")))))), /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary",
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement(IS, {
    name: "plus",
    size: 12
  }), " New token")), /*#__PURE__*/React.createElement(SettingsSection, {
    title: "Notifications",
    hint: "Per-channel \xB7 per-category"
  }, /*#__PURE__*/React.createElement("table", {
    className: "notif-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null), /*#__PURE__*/React.createElement("th", null, "In-app"), /*#__PURE__*/React.createElement("th", null, "Email"))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Mentions"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: true
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: true
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "PI flags on projects I'm in"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: true
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: true
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "AI proposals (suggest_writes)"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: true
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: false
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Iteration boundary reminders"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: true
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: false
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Meeting reminders (24 h)"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: true
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: true
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Workspace digest (weekly)"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: false
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: true
  })))))), /*#__PURE__*/React.createElement(SettingsSection, {
    title: "Security",
    hint: "Local accounts only \xB7 SSO accounts manage password & 2FA in Entra"
  }, /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Two-factor authentication (TOTP)",
    sublabel: "Available for local accounts in v1.1 (post-launch)."
  }, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: true
  })), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Active sessions",
    sublabel: "Sign out of all other sessions if you suspect a leak."
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Sign out other sessions (2)"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}

/* ──────────────────────────────────────────────────────
   ADMIN PANEL
──────────────────────────────────────────────────────── */

function AISpark({
  values
}) {
  const max = Math.max(...values);
  return /*#__PURE__*/React.createElement("div", {
    className: "ai-spark"
  }, values.map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "b" + (i === values.length - 1 ? " on" : ""),
    style: {
      height: Math.max(8, v / max * 100) + "%"
    }
  })));
}
function AdminPage({
  setRoute
}) {
  const u = LS.AI_USAGE;
  return /*#__PURE__*/React.createElement("div", {
    className: "page-wrap wide",
    style: {
      maxWidth: 1100
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "set-head"
  }, /*#__PURE__*/React.createElement("h1", null, "Workspace admin"), /*#__PURE__*/React.createElement("div", {
    className: "set-sub"
  }, "Halide \xB7 halide-lab.org \xB7 Owner Dr. Mei Tanaka")), /*#__PURE__*/React.createElement(SettingsSection, {
    title: "Workspace",
    hint: "Visible to all members"
  }, /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Workspace name"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Halide"
  })), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Subdomain"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "halide-lab.org",
    disabled: true
  })), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Allow-listed sign-in domains",
    sublabel: "University SSO is restricted to these domains."
  }, /*#__PURE__*/React.createElement("div", {
    className: "set-chips"
  }, /*#__PURE__*/React.createElement("span", {
    className: "set-chip"
  }, "halide-lab.org ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("span", {
    className: "set-chip"
  }, "stanford.edu ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("span", {
    className: "set-chip"
  }, "caltech.edu ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("button", {
    className: "set-chip add"
  }, "+ add domain"))), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "External invites",
    sublabel: "Admins may invite emails outside the allow-listed domains. They sign in with a local password."
  }, /*#__PURE__*/React.createElement(SwitchToggle, {
    on: true
  }))), /*#__PURE__*/React.createElement(SettingsSection, {
    title: "AI",
    hint: "Workspace-level configuration \xB7 \xA77.5.1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ai-overview"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ai-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ai-stat-k"
  }, "Spend, this month"), /*#__PURE__*/React.createElement("div", {
    className: "ai-stat-v"
  }, "$", u.spent.toFixed(2), /*#__PURE__*/React.createElement("small", null, "/ $", u.cap)), /*#__PURE__*/React.createElement("div", {
    className: "ai-stat-d"
  }, u.pctOfCap, "% of cap \xB7 ", u.daysLeft, " days remaining"), /*#__PURE__*/React.createElement("div", {
    className: "ai-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ai-bar-fill",
    style: {
      width: u.pctOfCap + "%"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "ai-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ai-stat-k"
  }, "Daily, last 14 days"), /*#__PURE__*/React.createElement(AISpark, {
    values: u.daily
  }), /*#__PURE__*/React.createElement("div", {
    className: "ai-stat-d"
  }, "Median $3.10 / day \xB7 trending up")), /*#__PURE__*/React.createElement("div", {
    className: "ai-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ai-stat-k"
  }, "By feature"), u.byFeature.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.k,
    className: "ai-feature"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ai-feat-l"
  }, f.k), /*#__PURE__*/React.createElement("div", {
    className: "ai-feat-bar"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: f.v / Math.max(...u.byFeature.map(x => x.v)) * 100 + "%"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "ai-feat-r"
  }, "$", f.v.toFixed(2)))))), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Monthly spend cap (USD)",
    sublabel: "Orchestrator refuses new requests once exceeded; soft-warn at 80%."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      color: "var(--muted)"
    }
  }, "$"), /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "200",
    style: {
      maxWidth: 120
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      color: "var(--muted)"
    }
  }, "/ month"))), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Default model \u2014 workflows",
    sublabel: "Used for risk-assessment + analysis steps."
  }, /*#__PURE__*/React.createElement("select", {
    className: "set-input",
    style: {
      maxWidth: 280
    }
  }, /*#__PURE__*/React.createElement("option", null, "claude-sonnet-4.5"), /*#__PURE__*/React.createElement("option", null, "claude-opus-4.5"), /*#__PURE__*/React.createElement("option", null, "gpt-5"))), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Default model \u2014 chat",
    sublabel: "Used for the in-project assistant."
  }, /*#__PURE__*/React.createElement("select", {
    className: "set-input",
    style: {
      maxWidth: 280
    }
  }, /*#__PURE__*/React.createElement("option", null, "claude-haiku-4.5"), /*#__PURE__*/React.createElement("option", null, "claude-sonnet-4.5"), /*#__PURE__*/React.createElement("option", null, "gpt-5-mini"))), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Default autonomy",
    sublabel: "Workspace default. Projects may override (never more permissive)."
  }, /*#__PURE__*/React.createElement("select", {
    className: "set-input",
    style: {
      maxWidth: 280
    }
  }, /*#__PURE__*/React.createElement("option", null, "read_only"), /*#__PURE__*/React.createElement("option", {
    selected: true
  }, "suggest_writes"), /*#__PURE__*/React.createElement("option", null, "auto_routine"), /*#__PURE__*/React.createElement("option", null, "full"))), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Per-user usage",
    sublabel: "Top consumers this month."
  }, /*#__PURE__*/React.createElement("table", {
    className: "usage-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null), /*#__PURE__*/React.createElement("th", null, "Calls"), /*#__PURE__*/React.createElement("th", null, "Spend"), /*#__PURE__*/React.createElement("th", null, "Share"))), /*#__PURE__*/React.createElement("tbody", null, u.byUser.map(b => /*#__PURE__*/React.createElement("tr", {
    key: b.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(AvS, {
    id: b.id,
    size: 18
  }), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 8
    }
  }, LS.PEOPLE[b.id].name)), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: "var(--mono)"
    }
  }, b.calls), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: "var(--mono)"
    }
  }, "$", b.spent.toFixed(2)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "usage-bar"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: b.spent / u.spent * 100 + "%"
    }
  }))))))))), /*#__PURE__*/React.createElement(SettingsSection, {
    title: "Members",
    hint: `${LS.MEMBERS.length} members · ${LS.INVITES.length} pending invites`
  }, /*#__PURE__*/React.createElement("table", {
    className: "member-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Member"), /*#__PURE__*/React.createElement("th", null, "Role"), /*#__PURE__*/React.createElement("th", null, "Auth"), /*#__PURE__*/React.createElement("th", null, "2FA"), /*#__PURE__*/React.createElement("th", null, "Last active"), /*#__PURE__*/React.createElement("th", null, "Since"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, LS.MEMBERS.map(m => /*#__PURE__*/React.createElement("tr", {
    key: m.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(AvS, {
    id: m.id,
    size: 22
  }), " ", /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 500
    }
  }, m.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "var(--muted)"
    }
  }, m.email)))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "role-pill role-" + m.role
  }, m.role)), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11.5,
      color: "var(--muted)"
    }
  }, m.auth), /*#__PURE__*/React.createElement("td", null, m.twofa ? /*#__PURE__*/React.createElement("span", {
    className: "pill s-active"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot-s active"
  }), "on") : /*#__PURE__*/React.createElement("span", {
    className: "pill",
    style: {
      color: "var(--muted)"
    }
  }, "off")), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11.5,
      color: "var(--muted)"
    }
  }, m.lastActive), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11.5,
      color: "var(--muted)"
    }
  }, m.since), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "top-btn",
    style: {
      padding: "3px 8px"
    }
  }, "Manage")))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary"
  }, /*#__PURE__*/React.createElement(IS, {
    name: "plus",
    size: 12
  }), " Invite external"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Export member list"))), /*#__PURE__*/React.createElement(SettingsSection, {
    title: "Risk-workflow library",
    hint: "JSON files in repo \xB7 \xA77.4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "workflow-list"
  }, [{
    key: "battery_safety_risk_v1",
    title: "Battery cell safety risk assessment",
    desc: "Walks through thermal runaway, electrolyte, voltage, and storage risks for cycling batches.",
    runs: 14,
    lastRun: "May 21"
  }, {
    key: "experimental_risk_v1",
    title: "Experimental risk assessment",
    desc: "Generic per-experiment risk: hazards, PPE, instrument scheduling, escalation.",
    runs: 22,
    lastRun: "May 24"
  }, {
    key: "project_risk_v1",
    title: "Project risk assessment",
    desc: "Scope, novelty, reproducibility, publication strategy, Plan B framing.",
    runs: 6,
    lastRun: "May 11"
  }].map(w => /*#__PURE__*/React.createElement("div", {
    key: w.key,
    className: "workflow-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "wf-title"
  }, w.title, " ", /*#__PURE__*/React.createElement("span", {
    className: "wf-key"
  }, w.key)), /*#__PURE__*/React.createElement("div", {
    className: "wf-desc"
  }, w.desc)), /*#__PURE__*/React.createElement("div", {
    className: "wf-stats"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "wf-stat-k"
  }, "runs"), " ", w.runs), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "wf-stat-k"
  }, "last"), " ", w.lastRun)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Inspect JSON")))))), /*#__PURE__*/React.createElement(SettingsSection, {
    title: "Audit log",
    hint: "Every API call \xB7 every AI tool call \xB7 every admin override \xB7 kept forever"
  }, /*#__PURE__*/React.createElement("table", {
    className: "audit-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "When"), /*#__PURE__*/React.createElement("th", null, "Actor"), /*#__PURE__*/React.createElement("th", null, "Via"), /*#__PURE__*/React.createElement("th", null, "Action"), /*#__PURE__*/React.createElement("th", null, "Resource"), /*#__PURE__*/React.createElement("th", null, "Status"))), /*#__PURE__*/React.createElement("tbody", null, LS.AUDIT.map((a, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted)"
    }
  }, a.ts), /*#__PURE__*/React.createElement("td", null, a.actor === "AI" ? /*#__PURE__*/React.createElement("span", {
    className: "ai-orb",
    style: {
      width: 16,
      height: 16,
      display: "inline-block",
      verticalAlign: -3
    }
  }) : /*#__PURE__*/React.createElement(AvS, {
    id: a.actor,
    size: 16
  }), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 6
    }
  }, a.actor)), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted)"
    }
  }, a.via), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11.5,
      color: "var(--ember)"
    }
  }, a.action), /*#__PURE__*/React.createElement("td", {
    style: {
      fontSize: 12.5
    }
  }, a.resource), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11.5,
      color: a.status >= 400 ? "var(--bad)" : "var(--good)"
    }
  }, a.status))))), /*#__PURE__*/React.createElement("button", {
    className: "top-btn",
    style: {
      marginTop: 10
    }
  }, "View full audit log \u2192")), /*#__PURE__*/React.createElement(SettingsSection, {
    title: "Backups",
    hint: "Nightly EBS snapshots \xB7 7-day retention"
  }, /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Last successful backup",
    sublabel: "Crash-consistent snapshot of the database EBS volume."
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      color: "var(--good)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot-s active"
  }), "May 26 \xB7 03:14 UTC")), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "RPO target",
    sublabel: "Worst-case data loss window."
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)"
    }
  }, "24 h")), /*#__PURE__*/React.createElement(SettingsRow, {
    label: "Restore drill",
    sublabel: "Last verified restore from snapshot."
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)"
    }
  }, "Apr 12, 2026")), /*#__PURE__*/React.createElement("p", {
    className: "set-note"
  }, "Upgrade path: switch to nightly ", /*#__PURE__*/React.createElement("code", null, "pg_dump \u2192 S3"), " (or ", /*#__PURE__*/React.createElement("code", null, "pgBackRest"), " WAL archiving) when data > 20 GB or uptime SLA matters (spec \xA78.1).")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}
Object.assign(window, {
  AccountPage,
  AdminPage
});
})();

/* === modals.jsx === */
(function(){
// modals.jsx — Share dialog · New sample form · New event form

const {
  Avatar: AvM,
  Icon: IM,
  LAB: LM
} = window;
function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-backdrop",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal" + (wide ? " modal-wide" : ""),
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-head"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h2", {
    className: "modal-title"
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    className: "modal-sub"
  }, subtitle)), /*#__PURE__*/React.createElement("button", {
    className: "modal-x",
    onClick: onClose,
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement(IM, {
    name: "x",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "modal-body"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "modal-foot"
  }, footer)));
}

/* ─── Share dialog ─────────────────────────────────────────────── */

function ShareModal({
  project,
  onClose
}) {
  const p = project || LM.PROJECTS[0];
  const collabs = (p.collaborators || ["MT", "JR", "SP", "KB", "DV"]).map(id => LM.MEMBERS.find(m => m.id === id) || LM.PEOPLE[id]);
  return /*#__PURE__*/React.createElement(ModalShell, {
    title: "Share " + p.name,
    subtitle: "Spec \xA75 \u2014 workspace + project roles compose by max(). Externals get local password accounts.",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "top-btn",
      onClick: onClose
    }, "Close"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("button", {
      className: "top-btn"
    }, "Copy link"), /*#__PURE__*/React.createElement("button", {
      className: "top-btn primary"
    }, "Send invites"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "share-vis"
  }, /*#__PURE__*/React.createElement("div", {
    className: "share-vis-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "share-vis-h"
  }, /*#__PURE__*/React.createElement("span", {
    className: "share-vis-glyph"
  }, "\u23E3"), " Workspace \xB7 all members can read"), /*#__PURE__*/React.createElement("div", {
    className: "share-vis-sub"
  }, "Everyone in Halide sees this project. Explicit collaborators below can edit.")), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Change visibility"))), /*#__PURE__*/React.createElement("div", {
    className: "share-add"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    placeholder: "invite by email or pick a member\u2026",
    style: {
      flex: 1,
      maxWidth: "none"
    }
  }), /*#__PURE__*/React.createElement("select", {
    className: "set-input",
    style: {
      maxWidth: 130
    }
  }, /*#__PURE__*/React.createElement("option", null, "Editor"), /*#__PURE__*/React.createElement("option", null, "Viewer")), /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary"
  }, "Invite")), /*#__PURE__*/React.createElement("div", {
    className: "share-hint"
  }, "Allow-listed domains for SSO: ", /*#__PURE__*/React.createElement("span", {
    className: "set-chip"
  }, "halide-lab.org"), " ", /*#__PURE__*/React.createElement("span", {
    className: "set-chip"
  }, "stanford.edu"), " ", /*#__PURE__*/React.createElement("span", {
    className: "set-chip"
  }, "caltech.edu"), ". Other emails will receive an external invite (local password)."), /*#__PURE__*/React.createElement("div", {
    className: "share-table"
  }, /*#__PURE__*/React.createElement("div", {
    className: "share-th"
  }, /*#__PURE__*/React.createElement("div", null, "Member"), /*#__PURE__*/React.createElement("div", null, "Access"), /*#__PURE__*/React.createElement("div", null, "Last active"), /*#__PURE__*/React.createElement("div", null)), collabs.filter(Boolean).map(m => /*#__PURE__*/React.createElement("div", {
    key: m.id,
    className: "share-tr"
  }, /*#__PURE__*/React.createElement("div", {
    className: "share-who"
  }, /*#__PURE__*/React.createElement(AvM, {
    id: m.id,
    size: 26
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "share-name"
  }, m.name), /*#__PURE__*/React.createElement("div", {
    className: "share-email"
  }, m.email || m.id + "@halide-lab.org"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("select", {
    className: "set-input",
    style: {
      maxWidth: 120,
      padding: "3px 8px",
      fontSize: 12.5
    }
  }, /*#__PURE__*/React.createElement("option", {
    selected: m.role === "owner"
  }, "Lead"), /*#__PURE__*/React.createElement("option", {
    selected: m.role === "admin" || m.role === "member"
  }, "Editor"), /*#__PURE__*/React.createElement("option", null, "Viewer"), /*#__PURE__*/React.createElement("option", null, "Remove"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11.5,
      color: "var(--muted)"
    }
  }, m.lastActive || "—"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, m.role === "external" && /*#__PURE__*/React.createElement("span", {
    className: "pill",
    style: {
      color: "var(--muted)"
    }
  }, "external")))), /*#__PURE__*/React.createElement("div", {
    className: "share-tr share-pending"
  }, /*#__PURE__*/React.createElement("div", {
    className: "share-who"
  }, /*#__PURE__*/React.createElement("div", {
    className: "share-pending-av"
  }, "@"), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "share-name"
  }, "rae.kim@stanford.edu"), /*#__PURE__*/React.createElement("div", {
    className: "share-email"
  }, "Invited May 23 \xB7 expires in 3 days"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "pill"
  }, "Editor (pending)")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11.5,
      color: "var(--muted)"
    }
  }, "\u2014"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn",
    style: {
      fontSize: 11.5
    }
  }, "Resend"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn",
    style: {
      fontSize: 11.5,
      color: "var(--bad)"
    }
  }, "Revoke")))), /*#__PURE__*/React.createElement("div", {
    className: "share-foot-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "share-vis-h",
    style: {
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement(IM, {
    name: "link",
    size: 12
  }), " Share-by-link"), /*#__PURE__*/React.createElement("div", {
    className: "share-vis-sub",
    style: {
      marginBottom: 10
    }
  }, "Anyone with the link can view (read-only). Disable to keep the project invite-only."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("code", {
    className: "share-link"
  }, "halide.app/p/", p.id, "?share=4f7c2a6e9d83"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Copy"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Rotate"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "sw-toggle on"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sw-knob"
  })))));
}

/* ─── New sample form ──────────────────────────────────────────── */

function NewSampleModal({
  project,
  onClose
}) {
  const p = project || LM.PROJECTS[0];
  const [kind, setKind] = React.useState("cell");
  const idPreview = {
    cell: "NMC-7B-cell-017",
    electrode: "NMC-7B-cathode-r4",
    precursor: "LPSCl-batch-23",
    derivative: "PM-cell-014-cs",
    module: "MOD-7B-01",
    other: "OTHER-001"
  }[kind];
  return /*#__PURE__*/React.createElement(ModalShell, {
    title: "New sample",
    subtitle: p.name + " · auto-id, freeform properties (spec §10)",
    onClose: onClose,
    wide: true,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "top-btn",
      onClick: onClose
    }, "Cancel"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("button", {
      className: "top-btn"
    }, "Save & add another"), /*#__PURE__*/React.createElement("button", {
      className: "top-btn primary"
    }, "Create sample"))
  }, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Kind",
    sublabel: "Determines lineage role and default properties."
  }, /*#__PURE__*/React.createElement("div", {
    className: "kind-picker"
  }, ["precursor", "electrode", "cell", "derivative", "module", "other"].map(k => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: "kind-card kind-" + k + (kind === k ? " on" : ""),
    onClick: () => setKind(k)
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill k-" + k
  }, k), /*#__PURE__*/React.createElement("span", {
    className: "kind-card-eg"
  }, k === "cell" && "e.g. coin cell, 2032", k === "electrode" && "e.g. cathode slurry, coated foil", k === "precursor" && "e.g. NMC powder, electrolyte", k === "derivative" && "e.g. post-mortem cross-section", k === "module" && "e.g. 4-cell pouch stack", k === "other" && "e.g. reference electrode, custom"))))), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Identifier",
    sublabel: "Auto-suggested from kind + project + next sequence. Editable."
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: idPreview,
    style: {
      fontFamily: "var(--mono)"
    }
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Name",
    sublabel: "Short, human-readable."
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: kind === "cell" ? "Coin cell, batch 7B, channel 17" : "",
    placeholder: "e.g. Coin cell, batch 7C, channel 1"
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Description",
    sublabel: "Optional. The AI extracts canonical fields from this prose (spec \xA710)."
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "set-input",
    rows: 3,
    placeholder: "What's special about this sample? Where in the lineage does it sit?"
  })), /*#__PURE__*/React.createElement("div", {
    className: "ns-properties"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ns-properties-h"
  }, "Properties", /*#__PURE__*/React.createElement("span", {
    className: "ns-properties-hint"
  }, "freeform JSONB \xB7 key/value \xB7 canonical schemas in v2")), kind === "cell" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Chemistry"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "NMC811 // LPSCl // Li-In",
    style: {
      fontFamily: "var(--mono)"
    }
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Mass (g)"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "11.4",
    style: {
      maxWidth: 160,
      fontFamily: "var(--mono)"
    }
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Capacity (mAh/g)"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    placeholder: "\u2014 measured after first formation cycle",
    style: {
      maxWidth: 280,
      fontFamily: "var(--mono)"
    }
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "V cutoff"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "4.30 V",
    style: {
      maxWidth: 160,
      fontFamily: "var(--mono)"
    }
  }))), kind === "electrode" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Chemistry"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "NMC811 + PVDF + Super C65",
    style: {
      fontFamily: "var(--mono)"
    }
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Loading (mg/cm\xB2)"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "12.4",
    style: {
      maxWidth: 160,
      fontFamily: "var(--mono)"
    }
  }))), kind === "precursor" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Chemistry"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    placeholder: "e.g. Li\u2086PS\u2085Cl",
    style: {
      fontFamily: "var(--mono)"
    }
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Mass (g)"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    placeholder: "\u2014",
    style: {
      maxWidth: 160,
      fontFamily: "var(--mono)"
    }
  })))), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Parent (derived from)",
    sublabel: "Sets up the lineage edge. Leave blank for root samples like precursors."
  }, /*#__PURE__*/React.createElement("div", {
    className: "sample-picker"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    placeholder: "search sample id\u2026",
    style: {
      flex: 1,
      maxWidth: "none"
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "sample-suggested"
  }, "Suggested: ", /*#__PURE__*/React.createElement("button", {
    className: "cf-person"
  }, "NMC-7B-cathode-r3")))), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Initial status"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-radio-group",
    style: {
      flexDirection: "row",
      gap: 8
    }
  }, ["active", "planned", "consumed", "failed"].map(s => /*#__PURE__*/React.createElement("label", {
    key: s,
    className: "cf-radio" + (s === "active" ? " on" : ""),
    style: {
      minWidth: 0,
      padding: "6px 10px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "cf-radio-dot"
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: 13
    }
  }, s)))))));
}

/* ─── New event form ───────────────────────────────────────────── */

function NewEventModal({
  onClose
}) {
  const [kind, setKind] = React.useState("meeting");
  const [recur, setRecur] = React.useState(false);
  return /*#__PURE__*/React.createElement(ModalShell, {
    title: "New event",
    subtitle: "Adds a row to your calendar. Lands in your .ics feed within ~12 h (Google) / ~15 min (Apple).",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "top-btn",
      onClick: onClose
    }, "Cancel"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("button", {
      className: "top-btn"
    }, "Save & add another"), /*#__PURE__*/React.createElement("button", {
      className: "top-btn primary"
    }, "Create event"))
  }, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Kind"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kind-picker"
  }, [{
    k: "meeting",
    l: "Meeting",
    d: "Group sync, PI weekly, handoff review"
  }, {
    k: "deadline",
    l: "Deadline",
    d: "Hard cutoff — report, submission"
  }, {
    k: "milestone",
    l: "Milestone",
    d: "Iteration boundary, project gate"
  }, {
    k: "reminder",
    l: "Reminder",
    d: "Maintenance window, calibration"
  }, {
    k: "custom",
    l: "Custom",
    d: "Anything else"
  }].map(o => /*#__PURE__*/React.createElement("button", {
    key: o.k,
    className: "kind-card kind-" + o.k + (kind === o.k ? " on" : ""),
    onClick: () => setKind(o.k)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: 15,
      color: "var(--ink)"
    }
  }, o.l), /*#__PURE__*/React.createElement("span", {
    className: "kind-card-eg"
  }, o.d))))), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Title"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Iter-7 cycling debrief",
    placeholder: "What is this event?"
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Project",
    sublabel: "Optional. Tags the event for project-scoped calendar feeds."
  }, /*#__PURE__*/React.createElement("select", {
    className: "set-input",
    style: {
      maxWidth: 340
    }
  }, /*#__PURE__*/React.createElement("option", null, "NMC811 Cathode Optimization"), /*#__PURE__*/React.createElement("option", null, "Sulfide Electrolyte Stability"), /*#__PURE__*/React.createElement("option", null, "Anode-Free Cell Architecture"), /*#__PURE__*/React.createElement("option", null, "SEI Formation Protocols"), /*#__PURE__*/React.createElement("option", null, "Post-Mortem Methodology"), /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\u2014 No project (workspace-only event)"))), /*#__PURE__*/React.createElement(FieldRow, {
    label: "When"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Jun 12, 2026",
    style: {
      maxWidth: 160
    }
  }), /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "10:00",
    style: {
      maxWidth: 90,
      fontFamily: "var(--mono)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--muted)"
    }
  }, "\u2192"), /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "11:00",
    style: {
      maxWidth: 90,
      fontFamily: "var(--mono)"
    }
  }), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12.5,
      color: "var(--muted)"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox"
  }), " All-day"))), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Location",
    sublabel: "Optional. Building / room / Zoom link."
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Building 3, Room 207 + Zoom"
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Attendees"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-people"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cf-person on"
  }, /*#__PURE__*/React.createElement(AvM, {
    id: "MT",
    size: 20
  }), " Mei Tanaka ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("span", {
    className: "cf-person on"
  }, /*#__PURE__*/React.createElement(AvM, {
    id: "JR",
    size: 20
  }), " Jules Reyes ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("span", {
    className: "cf-person on"
  }, /*#__PURE__*/React.createElement(AvM, {
    id: "SP",
    size: 20
  }), " Sam Patel ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("button", {
    className: "cf-person add"
  }, /*#__PURE__*/React.createElement(IM, {
    name: "plus",
    size: 11
  }), " Add attendee"))), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Recurrence",
    sublabel: "RFC 5545. Falls into everyone's .ics feed as a recurring entry."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: recur,
    onChange: e => setRecur(e.target.checked)
  }), " Repeats"), recur && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("select", {
    className: "set-input",
    style: {
      maxWidth: 160
    }
  }, /*#__PURE__*/React.createElement("option", null, "weekly"), /*#__PURE__*/React.createElement("option", null, "biweekly"), /*#__PURE__*/React.createElement("option", null, "monthly"), /*#__PURE__*/React.createElement("option", null, "custom")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: "var(--muted)"
    }
  }, "on"), /*#__PURE__*/React.createElement("div", {
    className: "dow-picker"
  }, ["S", "M", "T", "W", "T", "F", "S"].map((d, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    className: "dow" + (i === 3 ? " on" : "")
  }, d))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: "var(--muted)"
    }
  }, "until"), /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Aug 28, 2026",
    style: {
      maxWidth: 160
    }
  })))), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Description"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "set-input",
    rows: 3,
    placeholder: "Agenda preview, prep links, etc."
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Reminders"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "set-chip"
  }, "24 h before ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("span", {
    className: "set-chip"
  }, "10 min before ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("button", {
    className: "set-chip add"
  }, "+ Add reminder"))));
}
function FieldRow({
  label,
  sublabel,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "cf-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-field-l"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-field-label"
  }, label), sublabel && /*#__PURE__*/React.createElement("div", {
    className: "cf-field-sub"
  }, sublabel)), /*#__PURE__*/React.createElement("div", {
    className: "cf-field-r"
  }, children));
}
Object.assign(window, {
  ShareModal,
  NewSampleModal,
  NewEventModal
});
})();

/* === extras-views.jsx === */
(function(){
// extras-views.jsx — Templates page · Samples Cards view · Samples Lineage graph

const {
  Avatar: AvX,
  Icon: IX,
  LAB: LX
} = window;

/* ─── TEMPLATES (risk workflow library detail) ─────────────────── */

const WORKFLOWS = {
  battery_safety_risk_v1: {
    title: "Battery cell safety risk assessment",
    scope: "system",
    description: "Walks through thermal-runaway, electrolyte handling, voltage / SoC range, and storage risks for cycling batches. Output is the structured risk register that lands on the project or iteration.",
    runs: 14,
    lastRun: "May 21 · 18:22 by JR",
    steps: [{
      id: "sample_context",
      type: "gather_context",
      body: "Pull sample, sample_lineage, recent_experiments, related_artifacts, recent_iteration_pages."
    }, {
      id: "thermal_runaway",
      type: "ai_question",
      body: "Given the sample chemistry and recent cycling artifacts, assess thermal runaway risk on a 1–5 scale and list mitigations."
    }, {
      id: "electrolyte_handling",
      type: "ai_question",
      body: "Given the electrolyte choice and recent dry-room SOPs, assess handling risk."
    }, {
      id: "voltage_window",
      type: "ai_question",
      body: "Given the requested cutoff vs validated window, assess voltage / SoC range risk."
    }, {
      id: "mechanical_assembly",
      type: "ai_question",
      body: "Given the recent assembly history (separator-lot QA, cell builds), assess mechanical risk."
    }, {
      id: "summary",
      type: "ai_synthesis",
      body: "Combine the four structured ratings into a single risk register. Order by impact severity. Emit flagged_for_PI_review per the rule: any HIGH likelihood + KILLS impact triggers it, OR the AI may raise the flag directly."
    }],
    outputSchema: {
      flagged_for_PI_review: "boolean",
      items: "list[{ risk:{title,description}, likelihood:'low'|'medium'|'high', impact:{tone,headline,description}, mitigation:string }]",
      summary: "string"
    }
  },
  experimental_risk_v1: {
    title: "Experimental risk assessment",
    scope: "system",
    description: "Generic per-experiment risk: hazards, PPE, instrument scheduling, escalation. Used for syntheses, post-mortems, and instrument-heavy experiments.",
    runs: 22,
    lastRun: "May 24 · 10:15 by SP",
    steps: [{
      id: "experiment_context",
      type: "gather_context",
      body: "Pull experiment method, related samples, prior identical experiments, instrument calibration history."
    }, {
      id: "hazards",
      type: "ai_question",
      body: "What hazards does this experiment introduce? (chemical, electrical, mechanical, thermal)"
    }, {
      id: "ppe_scheduling",
      type: "ai_question",
      body: "Assess PPE requirements, instrument scheduling conflicts, and operator-experience match."
    }, {
      id: "escalation",
      type: "ai_question",
      body: "What conditions warrant halting the experiment? Set the abort criteria."
    }, {
      id: "summary",
      type: "ai_synthesis",
      body: "Output the structured risk register; flag for PI if any HIGH+KILLS."
    }],
    outputSchema: {
      flagged_for_PI_review: "boolean",
      items: "list[risk_item]",
      abort_criteria: "list[string]"
    }
  },
  project_risk_v1: {
    title: "Project risk assessment",
    scope: "system",
    description: "Scope, novelty, reproducibility, and publication strategy. Used at project kickoff and before major milestones.",
    runs: 6,
    lastRun: "May 11 · 16:42 by MT",
    steps: [{
      id: "project_context",
      type: "gather_context",
      body: "Pull project description, prior iterations, related projects, lab equipment availability."
    }, {
      id: "reproducibility",
      type: "ai_question",
      body: "Assess sample-to-sample variation risk."
    }, {
      id: "bandwidth",
      type: "ai_question",
      body: "Assess team bandwidth / scheduling conflicts with active work."
    }, {
      id: "sourcing",
      type: "ai_question",
      body: "Assess supplier / sourcing risks for any materials not in-house."
    }, {
      id: "publication",
      type: "ai_question",
      body: "Assess publication strategy: novelty, target venue, plan B."
    }, {
      id: "summary",
      type: "ai_synthesis",
      body: "Synthesize into the structured risk register."
    }],
    outputSchema: {
      flagged_for_PI_review: "boolean",
      items: "list[risk_item]",
      plan_b: "string"
    }
  }
};
function syntaxHighlightJSON(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/("[^"]+")(\s*:)/g, '<span class="k">$1</span>$2').replace(/:\s*("[^"]*")/g, ': <span class="s">$1</span>').replace(/:\s*(true|false|null|\d+(?:\.\d+)?)/g, ': <span class="n">$1</span>');
}
function TemplatePage({
  key: templateKey,
  setRoute
}) {
  const t = WORKFLOWS[templateKey];
  if (!t) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "tpl-page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cal-head"
  }, /*#__PURE__*/React.createElement("h2", null, t.title), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted-2)",
      textTransform: "uppercase",
      letterSpacing: ".06em"
    }
  }, "workflow template"), /*#__PURE__*/React.createElement("div", {
    className: "right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, /*#__PURE__*/React.createElement(IX, {
    name: "history",
    size: 12
  }), " Run history"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ai-orb",
    style: {
      width: 11,
      height: 11
    }
  }), " Run on\u2026"))), /*#__PURE__*/React.createElement("div", {
    className: "tpl-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tpl-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tpl-meta-pill",
    style: {
      color: "var(--ember)"
    }
  }, templateKey), /*#__PURE__*/React.createElement("span", null, "scope \xB7 ", t.scope), /*#__PURE__*/React.createElement("span", null, "\xB7"), /*#__PURE__*/React.createElement("span", null, t.runs, " runs to date"), /*#__PURE__*/React.createElement("span", null, "\xB7"), /*#__PURE__*/React.createElement("span", null, "last run ", t.lastRun)), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--muted)",
      fontSize: 14,
      lineHeight: 1.6,
      maxWidth: 680,
      marginTop: 14,
      marginBottom: 0,
      textWrap: "pretty"
    }
  }, t.description)), /*#__PURE__*/React.createElement("div", {
    className: "section-h",
    style: {
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 14
    }
  }, "Steps"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, t.steps.length, " total")), t.steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    className: "tpl-step"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tpl-step-h"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tpl-step-n"
  }, i + 1), /*#__PURE__*/React.createElement("span", {
    className: "tpl-step-title"
  }, s.id), /*#__PURE__*/React.createElement("span", {
    className: "tpl-step-type"
  }, s.type)), /*#__PURE__*/React.createElement("div", {
    className: "tpl-step-body"
  }, s.body))), /*#__PURE__*/React.createElement("div", {
    className: "section-h",
    style: {
      marginTop: 28
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 14
    }
  }, "Output schema"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "validated \xB7 \xA77.4")), /*#__PURE__*/React.createElement("pre", {
    className: "tpl-json",
    dangerouslySetInnerHTML: {
      __html: syntaxHighlightJSON(t.outputSchema)
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "set-note",
    style: {
      marginTop: 18
    }
  }, "Loaded from ", /*#__PURE__*/React.createElement("code", null, "/workflows/", templateKey, ".json"), " at server boot. Edit the JSON in the repo to change behavior; admins can re-deploy without a database migration (spec \xA77.4)."), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}

/* ─── SAMPLES — Cards view ─────────────────────────────────────── */

function SamplesCardsView({
  project,
  setRoute
}) {
  const samples = LX.SAMPLES;
  const byKind = {
    cell: samples.filter(s => s.kind === "cell"),
    electrode: samples.filter(s => s.kind === "electrode"),
    precursor: samples.filter(s => s.kind === "precursor"),
    derivative: samples.filter(s => s.kind === "derivative")
  };
  const openS = id => setRoute({
    view: "entity",
    entityType: "sample",
    entityId: id,
    projectId: project.id
  });
  return /*#__PURE__*/React.createElement(React.Fragment, null, Object.entries(byKind).filter(([, arr]) => arr.length > 0).map(([k, arr]) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: k
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-h",
    style: {
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 14
    }
  }, k, "s"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, arr.length, " total")), /*#__PURE__*/React.createElement("div", {
    className: "sc-grid"
  }, arr.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    className: "sc-card",
    onClick: () => openS(s.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: "sc-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill k-" + s.kind
  }, s.kind), /*#__PURE__*/React.createElement("span", {
    className: "pill s-" + s.status
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot-s " + s.status
  }), s.status)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sc-id"
  }, s.id), /*#__PURE__*/React.createElement("div", {
    className: "sc-name"
  }, s.name)), /*#__PURE__*/React.createElement("div", {
    className: "sc-props"
  }, s.chem && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "sc-prop-k"
  }, "chem"), " ", /*#__PURE__*/React.createElement("span", {
    className: "sc-prop-v"
  }, s.chem)), s.mass && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "sc-prop-k"
  }, "mass"), " ", /*#__PURE__*/React.createElement("span", {
    className: "sc-prop-v"
  }, s.mass)), s.cap && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "sc-prop-k"
  }, "capacity"), " ", /*#__PURE__*/React.createElement("span", {
    className: "sc-prop-v"
  }, s.cap)), s.load && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "sc-prop-k"
  }, "loading"), " ", /*#__PURE__*/React.createElement("span", {
    className: "sc-prop-v"
  }, s.load)), s.v && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "sc-prop-k"
  }, "V cutoff"), " ", /*#__PURE__*/React.createElement("span", {
    className: "sc-prop-v"
  }, s.v))), /*#__PURE__*/React.createElement("div", {
    className: "sc-foot"
  }, /*#__PURE__*/React.createElement("span", null, s.parent ? /*#__PURE__*/React.createElement(React.Fragment, null, "derived from ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ember)"
    }
  }, s.parent)) : "root sample"), /*#__PURE__*/React.createElement("span", null, "Open \u2192"))))))));
}

/* ─── SAMPLES — Lineage graph ─────────────────────────────────── */

function SamplesLineageView({
  project,
  setRoute
}) {
  // Position nodes manually in a tree layout
  // Levels: precursor (col 0), electrode (col 1), cell (col 2), derivative (col 3)
  const COL_W = 220;
  const ROW_H = 64;
  const NODE_W = 180;
  const NODE_H = 46;
  const PAD = 30;

  // Define positions for each sample manually based on the lineage tree we know.
  const positions = {
    // Precursors (column 0)
    "NMC811-pwd-04": {
      col: 0,
      row: 1
    },
    "LPSCl-batch-22": {
      col: 0,
      row: 5
    },
    // Electrodes (column 1)
    "NMC-7B-cathode-r3": {
      col: 1,
      row: 1
    },
    // Cells (column 2)
    "NMC-7B-cell-014": {
      col: 2,
      row: 0
    },
    "NMC-7B-cell-015": {
      col: 2,
      row: 1
    },
    "NMC-7B-cell-016": {
      col: 2,
      row: 2
    },
    // Derivatives (column 3)
    "PM-cell-014-cs": {
      col: 3,
      row: 0
    }
  };
  const samples = LX.SAMPLES;
  const w = COL_W * 4 + PAD * 2;
  const h = ROW_H * 7 + PAD * 2;
  function nodeXY(id) {
    const p = positions[id];
    if (!p) return null;
    return {
      x: PAD + p.col * COL_W,
      y: PAD + p.row * ROW_H
    };
  }
  const openS = id => setRoute({
    view: "entity",
    entityType: "sample",
    entityId: id,
    projectId: project.id
  });

  // Edges: child.parent → child
  const edges = samples.filter(s => s.parent && positions[s.id] && positions[s.parent]).map(s => ({
    from: s.parent,
    to: s.id,
    kind: s.kind === "derivative" ? "derived" : "assembled"
  }));

  // Color for kind
  const kindColor = k => ({
    precursor: "var(--pill-precursor-bg)",
    electrode: "var(--pill-electrode-bg)",
    cell: "var(--pill-cell-bg)",
    derivative: "var(--pill-deriv-bg)"
  })[k] || "var(--paper-2)";
  const kindBorder = k => ({
    precursor: "#6a5a32",
    electrode: "#2c5b6a",
    cell: "var(--ember)",
    derivative: "#5a3e7a"
  })[k] || "var(--line)";
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "lineage-legend"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lineage-legend-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill k-precursor"
  }, "precursor"), " root inputs (powder, electrolyte)"), /*#__PURE__*/React.createElement("span", {
    className: "lineage-legend-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill k-electrode"
  }, "electrode"), " coated foils"), /*#__PURE__*/React.createElement("span", {
    className: "lineage-legend-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill k-cell"
  }, "cell"), " assembled coin / pouch"), /*#__PURE__*/React.createElement("span", {
    className: "lineage-legend-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill k-derivative"
  }, "derivative"), " post-mortem, cross-section")), /*#__PURE__*/React.createElement("div", {
    className: "lineage-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lineage-svg-wrap"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${w} ${h}`,
    style: {
      width: "100%",
      height: h,
      display: "block"
    }
  }, ["Precursors", "Electrodes", "Cells", "Derivatives"].map((label, i) => /*#__PURE__*/React.createElement("text", {
    key: i,
    x: PAD + i * COL_W + NODE_W / 2,
    y: 18,
    fontFamily: "var(--mono)",
    fontSize: "10",
    fill: "var(--muted-2)",
    textAnchor: "middle",
    letterSpacing: ".06em",
    style: {
      textTransform: "uppercase"
    }
  }, label.toUpperCase())), edges.map((e, i) => {
    const from = nodeXY(e.from);
    const to = nodeXY(e.to);
    if (!from || !to) return null;
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const midX = (x1 + x2) / 2;
    const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("path", {
      d: d,
      className: "ln-edge"
    }), /*#__PURE__*/React.createElement("text", {
      x: midX,
      y: (y1 + y2) / 2 - 4,
      className: "ln-edge-label",
      textAnchor: "middle"
    }, e.kind === "derived" ? "DERIVED_FROM" : "ASSEMBLED_INTO"));
  }), samples.filter(s => positions[s.id]).map(s => {
    const pos = nodeXY(s.id);
    return /*#__PURE__*/React.createElement("g", {
      key: s.id,
      className: "ln-node",
      transform: `translate(${pos.x},${pos.y})`,
      onClick: () => openS(s.id),
      style: {
        cursor: "default"
      }
    }, /*#__PURE__*/React.createElement("rect", {
      width: NODE_W,
      height: NODE_H,
      rx: "6",
      ry: "6",
      style: {
        fill: kindColor(s.kind),
        stroke: kindBorder(s.kind),
        strokeWidth: s.status === "failed" ? 1.5 : 1
      }
    }), s.status === "failed" && /*#__PURE__*/React.createElement("line", {
      x1: "0",
      y1: "0",
      x2: NODE_W,
      y2: NODE_H,
      stroke: "var(--bad)",
      strokeWidth: "1",
      opacity: "0.5"
    }), /*#__PURE__*/React.createElement("text", {
      x: "10",
      y: "18",
      className: "ln-name"
    }, s.id), /*#__PURE__*/React.createElement("text", {
      x: "10",
      y: "34",
      className: "ln-sub"
    }, (s.chem || s.name).slice(0, 26)), s.status !== "active" && /*#__PURE__*/React.createElement("text", {
      x: NODE_W - 8,
      y: "14",
      fontFamily: "var(--mono)",
      fontSize: "9",
      fill: s.status === "failed" ? "var(--bad)" : "var(--muted)",
      textAnchor: "end",
      style: {
        textTransform: "uppercase",
        letterSpacing: ".06em"
      }
    }, s.status));
  })))), /*#__PURE__*/React.createElement("div", {
    className: "set-note",
    style: {
      marginTop: 14
    }
  }, "Click any node to open the sample page. ", /*#__PURE__*/React.createElement("code", null, "SampleRelation"), " rows drive this graph (spec \xA74) \u2014 ", /*#__PURE__*/React.createElement("code", null, "derived_from"), ", ", /*#__PURE__*/React.createElement("code", null, "assembled_into"), ", ", /*#__PURE__*/React.createElement("code", null, "split_from"), ", ", /*#__PURE__*/React.createElement("code", null, "tested_as"), ", ", /*#__PURE__*/React.createElement("code", null, "duplicate_of"), "."));
}
Object.assign(window, {
  TemplatePage,
  SamplesCardsView,
  SamplesLineageView
});
})();

/* === create-flows.jsx === */
(function(){
// create-flows.jsx — Two-page wizard for new project/iteration
// Page 1 = description, Page 2 = AI risk-assessment walkthrough.

const {
  Avatar: AvC,
  Icon: IC2,
  LAB: LC2
} = window;

/* ─── shared primitives ───────────────────────────────────────── */

function WizardStepper({
  step,
  steps
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "wiz-stepper"
  }, steps.map((s, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "wiz-step" + (i + 1 === step ? " on" : i + 1 < step ? " done" : "")
  }, /*#__PURE__*/React.createElement("span", {
    className: "wiz-step-n"
  }, i + 1 < step ? "✓" : i + 1), /*#__PURE__*/React.createElement("span", {
    className: "wiz-step-l"
  }, s)), i < steps.length - 1 && /*#__PURE__*/React.createElement("div", {
    className: "wiz-step-sep"
  }))));
}
function FormSection({
  n,
  title,
  hint,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "cf-sect"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-sect-h"
  }, n != null && /*#__PURE__*/React.createElement("span", {
    className: "cf-sect-n"
  }, n), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h3", null, title), hint && /*#__PURE__*/React.createElement("div", {
    className: "cf-sect-hint"
  }, hint))), /*#__PURE__*/React.createElement("div", {
    className: "cf-sect-body"
  }, children));
}
function FieldRow({
  label,
  sublabel,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "cf-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-field-l"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-field-label"
  }, label), sublabel && /*#__PURE__*/React.createElement("div", {
    className: "cf-field-sub"
  }, sublabel)), /*#__PURE__*/React.createElement("div", {
    className: "cf-field-r"
  }, children));
}

/* ─── AI walkthrough renderer ─────────────────────────────────── */

function WalkthroughStep({
  n,
  kind,
  title,
  status,
  durMs,
  expanded,
  onToggle,
  children
}) {
  const kindMeta = {
    gather_context: {
      l: "gather_context",
      c: "step-ctx"
    },
    ai_question: {
      l: "ai_question",
      c: "step-q"
    },
    ai_synthesis: {
      l: "ai_synthesis",
      c: "step-s"
    }
  }[kind] || {
    l: kind,
    c: "step-ctx"
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "wt-step wt-" + (status || "done")
  }, /*#__PURE__*/React.createElement("button", {
    className: "wt-head",
    onClick: onToggle
  }, /*#__PURE__*/React.createElement("span", {
    className: "wt-n"
  }, n), /*#__PURE__*/React.createElement("span", {
    className: "wt-name"
  }, title), /*#__PURE__*/React.createElement("span", {
    className: "wt-kind " + kindMeta.c
  }, kindMeta.l), /*#__PURE__*/React.createElement("span", {
    className: "wt-meta"
  }, status === "done" && /*#__PURE__*/React.createElement("span", {
    className: "wt-done"
  }, "\u2713 done"), durMs != null && /*#__PURE__*/React.createElement("span", {
    className: "wt-dur"
  }, (durMs / 1000).toFixed(1), "s")), /*#__PURE__*/React.createElement("span", {
    className: "wt-chev"
  }, expanded ? "▾" : "▸")), expanded && /*#__PURE__*/React.createElement("div", {
    className: "wt-body"
  }, children));
}
function RiskWalkthrough({
  flavor,
  finalTable
}) {
  // flavor: "project" | "iteration"
  const [open, setOpen] = React.useState({
    s1: true,
    s2: false,
    s3: false,
    s4: false,
    s5: true
  });
  const tog = k => setOpen(o => ({
    ...o,
    [k]: !o[k]
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: "walkthrough"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-head-card"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ai-orb",
    style: {
      width: 20,
      height: 20,
      flex: "0 0 20px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-wf"
  }, /*#__PURE__*/React.createElement("strong", null, flavor === "project" ? "project_risk_v1" : "battery_safety_risk_v1"), /*#__PURE__*/React.createElement("span", {
    className: "wt-sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "claude-sonnet-4.5"), /*#__PURE__*/React.createElement("span", {
    className: "wt-sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "15.6 s total"), /*#__PURE__*/React.createElement("span", {
    className: "wt-sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "$0.07")), /*#__PURE__*/React.createElement("div", {
    className: "wt-sub"
  }, "Walkthrough below shows every step the workflow ran. Open any step to inspect or override the AI's reasoning.")), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ai-orb",
    style: {
      width: 11,
      height: 11
    }
  }), " Re-run workflow")), /*#__PURE__*/React.createElement(WalkthroughStep, {
    n: 1,
    kind: "gather_context",
    title: "Pull context from the project",
    durMs: 2100,
    status: "done",
    expanded: open.s1,
    onToggle: () => tog("s1")
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-ctx-grid"
  }, [{
    k: "sample",
    l: "3 cells on test",
    v: "NMC-7B-cell-014 · 015 · 016"
  }, {
    k: "sample",
    l: "Cathode coating",
    v: "NMC-7B-cathode-r3 (12.4 mg/cm²)"
  }, {
    k: "experiment",
    l: "Recent experiments",
    v: "EX-211 cycling · EX-209 EIS · EX-205 SEM"
  }, {
    k: "artifact",
    l: "Linked artifacts",
    v: "Maxwell cycling report w22 · post-mortem SEM × 2 · EIS notebook"
  }, {
    k: "page",
    l: "Iteration page",
    v: "Iter-7 · Week 22 cycling notes (rev #84)"
  }, {
    k: "page",
    l: "Prior risk register",
    v: "iter-6 (overall pass) · iter-5 (drying SOP only)"
  }, {
    k: "meeting",
    l: "PI weekly · Week 22",
    v: "Discussion: cell-016 short, batch-7B QA gap"
  }, {
    k: "audit",
    l: "Recent audit",
    v: "page.update × 4 · risk.run × 1 · workflow approved by JR"
  }].map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "wt-ctx wt-ctx-" + c.k
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-ctx-k"
  }, c.l), /*#__PURE__*/React.createElement("div", {
    className: "wt-ctx-v"
  }, c.v))))), /*#__PURE__*/React.createElement(WalkthroughStep, {
    n: 2,
    kind: "ai_question",
    title: flavor === "iteration" ? "Voltage cutoff vs validated window" : "Reproducibility risk",
    durMs: 4800,
    status: "done",
    expanded: open.s2,
    onToggle: () => tog("s2")
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-prompt"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wt-prompt-l"
  }, "Prompt"), /*#__PURE__*/React.createElement("p", null, flavor === "iteration" ? /*#__PURE__*/React.createElement(React.Fragment, null, "Given the sample chemistry (NMC811 \xB7 LPSCl \xB7 Li-In), recent cycling artifacts showing +12\xA0\u03A9 Rct shift at 4.30\xA0V, and the requested 4.35\xA0V upper cutoff, assess ", /*#__PURE__*/React.createElement("strong", null, "thermal-runaway risk on a 1\u20135 scale"), " and list mitigations. Cite the artifact IDs you used.") : /*#__PURE__*/React.createElement(React.Fragment, null, "Given that this is an early-stage LFP baseline project with three intended cells and no prior in-lab LFP synthesis, assess ", /*#__PURE__*/React.createElement("strong", null, "reproducibility risk (sample-to-sample variation)"), " on a 1\u20135 scale and frame the worst-case publishing impact."))), /*#__PURE__*/React.createElement("div", {
    className: "wt-out"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-out-h"
  }, "Structured output"), /*#__PURE__*/React.createElement("pre", {
    className: "wt-out-pre"
  }, flavor === "iteration" ? `{
  "rating": 5,
  "likelihood": "high",
  "impact_tone": "bad",
  "impact_headline": "Kills the project",
  "rationale": "Each 50 mV step past the validated window roughly doubles dendrite probability per published Caltech data; iter-7 already at +12 Ω.",
  "mitigations": [
    "Cycle in thermal chamber with auto-abort at +2 °C delta",
    "PI sign-off required before first formation cycle"
  ],
  "citations": ["EX-209", "EX-205", "ar_11 (Safety-review-iter6.pdf)"]
}` : `{
  "rating": 3,
  "likelihood": "medium",
  "impact_tone": "warn",
  "impact_headline": "Lowers paper rigor",
  "rationale": "Without an in-house LFP synthesis the lab depends on a single commercial source; lot-to-lot variation will be the dominant noise term.",
  "mitigations": [
    "Source from single MTI Corp lot for paper 1",
    "Run 6+ cells per condition"
  ],
  "citations": ["batch-7B-QA-note", "p_nmc/iter-4 coater-calibration"]
}`)), /*#__PURE__*/React.createElement("div", {
    className: "wt-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Edit answer"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Re-ask with more context"))), /*#__PURE__*/React.createElement(WalkthroughStep, {
    n: 3,
    kind: "ai_question",
    title: flavor === "iteration" ? "Reproducibility of iter-7 result" : "Bandwidth conflict with active work",
    durMs: 3700,
    status: "done",
    expanded: open.s3,
    onToggle: () => tog("s3")
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-prompt"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wt-prompt-l"
  }, "Prompt"), /*#__PURE__*/React.createElement("p", null, flavor === "iteration" ? "Iter-7 closes Jun 12 and the impedance saturation criterion is not yet locked. Iter-10 is scheduled to start Jul 28. Assess the timing risk if iter-7 doesn't conclusively settle the trend." : "Project lead JR is also iter-7 lead; cycling channels 1–8 are booked through Jun 12 (~3 weeks of overlap). Assess the bandwidth-conflict risk for this new LFP project.")), /*#__PURE__*/React.createElement("div", {
    className: "wt-out"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-out-h"
  }, "Structured output"), /*#__PURE__*/React.createElement("pre", {
    className: "wt-out-pre"
  }, flavor === "iteration" ? `{
  "rating": 3,
  "likelihood": "medium",
  "impact_tone": "warn",
  "impact_headline": "Lowers paper rigor",
  "rationale": "Reviewers will ask 'did iter-7 justify the escalation?' If iter-7 trend changes mid-iter-10, the result looks reactive.",
  "mitigations": [
    "Pre-register the iter-7 saturation criterion",
    "Drop iter-10 to 4.32 V if iter-7 doesn't settle"
  ],
  "citations": ["iter-7 risk register #2", "EX-209"]
}` : `{
  "rating": 3,
  "likelihood": "medium",
  "impact_tone": "warn",
  "impact_headline": "Lowers paper rigor",
  "rationale": "Squeezed timelines lead to rushed cell builds; sample variation creeps up.",
  "mitigations": [
    "Move LFP cycling to channels 9–16 (currently idle)",
    "Stagger build week with iter-7 close-out"
  ],
  "citations": ["cycling-rig-schedule"]
}`)), /*#__PURE__*/React.createElement("div", {
    className: "wt-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Edit answer"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Re-ask"))), /*#__PURE__*/React.createElement(WalkthroughStep, {
    n: 4,
    kind: "ai_question",
    title: flavor === "iteration" ? "Caltech replication extrapolation" : "Sourcing / supplier risk",
    durMs: 3000,
    status: "done",
    expanded: open.s4,
    onToggle: () => tog("s4")
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-prompt"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wt-prompt-l"
  }, "Prompt"), /*#__PURE__*/React.createElement("p", null, flavor === "iteration" ? "Caltech (HQ) has 4.25 V data; iter-7 has 4.30 V data. The proposal extrapolates to 4.35 V — assess linearity assumption risk." : "No in-house LFP synthesis. Commercial sources: MTI Corp LFP-A2 (used at Caltech), Targray (untested in-lab). Assess sourcing risk.")), /*#__PURE__*/React.createElement("div", {
    className: "wt-out"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-out-h"
  }, "Structured output"), /*#__PURE__*/React.createElement("pre", {
    className: "wt-out-pre"
  }, flavor === "iteration" ? `{
  "rating": 2,
  "likelihood": "low",
  "impact_tone": "warn",
  "impact_headline": "Lowers novelty",
  "rationale": "Two data points (4.25 V, 4.30 V) is thin for linear extrapolation; nonlinearity would mute the headline finding.",
  "mitigations": ["Pull Caltech raw data via MOU before iter-10 start", "Plan B: pivot to 4.32 V"]
}` : `{
  "rating": 2,
  "likelihood": "low",
  "impact_tone": "warn",
  "impact_headline": "Delays kickoff by 1–2 weeks",
  "rationale": "Schedule slip, no safety or scientific impact.",
  "mitigations": ["MTI Corp LFP-A2 for first batch", "Targray in parallel evaluation"]
}`))), /*#__PURE__*/React.createElement(WalkthroughStep, {
    n: 5,
    kind: "ai_synthesis",
    title: "Synthesize risk register",
    durMs: 2000,
    status: "done",
    expanded: open.s5,
    onToggle: () => tog("s5")
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-prompt"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wt-prompt-l"
  }, "Prompt"), /*#__PURE__*/React.createElement("p", null, "Combine the three structured ratings above into a single register row per risk. Drop overlapping items, order by impact severity then likelihood. Emit a ", /*#__PURE__*/React.createElement("code", null, "flagged_for_PI_review"), " boolean per the workflow's rule (any HIGH+KILLS triggers it).")), /*#__PURE__*/React.createElement("div", {
    className: "wt-out"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wt-out-h"
  }, "Validated output (matches outputSchema)"), /*#__PURE__*/React.createElement("div", {
    className: "wt-syn-meta"
  }, /*#__PURE__*/React.createElement("span", null, flavor === "iteration" ? "3" : "3", " items \xB7 ", flavor === "iteration" ? "1 HIGH" : "2 MEDIUM", " \xB7 ", flavor === "iteration" ? "flagged for PI ⚑" : "no PI escalation"))), /*#__PURE__*/React.createElement("div", {
    className: "wt-final-label"
  }, "Final risk register \xB7 ready to save"), finalTable));
}

/* ─── final risk tables for the two flows ─────────────────────── */

function NewProjectRiskTable() {
  return /*#__PURE__*/React.createElement("div", {
    className: "risk-card",
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "risk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "rt-col-num"
  }, "#"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-risk"
  }, "Risk"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-like"
  }, "Likelihood"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-impact"
  }, "Impact if it hits"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-mit"
  }, "Mitigation / Plan B"))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "rt-col-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rt-num"
  }, "1")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-title"
  }, "Project is too obvious to publish"), /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-desc"
  }, "LFP at 4.0 V is well-trodden; reviewers may ask \"what's new?\"")), /*#__PURE__*/React.createElement("td", {
    className: "rt-col-like"
  }, /*#__PURE__*/React.createElement("span", {
    className: "like-pill like-medium"
  }, "MEDIUM")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-head rt-impact-warn"
  }, "Lowers novelty"), /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-desc"
  }, "Falls back to a methods paper or supplementary material to NMC811.")), /*#__PURE__*/React.createElement("td", null, "Position as the baseline for the NMC811 paper, not a standalone result. ACS Applied Energy Materials instead of Nature Energy.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "rt-col-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rt-num"
  }, "2")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-title"
  }, "Bandwidth conflict with iter-7 cycling"), /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-desc"
  }, "JR is iter-7 lead; cycling channels 1\u20138 booked through Jun 12.")), /*#__PURE__*/React.createElement("td", {
    className: "rt-col-like"
  }, /*#__PURE__*/React.createElement("span", {
    className: "like-pill like-medium"
  }, "MEDIUM")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-head rt-impact-warn"
  }, "Lowers paper rigor"), /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-desc"
  }, "Squeezed timelines lead to rushed cell builds; sample-to-sample variation spreads.")), /*#__PURE__*/React.createElement("td", null, "Move LFP cycling to channels 9\u201316 (currently idle). Stagger build week with iter-7 close-out.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "rt-col-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rt-num"
  }, "3")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-title"
  }, "No baseline LFP supplier identified"), /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-desc"
  }, "Lab has no in-house LFP synthesis; commercial source not yet sourced.")), /*#__PURE__*/React.createElement("td", {
    className: "rt-col-like"
  }, /*#__PURE__*/React.createElement("span", {
    className: "like-pill like-low"
  }, "LOW")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-head rt-impact-warn"
  }, "Delays kickoff by 1\u20132 weeks"), /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-desc"
  }, "Schedule slip; no impact on safety or scientific claim.")), /*#__PURE__*/React.createElement("td", null, "Source MTI Corp LFP-A2 (used by Caltech) for first batch. In parallel, evaluate Targray.")))));
}
function NewIterationRiskTable() {
  return /*#__PURE__*/React.createElement("div", {
    className: "risk-card",
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "risk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "rt-col-num"
  }, "#"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-risk"
  }, "Risk"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-like"
  }, "Likelihood"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-impact"
  }, "Impact if it hits"), /*#__PURE__*/React.createElement("th", {
    className: "rt-col-mit"
  }, "Mitigation / Plan B"))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "rt-col-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rt-num"
  }, "1")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-title"
  }, "4.35 V exceeds the validated NMC811 window"), /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-desc"
  }, "Iter-7 already saw +12 \u03A9 Rct at 4.30 V. Each 50 mV step doubles dendrite probability per published Caltech data.")), /*#__PURE__*/React.createElement("td", {
    className: "rt-col-like"
  }, /*#__PURE__*/React.createElement("span", {
    className: "like-pill like-high"
  }, "HIGH")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-head rt-impact-bad"
  }, "Kills the project"), /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-desc"
  }, "A short-induced thermal event in the dry-room halts iter-9 and forces a multi-week safety review.")), /*#__PURE__*/React.createElement("td", null, "Cycle in thermal chamber with auto-abort at +2 \xB0C delta. Mandatory PI sign-off before first formation cycle (already flagged \u2197).")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "rt-col-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rt-num"
  }, "2")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-title"
  }, "Iter-7 data isn't yet conclusive"), /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-desc"
  }, "Iter-7 closes Jun 12; you're scheduling iter-10 before the impedance trend is settled.")), /*#__PURE__*/React.createElement("td", {
    className: "rt-col-like"
  }, /*#__PURE__*/React.createElement("span", {
    className: "like-pill like-medium"
  }, "MEDIUM")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-head rt-impact-warn"
  }, "Lowers paper rigor"), /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-desc"
  }, "Reviewers will ask \"did iter-7 justify the escalation?\" If the trend changes, iter-10 looks reactive.")), /*#__PURE__*/React.createElement("td", null, "Pre-register the iter-7 saturation criterion. If Rct saturates by cycle 50, proceed. If not, drop iter-10 to 4.32 V.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "rt-col-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rt-num"
  }, "3")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-title"
  }, "Caltech 4.25 V data may not replicate at 4.35 V"), /*#__PURE__*/React.createElement("div", {
    className: "rt-risk-desc"
  }, "Extrapolating two data points (4.25 V, 4.30 V) to 4.35 V \u2014 Rct shift may be non-linear.")), /*#__PURE__*/React.createElement("td", {
    className: "rt-col-like"
  }, /*#__PURE__*/React.createElement("span", {
    className: "like-pill like-low"
  }, "LOW")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-head rt-impact-warn"
  }, "Lowers novelty"), /*#__PURE__*/React.createElement("div", {
    className: "rt-impact-desc"
  }, "If trend doesn't extrapolate, this is an unremarkable null result.")), /*#__PURE__*/React.createElement("td", null, "Pull HQ's raw cycling data via MOU before iter-10 start. Plan B: pivot to 4.32 V if Caltech sees nonlinearity.")))));
}

/* ─── NEW PROJECT (2-page wizard) ──────────────────────────────── */

function NewProjectPage({
  setRoute
}) {
  const [step, setStep] = React.useState(1);
  return /*#__PURE__*/React.createElement("div", {
    className: "page-wrap",
    style: {
      maxWidth: 980
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-overline"
  }, "New project"), /*#__PURE__*/React.createElement("h1", null, "Set up a research project")), /*#__PURE__*/React.createElement(WizardStepper, {
    step: step,
    steps: ["Description", "AI risk assessment"]
  }), step === 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    className: "cf-subhead"
  }, "Start with the basics: who, what, when. The next step runs ", /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--serif)"
    }
  }, "project_risk_v1"), " against your description and lab history to generate a baseline risk register."), /*#__PURE__*/React.createElement(FormSection, {
    n: "1",
    title: "Identity"
  }, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Emblem",
    sublabel: "One character \u2014 shown as the project glyph in the sidebar."
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "L",
    style: {
      width: 60,
      textAlign: "center",
      fontFamily: "var(--serif)",
      fontSize: 20
    }
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Name",
    sublabel: "Short, descriptive."
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "LiFePO\u2084 cathode reference study"
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Tagline",
    sublabel: "One sentence \u2014 what's the hypothesis or goal?"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Build an LFP baseline to compare against the NMC811 high-cutoff work."
  }))), /*#__PURE__*/React.createElement(FormSection, {
    n: "2",
    title: "Description",
    hint: "Be as detailed as you'd like. The AI uses this to generate the risk register on the next step."
  }, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Background"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "set-input",
    rows: 4,
    defaultValue: "The NMC811 project at 4.30 V cutoff has hit a +12 Ω Rct shift vs the 4.20 V baseline. To frame that result fairly we need an LFP control: a cathode chemistry well-understood by the community, at a benign cutoff, against which the NMC811 high-cutoff curves can be normalized.\n\nThe lab has no in-house LFP synthesis and will source from MTI Corp LFP-A2 for the first batch."
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Hypothesis"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "set-input",
    rows: 2,
    defaultValue: "LFP cells at 4.0 V cutoff will show < 2 \u03A9 Rct shift over 80 cycles, providing a clean control curve that frames the NMC811 4.30 V result."
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Success criteria",
    sublabel: "What does 'project complete' look like? Used by the AI to grade publishing risk."
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "set-input",
    rows: 3,
    defaultValue: "• 3+ LFP cells reach cycle 80 within the iter-6 baseline window for capacity retention.\n• Rct(cycle) curve published as Figure 1 in the NMC811 paper.\n• Final dataset reproduces MTI Corp's product-sheet curve within 5%."
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Visibility"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-radio-group"
  }, /*#__PURE__*/React.createElement("label", {
    className: "cf-radio on"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cf-radio-dot"
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, "Workspace"), /*#__PURE__*/React.createElement("span", {
    className: "cf-radio-sub"
  }, "All Halide members can read; explicit collaborators can edit."))), /*#__PURE__*/React.createElement("label", {
    className: "cf-radio"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cf-radio-dot"
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, "Private"), /*#__PURE__*/React.createElement("span", {
    className: "cf-radio-sub"
  }, "Only explicit collaborators can see this project.")))))), /*#__PURE__*/React.createElement(FormSection, {
    n: "3",
    title: "Team",
    hint: "Project-level roles compose with workspace roles via max() (spec \xA75)."
  }, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Leads",
    sublabel: "Owners of the project. Get all notifications, plus PI flag escalation."
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-people"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cf-person on"
  }, /*#__PURE__*/React.createElement(AvC, {
    id: "JR",
    size: 20
  }), " Jules Reyes ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("span", {
    className: "cf-person on"
  }, /*#__PURE__*/React.createElement(AvC, {
    id: "MT",
    size: 20
  }), " Mei Tanaka ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("button", {
    className: "cf-person add"
  }, /*#__PURE__*/React.createElement(IC2, {
    name: "plus",
    size: 11
  }), " Add lead"))), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Editors",
    sublabel: "Can edit content; cannot change project settings or invite externals."
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-people"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cf-person on"
  }, /*#__PURE__*/React.createElement(AvC, {
    id: "KB",
    size: 20
  }), " Karim Bah ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("span", {
    className: "cf-person on"
  }, /*#__PURE__*/React.createElement(AvC, {
    id: "SP",
    size: 20
  }), " Sam Patel ", /*#__PURE__*/React.createElement("button", null, "\xD7")), /*#__PURE__*/React.createElement("button", {
    className: "cf-person add"
  }, /*#__PURE__*/React.createElement(IC2, {
    name: "plus",
    size: 11
  }), " Add editor")))), /*#__PURE__*/React.createElement(FormSection, {
    n: "4",
    title: "First iteration (optional)",
    hint: "Spin up Iter-1 alongside the project. You can skip and add iterations later."
  }, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Iteration name"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Iter-1 \xB7 LFP baseline cells, 4.0 V cutoff"
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Schedule"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Jun 02",
    style: {
      width: 120
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      color: "var(--muted)"
    }
  }, "\u2192"), /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Jun 20",
    style: {
      width: 120
    }
  }))), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Owner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-people"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cf-person on"
  }, /*#__PURE__*/React.createElement(AvC, {
    id: "KB",
    size: 20
  }), " Karim Bah ", /*#__PURE__*/React.createElement("button", null, "\xD7"))))), /*#__PURE__*/React.createElement("div", {
    className: "cf-footer"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn",
    onClick: () => setRoute({
      view: "home"
    })
  }, "Cancel"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Save as draft"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary",
    onClick: () => setStep(2)
  }, "Continue to risk assessment \u2192"))), step === 2 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    className: "cf-subhead"
  }, "Walkthrough below shows every step ", /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--serif)"
    }
  }, "project_risk_v1"), " ran. Open any step to inspect or override the AI's reasoning. Save when you're satisfied with the final risk register."), /*#__PURE__*/React.createElement(RiskWalkthrough, {
    flavor: "project",
    finalTable: /*#__PURE__*/React.createElement(NewProjectRiskTable, null)
  }), /*#__PURE__*/React.createElement("div", {
    className: "cf-footer"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn",
    onClick: () => setStep(1)
  }, "\u2190 Back to description"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Save as draft"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary",
    onClick: () => setRoute({
      view: "project",
      projectId: "p_nmc",
      tab: "overview",
      variant: "editorial"
    })
  }, "Create project \u2192"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 60
    }
  }));
}

/* ─── NEW ITERATION (2-page wizard) ─────────────────────────────── */

function NewIterationPage({
  setRoute,
  project
}) {
  const p = project || LC2.PROJECTS[0];
  const [step, setStep] = React.useState(1);
  return /*#__PURE__*/React.createElement("div", {
    className: "page-wrap",
    style: {
      maxWidth: 980
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-overline"
  }, "New iteration \xB7 ", p.name), /*#__PURE__*/React.createElement("h1", null, "Plan an iteration")), /*#__PURE__*/React.createElement(WizardStepper, {
    step: step,
    steps: ["Description", "AI risk assessment"]
  }), step === 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    className: "cf-subhead"
  }, "Define the iteration's protocol, samples, and hypothesis. The next step runs ", /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--serif)"
    }
  }, "battery_safety_risk_v1"), " with this iteration's context plus the project's prior iterations."), /*#__PURE__*/React.createElement(FormSection, {
    n: "1",
    title: "Identity"
  }, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Number",
    sublabel: "Auto-incremented. Editable for parallel branches."
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "10",
    style: {
      width: 80,
      fontFamily: "var(--mono)"
    }
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Name",
    sublabel: "Short title \u2014 referenced everywhere else."
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Iter-10 \xB7 4.35 V escalation study"
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Schedule"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Jul 28",
    style: {
      width: 120
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      color: "var(--muted)"
    }
  }, "\u2192"), /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "Aug 22",
    style: {
      width: 120
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted)",
      marginLeft: 8
    }
  }, "25 days"))), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Owner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-people"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cf-person on"
  }, /*#__PURE__*/React.createElement(AvC, {
    id: "JR",
    size: 20
  }), " Jules Reyes ", /*#__PURE__*/React.createElement("button", null, "\xD7"))))), /*#__PURE__*/React.createElement(FormSection, {
    n: "2",
    title: "Hypothesis & description",
    hint: "The AI reads this to generate the risk register. Be specific about what's new vs prior iterations."
  }, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Hypothesis"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "set-input",
    rows: 2,
    defaultValue: "If the iter-7 Rct(cycle) curve saturates by cycle 50, the 4.35 V cutoff yields measurable additional capacity without runaway impedance growth."
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Description",
    sublabel: "What's the change relative to iter-7? What's the risk of pushing further?"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "set-input",
    rows: 5,
    defaultValue: "Iter-7 is mid-flight at 4.30 V upper cutoff and cell-014 / 015 are tracking the iter-6 baseline within ±2% through cycle 22 — but with a +12 Ω Rct shift at SoC 50%. If the shift saturates by cycle 50, that's evidence the cathode/electrolyte interface stabilizes at the new cutoff.\n\nIter-10 tests whether one more 50 mV step (to 4.35 V) yields additional capacity, or whether the Rct shift becomes nonlinear and runaway."
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Success criteria"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "set-input",
    rows: 2,
    defaultValue: "Capacity retention at cycle 80 \u2265 88% of iter-7's 4.30 V result, with Rct shift bounded under +20 \u03A9 vs iter-7 at SoC 50%."
  }))), /*#__PURE__*/React.createElement(FormSection, {
    n: "3",
    title: "Cycling protocol"
  }, /*#__PURE__*/React.createElement(FieldRow, {
    label: "Upper cutoff (V)"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "4.35",
    style: {
      width: 100,
      fontFamily: "var(--mono)"
    }
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Lower cutoff (V)"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "3.00",
    style: {
      width: 100,
      fontFamily: "var(--mono)"
    }
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "C-rate"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "C/3",
    style: {
      width: 100,
      fontFamily: "var(--mono)"
    }
  })), /*#__PURE__*/React.createElement(FieldRow, {
    label: "Cycles"
  }, /*#__PURE__*/React.createElement("input", {
    className: "set-input",
    defaultValue: "80",
    style: {
      width: 100,
      fontFamily: "var(--mono)"
    }
  }))), /*#__PURE__*/React.createElement(FormSection, {
    n: "4",
    title: "Samples",
    hint: "Pulled from this project's roster. Pick what enters this iteration."
  }, /*#__PURE__*/React.createElement("div", {
    className: "cf-samples"
  }, LC2.SAMPLES.filter(s => s.kind === "cell").map(s => {
    const on = s.id.includes("014") || s.id.includes("015");
    return /*#__PURE__*/React.createElement("label", {
      key: s.id,
      className: "cf-sample" + (on ? " on" : "")
    }, /*#__PURE__*/React.createElement("span", {
      className: "cf-sample-check"
    }, /*#__PURE__*/React.createElement("span", {
      className: "cf-sample-mark"
    }, on ? "✓" : "")), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--mono)",
        fontSize: 11,
        color: "var(--ember)"
      }
    }, s.id), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13
      }
    }, s.name)), /*#__PURE__*/React.createElement("span", {
      className: "pill k-" + s.kind
    }, s.kind), /*#__PURE__*/React.createElement("span", {
      className: "pill s-" + s.status
    }, /*#__PURE__*/React.createElement("span", {
      className: "dot-s " + s.status
    }), s.status));
  }), /*#__PURE__*/React.createElement("button", {
    className: "cf-sample add"
  }, /*#__PURE__*/React.createElement(IC2, {
    name: "plus",
    size: 12
  }), " Add new sample for this iteration"))), /*#__PURE__*/React.createElement("div", {
    className: "cf-footer"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn",
    onClick: () => setRoute({
      view: "project",
      projectId: p.id,
      tab: "iterations"
    })
  }, "Cancel"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Save as draft"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary",
    onClick: () => setStep(2)
  }, "Continue to risk assessment \u2192"))), step === 2 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    className: "cf-subhead"
  }, /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--serif)"
    }
  }, "battery_safety_risk_v1"), " ran with your description plus iter-7 / iter-6 cycling data and the prior risk registers. Item #1 below is HIGH likelihood + KILLS the project \u2014 workflow flagged the iteration for PI sign-off."), /*#__PURE__*/React.createElement(RiskWalkthrough, {
    flavor: "iteration",
    finalTable: /*#__PURE__*/React.createElement(NewIterationRiskTable, null)
  }), /*#__PURE__*/React.createElement("div", {
    className: "cf-pi-callout",
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(IC2, {
    name: "flag",
    size: 12
  }), /*#__PURE__*/React.createElement("strong", null, "PI sign-off required"), " \u2014 item #1 is HIGH likelihood + KILLS THE PROJECT impact. The workflow has emailed Mei. Iteration cannot transition to ", /*#__PURE__*/React.createElement("em", null, "active"), " until she approves."), /*#__PURE__*/React.createElement("div", {
    className: "cf-footer"
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn",
    onClick: () => setStep(1)
  }, "\u2190 Back to description"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "Save as planned"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary"
  }, "Send to Mei for sign-off"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 60
    }
  }));
}
Object.assign(window, {
  NewProjectPage,
  NewIterationPage
});
})();

/* === app.jsx === */
(function(){
// app.jsx — top-level app + routing + Tweaks

const {
  useState: uS,
  useEffect: uE
} = React;
const {
  Sidebar,
  TopBar,
  Tabs,
  AIPanel,
  ProjectOverview,
  PageEditor,
  CalendarView,
  ArtifactsView,
  MeetingsList,
  MeetingPage,
  SamplePage,
  ExperimentPage,
  InboxPage,
  PeoplePage,
  AccountPage,
  AdminPage,
  NewProjectPage,
  NewIterationPage,
  ShareModal,
  NewSampleModal,
  NewEventModal,
  TemplatePage,
  SamplesCardsView,
  SamplesLineageView,
  LAB,
  Icon
} = window;
const {
  TweaksPanel,
  useTweaks,
  TweakSection,
  TweakRadio,
  TweakSelect,
  TweakToggle,
  TweakColor,
  TweakSlider
} = window;
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
} /*EDITMODE-END*/;
const ACCENTS = ["#d97757", "#2c5b6a", "#5a7d3a", "#7a5aa0", "#1a1a1a"];
function HomeView({
  setRoute
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "page-wrap wide"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 8,
      paddingBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted)",
      letterSpacing: ".05em",
      textTransform: "uppercase"
    }
  }, "Tuesday \xB7 May 26 \xB7 2026"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: 46,
      letterSpacing: "-.015em",
      margin: "4px 0 6px",
      fontWeight: 400,
      lineHeight: 1.05
    }
  }, "Good morning, ", /*#__PURE__*/React.createElement("em", {
    style: {
      color: "var(--muted)"
    }
  }, "Jules.")), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--muted)",
      fontSize: 14,
      maxWidth: 560,
      lineHeight: 1.55
    }
  }, "You have ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--ink)"
    }
  }, "3 inbox items"), ", one ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--ember)"
    }
  }, "PI review flag"), " on Iter-7, and Mei left two comments on your Week\xA022 notes.")), /*#__PURE__*/React.createElement("div", {
    className: "section-h"
  }, /*#__PURE__*/React.createElement("h2", null, "Your projects"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "5 active \xB7 1 private")), /*#__PURE__*/React.createElement("div", {
    className: "records three",
    style: {
      gridTemplateColumns: "repeat(3,1fr)"
    }
  }, LAB.PROJECTS.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    className: "rec clickable",
    style: {
      textAlign: "left"
    },
    onClick: () => setRoute({
      view: "project",
      projectId: p.id,
      tab: "overview"
    })
  }, /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      gap: 10,
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 8,
      background: "var(--ember-tint)",
      color: "var(--ember)",
      display: "grid",
      placeItems: "center",
      fontFamily: "var(--serif)",
      fontSize: 24,
      lineHeight: 1,
      border: "1px solid var(--ember-soft)",
      flex: "0 0 40px"
    }
  }, p.emblem), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 500,
      fontSize: 14
    }
  }, p.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--muted)",
      marginTop: 2,
      textWrap: "pretty"
    }
  }, p.tagline))), /*#__PURE__*/React.createElement("div", {
    className: "foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill s-" + (p.status || "active")
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot-s " + (p.status || "active")
  }), p.status || "active"), p.visibility === "private" && /*#__PURE__*/React.createElement("span", {
    className: "pill"
  }, "private"), /*#__PURE__*/React.createElement("span", {
    className: "right",
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--muted)"
    }
  }, p.samples ? p.samples + " samples" : "—")))), /*#__PURE__*/React.createElement("button", {
    className: "rec clickable",
    style: {
      borderStyle: "dashed",
      color: "var(--muted)",
      justifyContent: "center",
      alignItems: "center",
      minHeight: 120
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: 32,
      lineHeight: 1
    }
  }, "\uFF0B"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5
    }
  }, "New project"))), /*#__PURE__*/React.createElement("div", {
    className: "section-h"
  }, /*#__PURE__*/React.createElement("h2", null, "Activity across lab"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "last 24 h")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "feed"
  }, /*#__PURE__*/React.createElement("div", {
    className: "feed-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, "\u27C1"), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Assistant"), " flagged ", /*#__PURE__*/React.createElement("em", null, "cell-016"), " for safety review on ", /*#__PURE__*/React.createElement("em", null, "NMC")), /*#__PURE__*/React.createElement("div", {
    className: "ts"
  }, "2h")), /*#__PURE__*/React.createElement("div", {
    className: "feed-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, "e"), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Sam"), " ran EX-205 \xB7 SEM on PM-cell-014-cs"), /*#__PURE__*/React.createElement("div", {
    className: "ts"
  }, "5h")), /*#__PURE__*/React.createElement("div", {
    className: "feed-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, "p"), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Mei"), " commented on ", /*#__PURE__*/React.createElement("em", null, "Iter-7 \xB7 Week 22 notes")), /*#__PURE__*/React.createElement("div", {
    className: "ts"
  }, "7h")), /*#__PURE__*/React.createElement("div", {
    className: "feed-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, "a"), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Sam"), " uploaded 2 artifacts to ", /*#__PURE__*/React.createElement("em", null, "NMC")), /*#__PURE__*/React.createElement("div", {
    className: "ts"
  }, "y")), /*#__PURE__*/React.createElement("div", {
    className: "feed-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, "i"), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "Karim"), " closed iteration ", /*#__PURE__*/React.createElement("em", null, "Iter-4"), " on ", /*#__PURE__*/React.createElement("em", null, "NMC")), /*#__PURE__*/React.createElement("div", {
    className: "ts"
  }, "y"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px",
      border: "1px solid var(--ember-soft)",
      borderRadius: 8,
      background: "var(--ember-tint)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 10.5,
      color: "var(--ember)",
      textTransform: "uppercase",
      letterSpacing: ".06em",
      marginBottom: 6
    }
  }, "Risk workflow \xB7 awaiting your approval"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: 18,
      letterSpacing: "-.005em",
      marginBottom: 4
    }
  }, "Battery safety risk \xB7 cell-016 short"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--ink-2)",
      fontSize: 13,
      lineHeight: 1.5,
      maxWidth: 420
    }
  }, "Workflow ", /*#__PURE__*/React.createElement("em", null, "battery_safety_risk_v1"), " proposed ", /*#__PURE__*/React.createElement("strong", null, "overall rating 4 / 5"), ". Threshold reached; PI notified. AI drafted a remediation plan as a candidate revision."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "top-btn primary"
  }, "Open review"), /*#__PURE__*/React.createElement("button", {
    className: "top-btn"
  }, "View AI draft"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}
function ProjectShellContent({
  route,
  setRoute,
  project
}) {
  const tab = route.tab || "overview";
  if (tab === "overview") return /*#__PURE__*/React.createElement(ProjectOverview, {
    project: project,
    variant: route.variant,
    setVariant: v => setRoute({
      ...route,
      variant: v
    })
  });
  if (tab === "pages") return /*#__PURE__*/React.createElement(PageEditor, {
    project: project
  });
  if (tab === "calendar") return /*#__PURE__*/React.createElement(CalendarView, {
    project: project,
    embedded: true
  });
  if (tab === "artifacts") return /*#__PURE__*/React.createElement(ArtifactsView, {
    project: project
  });
  // generic placeholder lists for remaining tabs (samples / experiments / iterations)
  return /*#__PURE__*/React.createElement(GenericList, {
    project: project,
    kind: tab,
    setRoute: setRoute
  });
}
function GenericList({
  project,
  kind,
  setRoute
}) {
  const [smpView, setSmpView] = React.useState("table");
  if (kind === "samples") {
    return /*#__PURE__*/React.createElement("div", {
      className: "page-wrap wide"
    }, /*#__PURE__*/React.createElement("div", {
      className: "cal-head"
    }, /*#__PURE__*/React.createElement("h2", null, "Samples"), /*#__PURE__*/React.createElement("div", {
      className: "cmode"
    }, /*#__PURE__*/React.createElement("button", {
      className: smpView === "table" ? "on" : "",
      onClick: () => setSmpView("table")
    }, "Table"), /*#__PURE__*/React.createElement("button", {
      className: smpView === "cards" ? "on" : "",
      onClick: () => setSmpView("cards")
    }, "Cards"), /*#__PURE__*/React.createElement("button", {
      className: smpView === "lineage" ? "on" : "",
      onClick: () => setSmpView("lineage")
    }, "Lineage")), /*#__PURE__*/React.createElement("div", {
      className: "right"
    }, /*#__PURE__*/React.createElement("button", {
      className: "top-btn"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "filter",
      size: 12
    }), " Filter"), /*#__PURE__*/React.createElement("button", {
      className: "top-btn primary",
      onClick: () => window.__app_setModal && window.__app_setModal("new-sample")
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 12
    }), " New sample"))), smpView === "table" && /*#__PURE__*/React.createElement("table", {
      style: {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 13
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
      style: {
        textAlign: "left",
        color: "var(--muted-2)",
        fontFamily: "var(--mono)",
        fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: ".06em"
      }
    }, /*#__PURE__*/React.createElement("th", {
      style: {
        padding: "8px 8px",
        borderBottom: "1px solid var(--line)"
      }
    }, "Identifier"), /*#__PURE__*/React.createElement("th", {
      style: {
        padding: "8px 8px",
        borderBottom: "1px solid var(--line)"
      }
    }, "Kind"), /*#__PURE__*/React.createElement("th", {
      style: {
        padding: "8px 8px",
        borderBottom: "1px solid var(--line)"
      }
    }, "Name"), /*#__PURE__*/React.createElement("th", {
      style: {
        padding: "8px 8px",
        borderBottom: "1px solid var(--line)"
      }
    }, "Chemistry"), /*#__PURE__*/React.createElement("th", {
      style: {
        padding: "8px 8px",
        borderBottom: "1px solid var(--line)"
      }
    }, "Mass"), /*#__PURE__*/React.createElement("th", {
      style: {
        padding: "8px 8px",
        borderBottom: "1px solid var(--line)"
      }
    }, "Parent"), /*#__PURE__*/React.createElement("th", {
      style: {
        padding: "8px 8px",
        borderBottom: "1px solid var(--line)"
      }
    }, "Status"))), /*#__PURE__*/React.createElement("tbody", null, LAB.SAMPLES.map(s => /*#__PURE__*/React.createElement("tr", {
      key: s.id,
      style: {
        borderBottom: "1px solid var(--line)",
        cursor: "default"
      },
      onClick: () => setRoute({
        view: "entity",
        entityType: "sample",
        entityId: s.id,
        projectId: project.id
      }),
      onMouseEnter: e => e.currentTarget.style.background = "var(--paper-2)",
      onMouseLeave: e => e.currentTarget.style.background = "transparent"
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "10px 8px",
        fontFamily: "var(--mono)",
        fontSize: 12,
        color: "var(--ember)"
      }
    }, s.id), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "10px 8px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "pill k-" + s.kind
    }, s.kind)), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "10px 8px"
      }
    }, s.name), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "10px 8px",
        fontFamily: "var(--mono)",
        fontSize: 12,
        color: "var(--ink-2)"
      }
    }, s.chem || "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "10px 8px",
        fontFamily: "var(--mono)",
        fontSize: 12,
        color: "var(--muted)"
      }
    }, s.mass || "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "10px 8px",
        fontFamily: "var(--mono)",
        fontSize: 12,
        color: "var(--muted)"
      }
    }, s.parent || "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "10px 8px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "pill s-" + s.status
    }, /*#__PURE__*/React.createElement("span", {
      className: "dot-s " + s.status
    }), s.status)))))), smpView === "cards" && /*#__PURE__*/React.createElement(SamplesCardsView, {
      project: project,
      setRoute: setRoute
    }), smpView === "lineage" && /*#__PURE__*/React.createElement(SamplesLineageView, {
      project: project,
      setRoute: setRoute
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 80
      }
    }));
  }
  if (kind === "experiments") {
    return /*#__PURE__*/React.createElement("div", {
      className: "page-wrap wide"
    }, /*#__PURE__*/React.createElement("div", {
      className: "cal-head"
    }, /*#__PURE__*/React.createElement("h2", null, "Experiments"), /*#__PURE__*/React.createElement("div", {
      className: "right"
    }, /*#__PURE__*/React.createElement("button", {
      className: "top-btn primary"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 12
    }), " Log experiment"))), /*#__PURE__*/React.createElement("div", {
      className: "records three"
    }, LAB.EXPERIMENTS.map(e => /*#__PURE__*/React.createElement("div", {
      key: e.id,
      className: "rec",
      onClick: () => setRoute({
        view: "entity",
        entityType: "experiment",
        entityId: e.id,
        projectId: project.id
      }),
      style: {
        cursor: "default"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "row",
      style: {
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "id"
    }, e.id), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto"
      },
      className: "pill"
    }, e.method)), /*#__PURE__*/React.createElement("div", {
      className: "name"
    }, e.title), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: "var(--muted)",
        lineHeight: 1.5
      }
    }, e.summary), /*#__PURE__*/React.createElement("div", {
      className: "foot"
    }, /*#__PURE__*/React.createElement("span", {
      className: "pill s-" + (e.status === "completed" ? "done" : e.status === "in_progress" ? "active" : e.status)
    }, /*#__PURE__*/React.createElement("span", {
      className: "dot-s " + (e.status === "completed" ? "done" : e.status === "in_progress" ? "active" : e.status)
    }), e.status.replace("_", " ")), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--mono)",
        fontSize: 11
      }
    }, e.samples.length, " sample", e.samples.length > 1 ? "s" : ""), /*#__PURE__*/React.createElement("span", {
      className: "right",
      style: {
        fontFamily: "var(--mono)",
        fontSize: 11,
        color: "var(--muted)"
      }
    }, e.at))))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 80
      }
    }));
  }
  if (kind === "iterations") {
    const cur = LAB.ITERATIONS.find(i => i.status === "active");
    return /*#__PURE__*/React.createElement("div", {
      className: "page-wrap"
    }, /*#__PURE__*/React.createElement("div", {
      className: "cal-head"
    }, /*#__PURE__*/React.createElement("h2", null, "Iterations"), /*#__PURE__*/React.createElement("div", {
      className: "right"
    }, /*#__PURE__*/React.createElement("button", {
      className: "top-btn primary",
      onClick: () => setRoute({
        view: "new-iteration",
        projectId: project.id
      })
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 12
    }), " New iteration"))), cur && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--mono)",
        fontSize: 10.5,
        color: "var(--muted-2)",
        textTransform: "uppercase",
        letterSpacing: ".06em",
        marginBottom: 6
      }
    }, "Current iteration \xB7 Iter-", cur.num), /*#__PURE__*/React.createElement(window.RiskAssessment, {
      id: cur.id,
      scope: "iteration"
    })), /*#__PURE__*/React.createElement("div", {
      className: "section-h"
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 20
      }
    }, "All iterations"), /*#__PURE__*/React.createElement("span", {
      className: "meta"
    }, LAB.ITERATIONS.length, " total")), /*#__PURE__*/React.createElement("div", {
      className: "iter-list",
      style: {
        borderTopColor: "var(--line)"
      }
    }, LAB.ITERATIONS.map(it => /*#__PURE__*/React.createElement("div", {
      key: it.id,
      className: "iter-row",
      onClick: () => setRoute({
        view: "entity",
        entityType: "iteration",
        entityId: it.id,
        projectId: project.id
      })
    }, /*#__PURE__*/React.createElement("div", {
      className: "num"
    }, "Iter-", it.num), /*#__PURE__*/React.createElement("div", {
      className: "title"
    }, it.name, /*#__PURE__*/React.createElement("div", {
      className: "sub"
    }, it.samples, " samples \xB7 ", it.experiments, " experiments \xB7 ", LAB.PEOPLE[it.owner].name)), /*#__PURE__*/React.createElement("div", {
      className: "dates"
    }, it.start, " \u2192 ", it.end), /*#__PURE__*/React.createElement("div", {
      className: "right"
    }, /*#__PURE__*/React.createElement("span", {
      className: "pill s-" + it.status
    }, /*#__PURE__*/React.createElement("span", {
      className: "dot-s " + it.status
    }), it.status))))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 80
      }
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "page-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "40px 0",
      color: "var(--muted)",
      fontFamily: "var(--mono)",
      fontSize: 13
    }
  }, "View \u201C", kind, "\u201D \u2014 not stubbed in this design pass."));
}
function App() {
  const [t, setT] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = uS({
    view: "project",
    projectId: "p_nmc",
    tab: "overview",
    variant: "editorial"
  });
  const [showAi, setShowAi] = uS(true);
  const [modal, setModal] = uS(null); // "share" | "new-sample" | "new-event" | null

  // sync variant tweak <-> route
  uE(() => {
    if (route.view === "project" && route.tab === "overview" && route.variant !== t.overview) {
      setRoute(r => ({
        ...r,
        variant: t.overview
      }));
    }
  }, [t.overview]);

  // apply accent + density
  uE(() => {
    document.documentElement.style.setProperty("--ember", t.accent || "#d97757");
    document.body.style.setProperty("--ember", t.accent || "#d97757");
    // soft / tint shades derived (simple): keep static for now
  }, [t.accent]);
  uE(() => {
    document.body.style.fontSize = (t.density === "compact" ? 13 : t.density === "comfy" ? 15 : 14) + "px";
  }, [t.density]);
  uE(() => {
    document.documentElement.setAttribute("data-theme", t.theme || "light");
    window.__app_setModal = setModal;
  }, [t.theme]);
  const project = LAB.PROJECTS.find(p => p.id === route.projectId) || LAB.PROJECTS[0];
  let body = null;
  if (route.view === "home") body = /*#__PURE__*/React.createElement(HomeView, {
    setRoute: setRoute
  });
  if (route.view === "calendar") body = /*#__PURE__*/React.createElement(CalendarView, null);
  if (route.view === "project") body = /*#__PURE__*/React.createElement(ProjectShellContent, {
    route: route,
    setRoute: setRoute,
    project: project
  });
  if (route.view === "meetings") body = /*#__PURE__*/React.createElement(MeetingsList, {
    onOpen: id => setRoute({
      view: "meeting",
      meetingId: id
    })
  });
  if (route.view === "meeting") {
    const m = LAB.MEETINGS.find(mt => mt.id === route.meetingId);
    body = m && /*#__PURE__*/React.createElement(MeetingPage, {
      meeting: m
    });
  }
  if (route.view === "inbox") body = /*#__PURE__*/React.createElement(InboxPage, {
    setRoute: setRoute
  });
  if (route.view === "people") body = /*#__PURE__*/React.createElement(PeoplePage, {
    setRoute: setRoute
  });
  if (route.view === "account") body = /*#__PURE__*/React.createElement(AccountPage, null);
  if (route.view === "admin") body = /*#__PURE__*/React.createElement(AdminPage, {
    setRoute: setRoute
  });
  if (route.view === "new-project") body = /*#__PURE__*/React.createElement(NewProjectPage, {
    setRoute: setRoute
  });
  if (route.view === "new-iteration") body = /*#__PURE__*/React.createElement(NewIterationPage, {
    setRoute: setRoute,
    project: project
  });
  if (route.view === "template") body = /*#__PURE__*/React.createElement(TemplatePage, {
    key: route.templateKey,
    setRoute: setRoute
  });
  if (route.view === "entity") {
    const proj = project;
    if (route.entityType === "sample") {
      const s = LAB.SAMPLE_BY_ID[route.entityId];
      body = s && /*#__PURE__*/React.createElement(SamplePage, {
        sample: s,
        project: proj
      });
    } else if (route.entityType === "experiment") {
      const e = LAB.EXP_BY_ID[route.entityId];
      body = e && /*#__PURE__*/React.createElement(ExperimentPage, {
        experiment: e,
        project: proj
      });
    } else if (route.entityType === "iteration") {
      const it = LAB.ITERATIONS.find(i => i.id === route.entityId);
      body = it && /*#__PURE__*/React.createElement(PageEditor, {
        pageRef: {
          type: "iteration",
          id: it.id
        },
        project: proj
      });
    }
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "app" + (showAi ? "" : " no-ai")
  }, /*#__PURE__*/React.createElement(Sidebar, {
    route: route,
    setRoute: setRoute
  }), /*#__PURE__*/React.createElement("div", {
    className: "main"
  }, /*#__PURE__*/React.createElement(TopBar, {
    route: route,
    setRoute: setRoute,
    project: project,
    showAi: showAi,
    setShowAi: setShowAi,
    setModal: setModal
  }), /*#__PURE__*/React.createElement(Tabs, {
    route: route,
    setRoute: setRoute,
    project: project,
    setRoute2: setRoute
  }), /*#__PURE__*/React.createElement("div", {
    className: "content"
  }, body)), showAi && /*#__PURE__*/React.createElement(AIPanel, {
    project: project,
    route: route
  }), modal === "share" && /*#__PURE__*/React.createElement(ShareModal, {
    project: project,
    onClose: () => setModal(null)
  }), modal === "new-sample" && /*#__PURE__*/React.createElement(NewSampleModal, {
    project: project,
    onClose: () => setModal(null)
  }), modal === "new-event" && /*#__PURE__*/React.createElement(NewEventModal, {
    onClose: () => setModal(null)
  }), /*#__PURE__*/React.createElement(TweaksPanel, null, /*#__PURE__*/React.createElement(TweakSection, {
    label: "Project overview"
  }), /*#__PURE__*/React.createElement(TweakRadio, {
    label: "Layout",
    value: t.overview,
    options: ["editorial", "dashboard", "stream"],
    onChange: v => setT({
      overview: v,
      ...(route.view === "project" ? {} : {})
    }) || setRoute(r => ({
      ...r,
      view: "project",
      tab: "overview",
      variant: v
    }))
  }), /*#__PURE__*/React.createElement(TweakSection, {
    label: "Theme"
  }), /*#__PURE__*/React.createElement(TweakRadio, {
    label: "Mode",
    value: t.theme,
    options: ["light", "dark"],
    onChange: v => setT("theme", v)
  }), /*#__PURE__*/React.createElement(TweakColor, {
    label: "Accent",
    value: t.accent,
    options: ACCENTS,
    onChange: v => setT("accent", v)
  }), /*#__PURE__*/React.createElement(TweakRadio, {
    label: "Density",
    value: t.density,
    options: ["compact", "regular", "comfy"],
    onChange: v => setT("density", v)
  }), /*#__PURE__*/React.createElement(TweakSection, {
    label: "AI panel"
  }), /*#__PURE__*/React.createElement(TweakToggle, {
    label: "Show panel",
    value: showAi,
    onChange: v => setShowAi(v)
  }), /*#__PURE__*/React.createElement(TweakSelect, {
    label: "Autonomy",
    value: t.aiAutonomy,
    options: ["read_only", "suggest_writes", "auto_routine", "full"],
    onChange: v => setT("aiAutonomy", v)
  }), /*#__PURE__*/React.createElement(TweakSection, {
    label: "Jump to"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 5
    }
  }, [["Home", () => setRoute({
    view: "home"
  })], ["Inbox", () => setRoute({
    view: "inbox"
  })], ["People", () => setRoute({
    view: "people"
  })], ["Workspace admin", () => setRoute({
    view: "admin"
  })], ["Account settings", () => setRoute({
    view: "account"
  })], ["New project", () => setRoute({
    view: "new-project"
  })], ["New iteration", () => setRoute({
    view: "new-iteration",
    projectId: "p_nmc"
  })], ["Project · Overview", () => setRoute({
    view: "project",
    projectId: "p_nmc",
    tab: "overview",
    variant: t.overview
  })], ["Project · Page editor", () => setRoute({
    view: "project",
    projectId: "p_nmc",
    tab: "pages"
  })], ["Project · Iterations", () => setRoute({
    view: "project",
    projectId: "p_nmc",
    tab: "iterations"
  })], ["Project · Samples", () => setRoute({
    view: "project",
    projectId: "p_nmc",
    tab: "samples"
  })], ["Project · Experiments", () => setRoute({
    view: "project",
    projectId: "p_nmc",
    tab: "experiments"
  })], ["Project · Artifacts", () => setRoute({
    view: "project",
    projectId: "p_nmc",
    tab: "artifacts"
  })], ["Calendar (all projects)", () => setRoute({
    view: "calendar"
  })], ["Meetings · list", () => setRoute({
    view: "meetings"
  })], ["Meeting · PI weekly W22", () => setRoute({
    view: "meeting",
    meetingId: "mtg_2026_05_21"
  })], ["Sample page · cell-014", () => setRoute({
    view: "entity",
    entityType: "sample",
    entityId: "NMC-7B-cell-014",
    projectId: "p_nmc"
  })], ["Experiment page · EX-205 (SEM)", () => setRoute({
    view: "entity",
    entityType: "experiment",
    entityId: "EX-205",
    projectId: "p_nmc"
  })], ["Iteration page · Iter-7", () => setRoute({
    view: "entity",
    entityType: "iteration",
    entityId: "it_7",
    projectId: "p_nmc"
  })]].map(([l, fn]) => /*#__PURE__*/React.createElement("button", {
    key: l,
    onClick: fn,
    style: {
      textAlign: "left",
      padding: "5px 8px",
      borderRadius: 5,
      background: "rgba(255,255,255,.5)",
      border: "1px solid rgba(0,0,0,.05)",
      fontSize: 11.5,
      color: "var(--ink-2)",
      fontFamily: "var(--mono)"
    }
  }, l)))));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
})();
