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
