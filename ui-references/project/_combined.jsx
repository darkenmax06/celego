
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
//                        onChange={(v) => setTweak('primaryColor', v)} />
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

  .twk-field{appearance:none;width:100%;height:26px;padding:0 8px;
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

  .twk-num{display:flex;align-items:center;height:26px;padding:0 0 0 8px;
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
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
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
function TweaksPanel({ title = 'Tweaks', children }) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
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
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
  };

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
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
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={dragRef} className="twk-panel" data-noncommentable=""
           style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button className="twk-x" aria-label="Close tweaks"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={dismiss}>✕</button>
        </div>
        <div className="twk-body">{children}</div>
      </div>
    </>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({ label, children }) {
  return (
    <>
      <div className="twk-sect">{label}</div>
      {children}
    </>
  );
}

function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input type="range" className="twk-slider" min={min} max={max} step={step}
             value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </TweakRow>
  );
}

function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'}
              role="switch" aria-checked={!!value}
              onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;

  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  const segAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => {
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

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown}
           className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </TweakRow>
  );
}

function TweakText({ label, value, placeholder, onChange }) {
  return (
    <TweakRow label={label}>
      <input className="twk-field" type="text" value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </TweakRow>
  );
}

function TweakNumber({ label, value, min, max, step = 1, unit = '', onChange }) {
  const clamp = (n) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({ x: 0, val: 0 });
  const onScrubStart = (e) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = (ev) => {
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
  return (
    <div className="twk-num">
      <span className="twk-num-lbl" onPointerDown={onScrubStart}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
             onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      {unit && <span className="twk-num-unit">{unit}</span>}
    </div>
  );
}

function TweakColor({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <input type="color" className="twk-swatch" value={value}
             onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TweakButton({ label, onClick, secondary = false }) {
  return (
    <button type="button" className={secondary ? 'twk-btn secondary' : 'twk-btn'}
            onClick={onClick}>{label}</button>
  );
}

Object.assign(window, {
  useTweaks, TweaksPanel, TweakSection, TweakRow,
  TweakSlider, TweakToggle, TweakRadio, TweakSelect,
  TweakText, TweakNumber, TweakColor, TweakButton,
});


// Sidebar Navigation Component
const NAV_ITEMS = [
  { id: 'dashboard', icon: '▦', label: 'Dashboard' },
  { id: 'tarjetas', icon: '◈', label: 'Tarjetas', badge: null },
  { id: 'rutas', icon: '⊞', label: 'Rutas' },
  { id: 'operativo', icon: '◎', label: 'Operativo' },
  { id: 'redaccion', icon: '◧', label: 'Redacción' },
  { id: 'mensajeros', icon: '◉', label: 'Mensajeros' },
  { id: 'facturacion', icon: '◫', label: 'Facturación' },
  { id: 'reportes', icon: '◱', label: 'Reportes' },
  { id: 'configuracion', icon: '◎', label: 'Configuración' },
];

function Sidebar({ activeModule, setActiveModule, alerts }) {
  return (
    <aside style={sidebarStyles.aside}>
      {/* Logo */}
      <div style={sidebarStyles.logo}>
        <div style={sidebarStyles.logoMark}>C</div>
        <div style={sidebarStyles.logoText}>
          <span style={sidebarStyles.logoMain}>celego</span>
          <span style={sidebarStyles.logoSub}>logistics</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={sidebarStyles.nav}>
        {NAV_ITEMS.map(item => {
          const isActive = activeModule === item.id;
          const hasAlert = item.id === 'tarjetas' && alerts > 0;
          return (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
              style={{
                ...sidebarStyles.navBtn,
                ...(isActive ? sidebarStyles.navBtnActive : {}),
              }}
            >
              <span style={sidebarStyles.navIcon}>{item.icon}</span>
              <span style={sidebarStyles.navLabel}>{item.label}</span>
              {hasAlert && (
                <span style={sidebarStyles.alertBadge}>{alerts}</span>
              )}
              {isActive && <span style={sidebarStyles.activeDot}></span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={sidebarStyles.bottom}>
        <div style={sidebarStyles.userRow}>
          <div style={sidebarStyles.avatar}>OP</div>
          <div style={sidebarStyles.userInfo}>
            <span style={sidebarStyles.userName}>Operador</span>
            <span style={sidebarStyles.userRole}>Admin</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

const sidebarStyles = {
  aside: {
    width: 220,
    minWidth: 220,
    background: '#0f1117',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 100,
    borderRight: '1px solid rgba(255,255,255,0.06)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '24px 20px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'oklch(0.55 0.18 260)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 800,
    fontSize: 16,
    fontFamily: "'Space Grotesk', sans-serif",
  },
  logoText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  logoMain: {
    color: '#f0f0ee',
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: '-0.03em',
    lineHeight: 1,
  },
  logoSub: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    lineHeight: 1.4,
  },
  nav: {
    flex: 1,
    padding: '12px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflowY: 'auto',
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    borderRadius: 8,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'rgba(255,255,255,0.45)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13.5,
    fontWeight: 400,
    width: '100%',
    textAlign: 'left',
    position: 'relative',
    transition: 'all 0.15s',
  },
  navBtnActive: {
    background: 'rgba(255,255,255,0.07)',
    color: '#f0f0ee',
    fontWeight: 500,
  },
  navIcon: {
    fontSize: 15,
    width: 18,
    textAlign: 'center',
    opacity: 0.7,
  },
  navLabel: {
    flex: 1,
  },
  alertBadge: {
    background: 'oklch(0.65 0.22 25)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    borderRadius: 10,
    padding: '1px 6px',
    fontFamily: "'Space Grotesk', sans-serif",
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: 'oklch(0.55 0.18 260)',
  },
  bottom: {
    padding: '12px 14px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: 'rgba(255,255,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: 11,
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  userName: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    fontWeight: 500,
  },
  userRole: {
    color: 'rgba(255,255,255,0.3)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
  },
};

Object.assign(window, { Sidebar });


// Dashboard Module

const STAT_CARDS = [
  { label: 'En Posesión', value: 1842, sub: 'tarjetas activas', color: 'oklch(0.55 0.18 260)', delta: '+47 hoy' },
  { label: 'Entregadas Hoy', value: 124, sub: 'de 310 en ruta', color: 'oklch(0.58 0.18 145)', delta: '40%' },
  { label: 'Próximas a Vencer SLA', value: 38, sub: 'en las próx. 48h', color: 'oklch(0.65 0.22 25)', delta: 'urgente' },
  { label: 'Retornadas', value: 23, sub: 'este mes', color: 'oklch(0.55 0.16 310)', delta: '-5 vs mes ant.' },
];

const ZONE_DATA = [
  { zona: 'Metro', tarjetas: 641, pct: 35, color: 'oklch(0.55 0.18 260)' },
  { zona: 'Este', tarjetas: 428, pct: 23, color: 'oklch(0.58 0.18 145)' },
  { zona: 'Norte', tarjetas: 387, pct: 21, color: 'oklch(0.55 0.16 310)' },
  { zona: 'Sur', tarjetas: 386, pct: 21, color: 'oklch(0.65 0.22 25)' },
];

const SLA_ALERTS = [
  { ref: 'BDH-2024-08841', cedula: '001-1234567-8', nombre: 'RAMÓN PÉREZ TORRES', zona: 'Metro', dias: 1, location: 'Santo Domingo' },
  { ref: 'BDH-2024-08799', cedula: '402-9876543-1', nombre: 'CARMEN ROSARIO DÍAZ', zona: 'Norte', dias: 1, location: 'Santiago' },
  { ref: 'BDH-2024-08712', cedula: '223-4561289-0', nombre: 'JORGE ALMONTE FELIZ', zona: 'Este', dias: 2, location: 'Higüey' },
  { ref: 'BDH-2024-08698', cedula: '001-9871234-2', nombre: 'ANA MERCEDES LORA', zona: 'Metro', dias: 2, location: 'Santo Domingo' },
  { ref: 'BDH-2024-08655', cedula: '234-0087651-9', nombre: 'PEDRO MARTÍNEZ GIL', zona: 'Sur', dias: 2, location: 'Baní' },
];

const RECENT_ACTIVITY = [
  { time: '09:42', action: 'Importación', detail: '312 tarjetas importadas — Lote BHD-MAY-01', type: 'import' },
  { time: '09:15', action: 'Status Masivo', detail: '47 tarjetas → En Ruta (Santiago)', type: 'status' },
  { time: '08:55', action: 'Redacción', detail: 'Acuse #0042 generado — 89 entregas', type: 'doc' },
  { time: '08:30', action: 'Retorno', detail: '12 tarjetas retornadas — Motivo: Dirección Incorrecta', type: 'return' },
  { time: '08:00', action: 'Ruta Asignada', detail: 'Mensajero: Carlos Méndez — 34 tarjetas', type: 'route' },
];

const activityColors = {
  import: 'oklch(0.55 0.18 260)',
  status: 'oklch(0.58 0.18 145)',
  doc: 'oklch(0.55 0.16 310)',
  return: 'oklch(0.65 0.22 25)',
  route: 'oklch(0.6 0.14 200)',
};

function StatCard({ label, value, sub, color, delta }) {
  return (
    <div style={dbStyles.statCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={dbStyles.statLabel}>{label}</span>
        <span style={{ ...dbStyles.statDelta, color }}>{delta}</span>
      </div>
      <div style={{ ...dbStyles.statValue, color }}>{value.toLocaleString()}</div>
      <div style={dbStyles.statSub}>{sub}</div>
      <div style={{ ...dbStyles.statBar, background: `${color}22` }}>
        <div style={{ height: '100%', width: '60%', background: color, borderRadius: 4, opacity: 0.7 }}></div>
      </div>
    </div>
  );
}

function Dashboard({ setActiveModule }) {
  return (
    <div style={dbStyles.container}>
      {/* Header */}
      <div style={dbStyles.header}>
        <div>
          <h1 style={dbStyles.title}>Dashboard</h1>
          <p style={dbStyles.subtitle}>Sábado, 2 de mayo 2026 · Turno activo</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={dbStyles.btnSecondary} onClick={() => setActiveModule('tarjetas')}>
            Importar tarjetas
          </button>
          <button style={dbStyles.btnPrimary} onClick={() => setActiveModule('redaccion')}>
            + Nueva Redacción
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={dbStyles.statsGrid}>
        {STAT_CARDS.map(c => <StatCard key={c.label} {...c} />)}
      </div>

      {/* Main content area */}
      <div style={dbStyles.mainGrid}>
        {/* SLA Alerts */}
        <div style={dbStyles.card}>
          <div style={dbStyles.cardHeader}>
            <span style={dbStyles.cardTitle}>⚠ Alertas de SLA</span>
            <button style={dbStyles.cardAction} onClick={() => setActiveModule('tarjetas')}>Ver todas →</button>
          </div>
          <div style={dbStyles.alertTable}>
            <div style={dbStyles.alertTableHead}>
              <span>Referencia</span>
              <span>Cliente</span>
              <span>Zona</span>
              <span>Ubicación</span>
              <span style={{ textAlign: 'right' }}>Días SLA</span>
            </div>
            {SLA_ALERTS.map(a => (
              <div key={a.ref} style={dbStyles.alertRow}>
                <span style={dbStyles.refCode}>{a.ref}</span>
                <span style={dbStyles.clientName}>{a.nombre}</span>
                <span style={dbStyles.zoneBadge}>{a.zona}</span>
                <span style={dbStyles.locationText}>{a.location}</span>
                <span style={{ textAlign: 'right' }}>
                  <span style={{
                    ...dbStyles.slaDays,
                    background: a.dias === 1 ? 'oklch(0.65 0.22 25 / 0.15)' : 'oklch(0.6 0.18 60 / 0.15)',
                    color: a.dias === 1 ? 'oklch(0.65 0.22 25)' : 'oklch(0.6 0.18 60)',
                  }}>
                    {a.dias}d
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Zone breakdown */}
          <div style={dbStyles.card}>
            <div style={dbStyles.cardHeader}>
              <span style={dbStyles.cardTitle}>Tarjetas por Zona</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              {ZONE_DATA.map(z => (
                <div key={z.zona} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={dbStyles.zoneName}>{z.zona}</span>
                    <span style={dbStyles.zoneCount}>{z.tarjetas.toLocaleString()}</span>
                  </div>
                  <div style={dbStyles.zoneBarBg}>
                    <div style={{ ...dbStyles.zoneBarFill, width: `${z.pct}%`, background: z.color }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity feed */}
          <div style={dbStyles.card}>
            <div style={dbStyles.cardHeader}>
              <span style={dbStyles.cardTitle}>Actividad Reciente</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {RECENT_ACTIVITY.map((a, i) => (
                <div key={i} style={dbStyles.activityRow}>
                  <div style={{ ...dbStyles.activityDot, background: activityColors[a.type] }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={dbStyles.activityAction}>{a.action}</span>
                      <span style={dbStyles.activityTime}>{a.time}</span>
                    </div>
                    <span style={dbStyles.activityDetail}>{a.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const dbStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  subtitle: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnSecondary: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 },
  statCard: { background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #ebebea', display: 'flex', flexDirection: 'column', gap: 4 },
  statLabel: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' },
  statValue: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 36, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 },
  statSub: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#aaa' },
  statDelta: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600 },
  statBar: { height: 4, borderRadius: 4, marginTop: 8 },
  mainGrid: { display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 },
  card: { background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #ebebea' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 13.5, fontWeight: 600, color: '#1a1a1a' },
  cardAction: { background: 'none', border: 'none', color: 'oklch(0.55 0.18 260)', fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  alertTable: { display: 'flex', flexDirection: 'column', gap: 0 },
  alertTableHead: { display: 'grid', gridTemplateColumns: '160px 1fr 70px 120px 60px', gap: 8, padding: '0 0 8px', borderBottom: '1px solid #f0f0ee', marginBottom: 4 },
  alertRow: { display: 'grid', gridTemplateColumns: '160px 1fr 70px 120px 60px', gap: 8, padding: '8px 0', borderBottom: '1px solid #f8f8f6', alignItems: 'center' },
  refCode: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: 'oklch(0.55 0.18 260)', fontWeight: 500 },
  clientName: { fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#333', fontWeight: 400 },
  zoneBadge: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#666', background: '#f4f4f2', borderRadius: 4, padding: '2px 6px', display: 'inline-block' },
  locationText: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888' },
  slaDays: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 },
  zoneName: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444', fontWeight: 500 },
  zoneCount: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: '#1a1a1a' },
  zoneBarBg: { height: 6, background: '#f0f0ee', borderRadius: 4, overflow: 'hidden' },
  zoneBarFill: { height: '100%', borderRadius: 4, transition: 'width 0.3s' },
  activityRow: { display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid #f8f8f6', alignItems: 'flex-start' },
  activityDot: { width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0 },
  activityAction: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 600, color: '#333' },
  activityTime: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#aaa' },
  activityDetail: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888', display: 'block', marginTop: 1 },
};

Object.assign(window, { Dashboard });


// Tarjetas Module — Search, Import, Status Management

const STATUS_OPTIONS = [
  { id: 'despachada', label: 'Despachada', color: 'oklch(0.55 0.18 260)', bg: 'oklch(0.55 0.18 260 / 0.1)' },
  { id: 'enviada_interior', label: 'Enviada a Interior', color: 'oklch(0.55 0.16 310)', bg: 'oklch(0.55 0.16 310 / 0.1)' },
  { id: 'en_ruta', label: 'En Ruta', color: 'oklch(0.6 0.18 200)', bg: 'oklch(0.6 0.18 200 / 0.1)' },
  { id: 'entregada', label: 'Entregada', color: 'oklch(0.58 0.18 145)', bg: 'oklch(0.58 0.18 145 / 0.1)' },
  { id: 'retornada', label: 'Retornada', color: 'oklch(0.65 0.22 25)', bg: 'oklch(0.65 0.22 25 / 0.1)' },
];

const PROVINCIAS = ['Santo Domingo', 'Higüey', 'La Romana', 'San Pedro', 'Punta Cana', 'Santiago', 'San Francisco', 'San Cristóbal', 'Puerto Plata', 'Baní'];
const ZONAS = ['Metro', 'Este', 'Norte', 'Sur'];

const MOTIVOS_RETORNO = ['Dirección incorrecta', 'Cliente no localizado', 'Cliente rechazó', 'Dirección no existe', 'Empresa cerrada', 'Otro'];

const SAMPLE_TARJETAS = [
  { ref: 'BDH-2024-08841', cedula: '001-1234567-8', nombre: 'RAMÓN PÉREZ TORRES', direccion: 'Av. Winston Churchill #45, Evaristo Morales', tel: '809-555-0101', zona: 'Metro', provincia: 'Santo Domingo', status: 'en_ruta', despacho: '2026-04-29', sla_restante: 1, mensajero: 'Carlos Méndez' },
  { ref: 'BDH-2024-08799', cedula: '402-9876543-1', nombre: 'CARMEN ROSARIO DÍAZ', direccion: 'Calle El Sol #12, Santiago Centro', tel: '829-555-0202', zona: 'Norte', provincia: 'Santiago', status: 'enviada_interior', despacho: '2026-04-28', sla_restante: 1, mensajero: null },
  { ref: 'BDH-2024-08712', cedula: '223-4561289-0', nombre: 'JORGE ALMONTE FELIZ', direccion: 'Carr. Higüey-Romana Km 3', tel: '809-555-0303', zona: 'Este', provincia: 'Higüey', status: 'en_ruta', despacho: '2026-04-28', sla_restante: 2, mensajero: 'Pedro Santos' },
  { ref: 'BDH-2024-08698', cedula: '001-9871234-2', nombre: 'ANA MERCEDES LORA', direccion: 'Residencial Los Prados, Bloque D', tel: '829-555-0404', zona: 'Metro', provincia: 'Santo Domingo', status: 'despachada', despacho: '2026-04-30', sla_restante: 3, mensajero: null },
  { ref: 'BDH-2024-08655', cedula: '234-0087651-9', nombre: 'PEDRO MARTÍNEZ GIL', direccion: 'Calle Principal #8, Baní Centro', tel: '809-555-0505', zona: 'Sur', provincia: 'Baní', status: 'en_ruta', despacho: '2026-04-28', sla_restante: 2, mensajero: 'José Reyes' },
  { ref: 'BDH-2024-08601', cedula: '001-3344556-7', nombre: 'MARÍA FAMILIA NÚÑEZ', direccion: 'Calle 5 #33, Gazcue', tel: '849-555-0606', zona: 'Metro', provincia: 'Santo Domingo', status: 'entregada', despacho: '2026-04-25', sla_restante: null, mensajero: 'Carlos Méndez' },
  { ref: 'BDH-2024-08590', cedula: '001-7788990-1', nombre: 'LUIS THEN VENTURA', direccion: 'Av. Independencia #200', tel: '809-555-0707', zona: 'Metro', provincia: 'Santo Domingo', status: 'retornada', despacho: '2026-04-20', sla_restante: null, mensajero: 'Carlos Méndez' },
  { ref: 'BDH-2024-08541', cedula: '402-1122334-5', nombre: 'ELENA SANTOS PICHARDO', direccion: 'Urb. Los Jardines, Santiago', tel: '829-555-0808', zona: 'Norte', provincia: 'Santiago', status: 'entregada', despacho: '2026-04-24', sla_restante: null, mensajero: 'Pedro Santos' },
];

function StatusBadge({ statusId }) {
  const s = STATUS_OPTIONS.find(x => x.id === statusId);
  if (!s) return null;
  return (
    <span style={{
      fontFamily: "'Space Grotesk', sans-serif",
      fontSize: 11,
      fontWeight: 600,
      color: s.color,
      background: s.bg,
      borderRadius: 6,
      padding: '3px 8px',
      whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

function SlaChip({ dias }) {
  if (dias === null || dias === undefined) return <span style={{ color: '#ccc', fontSize: 11 }}>—</span>;
  const color = dias <= 1 ? 'oklch(0.65 0.22 25)' : dias <= 2 ? 'oklch(0.6 0.18 60)' : 'oklch(0.55 0.14 145)';
  const bg = dias <= 1 ? 'oklch(0.65 0.22 25 / 0.12)' : dias <= 2 ? 'oklch(0.6 0.18 60 / 0.12)' : 'oklch(0.55 0.14 145 / 0.12)';
  return (
    <span style={{ color, background: bg, fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px' }}>
      {dias}d
    </span>
  );
}

// Modal de detalle / bitácora
function TarjetaModal({ tarjeta, onClose }) {
  const [activeTab, setActiveTab] = React.useState('info');
  const bitacora = [
    { fecha: '2026-04-29 08:30', status: 'en_ruta', user: 'Op. Martínez', nota: 'Asignada a Carlos Méndez' },
    { fecha: '2026-04-28 16:00', status: 'despachada', user: 'Op. García', nota: 'Recibida del banco' },
    { fecha: '2026-03-10 10:00', status: 'retornada', user: 'Op. García', nota: 'Dirección incorrecta' },
    { fecha: '2026-03-08 09:00', status: 'despachada', user: 'Op. García', nota: 'Primer despacho' },
  ];

  return (
    <div style={tarjetaStyles.modalOverlay} onClick={onClose}>
      <div style={tarjetaStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={tarjetaStyles.modalHeader}>
          <div>
            <div style={tarjetaStyles.modalRef}>{tarjeta.ref}</div>
            <div style={tarjetaStyles.modalName}>{tarjeta.nombre}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <StatusBadge statusId={tarjeta.status} />
            <button onClick={onClose} style={tarjetaStyles.closeBtn}>✕</button>
          </div>
        </div>

        <div style={tarjetaStyles.modalTabs}>
          {['info', 'bitacora', 'status'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              ...tarjetaStyles.tabBtn,
              ...(activeTab === t ? tarjetaStyles.tabBtnActive : {}),
            }}>
              {t === 'info' ? 'Información' : t === 'bitacora' ? 'Bitácora' : 'Cambiar Status'}
            </button>
          ))}
        </div>

        {activeTab === 'info' && (
          <div style={tarjetaStyles.modalBody}>
            <div style={tarjetaStyles.infoGrid}>
              {[
                ['Cédula', tarjeta.cedula],
                ['Zona', tarjeta.zona],
                ['Provincia', tarjeta.provincia],
                ['F. Despacho', tarjeta.despacho],
                ['Teléfono', tarjeta.tel],
                ['Mensajero', tarjeta.mensajero || '—'],
              ].map(([k, v]) => (
                <div key={k} style={tarjetaStyles.infoItem}>
                  <span style={tarjetaStyles.infoKey}>{k}</span>
                  <span style={tarjetaStyles.infoVal}>{v}</span>
                </div>
              ))}
            </div>
            <div style={tarjetaStyles.infoItem}>
              <span style={tarjetaStyles.infoKey}>Dirección</span>
              <span style={tarjetaStyles.infoVal}>{tarjeta.direccion}</span>
            </div>
          </div>
        )}

        {activeTab === 'bitacora' && (
          <div style={tarjetaStyles.modalBody}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {bitacora.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid #f4f4f2', position: 'relative' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_OPTIONS.find(s => s.id === b.status)?.color || '#ccc', flexShrink: 0 }}></div>
                    {i < bitacora.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 20, background: '#ebebea', marginTop: 4 }}></div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                      <StatusBadge statusId={b.status} />
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#aaa' }}>{b.fecha}</span>
                    </div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#555' }}>{b.nota}</div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#bbb', marginTop: 2 }}>{b.user}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'status' && (
          <div style={tarjetaStyles.modalBody}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#666', margin: '0 0 8px' }}>Selecciona el nuevo status:</p>
              {STATUS_OPTIONS.map(s => (
                <label key={s.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1.5px solid ${tarjeta.status === s.id ? s.color : '#ebebea'}`,
                  background: tarjeta.status === s.id ? s.bg : '#fff',
                  cursor: 'pointer',
                }}>
                  <input type="radio" name="status" defaultChecked={tarjeta.status === s.id} style={{ accentColor: s.color }} />
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#333' }}>{s.label}</span>
                </label>
              ))}
              <div style={{ marginTop: 8 }}>
                <label style={tarjetaStyles.infoKey}>Provincia (si aplica)</label>
                <select style={tarjetaStyles.select}>
                  <option value="">— Seleccionar —</option>
                  {PROVINCIAS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={tarjetaStyles.infoKey}>Motivo retorno (si aplica)</label>
                <select style={tarjetaStyles.select}>
                  <option value="">— Seleccionar —</option>
                  {MOTIVOS_RETORNO.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <button style={{ ...tarjetaStyles.btnPrimary, marginTop: 8 }}>Guardar cambio</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Import Modal
function ImportModal({ onClose }) {
  const [step, setStep] = React.useState(1);
  return (
    <div style={tarjetaStyles.modalOverlay} onClick={onClose}>
      <div style={{ ...tarjetaStyles.modal, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div style={tarjetaStyles.modalHeader}>
          <div style={tarjetaStyles.modalName}>Importar Tarjetas</div>
          <button onClick={onClose} style={tarjetaStyles.closeBtn}>✕</button>
        </div>
        <div style={tarjetaStyles.modalBody}>
          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {['Archivo', 'Zona', 'Confirmar'].map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: step > i + 1 ? 'oklch(0.58 0.18 145)' : step === i + 1 ? 'oklch(0.55 0.18 260)' : '#ebebea',
                  color: step >= i + 1 ? '#fff' : '#bbb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700,
                }}>{step > i + 1 ? '✓' : i + 1}</div>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: step === i + 1 ? '#333' : '#bbb' }}>{s}</span>
                {i < 2 && <div style={{ flex: 1, height: 1, background: '#ebebea' }}></div>}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div>
              <div style={tarjetaStyles.dropZone}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#555' }}>Arrastra tu archivo Excel o CSV aquí</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#aaa', marginTop: 4 }}>o haz clic para seleccionar</div>
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#aaa', marginTop: 10 }}>
                Campos requeridos: Referencia Externa, Cédula, Nombre, Dirección, Teléfono, Fecha Despacho
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#555', margin: 0 }}>312 tarjetas detectadas. Asigna la zona de facturación:</p>
              {ZONAS.map(z => (
                <label key={z} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: '1.5px solid #ebebea', cursor: 'pointer' }}>
                  <input type="radio" name="zona" style={{ accentColor: 'oklch(0.55 0.18 260)' }} />
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{z}</span>
                </label>
              ))}
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={{ background: '#f9f9f7', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[['Archivo', 'despacho_mayo_01.xlsx'], ['Total tarjetas', '312'], ['Zona', 'Metro'], ['Fecha despacho', '2026-05-02'], ['Duplicadas', '0'], ['Errores', '0']].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#aaa', marginBottom: 2 }}>{k}</div>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: '#333' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888' }}>Al confirmar, las 312 tarjetas se registrarán con status <strong>Despachada</strong>.</div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            {step > 1 && <button style={tarjetaStyles.btnSecondary} onClick={() => setStep(s => s - 1)}>← Atrás</button>}
            <button style={tarjetaStyles.btnPrimary} onClick={() => step < 3 ? setStep(s => s + 1) : onClose()}>
              {step < 3 ? 'Continuar →' : '✓ Confirmar Importación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tarjetas() {
  const [search, setSearch] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [filterZona, setFilterZona] = React.useState('all');
  const [selected, setSelected] = React.useState([]);
  const [modalTarjeta, setModalTarjeta] = React.useState(null);
  const [showImport, setShowImport] = React.useState(false);
  const [showMasivo, setShowMasivo] = React.useState(false);

  const filtered = SAMPLE_TARJETAS.filter(t => {
    const q = search.toLowerCase();
    const matchQ = !q || t.ref.toLowerCase().includes(q) || t.nombre.toLowerCase().includes(q) || t.cedula.includes(q);
    const matchS = filterStatus === 'all' || t.status === filterStatus;
    const matchZ = filterZona === 'all' || t.zona === filterZona;
    return matchQ && matchS && matchZ;
  });

  const toggleSelect = (ref) => {
    setSelected(s => s.includes(ref) ? s.filter(x => x !== ref) : [...s, ref]);
  };
  const allSelected = filtered.length > 0 && filtered.every(t => selected.includes(t.ref));
  const toggleAll = () => setSelected(allSelected ? [] : filtered.map(t => t.ref));

  return (
    <div style={tarjetaStyles.container}>
      <div style={tarjetaStyles.header}>
        <div>
          <h1 style={tarjetaStyles.title}>Tarjetas</h1>
          <p style={tarjetaStyles.subtitle}>8 tarjetas · 38 alertas SLA</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={tarjetaStyles.btnSecondary} onClick={() => setShowImport(true)}>↑ Importar</button>
          <button style={tarjetaStyles.btnSecondary}>↓ Exportar</button>
          {selected.length > 0 && (
            <button style={tarjetaStyles.btnWarning} onClick={() => setShowMasivo(true)}>
              Cambiar Status ({selected.length})
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={tarjetaStyles.filters}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por referencia, cédula o nombre..."
          style={tarjetaStyles.searchInput}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={tarjetaStyles.filterSelect}>
          <option value="all">Todos los status</option>
          {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={filterZona} onChange={e => setFilterZona(e.target.value)} style={tarjetaStyles.filterSelect}>
          <option value="all">Todas las zonas</option>
          {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={tarjetaStyles.tableWrap}>
        <table style={tarjetaStyles.table}>
          <thead>
            <tr style={tarjetaStyles.thead}>
              <th style={tarjetaStyles.thCheck}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
              <th style={tarjetaStyles.th}>Referencia</th>
              <th style={tarjetaStyles.th}>Cliente / Cédula</th>
              <th style={tarjetaStyles.th}>Zona</th>
              <th style={tarjetaStyles.th}>Provincia</th>
              <th style={tarjetaStyles.th}>Status</th>
              <th style={tarjetaStyles.th}>SLA</th>
              <th style={tarjetaStyles.th}>Mensajero</th>
              <th style={tarjetaStyles.th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.ref} style={{ ...tarjetaStyles.row, background: selected.includes(t.ref) ? 'oklch(0.55 0.18 260 / 0.04)' : '#fff' }}>
                <td style={tarjetaStyles.tdCheck}><input type="checkbox" checked={selected.includes(t.ref)} onChange={() => toggleSelect(t.ref)} /></td>
                <td style={tarjetaStyles.td}>
                  <span style={tarjetaStyles.refCode}>{t.ref}</span>
                </td>
                <td style={tarjetaStyles.td}>
                  <div style={tarjetaStyles.clientCell}>
                    <span style={tarjetaStyles.clientNameCell}>{t.nombre}</span>
                    <span style={tarjetaStyles.cedulaCell}>{t.cedula}</span>
                  </div>
                </td>
                <td style={tarjetaStyles.td}><span style={tarjetaStyles.zonaBadge}>{t.zona}</span></td>
                <td style={tarjetaStyles.td}><span style={tarjetaStyles.provText}>{t.provincia}</span></td>
                <td style={tarjetaStyles.td}><StatusBadge statusId={t.status} /></td>
                <td style={tarjetaStyles.td}><SlaChip dias={t.sla_restante} /></td>
                <td style={tarjetaStyles.td}><span style={tarjetaStyles.mensajeroText}>{t.mensajero || '—'}</span></td>
                <td style={tarjetaStyles.td}>
                  <button style={tarjetaStyles.rowAction} onClick={() => setModalTarjeta(t)}>Ver →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Masivo status change panel */}
      {showMasivo && (
        <div style={tarjetaStyles.modalOverlay} onClick={() => setShowMasivo(false)}>
          <div style={{ ...tarjetaStyles.modal, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={tarjetaStyles.modalHeader}>
              <div style={tarjetaStyles.modalName}>Cambio Masivo de Status</div>
              <button onClick={() => setShowMasivo(false)} style={tarjetaStyles.closeBtn}>✕</button>
            </div>
            <div style={tarjetaStyles.modalBody}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#555', margin: '0 0 14px' }}>
                Aplicar a <strong>{selected.length} tarjetas</strong> seleccionadas:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {STATUS_OPTIONS.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ebebea', cursor: 'pointer' }}>
                    <input type="radio" name="masivo_status" style={{ accentColor: s.color }} />
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{s.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={tarjetaStyles.infoKey}>Provincia destino (para Enviada a Interior)</label>
                <select style={tarjetaStyles.select}>
                  <option value="">— Seleccionar provincia —</option>
                  {PROVINCIAS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button style={tarjetaStyles.btnSecondary} onClick={() => setShowMasivo(false)}>Cancelar</button>
                <button style={tarjetaStyles.btnPrimary} onClick={() => setShowMasivo(false)}>Aplicar cambio</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalTarjeta && <TarjetaModal tarjeta={modalTarjeta} onClose={() => setModalTarjeta(null)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}

const tarjetaStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  subtitle: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnSecondary: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnWarning: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  filters: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' },
  searchInput: { flex: 1, padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#333', outline: 'none', background: '#fff' },
  filterSelect: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#555', background: '#fff', cursor: 'pointer', outline: 'none' },
  tableWrap: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f8f8f6' },
  th: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid #ebebea' },
  thCheck: { padding: '10px 14px', borderBottom: '1px solid #ebebea', width: 40 },
  td: { padding: '11px 14px', borderBottom: '1px solid #f4f4f2', verticalAlign: 'middle' },
  tdCheck: { padding: '11px 14px', borderBottom: '1px solid #f4f4f2', width: 40 },
  row: { transition: 'background 0.1s' },
  refCode: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: 'oklch(0.55 0.18 260)', fontWeight: 500 },
  clientCell: { display: 'flex', flexDirection: 'column', gap: 1 },
  clientNameCell: { fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#333', fontWeight: 500 },
  cedulaCell: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: '#aaa' },
  zonaBadge: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#666', background: '#f4f4f2', borderRadius: 4, padding: '2px 7px' },
  provText: { fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#555' },
  mensajeroText: { fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#666' },
  rowAction: { background: 'none', border: 'none', color: 'oklch(0.55 0.18 260)', fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#fff', borderRadius: 16, width: '90%', maxWidth: 680, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader: { padding: '20px 24px', borderBottom: '1px solid #f0f0ee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 },
  modalRef: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: 'oklch(0.55 0.18 260)', fontWeight: 500, marginBottom: 2 },
  modalName: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em' },
  closeBtn: { background: '#f4f4f2', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 14, color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalTabs: { display: 'flex', gap: 0, padding: '0 24px', borderBottom: '1px solid #f0f0ee', flexShrink: 0 },
  tabBtn: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 400, color: '#aaa', background: 'none', border: 'none', padding: '12px 16px', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabBtnActive: { color: 'oklch(0.55 0.18 260)', fontWeight: 600, borderBottom: '2px solid oklch(0.55 0.18 260)' },
  modalBody: { padding: '20px 24px', overflowY: 'auto', flex: 1 },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 },
  infoItem: { display: 'flex', flexDirection: 'column', gap: 3 },
  infoKey: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' },
  infoVal: { fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, color: '#333', fontWeight: 500 },
  select: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444', outline: 'none', marginTop: 4 },
  dropZone: { border: '2px dashed #dededd', borderRadius: 10, padding: '28px 20px', textAlign: 'center', background: '#fafaf8', cursor: 'pointer' },
};

Object.assign(window, { Tarjetas, StatusBadge, SlaChip, STATUS_OPTIONS, ZONAS, PROVINCIAS, MOTIVOS_RETORNO, SAMPLE_TARJETAS });


// Operativo de Llamadas Module

const OPERATIVO_DATA = [
  { ref: 'BDH-2024-08841', cedula: '001-1234567-8', nombre: 'RAMÓN PÉREZ TORRES', zona: 'Metro', provincia: 'Santo Domingo', status: 'en_ruta', sla_restante: 1, telefonos: ['809-555-0101', '829-555-9988'], comentario: '', contactado: false, location: 'Santo Domingo' },
  { ref: 'BDH-2024-08799', cedula: '402-9876543-1', nombre: 'CARMEN ROSARIO DÍAZ', zona: 'Norte', provincia: 'Santiago', status: 'enviada_interior', sla_restante: 1, telefonos: ['829-555-0202'], comentario: '', contactado: false, location: 'Santiago' },
  { ref: 'BDH-2024-08712', cedula: '223-4561289-0', nombre: 'JORGE ALMONTE FELIZ', zona: 'Este', provincia: 'Higüey', status: 'en_ruta', sla_restante: 2, telefonos: ['809-555-0303', '849-333-1122'], comentario: '', contactado: false, location: 'Higüey' },
  { ref: 'BDH-2024-08698', cedula: '001-9871234-2', nombre: 'ANA MERCEDES LORA', zona: 'Metro', provincia: 'Santo Domingo', status: 'despachada', sla_restante: 2, telefonos: ['829-555-0404'], comentario: '', contactado: false, location: 'Santo Domingo' },
  { ref: 'BDH-2024-08655', cedula: '234-0087651-9', nombre: 'PEDRO MARTÍNEZ GIL', zona: 'Sur', provincia: 'Baní', status: 'en_ruta', sla_restante: 2, telefonos: ['809-555-0505'], comentario: '', contactado: false, location: 'Baní' },
];

function ContactModal({ card, onClose, onNext }) {
  const [tels, setTels] = React.useState(card.telefonos.map((t, i) => ({ num: t, checked: false })));
  const [comentario, setComentario] = React.useState(card.comentario || '');
  const [contactado, setContactado] = React.useState(card.contactado || false);
  const [newTel, setNewTel] = React.useState('');

  const slaColor = card.sla_restante <= 1 ? 'oklch(0.65 0.22 25)' : 'oklch(0.6 0.18 60)';

  return (
    <div style={opStyles.overlay}>
      <div style={opStyles.modal}>
        {/* Top bar */}
        <div style={opStyles.modalTop}>
          <div style={opStyles.modalTopLeft}>
            <span style={opStyles.modalRef}>{card.ref}</span>
            <span style={{ ...opStyles.slaBadge, color: slaColor, background: `${slaColor.replace(')', ' / 0.12)')}` }}>
              SLA: {card.sla_restante}d
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={opStyles.nextBtn} onClick={onNext}>Siguiente cliente →</button>
            <button style={opStyles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={opStyles.modalBody}>
          {/* Client info */}
          <div style={opStyles.clientHeader}>
            <div style={opStyles.clientAvatar}>{card.nombre.split(' ').slice(0, 2).map(w => w[0]).join('')}</div>
            <div>
              <div style={opStyles.clientName}>{card.nombre}</div>
              <div style={opStyles.clientMeta}>{card.cedula} · {card.location} · <span style={opStyles.zonaBadge}>{card.zona}</span></div>
            </div>
          </div>

          {/* Telephones */}
          <div style={opStyles.section}>
            <div style={opStyles.sectionLabel}>Teléfonos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tels.map((t, i) => (
                <label key={i} style={opStyles.telRow}>
                  <input type="checkbox" checked={t.checked} onChange={() => setTels(prev => prev.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))}
                    style={{ accentColor: 'oklch(0.55 0.18 260)', width: 15, height: 15 }} />
                  <span style={opStyles.telNum}>{t.num}</span>
                  {t.checked && <span style={opStyles.telCheck}>✓ Marcado</span>}
                </label>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input value={newTel} onChange={e => setNewTel(e.target.value)} placeholder="Agregar número..." style={opStyles.telInput} />
                <button style={opStyles.addTelBtn} onClick={() => { if (newTel) { setTels(p => [...p, { num: newTel, checked: false }]); setNewTel(''); } }}>+ Agregar</button>
              </div>
            </div>
          </div>

          {/* Comentario */}
          <div style={opStyles.section}>
            <div style={opStyles.sectionLabel}>Comentarios / Dirección confirmada</div>
            <textarea
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              placeholder="Ej: Cliente confirmó dirección Av. Churchill #45 apt 3B, disponible después de las 5pm..."
              style={opStyles.textarea}
              rows={3}
            />
          </div>

          {/* Contactado */}
          <label style={opStyles.contactadoRow}>
            <input type="checkbox" checked={contactado} onChange={e => setContactado(e.target.checked)}
              style={{ accentColor: 'oklch(0.58 0.18 145)', width: 16, height: 16 }} />
            <span style={opStyles.contactadoLabel}>Marcar como Contactado</span>
          </label>
        </div>

        <div style={opStyles.modalFooter}>
          <button style={opStyles.btnSecondary} onClick={onClose}>Cerrar</button>
          <button style={opStyles.btnPrimary}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

function Operativo() {
  const [viewMode, setViewMode] = React.useState('list');
  const [filterZona, setFilterZona] = React.useState('all');
  const [filterSla, setFilterSla] = React.useState('all');
  const [selectedCard, setSelectedCard] = React.useState(null);
  const [cardIndex, setCardIndex] = React.useState(0);

  const filtered = OPERATIVO_DATA.filter(c => {
    const mZ = filterZona === 'all' || c.zona === filterZona;
    const mS = filterSla === 'all' || c.sla_restante <= parseInt(filterSla);
    return mZ && mS;
  });

  const openCard = (card, idx) => { setSelectedCard(card); setCardIndex(idx); };
  const nextCard = () => {
    const next = (cardIndex + 1) % filtered.length;
    setSelectedCard(filtered[next]);
    setCardIndex(next);
  };

  return (
    <div style={opStyles.container}>
      <div style={opStyles.header}>
        <div>
          <h1 style={opStyles.title}>Operativo de Llamadas</h1>
          <p style={opStyles.subtitle}>{filtered.length} tarjetas activas para contactar</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={opStyles.reportBtn}>Reporte de Contactos</button>
        </div>
      </div>

      {/* Filters */}
      <div style={opStyles.filters}>
        <select value={filterZona} onChange={e => setFilterZona(e.target.value)} style={opStyles.filterSelect}>
          <option value="all">Todas las zonas</option>
          {['Metro', 'Este', 'Norte', 'Sur'].map(z => <option key={z}>{z}</option>)}
        </select>
        <select value={filterSla} onChange={e => setFilterSla(e.target.value)} style={opStyles.filterSelect}>
          <option value="all">Cualquier SLA</option>
          <option value="1">1 día restante</option>
          <option value="2">2 días restantes</option>
          <option value="3">3 días restantes</option>
        </select>
        <div style={{ flex: 1 }}></div>
        <div style={opStyles.viewToggle}>
          <button style={{ ...opStyles.viewBtn, ...(viewMode === 'list' ? opStyles.viewBtnActive : {}) }} onClick={() => setViewMode('list')}>≡ Lista</button>
          <button style={{ ...opStyles.viewBtn, ...(viewMode === 'cards' ? opStyles.viewBtnActive : {}) }} onClick={() => setViewMode('cards')}>⊞ Cards</button>
        </div>
      </div>

      {/* List view */}
      {viewMode === 'list' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebea', overflow: 'hidden' }}>
          {filtered.map((card, i) => (
            <div key={card.ref} style={{ ...opStyles.listRow, borderBottom: i < filtered.length - 1 ? '1px solid #f4f4f2' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <div style={opStyles.listAvatar}>{card.nombre.split(' ').slice(0, 2).map(w => w[0]).join('')}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={opStyles.listName}>{card.nombre}</span>
                    <span style={opStyles.listRef}>{card.ref}</span>
                    {card.contactado && <span style={opStyles.contactadoBadge}>✓ Contactado</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                    <span style={opStyles.listMeta}>{card.cedula}</span>
                    <span style={opStyles.listMeta}>·</span>
                    <span style={opStyles.listMeta}>{card.location}</span>
                    <span style={opStyles.listMeta}>·</span>
                    <span style={opStyles.listTels}>{card.telefonos[0]}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={opStyles.listZona}>{card.zona}</span>
                <span style={{
                  ...opStyles.listSla,
                  color: card.sla_restante <= 1 ? 'oklch(0.65 0.22 25)' : 'oklch(0.6 0.18 60)',
                  background: card.sla_restante <= 1 ? 'oklch(0.65 0.22 25 / 0.1)' : 'oklch(0.6 0.18 60 / 0.1)',
                }}>SLA: {card.sla_restante}d</span>
                <button style={opStyles.callBtn} onClick={() => openCard(card, i)}>Contactar →</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cards view */}
      {viewMode === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {filtered.map((card, i) => (
            <div key={card.ref} style={opStyles.cardItem} onClick={() => openCard(card, i)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={opStyles.cardRef}>{card.ref}</span>
                <span style={{
                  ...opStyles.listSla,
                  color: card.sla_restante <= 1 ? 'oklch(0.65 0.22 25)' : 'oklch(0.6 0.18 60)',
                  background: card.sla_restante <= 1 ? 'oklch(0.65 0.22 25 / 0.1)' : 'oklch(0.6 0.18 60 / 0.1)',
                }}>SLA: {card.sla_restante}d</span>
              </div>
              <div style={opStyles.cardName}>{card.nombre}</div>
              <div style={opStyles.cardMeta}>{card.cedula}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <span style={opStyles.listZona}>{card.zona}</span>
                <span style={opStyles.cardLoc}>{card.location}</span>
              </div>
              <div style={{ marginTop: 10 }}>
                {card.telefonos.map(t => <div key={t} style={opStyles.cardTel}>{t}</div>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedCard && (
        <ContactModal card={selectedCard} onClose={() => setSelectedCard(null)} onNext={nextCard} />
      )}
    </div>
  );
}

const opStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  subtitle: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  reportBtn: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  filters: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' },
  filterSelect: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#555', background: '#fff', cursor: 'pointer', outline: 'none' },
  viewToggle: { display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1.5px solid #e8e8e6' },
  viewBtn: { padding: '7px 14px', background: '#fff', border: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#888', cursor: 'pointer' },
  viewBtnActive: { background: 'oklch(0.55 0.18 260)', color: '#fff' },
  listRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' },
  listAvatar: { width: 36, height: 36, borderRadius: 10, background: 'oklch(0.55 0.18 260 / 0.12)', color: 'oklch(0.55 0.18 260)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  listName: { fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 500, color: '#1a1a1a' },
  listRef: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: '#aaa' },
  listMeta: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#aaa' },
  listTels: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: '#666' },
  listZona: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#666', background: '#f4f4f2', borderRadius: 4, padding: '2px 7px' },
  listSla: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px' },
  callBtn: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  contactadoBadge: { background: 'oklch(0.58 0.18 145 / 0.12)', color: 'oklch(0.58 0.18 145)', fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 600, borderRadius: 5, padding: '2px 6px' },
  cardItem: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.15s' },
  cardRef: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: 'oklch(0.55 0.18 260)', fontWeight: 500 },
  cardName: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.02em' },
  cardMeta: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#aaa', marginTop: 2 },
  cardLoc: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888' },
  cardTel: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: '#555', marginTop: 2 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#fff', borderRadius: 16, width: '90%', maxWidth: 560, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' },
  modalTop: { padding: '16px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
  modalTopLeft: { display: 'flex', gap: 10, alignItems: 'center' },
  modalRef: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: 'oklch(0.55 0.18 260)', fontWeight: 600 },
  slaBadge: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px' },
  nextBtn: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 500, cursor: 'pointer' },
  closeBtn: { background: '#f4f4f2', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 13, color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalBody: { padding: '20px', overflowY: 'auto', flex: 1 },
  clientHeader: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, padding: '14px 16px', background: '#f9f9f7', borderRadius: 10 },
  clientAvatar: { width: 44, height: 44, borderRadius: 12, background: 'oklch(0.55 0.18 260)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 700, flexShrink: 0 },
  clientName: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em' },
  clientMeta: { fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#888', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' },
  zonaBadge: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#666', background: '#ebebea', borderRadius: 4, padding: '2px 6px' },
  section: { marginBottom: 18 },
  sectionLabel: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 600 },
  telRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#f9f9f7', borderRadius: 8, cursor: 'pointer' },
  telNum: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: '#333', flex: 1 },
  telCheck: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'oklch(0.58 0.18 145)', fontWeight: 600 },
  telInput: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, outline: 'none' },
  addTelBtn: { background: '#f4f4f2', border: 'none', borderRadius: 7, padding: '8px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  textarea: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#333', resize: 'vertical', outline: 'none', boxSizing: 'border-box' },
  contactadoRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'oklch(0.58 0.18 145 / 0.06)', borderRadius: 10, cursor: 'pointer' },
  contactadoLabel: { fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#333', fontWeight: 500 },
  modalFooter: { padding: '14px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnSecondary: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
};

Object.assign(window, { Operativo });


// Rutas Module

const MENSAJEROS = [
  { id: 1, nombre: 'Carlos Méndez', avatar: 'CM' },
  { id: 2, nombre: 'Pedro Santos', avatar: 'PS' },
  { id: 3, nombre: 'José Reyes', avatar: 'JR' },
  { id: 4, nombre: 'Luis Familia', avatar: 'LF' },
];

const RUTAS_DATA = [
  { ref: 'BDH-2024-08841', cedula: '001-1234567-8', nombre: 'RAMÓN PÉREZ TORRES', direccion: 'Av. Winston Churchill #45', zona: 'Metro', mensajero_id: 1 },
  { ref: 'BDH-2024-08601', cedula: '001-3344556-7', nombre: 'MARÍA FAMILIA NÚÑEZ', direccion: 'Calle 5 #33, Gazcue', zona: 'Metro', mensajero_id: 1 },
  { ref: 'BDH-2024-08698', cedula: '001-9871234-2', nombre: 'ANA MERCEDES LORA', direccion: 'Residencial Los Prados, Bloque D', zona: 'Metro', mensajero_id: 1 },
  { ref: 'BDH-2024-08712', cedula: '223-4561289-0', nombre: 'JORGE ALMONTE FELIZ', direccion: 'Carr. Higüey-Romana Km 3', zona: 'Este', mensajero_id: 2 },
  { ref: 'BDH-2024-08541', cedula: '402-1122334-5', nombre: 'ELENA SANTOS PICHARDO', direccion: 'Urb. Los Jardines, Santiago', zona: 'Norte', mensajero_id: 2 },
  { ref: 'BDH-2024-08655', cedula: '234-0087651-9', nombre: 'PEDRO MARTÍNEZ GIL', direccion: 'Calle Principal #8, Baní', zona: 'Sur', mensajero_id: 3 },
];

function Rutas() {
  const [fecha, setFecha] = React.useState('2026-05-02');
  const [filterMensajero, setFilterMensajero] = React.useState('all');
  const [scanInput, setScanInput] = React.useState('');
  const [assignMensajero, setAssignMensajero] = React.useState('');
  const [assignTarget, setAssignTarget] = React.useState('');

  const filtered = RUTAS_DATA.filter(r =>
    filterMensajero === 'all' || r.mensajero_id === parseInt(filterMensajero)
  );

  const grouped = MENSAJEROS.map(m => ({
    ...m,
    tarjetas: filtered.filter(r => r.mensajero_id === m.id),
  })).filter(m => m.tarjetas.length > 0 || filterMensajero === 'all');

  return (
    <div style={rutaStyles.container}>
      <div style={rutaStyles.header}>
        <div>
          <h1 style={rutaStyles.title}>Rutas del Día</h1>
          <p style={rutaStyles.subtitle}>Asignación y seguimiento de entregas</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={rutaStyles.dateInput} />
          <button style={rutaStyles.btnSecondary}>Generar Lote</button>
          <button style={rutaStyles.btnPrimary}>↓ Exportar Rutas</button>
        </div>
      </div>

      {/* Assign panel */}
      <div style={rutaStyles.assignPanel}>
        <div style={rutaStyles.assignTitle}>Asignar tarjeta a mensajero</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            placeholder="Cédula o referencia externa..."
            style={rutaStyles.scanInput}
          />
          <select value={assignMensajero} onChange={e => setAssignMensajero(e.target.value)} style={rutaStyles.filterSelect}>
            <option value="">Seleccionar mensajero</option>
            {MENSAJEROS.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <button style={rutaStyles.btnPrimary}>Asignar</button>
          <span style={rutaStyles.scanHint}>Puedes usar una pistola de código de barras</span>
        </div>
      </div>

      {/* Filter by mensajero */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          style={{ ...rutaStyles.mensajeroChip, ...(filterMensajero === 'all' ? rutaStyles.chipActive : {}) }}
          onClick={() => setFilterMensajero('all')}
        >Todos</button>
        {MENSAJEROS.map(m => (
          <button
            key={m.id}
            style={{ ...rutaStyles.mensajeroChip, ...(filterMensajero === String(m.id) ? rutaStyles.chipActive : {}) }}
            onClick={() => setFilterMensajero(String(m.id))}
          >{m.nombre}</button>
        ))}
      </div>

      {/* Grouped by mensajero */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {grouped.map(m => (
          <div key={m.id} style={rutaStyles.mensajeroBlock}>
            <div style={rutaStyles.mensajeroHeader}>
              <div style={rutaStyles.mensajeroAvatar}>{m.avatar}</div>
              <span style={rutaStyles.mensajeroName}>{m.nombre}</span>
              <span style={rutaStyles.tarjetasCount}>{m.tarjetas.length} tarjetas</span>
            </div>
            <div style={rutaStyles.tarjetasList}>
              {m.tarjetas.map((t, i) => (
                <div key={t.ref} style={{ ...rutaStyles.tarjetaRow, borderBottom: i < m.tarjetas.length - 1 ? '1px solid #f4f4f2' : 'none' }}>
                  <span style={rutaStyles.rowNum}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={rutaStyles.rowName}>{t.nombre}</span>
                      <span style={rutaStyles.rowRef}>{t.ref}</span>
                    </div>
                    <span style={rutaStyles.rowDir}>{t.direccion}</span>
                  </div>
                  <span style={rutaStyles.rowZona}>{t.zona}</span>
                  <button style={rutaStyles.removeBtn}>✕</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const rutaStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  subtitle: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnSecondary: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  dateInput: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444', outline: 'none' },
  assignPanel: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', padding: '16px 20px', marginBottom: 16 },
  assignTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 12 },
  scanInput: { flex: 1, minWidth: 220, padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none' },
  filterSelect: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#555', background: '#fff', cursor: 'pointer', outline: 'none' },
  scanHint: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#bbb' },
  mensajeroChip: { padding: '6px 14px', borderRadius: 20, border: '1.5px solid #ebebea', background: '#fff', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#666', cursor: 'pointer', transition: 'all 0.15s' },
  chipActive: { background: 'oklch(0.55 0.18 260)', color: '#fff', borderColor: 'oklch(0.55 0.18 260)' },
  mensajeroBlock: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', overflow: 'hidden' },
  mensajeroHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#f8f8f6', borderBottom: '1px solid #ebebea' },
  mensajeroAvatar: { width: 32, height: 32, borderRadius: 8, background: 'oklch(0.55 0.18 260)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700 },
  mensajeroName: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 600, color: '#1a1a1a', flex: 1 },
  tarjetasCount: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888', background: '#ebebea', borderRadius: 10, padding: '2px 10px' },
  tarjetasList: { display: 'flex', flexDirection: 'column' },
  tarjetaRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' },
  rowNum: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: '#ccc', width: 20, textAlign: 'right', flexShrink: 0 },
  rowName: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: '#333' },
  rowRef: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: '#aaa' },
  rowDir: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888', display: 'block', marginTop: 1 },
  rowZona: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#666', background: '#f4f4f2', borderRadius: 4, padding: '2px 7px', flexShrink: 0 },
  removeBtn: { background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 12, padding: '4px 6px' },
};

Object.assign(window, { Rutas });


// Redaccion Module — Acuses de Entrega y Retornos

const REDAC_TARJETAS = [
  { ref: 'BDH-2024-08841', cedula: '001-1234567-8', nombre: 'RAMÓN PÉREZ TORRES', zona: 'Metro', tipo: 'entrega', motivo: '' },
  { ref: 'BDH-2024-08601', cedula: '001-3344556-7', nombre: 'MARÍA FAMILIA NÚÑEZ', zona: 'Metro', tipo: 'entrega', motivo: '' },
  { ref: 'BDH-2024-08590', cedula: '001-7788990-1', nombre: 'LUIS THEN VENTURA', zona: 'Metro', tipo: 'retorno', motivo: 'Dirección incorrecta' },
  { ref: 'BDH-2024-08712', cedula: '223-4561289-0', nombre: 'JORGE ALMONTE FELIZ', zona: 'Este', tipo: 'entrega', motivo: '' },
  { ref: 'BDH-2024-08655', cedula: '234-0087651-9', nombre: 'PEDRO MARTÍNEZ GIL', zona: 'Sur', tipo: 'retorno', motivo: '' },
];

function Redaccion() {
  const [mode, setMode] = React.useState('entrega'); // 'entrega' | 'retorno'
  const [scanned, setScanned] = React.useState(REDAC_TARJETAS);
  const [scanInput, setScanInput] = React.useState('');
  const [selectedRefs, setSelectedRefs] = React.useState([]);
  const [bulkMotivo, setBulkMotivo] = React.useState('');
  const [showApprove, setShowApprove] = React.useState(false);
  const [fecha, setFecha] = React.useState('2026-05-02');

  const lista = scanned.filter(t => t.tipo === mode);
  const zonas = ['Metro', 'Este', 'Norte', 'Sur'];

  const toggleSelect = (ref) => setSelectedRefs(s => s.includes(ref) ? s.filter(x => x !== ref) : [...s, ref]);

  const applyBulkMotivo = () => {
    setScanned(prev => prev.map(t => selectedRefs.includes(t.ref) ? { ...t, motivo: bulkMotivo } : t));
    setSelectedRefs([]);
    setBulkMotivo('');
  };

  const updateMotivo = (ref, val) => setScanned(prev => prev.map(t => t.ref === ref ? { ...t, motivo: val } : t));

  const scan = (e) => {
    if (e.key === 'Enter' && scanInput.trim()) {
      const found = REDAC_TARJETAS.find(t => t.ref === scanInput.trim() || t.cedula === scanInput.trim());
      if (found && !scanned.find(t => t.ref === found.ref)) {
        setScanned(prev => [...prev, found]);
      }
      setScanInput('');
    }
  };

  return (
    <div style={redStyles.container}>
      <div style={redStyles.header}>
        <div>
          <h1 style={redStyles.title}>Redacción</h1>
          <p style={redStyles.subtitle}>Acuses de entrega y retornos · {fecha}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={redStyles.dateInput} />
          <button style={redStyles.btnSecondary}>↓ Excel</button>
          <button style={redStyles.btnSecondary}>↓ CSV</button>
          <button style={redStyles.btnSecondary}>↓ PDF</button>
          <button style={redStyles.btnPrimary} onClick={() => setShowApprove(true)}>✓ Aprobar Redacción</button>
        </div>
      </div>

      {/* Mode tabs */}
      <div style={redStyles.modeTabs}>
        <button
          style={{ ...redStyles.modeBtn, ...(mode === 'entrega' ? redStyles.modeBtnActive : {}) }}
          onClick={() => setMode('entrega')}
        >
          Acuses de Entrega
          <span style={redStyles.modeCount}>{scanned.filter(t => t.tipo === 'entrega').length}</span>
        </button>
        <button
          style={{ ...redStyles.modeBtn, ...(mode === 'retorno' ? { ...redStyles.modeBtnActive, borderColor: 'oklch(0.65 0.22 25)', color: 'oklch(0.65 0.22 25)' } : {}) }}
          onClick={() => setMode('retorno')}
        >
          Retornos
          <span style={{ ...redStyles.modeCount, ...(mode === 'retorno' ? { background: 'oklch(0.65 0.22 25 / 0.15)', color: 'oklch(0.65 0.22 25)' } : {}) }}>
            {scanned.filter(t => t.tipo === 'retorno').length}
          </span>
        </button>
      </div>

      {/* Scan input */}
      <div style={redStyles.scanBar}>
        <div style={redStyles.scanIcon}>⊙</div>
        <input
          value={scanInput}
          onChange={e => setScanInput(e.target.value)}
          onKeyDown={scan}
          placeholder="Pistolear código de barras o digitar referencia / cédula..."
          style={redStyles.scanInput}
          autoFocus
        />
        <span style={redStyles.scanHint}>↵ Enter para agregar</span>
      </div>

      {/* Bulk motivo (retornos only) */}
      {mode === 'retorno' && selectedRefs.length > 0 && (
        <div style={redStyles.bulkBar}>
          <span style={redStyles.bulkCount}>{selectedRefs.length} seleccionadas</span>
          <select value={bulkMotivo} onChange={e => setBulkMotivo(e.target.value)} style={redStyles.bulkSelect}>
            <option value="">Seleccionar motivo...</option>
            {['Dirección incorrecta', 'Cliente no localizado', 'Cliente rechazó', 'Dirección no existe', 'Empresa cerrada', 'Otro'].map(m => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <button style={redStyles.btnPrimary} onClick={applyBulkMotivo}>Aplicar a seleccionadas</button>
        </div>
      )}

      {/* Tables by zone */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {zonas.map(zona => {
          const zonaTarjetas = lista.filter(t => t.zona === zona);
          if (zonaTarjetas.length === 0) return null;
          return (
            <div key={zona} style={redStyles.zonaBlock}>
              <div style={redStyles.zonaHeader}>
                <span style={redStyles.zonaTitle}>Zona {zona}</span>
                <span style={redStyles.zonaCount}>{zonaTarjetas.length} tarjetas</span>
              </div>
              <div style={redStyles.zonaTable}>
                <div style={redStyles.tableHead}>
                  {mode === 'retorno' && <span style={{ width: 30 }}></span>}
                  <span style={{ flex: '0 0 160px' }}>Referencia</span>
                  <span style={{ flex: '0 0 140px' }}>Cédula</span>
                  <span style={{ flex: 1 }}>Nombre</span>
                  {mode === 'retorno' && <span style={{ flex: '0 0 220px' }}>Motivo</span>}
                </div>
                {zonaTarjetas.map((t, i) => (
                  <div key={t.ref} style={{ ...redStyles.tableRow, background: selectedRefs.includes(t.ref) ? 'oklch(0.65 0.22 25 / 0.04)' : '#fff', borderBottom: i < zonaTarjetas.length - 1 ? '1px solid #f4f4f2' : 'none' }}>
                    {mode === 'retorno' && (
                      <span style={{ width: 30, display: 'flex', alignItems: 'center' }}>
                        <input type="checkbox" checked={selectedRefs.includes(t.ref)} onChange={() => toggleSelect(t.ref)} style={{ accentColor: 'oklch(0.65 0.22 25)' }} />
                      </span>
                    )}
                    <span style={{ ...redStyles.cellRef, flex: '0 0 160px' }}>{t.ref}</span>
                    <span style={{ ...redStyles.cellMeta, flex: '0 0 140px' }}>{t.cedula}</span>
                    <span style={{ ...redStyles.cellName, flex: 1 }}>{t.nombre}</span>
                    {mode === 'retorno' && (
                      <span style={{ flex: '0 0 220px' }}>
                        <input
                          value={t.motivo}
                          onChange={e => updateMotivo(t.ref, e.target.value)}
                          placeholder="Motivo de retorno..."
                          style={redStyles.motivoInput}
                        />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Approve Modal */}
      {showApprove && (
        <div style={redStyles.overlay} onClick={() => setShowApprove(false)}>
          <div style={redStyles.approveModal} onClick={e => e.stopPropagation()}>
            <div style={redStyles.approveHeader}>Confirmar Redacción</div>
            <div style={redStyles.approveBody}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#555', margin: '0 0 16px' }}>
                Al aprobar, se actualizarán automáticamente los status de las tarjetas:
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={redStyles.approveCard}>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, color: 'oklch(0.58 0.18 145)' }}>{scanned.filter(t => t.tipo === 'entrega').length}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#666' }}>→ Entregadas</div>
                </div>
                <div style={redStyles.approveCard}>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, color: 'oklch(0.65 0.22 25)' }}>{scanned.filter(t => t.tipo === 'retorno').length}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#666' }}>→ Retornadas</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid #f0f0ee' }}>
              <button style={redStyles.btnSecondary} onClick={() => setShowApprove(false)}>Cancelar</button>
              <button style={redStyles.btnPrimary} onClick={() => setShowApprove(false)}>✓ Aprobar y actualizar status</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const redStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  subtitle: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  dateInput: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444', outline: 'none' },
  modeTabs: { display: 'flex', gap: 8, marginBottom: 16 },
  modeBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 8, border: '2px solid #ebebea', background: '#fff', fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 500, color: '#888', cursor: 'pointer' },
  modeBtnActive: { borderColor: 'oklch(0.55 0.18 260)', color: 'oklch(0.55 0.18 260)', background: 'oklch(0.55 0.18 260 / 0.05)' },
  modeCount: { background: '#f0f0ee', color: '#888', borderRadius: 10, padding: '1px 8px', fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700 },
  scanBar: { display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 10, border: '2px solid oklch(0.55 0.18 260 / 0.3)', padding: '10px 16px', marginBottom: 16 },
  scanIcon: { color: 'oklch(0.55 0.18 260)', fontSize: 18 },
  scanInput: { flex: 1, border: 'none', outline: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#333' },
  scanHint: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#ccc', whiteSpace: 'nowrap' },
  bulkBar: { display: 'flex', alignItems: 'center', gap: 10, background: 'oklch(0.65 0.22 25 / 0.08)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, border: '1px solid oklch(0.65 0.22 25 / 0.2)' },
  bulkCount: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: 'oklch(0.65 0.22 25)', whiteSpace: 'nowrap' },
  bulkSelect: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none' },
  zonaBlock: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', overflow: 'hidden' },
  zonaHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: '#f8f8f6', borderBottom: '1px solid #ebebea' },
  zonaTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: '#444', flex: 1 },
  zonaCount: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888', background: '#ebebea', borderRadius: 10, padding: '2px 10px' },
  zonaTable: { display: 'flex', flexDirection: 'column' },
  tableHead: { display: 'flex', gap: 12, padding: '8px 16px', borderBottom: '1px solid #f0f0ee', fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tableRow: { display: 'flex', gap: 12, padding: '9px 16px', alignItems: 'center' },
  cellRef: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: 'oklch(0.55 0.18 260)', fontWeight: 500 },
  cellMeta: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: '#aaa' },
  cellName: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#333' },
  motivoInput: { width: '100%', padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: 'none', boxSizing: 'border-box' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  approveModal: { background: '#fff', borderRadius: 14, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' },
  approveHeader: { padding: '18px 20px', borderBottom: '1px solid #f0f0ee', fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, color: '#1a1a1a' },
  approveBody: { padding: '18px 20px' },
  approveCard: { flex: 1, background: '#f9f9f7', borderRadius: 10, padding: '14px 16px', textAlign: 'center' },
};

Object.assign(window, { Redaccion });


// Mensajeros Module — Nómina, Registro diario, Reportes

const MENSAJEROS_DATA = [
  {
    id: 1, nombre: 'Carlos Méndez', avatar: 'CM', telefono: '809-555-1001',
    tarifas: [
      { tipo: 'Entrega Normal', precio: 45 },
      { tipo: 'Zona Remota', precio: 80 },
      { tipo: 'Recogida a Banco', precio: 120 },
      { tipo: 'Mandado', precio: 200 },
    ],
    historial: [
      { fecha: '2026-05-01', entregas: 18, remotas: 2, recogidas: 1, mandados: 0 },
      { fecha: '2026-04-30', entregas: 22, remotas: 3, recogidas: 1, mandados: 1 },
      { fecha: '2026-04-29', entregas: 15, remotas: 1, recogidas: 0, mandados: 0 },
      { fecha: '2026-04-28', entregas: 20, remotas: 4, recogidas: 1, mandados: 0 },
    ],
    reportes: [
      { id: 'R-001', desde: '2026-04-01', hasta: '2026-04-15', total: 4850, generado: '2026-04-15 14:22' },
    ],
  },
  {
    id: 2, nombre: 'Pedro Santos', avatar: 'PS', telefono: '829-555-2002',
    tarifas: [
      { tipo: 'Entrega Normal', precio: 45 },
      { tipo: 'Zona Remota', precio: 90 },
      { tipo: 'Recogida a Banco', precio: 120 },
      { tipo: 'Entrega Frailes', precio: 150 },
    ],
    historial: [
      { fecha: '2026-05-01', entregas: 12, remotas: 5, recogidas: 0, mandados: 0 },
      { fecha: '2026-04-30', entregas: 16, remotas: 3, recogidas: 1, mandados: 0 },
    ],
    reportes: [],
  },
  {
    id: 3, nombre: 'José Reyes', avatar: 'JR', telefono: '849-555-3003',
    tarifas: [
      { tipo: 'Entrega Normal', precio: 40 },
      { tipo: 'Zona Remota', precio: 75 },
      { tipo: 'Mandado', precio: 180 },
    ],
    historial: [
      { fecha: '2026-05-01', entregas: 8, remotas: 0, recogidas: 0, mandados: 2 },
    ],
    reportes: [],
  },
];

function calcTotal(mensajero, historial) {
  return historial.reduce((sum, d) => {
    const tarifaMap = {};
    mensajero.tarifas.forEach(t => tarifaMap[t.tipo] = t.precio);
    return sum
      + (d.entregas || 0) * (tarifaMap['Entrega Normal'] || 0)
      + (d.remotas || 0) * (tarifaMap['Zona Remota'] || 0)
      + (d.recogidas || 0) * (tarifaMap['Recogida a Banco'] || 0)
      + (d.mandados || 0) * (tarifaMap['Mandado'] || 0);
  }, 0);
}

function MensajeroCard({ m, onOpen }) {
  const totalHoy = m.historial[0] ? calcTotal(m, [m.historial[0]]) : 0;
  const totalMes = calcTotal(m, m.historial);
  return (
    <div style={mensStyles.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={mensStyles.avatar}>{m.avatar}</div>
        <div style={{ flex: 1 }}>
          <div style={mensStyles.cardName}>{m.nombre}</div>
          <div style={mensStyles.cardTel}>{m.telefono}</div>
        </div>
        <button style={mensStyles.btnPrimary} onClick={() => onOpen(m)}>Ver perfil</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div style={mensStyles.miniStat}>
          <span style={mensStyles.miniVal}>{m.historial[0]?.entregas || 0}</span>
          <span style={mensStyles.miniLabel}>Entregas hoy</span>
        </div>
        <div style={mensStyles.miniStat}>
          <span style={{ ...mensStyles.miniVal, color: 'oklch(0.58 0.18 145)' }}>RD${totalMes.toLocaleString()}</span>
          <span style={mensStyles.miniLabel}>Total período</span>
        </div>
        <div style={mensStyles.miniStat}>
          <span style={mensStyles.miniVal}>{m.tarifas.length}</span>
          <span style={mensStyles.miniLabel}>Tipos entrega</span>
        </div>
      </div>
    </div>
  );
}

function MensajeroModal({ m, onClose }) {
  const [tab, setTab] = React.useState('perfil');
  const [desde, setDesde] = React.useState('2026-04-01');
  const [hasta, setHasta] = React.useState('2026-05-02');
  const [registroFecha, setRegistroFecha] = React.useState('2026-05-02');
  const [registros, setRegistros] = React.useState({ entregas: '', remotas: '', recogidas: '', mandados: '' });

  const totalReporte = calcTotal(m, m.historial);

  return (
    <div style={mensStyles.overlay} onClick={onClose}>
      <div style={mensStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={mensStyles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={mensStyles.avatar}>{m.avatar}</div>
            <div>
              <div style={mensStyles.modalName}>{m.nombre}</div>
              <div style={mensStyles.modalTel}>{m.telefono}</div>
            </div>
          </div>
          <button onClick={onClose} style={mensStyles.closeBtn}>✕</button>
        </div>

        <div style={mensStyles.tabs}>
          {[['perfil', 'Perfil & Tarifas'], ['registro', 'Registro Diario'], ['reporte', 'Generar Reporte'], ['historial', 'Historial Reportes']].map(([id, label]) => (
            <button key={id} style={{ ...mensStyles.tabBtn, ...(tab === id ? mensStyles.tabBtnActive : {}) }} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        <div style={mensStyles.modalBody}>
          {/* PERFIL */}
          {tab === 'perfil' && (
            <div>
              <div style={mensStyles.sectionLabel}>Tarifas configuradas</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {m.tarifas.map((t, i) => (
                  <div key={i} style={mensStyles.tarifaRow}>
                    <span style={mensStyles.tarifaTipo}>{t.tipo}</span>
                    <span style={mensStyles.tarifaPrecio}>RD${t.precio.toLocaleString()}</span>
                    <button style={mensStyles.editBtn}>Editar</button>
                  </div>
                ))}
              </div>
              <button style={mensStyles.addTarifaBtn}>+ Agregar tipo de entrega</button>
            </div>
          )}

          {/* REGISTRO */}
          {tab === 'registro' && (
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                <input type="date" value={registroFecha} onChange={e => setRegistroFecha(e.target.value)} style={mensStyles.dateInput} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {m.tarifas.map((t, i) => (
                  <div key={i} style={mensStyles.registroItem}>
                    <label style={mensStyles.registroLabel}>{t.tipo}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button style={mensStyles.stepBtn} onClick={() => {
                        const key = t.tipo.toLowerCase().replace(/ /g, '_');
                        setRegistros(p => ({ ...p, [key]: Math.max(0, (parseInt(p[key]) || 0) - 1) }));
                      }}>−</button>
                      <input
                        type="number"
                        min={0}
                        value={registros[t.tipo.toLowerCase().replace(/ /g, '_')] || ''}
                        onChange={e => setRegistros(p => ({ ...p, [t.tipo.toLowerCase().replace(/ /g, '_')]: e.target.value }))}
                        placeholder="0"
                        style={mensStyles.numInput}
                      />
                      <button style={mensStyles.stepBtn} onClick={() => {
                        const key = t.tipo.toLowerCase().replace(/ /g, '_');
                        setRegistros(p => ({ ...p, [key]: (parseInt(p[key]) || 0) + 1 }));
                      }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <button style={mensStyles.btnPrimary}>Guardar registro del día</button>

              {/* Historial reciente */}
              <div style={{ marginTop: 24 }}>
                <div style={mensStyles.sectionLabel}>Registros recientes</div>
                <div style={{ background: '#f9f9f7', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(4, 1fr)', gap: 0, padding: '8px 14px', borderBottom: '1px solid #f0f0ee', fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>
                    <span>Fecha</span>
                    <span>Entregas</span>
                    <span>Remotas</span>
                    <span>Recogidas</span>
                    <span>Mandados</span>
                  </div>
                  {m.historial.map((h, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px repeat(4, 1fr)', padding: '9px 14px', borderBottom: i < m.historial.length - 1 ? '1px solid #f0f0ee' : 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444' }}>
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: '#888' }}>{h.fecha}</span>
                      <span>{h.entregas}</span>
                      <span>{h.remotas}</span>
                      <span>{h.recogidas}</span>
                      <span>{h.mandados}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* REPORTE */}
          {tab === 'reporte' && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={mensStyles.sectionLabel}>Desde</label>
                  <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ ...mensStyles.dateInput, width: '100%', marginTop: 4 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={mensStyles.sectionLabel}>Hasta</label>
                  <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ ...mensStyles.dateInput, width: '100%', marginTop: 4 }} />
                </div>
              </div>

              {/* Preview reporte */}
              <div style={mensStyles.reportePreview}>
                <div style={mensStyles.reporteHeader}>
                  <div style={mensStyles.reporteNombre}>{m.nombre}</div>
                  <div style={mensStyles.reportePeriodo}>{desde} al {hasta}</div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f0f0ee' }}>
                        <th style={mensStyles.rth}>Fecha</th>
                        {m.tarifas.map(t => <th key={t.tipo} style={mensStyles.rth}>{t.tipo}</th>)}
                        <th style={{ ...mensStyles.rth, textAlign: 'right' }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.historial.map((h, i) => {
                        const sub = calcTotal(m, [h]);
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #f0f0ee' }}>
                            <td style={mensStyles.rtd}>{h.fecha}</td>
                            <td style={mensStyles.rtd}>{h.entregas}</td>
                            <td style={mensStyles.rtd}>{h.remotas}</td>
                            <td style={mensStyles.rtd}>{h.recogidas}</td>
                            {m.tarifas.length > 3 && <td style={mensStyles.rtd}>{h.mandados}</td>}
                            <td style={{ ...mensStyles.rtd, textAlign: 'right', fontWeight: 600 }}>RD${sub.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={mensStyles.reporteTotal}>
                  <span style={mensStyles.reporteTotalLabel}>TOTAL DEL PERÍODO</span>
                  <span style={mensStyles.reporteTotalVal}>RD${totalReporte.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button style={mensStyles.btnSecondary}>Vista previa JPG</button>
                <button style={mensStyles.btnPrimary}>Generar y guardar reporte</button>
              </div>
            </div>
          )}

          {/* HISTORIAL REPORTES */}
          {tab === 'historial' && (
            <div>
              {m.reportes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#ccc', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>No hay reportes generados aún</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {m.reportes.map(r => (
                    <div key={r.id} style={mensStyles.reporteHistRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={mensStyles.reporteId}>{r.id}</span>
                          <span style={mensStyles.reporteRango}>{r.desde} → {r.hasta}</span>
                        </div>
                        <div style={mensStyles.reporteGen}>Generado: {r.generado}</div>
                      </div>
                      <span style={mensStyles.reporteTotal2}>RD${r.total.toLocaleString()}</span>
                      <button style={mensStyles.btnSecondary}>↓ JPG</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Registro global diario
function RegistroGlobal() {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebea', overflow: 'hidden', marginTop: 24 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #ebebea', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>Registro Global del Día</span>
        <input type="date" defaultValue="2026-05-02" style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: 'none' }} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8f8f6' }}>
              <th style={{ padding: '9px 14px', fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid #ebebea' }}>Mensajero</th>
              {['Entregas', 'Remotas', 'Recogidas', 'Mandados', 'Total'].map(h => (
                <th key={h} style={{ padding: '9px 14px', fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', textAlign: 'center', borderBottom: '1px solid #ebebea' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MENSAJEROS_DATA.map(m => {
              const hoy = m.historial[0] || { entregas: 0, remotas: 0, recogidas: 0, mandados: 0 };
              const total = calcTotal(m, [hoy]);
              return (
                <tr key={m.id} style={{ borderBottom: '1px solid #f4f4f2' }}>
                  <td style={{ padding: '10px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#333', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: 'oklch(0.55 0.18 260 / 0.12)', color: 'oklch(0.55 0.18 260)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 700 }}>{m.avatar}</div>
                      {m.nombre}
                    </div>
                  </td>
                  {[hoy.entregas, hoy.remotas, hoy.recogidas, hoy.mandados].map((v, i) => (
                    <td key={i} style={{ padding: '10px 14px', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 600, color: '#333' }}>
                      <input type="number" defaultValue={v} min={0} style={{ width: 52, textAlign: 'center', padding: '4px 6px', borderRadius: 6, border: '1.5px solid #e8e8e6', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, outline: 'none' }} />
                    </td>
                  ))}
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 700, color: 'oklch(0.58 0.18 145)' }}>RD${total.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Mensajeros() {
  const [selectedMensajero, setSelectedMensajero] = React.useState(null);

  return (
    <div style={mensStyles.container}>
      <div style={mensStyles.header}>
        <div>
          <h1 style={mensStyles.title}>Mensajeros</h1>
          <p style={mensStyles.subtitle}>Nómina y gestión de entregas</p>
        </div>
        <button style={mensStyles.btnPrimary}>+ Nuevo Mensajero</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {MENSAJEROS_DATA.map(m => (
          <MensajeroCard key={m.id} m={m} onOpen={setSelectedMensajero} />
        ))}
      </div>

      <RegistroGlobal />

      {selectedMensajero && <MensajeroModal m={selectedMensajero} onClose={() => setSelectedMensajero(null)} />}
    </div>
  );
}

const mensStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  subtitle: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  card: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', padding: '18px 20px' },
  avatar: { width: 40, height: 40, borderRadius: 10, background: 'oklch(0.55 0.18 260)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 700, flexShrink: 0 },
  cardName: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.02em' },
  cardTel: { fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#aaa', marginTop: 2 },
  miniStat: { background: '#f9f9f7', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 },
  miniVal: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.03em' },
  miniLabel: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#aaa' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#fff', borderRadius: 16, width: '90%', maxWidth: 700, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' },
  modalHeader: { padding: '18px 22px', borderBottom: '1px solid #f0f0ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
  modalName: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em' },
  modalTel: { fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#aaa', marginTop: 2 },
  closeBtn: { background: '#f4f4f2', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 13, color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tabs: { display: 'flex', borderBottom: '1px solid #f0f0ee', flexShrink: 0 },
  tabBtn: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 400, color: '#aaa', background: 'none', border: 'none', padding: '11px 16px', cursor: 'pointer', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  tabBtnActive: { color: 'oklch(0.55 0.18 260)', fontWeight: 600, borderBottom: '2px solid oklch(0.55 0.18 260)' },
  modalBody: { padding: '20px 22px', overflowY: 'auto', flex: 1 },
  sectionLabel: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 600 },
  tarifaRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f9f9f7', borderRadius: 8 },
  tarifaTipo: { fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, color: '#333', flex: 1 },
  tarifaPrecio: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 700, color: 'oklch(0.58 0.18 145)' },
  editBtn: { background: 'none', border: 'none', color: 'oklch(0.55 0.18 260)', fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  addTarifaBtn: { background: 'none', border: '1.5px dashed #e0e0de', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#aaa', cursor: 'pointer', width: '100%' },
  registroItem: { background: '#f9f9f7', borderRadius: 10, padding: '14px', display: 'flex', flexDirection: 'column', gap: 8 },
  registroLabel: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#666', fontWeight: 500 },
  stepBtn: { width: 30, height: 30, borderRadius: 7, border: '1.5px solid #e0e0de', background: '#fff', fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  numInput: { width: 60, textAlign: 'center', padding: '6px', borderRadius: 7, border: '1.5px solid #e0e0de', fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, outline: 'none' },
  dateInput: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444', outline: 'none' },
  reportePreview: { background: '#f9f9f7', borderRadius: 12, overflow: 'hidden', border: '1px solid #e8e8e6' },
  reporteHeader: { padding: '16px 18px', background: '#1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  reporteNombre: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: '#fff' },
  reportePeriodo: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  rth: { padding: '8px 12px', fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid #e8e8e6' },
  rtd: { padding: '8px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#444', borderBottom: '1px solid #f0f0ee' },
  reporteTotal: { padding: '16px 18px', background: '#0f1117', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  reporteTotalLabel: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' },
  reporteTotalVal: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 800, color: 'oklch(0.58 0.18 145)', letterSpacing: '-0.04em' },
  reporteHistRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#f9f9f7', borderRadius: 10 },
  reporteId: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 600, color: 'oklch(0.55 0.18 260)' },
  reporteRango: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444' },
  reporteGen: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#aaa', marginTop: 2 },
  reporteTotal2: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: 'oklch(0.58 0.18 145)' },
};

Object.assign(window, { Mensajeros });


// Facturacion, Reportes, Configuracion modules

// ─── FACTURACIÓN ───────────────────────────────────────────────────────────────
const FACTURA_ZONAS = [
  {
    zona: 'Metro', color: 'oklch(0.55 0.18 260)',
    rangos: [
      { desde: 1, hasta: 99, precio: 3.00 },
      { desde: 100, hasta: 299, precio: 2.75 },
      { desde: 300, hasta: 999, precio: 2.50 },
      { desde: 1000, hasta: null, precio: 2.25 },
    ],
  },
  {
    zona: 'Este', color: 'oklch(0.58 0.18 145)',
    rangos: [
      { desde: 1, hasta: 99, precio: 5.00 },
      { desde: 100, hasta: 299, precio: 4.50 },
      { desde: 300, hasta: 999, precio: 4.00 },
      { desde: 1000, hasta: null, precio: 3.75 },
    ],
  },
  {
    zona: 'Norte', color: 'oklch(0.55 0.16 310)',
    rangos: [
      { desde: 1, hasta: 99, precio: 4.50 },
      { desde: 100, hasta: 299, precio: 4.00 },
      { desde: 300, hasta: null, precio: 3.50 },
    ],
  },
  {
    zona: 'Sur', color: 'oklch(0.65 0.22 25)',
    rangos: [
      { desde: 1, hasta: 99, precio: 4.00 },
      { desde: 100, hasta: null, precio: 3.50 },
    ],
  },
];

function Facturacion() {
  const [zonas, setZonas] = React.useState(FACTURA_ZONAS);
  const [periodo, setPeriodo] = React.useState({ desde: '2026-05-01', hasta: '2026-05-02' });

  const updatePrecio = (zonaIdx, rangoIdx, val) => {
    setZonas(prev => prev.map((z, zi) => zi !== zonaIdx ? z : {
      ...z,
      rangos: z.rangos.map((r, ri) => ri !== rangoIdx ? r : { ...r, precio: parseFloat(val) || 0 })
    }));
  };

  return (
    <div style={facStyles.container}>
      <div style={facStyles.header}>
        <div>
          <h1 style={facStyles.title}>Facturación</h1>
          <p style={facStyles.subtitle}>Tarifas por zona y rangos de volumen</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={facStyles.btnSecondary}>↓ Reporte Facturación</button>
          <button style={facStyles.btnPrimary}>Generar Factura</button>
        </div>
      </div>

      {/* Periodo selector */}
      <div style={facStyles.periodoBar}>
        <span style={facStyles.periodoLabel}>Período de facturación:</span>
        <input type="date" value={periodo.desde} onChange={e => setPeriodo(p => ({ ...p, desde: e.target.value }))} style={facStyles.dateInput} />
        <span style={{ color: '#aaa', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>al</span>
        <input type="date" value={periodo.hasta} onChange={e => setPeriodo(p => ({ ...p, hasta: e.target.value }))} style={facStyles.dateInput} />
        <button style={facStyles.btnPrimary}>Calcular</button>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {zonas.map(z => (
          <div key={z.zona} style={{ ...facStyles.summaryCard, borderTop: `3px solid ${z.color}` }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8 }}>Zona {z.zona}</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, color: z.color, letterSpacing: '-0.04em' }}>$0.00</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#aaa', marginTop: 2 }}>0 entregas</div>
          </div>
        ))}
      </div>

      {/* Tarifas configuración */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {zonas.map((z, zi) => (
          <div key={z.zona} style={facStyles.zonaCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: z.color }}></div>
              <span style={facStyles.zonaName}>Zona {z.zona}</span>
            </div>
            <div style={facStyles.rangoHeader}>
              <span style={{ flex: '0 0 80px' }}>Desde</span>
              <span style={{ flex: '0 0 80px' }}>Hasta</span>
              <span style={{ flex: 1 }}>Precio (USD)</span>
            </div>
            {z.rangos.map((r, ri) => (
              <div key={ri} style={facStyles.rangoRow}>
                <span style={{ ...facStyles.rangoVal, flex: '0 0 80px' }}>{r.desde}</span>
                <span style={{ ...facStyles.rangoVal, flex: '0 0 80px' }}>{r.hasta || '∞'}</span>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={facStyles.dollar}>$</span>
                  <input
                    type="number"
                    step="0.25"
                    value={r.precio}
                    onChange={e => updatePrecio(zi, ri, e.target.value)}
                    style={facStyles.precioInput}
                  />
                </div>
              </div>
            ))}
            <button style={facStyles.addRangoBtn}>+ Agregar rango</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const facStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  subtitle: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  periodoBar: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 10, border: '1px solid #ebebea', padding: '12px 16px', marginBottom: 20 },
  periodoLabel: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#555', whiteSpace: 'nowrap', marginRight: 4 },
  dateInput: { padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444', outline: 'none' },
  summaryCard: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', padding: '16px 18px' },
  zonaCard: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', padding: '18px 20px' },
  zonaName: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 600, color: '#333' },
  rangoHeader: { display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0ee', marginBottom: 4, fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' },
  rangoRow: { display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #f8f8f6', alignItems: 'center' },
  rangoVal: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: '#555' },
  dollar: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#aaa' },
  precioInput: { width: 80, padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e0e0de', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, outline: 'none' },
  addRangoBtn: { background: 'none', border: '1.5px dashed #e0e0de', borderRadius: 8, padding: '7px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#aaa', cursor: 'pointer', width: '100%', marginTop: 8 },
};

// ─── REPORTES ────────────────────────────────────────────────────────────────
function Reportes() {
  const [params, setParams] = React.useState({ zona: 'all', status: 'all', desde: '2026-05-01', hasta: '2026-05-02' });

  return (
    <div style={repStyles.container}>
      <div style={repStyles.header}>
        <div>
          <h1 style={repStyles.title}>Reportes</h1>
          <p style={repStyles.subtitle}>Exportación de datos por parámetros</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
        {/* Params */}
        <div style={repStyles.paramsCard}>
          <div style={repStyles.paramsTitle}>Parámetros</div>
          <div style={repStyles.paramGroup}>
            <label style={repStyles.paramLabel}>Zona</label>
            <select style={repStyles.select} value={params.zona} onChange={e => setParams(p => ({ ...p, zona: e.target.value }))}>
              <option value="all">Todas las zonas</option>
              {['Metro', 'Este', 'Norte', 'Sur'].map(z => <option key={z}>{z}</option>)}
            </select>
          </div>
          <div style={repStyles.paramGroup}>
            <label style={repStyles.paramLabel}>Status</label>
            <select style={repStyles.select} value={params.status} onChange={e => setParams(p => ({ ...p, status: e.target.value }))}>
              <option value="all">Todos</option>
              <option value="entregada">Entregadas</option>
              <option value="retornada">Retornadas</option>
              <option value="en_ruta">En Ruta</option>
              <option value="despachada">Despachadas</option>
            </select>
          </div>
          <div style={repStyles.paramGroup}>
            <label style={repStyles.paramLabel}>Fecha inicio</label>
            <input type="date" value={params.desde} onChange={e => setParams(p => ({ ...p, desde: e.target.value }))} style={repStyles.input} />
          </div>
          <div style={repStyles.paramGroup}>
            <label style={repStyles.paramLabel}>Fecha fin</label>
            <input type="date" value={params.hasta} onChange={e => setParams(p => ({ ...p, hasta: e.target.value }))} style={repStyles.input} />
          </div>
          <div style={repStyles.paramGroup}>
            <label style={repStyles.paramLabel}>Mensajero</label>
            <select style={repStyles.select}>
              <option value="">Todos</option>
              <option>Carlos Méndez</option>
              <option>Pedro Santos</option>
              <option>José Reyes</option>
            </select>
          </div>
          <button style={{ ...repStyles.btnPrimary, width: '100%', marginTop: 8 }}>Generar reporte</button>
        </div>

        {/* Export options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={repStyles.sectionTitle}>Formatos de exportación</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { format: 'Excel', icon: '⊞', desc: 'Tabla completa con todos los campos', ext: '.xlsx', color: 'oklch(0.58 0.18 145)' },
              { format: 'CSV', icon: '≡', desc: 'Valores separados por coma para análisis', ext: '.csv', color: 'oklch(0.55 0.18 260)' },
              { format: 'PDF', icon: '◧', desc: 'Documento listo para imprimir 8.5×11', ext: '.pdf', color: 'oklch(0.65 0.22 25)' },
            ].map(f => (
              <div key={f.format} style={repStyles.formatCard}>
                <div style={{ ...repStyles.formatIcon, color: f.color, background: `${f.color.replace(')', ' / 0.1)')}` }}>{f.icon}</div>
                <div style={repStyles.formatName}>{f.format}</div>
                <div style={repStyles.formatDesc}>{f.desc}</div>
                <button style={{ ...repStyles.formatBtn, color: f.color, border: `1.5px solid ${f.color.replace(')', ' / 0.3)')}` }}>
                  ↓ Exportar {f.ext}
                </button>
              </div>
            ))}
          </div>

          {/* Quick reports */}
          <div style={repStyles.sectionTitle}>Reportes rápidos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Tarjetas entregadas hoy',
              'Tarjetas retornadas este mes',
              'Lote completo por zona',
              'Facturación del período',
              'Acuse de entregas (formato impresión)',
              'Urgencias activas',
            ].map(r => (
              <div key={r} style={repStyles.quickRow}>
                <span style={repStyles.quickName}>{r}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={repStyles.quickBtn}>Excel</button>
                  <button style={repStyles.quickBtn}>CSV</button>
                  <button style={repStyles.quickBtn}>PDF</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const repStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  subtitle: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  paramsCard: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', padding: '18px 20px', alignSelf: 'start' },
  paramsTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 14 },
  paramGroup: { marginBottom: 12 },
  paramLabel: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', marginBottom: 4 },
  select: { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444', outline: 'none' },
  input: { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444', outline: 'none', boxSizing: 'border-box' },
  sectionTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 13.5, fontWeight: 600, color: '#333' },
  formatCard: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', padding: '18px', display: 'flex', flexDirection: 'column', gap: 8 },
  formatIcon: { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  formatName: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: '#1a1a1a' },
  formatDesc: { fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#888', flex: 1 },
  formatBtn: { background: 'none', borderRadius: 7, padding: '7px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  quickRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid #ebebea' },
  quickName: { fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, color: '#333' },
  quickBtn: { background: '#f4f4f2', border: 'none', borderRadius: 6, padding: '5px 10px', fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: '#555', cursor: 'pointer', fontWeight: 500 },
};

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
function Configuracion() {
  const [sla, setSla] = React.useState(5);

  return (
    <div style={cfgStyles.container}>
      <div style={cfgStyles.header}>
        <h1 style={cfgStyles.title}>Configuración</h1>
        <p style={cfgStyles.subtitle}>Parámetros del sistema</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* SLA */}
        <div style={cfgStyles.card}>
          <div style={cfgStyles.cardTitle}>SLA de Entrega</div>
          <p style={cfgStyles.cardDesc}>Días laborables máximos para realizar una entrega (sábados y domingos excluidos automáticamente).</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <button style={cfgStyles.stepBtn} onClick={() => setSla(s => Math.max(1, s - 1))}>−</button>
            <div style={cfgStyles.slaDisplay}>
              <span style={cfgStyles.slaNum}>{sla}</span>
              <span style={cfgStyles.slaUnit}>días laborables</span>
            </div>
            <button style={cfgStyles.stepBtn} onClick={() => setSla(s => s + 1)}>+</button>
          </div>
          <button style={{ ...cfgStyles.btnPrimary, marginTop: 16 }}>Guardar SLA</button>
        </div>

        {/* Usuarios */}
        <div style={cfgStyles.card}>
          <div style={cfgStyles.cardTitle}>Usuarios del Sistema</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {[
              { nombre: 'Administrador', email: 'admin@celego.com', rol: 'Admin' },
              { nombre: 'Operador 1', email: 'op1@celego.com', rol: 'Operador' },
              { nombre: 'Operador 2', email: 'op2@celego.com', rol: 'Operador' },
            ].map(u => (
              <div key={u.email} style={cfgStyles.userRow}>
                <div style={cfgStyles.userAvatar}>{u.nombre.split(' ').map(w => w[0]).join('').slice(0, 2)}</div>
                <div style={{ flex: 1 }}>
                  <div style={cfgStyles.userName}>{u.nombre}</div>
                  <div style={cfgStyles.userEmail}>{u.email}</div>
                </div>
                <span style={cfgStyles.rolBadge}>{u.rol}</span>
              </div>
            ))}
          </div>
          <button style={{ ...cfgStyles.addBtn, marginTop: 12 }}>+ Agregar usuario</button>
        </div>

        {/* Provincias */}
        <div style={cfgStyles.card}>
          <div style={cfgStyles.cardTitle}>Provincias / Locaciones</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {['Santo Domingo', 'Higüey', 'La Romana', 'San Pedro', 'Punta Cana', 'Santiago', 'San Francisco', 'San Cristóbal', 'Puerto Plata', 'Baní'].map(p => (
              <span key={p} style={cfgStyles.provTag}>{p}</span>
            ))}
          </div>
          <button style={{ ...cfgStyles.addBtn, marginTop: 12 }}>+ Agregar provincia</button>
        </div>

        {/* Motivos retorno */}
        <div style={cfgStyles.card}>
          <div style={cfgStyles.cardTitle}>Motivos de Retorno</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {['Dirección incorrecta', 'Cliente no localizado', 'Cliente rechazó', 'Dirección no existe', 'Empresa cerrada', 'Otro'].map(m => (
              <div key={m} style={cfgStyles.motivoRow}>
                <span style={cfgStyles.motivoText}>{m}</span>
                <button style={cfgStyles.deleteBtn}>✕</button>
              </div>
            ))}
          </div>
          <button style={{ ...cfgStyles.addBtn, marginTop: 10 }}>+ Agregar motivo</button>
        </div>
      </div>
    </div>
  );
}

const cfgStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { marginBottom: 24 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  subtitle: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  card: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', padding: '20px 22px' },
  cardTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 },
  cardDesc: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', margin: 0, lineHeight: 1.5 },
  stepBtn: { width: 36, height: 36, borderRadius: 8, border: '1.5px solid #e0e0de', background: '#f9f9f7', fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  slaDisplay: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  slaNum: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 40, fontWeight: 800, color: 'oklch(0.55 0.18 260)', letterSpacing: '-0.05em', lineHeight: 1 },
  slaUnit: { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#aaa' },
  userRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#f9f9f7', borderRadius: 8 },
  userAvatar: { width: 30, height: 30, borderRadius: 7, background: 'oklch(0.55 0.18 260 / 0.15)', color: 'oklch(0.55 0.18 260)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700 },
  userName: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: '#333' },
  userEmail: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#aaa' },
  rolBadge: { background: '#ebebea', color: '#666', fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 600, borderRadius: 5, padding: '2px 8px' },
  addBtn: { background: 'none', border: '1.5px dashed #e0e0de', borderRadius: 8, padding: '7px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#aaa', cursor: 'pointer', width: '100%' },
  provTag: { background: '#f4f4f2', borderRadius: 20, padding: '4px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: '#555' },
  motivoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: '#f9f9f7', borderRadius: 7 },
  motivoText: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444' },
  deleteBtn: { background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 11, padding: '2px 4px' },
};

Object.assign(window, { Facturacion, Reportes, Configuracion });



const TWEAK_DEFAULTS = {
  "accentColor": "oklch(0.55 0.18 260)",
  "bgColor": "#f5f5f3",
  "density": "normal",
  "sidebarDark": true
};

function App() {
  const tweaksResult = useTweaks(TWEAK_DEFAULTS);
  const tweaks = tweaksResult.tweaks;
  const TweaksPanel = tweaksResult.TweaksPanel;
  const TweakSection = tweaksResult.TweakSection;
  const TweakColor = tweaksResult.TweakColor;
  const TweakRadio = tweaksResult.TweakRadio;
  const TweakToggle = tweaksResult.TweakToggle;

  const [activeModule, setActiveModule] = React.useState('dashboard');

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':     return React.createElement(Dashboard, { setActiveModule });
      case 'tarjetas':      return React.createElement(Tarjetas, null);
      case 'rutas':         return React.createElement(Rutas, null);
      case 'operativo':     return React.createElement(Operativo, null);
      case 'redaccion':     return React.createElement(Redaccion, null);
      case 'mensajeros':    return React.createElement(Mensajeros, null);
      case 'facturacion':   return React.createElement(Facturacion, null);
      case 'reportes':      return React.createElement(Reportes, null);
      case 'configuracion': return React.createElement(Configuracion, null);
      default:              return React.createElement(Dashboard, { setActiveModule });
    }
  };

  return React.createElement('div', { style: { display: 'flex', height: '100vh', background: tweaks.bgColor, overflow: 'hidden' } },
    React.createElement(Sidebar, { activeModule, setActiveModule, alerts: 38 }),
    React.createElement('main', { style: { marginLeft: 220, flex: 1, overflowY: 'auto', minHeight: '100vh' } },
      renderModule()
    ),
    React.createElement(TweaksPanel, null,
      React.createElement(TweakSection, { title: 'Apariencia' },
        React.createElement(TweakColor, { id: 'accentColor', label: 'Color de acento' }),
        React.createElement(TweakColor, { id: 'bgColor', label: 'Fondo general' }),
        React.createElement(TweakRadio, { id: 'density', label: 'Densidad', options: ['compact', 'normal', 'comfortable'] }),
        React.createElement(TweakToggle, { id: 'sidebarDark', label: 'Sidebar oscuro' })
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App, null));
