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
