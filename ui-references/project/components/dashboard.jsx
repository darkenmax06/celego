// Dashboard — con datos reales

function Dashboard({ setActiveModule }) {
  const total = REAL_TARJETAS.length;
  const entregadas = REAL_TARJETAS.filter(t => t.status === 'ENTREGADA').length;
  const retornadas = REAL_TARJETAS.filter(t => t.status === 'RETORNADA').length;
  const enRuta = REAL_TARJETAS.filter(t => t.status === 'EN RUTA').length;
  const urgentesCount = REAL_URGENTES.length;

  const STATS = [
    { label: 'En Posesión', value: total, sub: 'tarjetas activas', color: 'oklch(0.55 0.18 260)', delta: '+15 hoy' },
    { label: 'En Ruta', value: enRuta, sub: 'asignadas a mensajero', color: 'oklch(0.6 0.18 200)', delta: `${Math.round(enRuta/total*100)}%` },
    { label: 'Urgentes', value: urgentesCount, sub: 'requieren gestión', color: 'oklch(0.65 0.22 25)', delta: 'atención' },
    { label: 'Retornadas', value: retornadas, sub: 'este período', color: 'oklch(0.55 0.16 310)', delta: `${Math.round(retornadas/total*100)}%` },
  ];

  const byProv = {};
  REAL_TARJETAS.forEach(t => { byProv[t.provincia] = (byProv[t.provincia]||0) + 1; });
  const provStats = Object.entries(byProv).sort((a,b) => b[1]-a[1]).map(([p, n]) => ({ prov: p, n, pct: Math.round(n/total*100) }));
  const provColors = ['oklch(0.55 0.18 260)','oklch(0.58 0.18 145)','oklch(0.55 0.16 310)','oklch(0.65 0.22 25)','oklch(0.6 0.18 200)'];

  const recentActivity = [
    { time: '09:42', action: 'Importación', detail: `${total} tarjetas — Lote AUTOMATICAS ZONA ESTE`, type: 'import' },
    { time: '09:15', action: 'Redacción', detail: `${retornadas} tarjetas retornadas procesadas`, type: 'doc' },
    { time: '08:55', action: 'Urgentes', detail: `${urgentesCount} tarjetas marcadas como urgentes`, type: 'return' },
    { time: '08:30', action: 'En Ruta', detail: `${enRuta} tarjetas asignadas a mensajeros`, type: 'status' },
    { time: '08:00', action: 'Lote 2204', detail: 'Enviado a Pedro Santos — HIGUEY', type: 'route' },
  ];
  const actColors = { import:'oklch(0.55 0.18 260)', doc:'oklch(0.55 0.16 310)', return:'oklch(0.65 0.22 25)', status:'oklch(0.58 0.18 145)', route:'oklch(0.6 0.14 200)' };

  return (
    <div style={dbStyles.container}>
      <div style={dbStyles.header}>
        <div>
          <h1 style={dbStyles.title}>Dashboard</h1>
          <p style={dbStyles.sub}>Viernes, 24 de abril 2026 · AUTOMATICAS ZONA ESTE</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={dbStyles.btnSecondary} onClick={() => setActiveModule('tarjetas')}>Importar tarjetas</button>
          <button style={dbStyles.btnPrimary} onClick={() => setActiveModule('redaccion')}>+ Nueva Redacción</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {STATS.map(s => (
          <div key={s.label} style={dbStyles.statCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={dbStyles.statLabel}>{s.label}</span>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: s.color }}>{s.delta}</span>
            </div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 36, fontWeight: 700, color: s.color, letterSpacing: '-0.04em', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#aaa' }}>{s.sub}</div>
            <div style={{ height: 4, background: `${s.color.replace(')', ' / 0.15)')}`, borderRadius: 4, marginTop: 8 }}>
              <div style={{ height: '100%', width: `${Math.round(s.value/total*100)}%`, background: s.color, borderRadius: 4, opacity: 0.7 }}></div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        {/* Urgentes table */}
        <div style={dbStyles.card}>
          <div style={dbStyles.cardHdr}>
            <span style={dbStyles.cardTitle}>⚠ Tarjetas Urgentes</span>
            <button style={dbStyles.cardAction} onClick={() => setActiveModule('operativo')}>Ver en Operativo →</button>
          </div>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '175px 130px 1fr 110px 100px', gap: 8, padding: '7px 0 9px', borderBottom: '1px solid #f0f0ee', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>No. TC</span><span>Cédula</span><span>Provincia</span><span>Teléfono</span><span style={{ textAlign: 'right' }}>Status</span>
            </div>
            {REAL_URGENTES.map((u, i) => {
              const telP = u.telefonos?.[0];
              const sOpt = STATUS_OPTIONS.find(s => s.id === u.status);
              return (
                <div key={u.tc} style={{ display: 'grid', gridTemplateColumns: '175px 130px 1fr 110px 100px', gap: 8, padding: '9px 0', borderBottom: i < REAL_URGENTES.length-1 ? '1px solid #f8f8f6' : 'none', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11.5, color: 'oklch(0.55 0.18 260)', fontWeight: 600 }}>{u.tc}</span>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#aaa' }}>{u.cedula}</span>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, color: '#444' }}>{u.provincia}</span>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#555' }}>{telP?.num || '—'}</span>
                  <span style={{ textAlign: 'right' }}>
                    {sOpt ? <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: sOpt.color, background: sOpt.bg, borderRadius: 5, padding: '2px 7px' }}>{sOpt.label}</span> : <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#aaa' }}>{u.status}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* By province */}
          <div style={dbStyles.card}>
            <div style={dbStyles.cardHdr}><span style={dbStyles.cardTitle}>Por Provincia</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {provStats.map((p, i) => (
                <div key={p.prov} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#444', fontWeight: 500 }}>{p.prov}</span>
                    <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{p.n}</span>
                  </div>
                  <div style={{ height: 5, background: '#f0f0ee', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.pct}%`, background: provColors[i % provColors.length], borderRadius: 4 }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity */}
          <div style={dbStyles.card}>
            <div style={dbStyles.cardHdr}><span style={dbStyles.cardTitle}>Actividad Reciente</span></div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentActivity.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: i < recentActivity.length-1 ? '1px solid #f8f8f6' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: actColors[a.type], marginTop: 4, flexShrink: 0 }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: '#333' }}>{a.action}</span>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: '#aaa' }}>{a.time}</span>
                    </div>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#888', display: 'block', marginTop: 1 }}>{a.detail}</span>
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
  title: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  sub: { fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnSecondary: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  statCard: { background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #ebebea', display: 'flex', flexDirection: 'column', gap: 4 },
  statLabel: { fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#888', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #ebebea' },
  cardHdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 600, color: '#1a1a1a' },
  cardAction: { background: 'none', border: 'none', color: 'oklch(0.55 0.18 260)', fontFamily: "'DM Sans',sans-serif", fontSize: 12, cursor: 'pointer', fontWeight: 500 },
};

Object.assign(window, { Dashboard });
