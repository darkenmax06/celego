// Lotes Module — basado en estructura real LOTE 22-4-2026.xlsx y Esquema seguimiento

function LoteModal({ lote, onClose }) {
  const [tarjetas, setTarjetas] = React.useState(lote.tarjetas.map(t => ({ ...t })));

  const toggleRecibida = (i) => setTarjetas(prev => prev.map((t, j) => j === i ? { ...t, recibida: !t.recibida, retornada: t.recibida ? t.retornada : false } : t));
  const toggleRetornada = (i) => setTarjetas(prev => prev.map((t, j) => j === i ? { ...t, retornada: !t.retornada, recibida: t.retornada ? t.recibida : false } : t));

  const recibidas = tarjetas.filter(t => t.recibida).length;
  const retornadas = tarjetas.filter(t => t.retornada).length;
  const pendientes = tarjetas.length - recibidas - retornadas;

  return (
    <div style={lotStyles.overlay} onClick={onClose}>
      <div style={lotStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={lotStyles.mHeader}>
          <div>
            <div style={lotStyles.mLoteId}>LOTE {lote.loteId}</div>
            <div style={lotStyles.mNombre}>{lote.nombre} — {lote.provincia}</div>
          </div>
          <button onClick={onClose} style={lotStyles.closeBtn}>✕</button>
        </div>

        {/* Stats */}
        <div style={lotStyles.statsRow}>
          {[
            { label: 'Total', val: tarjetas.length, color: '#333' },
            { label: 'Recibidas', val: recibidas, color: 'oklch(0.58 0.18 145)' },
            { label: 'Retornadas', val: retornadas, color: 'oklch(0.65 0.22 25)' },
            { label: 'Pendientes', val: pendientes, color: 'oklch(0.55 0.18 260)' },
          ].map(s => (
            <div key={s.label} style={lotStyles.statChip}>
              <span style={{ ...lotStyles.statVal, color: s.color }}>{s.val}</span>
              <span style={lotStyles.statLabel}>{s.label}</span>
            </div>
          ))}
        </div>

        <div style={lotStyles.mBody}>
          <div style={lotStyles.tableHead}>
            <span style={{ flex: '0 0 170px' }}>No. Tarjeta</span>
            <span style={{ flex: '0 0 130px' }}>Cédula</span>
            <span style={{ flex: '0 0 130px' }}>Teléfono</span>
            <span style={{ flex: 1 }}></span>
            <span style={{ flex: '0 0 100px', textAlign: 'center' }}>Recibida</span>
            <span style={{ flex: '0 0 100px', textAlign: 'center' }}>Retornada</span>
          </div>
          {tarjetas.map((t, i) => (
            <div key={t.tc} style={{ ...lotStyles.tableRow, background: t.recibida ? 'oklch(0.58 0.18 145 / 0.04)' : t.retornada ? 'oklch(0.65 0.22 25 / 0.04)' : '#fff', borderBottom: i < tarjetas.length - 1 ? '1px solid #f4f4f2' : 'none' }}>
              <span style={{ ...lotStyles.tcCode, flex: '0 0 170px' }}>{t.tc}</span>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#888', flex: '0 0 130px' }}>{t.cedula}</span>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#555', flex: '0 0 130px' }}>{t.telefono || '—'}</span>
              <span style={{ flex: 1 }}></span>
              <div style={{ flex: '0 0 100px', display: 'flex', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={t.recibida} onChange={() => toggleRecibida(i)} style={{ accentColor: 'oklch(0.58 0.18 145)', width: 16, height: 16 }} />
                  {t.recibida && <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: 'oklch(0.58 0.18 145)', fontWeight: 700 }}>✓</span>}
                </label>
              </div>
              <div style={{ flex: '0 0 100px', display: 'flex', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={t.retornada} onChange={() => toggleRetornada(i)} style={{ accentColor: 'oklch(0.65 0.22 25)', width: 16, height: 16 }} />
                  {t.retornada && <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: 'oklch(0.65 0.22 25)', fontWeight: 700 }}>✓</span>}
                </label>
              </div>
            </div>
          ))}
        </div>
        <div style={lotStyles.mFooter}>
          <button style={lotStyles.btnSecondary} onClick={onClose}>Cerrar</button>
          <button style={lotStyles.btnSecondary}>↓ Excel</button>
          <button style={lotStyles.btnPrimary}>✓ Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

function Rutas() {
  const [lotes, setLotes] = React.useState(REAL_LOTES_MENSAJEROS);
  const [esquema, setEsquema] = React.useState(REAL_ESQUEMA_LOTES);
  const [activeTab, setActiveTab] = React.useState('lotes');
  const [selectedLote, setSelectedLote] = React.useState(null);
  const [showNuevo, setShowNuevo] = React.useState(false);

  const statusColor = (s) => s === 'RETORNADO' ? 'oklch(0.58 0.18 145)' : s === 'EN TRANSITO' ? 'oklch(0.55 0.18 260)' : 'oklch(0.6 0.18 60)';
  const statusBg = (s) => s === 'RETORNADO' ? 'oklch(0.58 0.18 145 / 0.1)' : s === 'EN TRANSITO' ? 'oklch(0.55 0.18 260 / 0.1)' : 'oklch(0.6 0.18 60 / 0.1)';

  return (
    <div style={lotStyles.container}>
      <div style={lotStyles.header}>
        <div>
          <h1 style={lotStyles.title}>Lotes</h1>
          <p style={lotStyles.sub}>Gestión de envíos a mensajeros de provincia</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={lotStyles.btnSecondary}>↓ Exportar</button>
          <button style={lotStyles.btnPrimary} onClick={() => setShowNuevo(true)}>+ Nuevo Lote</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['lotes','Lotes Activos'],['seguimiento','Seguimiento de Lotes']].map(([id, lbl]) => (
          <button key={id} style={{ ...lotStyles.tabBtn, ...(activeTab === id ? lotStyles.tabActive : {}) }} onClick={() => setActiveTab(id)}>{lbl}</button>
        ))}
      </div>

      {activeTab === 'lotes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {lotes.map(lote => {
            const recibidas = lote.tarjetas.filter(t => t.recibida).length;
            const retornadas = lote.tarjetas.filter(t => t.retornada).length;
            const pct = lote.tarjetas.length > 0 ? Math.round((recibidas + retornadas) / lote.tarjetas.length * 100) : 0;
            return (
              <div key={lote.loteId} style={lotStyles.loteCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={lotStyles.loteId}>LOTE {lote.loteId}</span>
                  <span style={lotStyles.pctBadge}>{pct}% procesado</span>
                </div>
                <div style={lotStyles.loteNombre}>{lote.nombre}</div>
                <div style={lotStyles.loteProv}>{lote.provincia}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12, marginBottom: 12 }}>
                  {[['Total', lote.tarjetas.length, '#333'], ['Recibidas', recibidas, 'oklch(0.58 0.18 145)'], ['Retornadas', retornadas, 'oklch(0.65 0.22 25)']].map(([l,v,c]) => (
                    <div key={l} style={lotStyles.loteStat}>
                      <span style={{ ...lotStyles.loteStatVal, color: c }}>{v}</span>
                      <span style={lotStyles.loteStatLabel}>{l}</span>
                    </div>
                  ))}
                </div>
                <div style={lotStyles.progressBg}>
                  <div style={{ ...lotStyles.progressFill, width: `${pct}%` }}></div>
                </div>
                <button style={{ ...lotStyles.btnPrimary, width: '100%', marginTop: 12, justifyContent: 'center', display: 'flex' }} onClick={() => setSelectedLote(lote)}>
                  Ver tarjetas →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'seguimiento' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebea', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 140px 120px 120px 110px', gap: 8, padding: '10px 16px', background: '#f8f8f6', borderBottom: '1px solid #ebebea', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>
            <span>No. Lote</span><span>Mensajero</span><span>Provincia</span><span>F. Envío</span><span>F. Retorno</span><span>Status</span>
          </div>
          {esquema.map((l, i) => (
            <div key={l.lote} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 140px 120px 120px 110px', gap: 8, padding: '11px 16px', borderBottom: i < esquema.length - 1 ? '1px solid #f4f4f2' : 'none', alignItems: 'center' }}>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700, color: 'oklch(0.55 0.18 260)' }}>{l.lote}</span>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#333', fontWeight: 500 }}>{l.mensajero}</span>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, color: '#555' }}>{l.provincia}</span>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#888' }}>{l.fechaEnvio}</span>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#888' }}>{l.fechaRetorno || '—'}</span>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: statusColor(l.status), background: statusBg(l.status), borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>{l.status}</span>
            </div>
          ))}
        </div>
      )}

      {selectedLote && <LoteModal lote={selectedLote} onClose={() => setSelectedLote(null)} />}

      {showNuevo && (
        <div style={lotStyles.overlay} onClick={() => setShowNuevo(false)}>
          <div style={{ ...lotStyles.modal, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={lotStyles.mHeader}>
              <div style={lotStyles.mNombre}>Nuevo Lote</div>
              <button onClick={() => setShowNuevo(false)} style={lotStyles.closeBtn}>✕</button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[['No. de Lote','text','Ej: 2504'],['Mensajero','text','Nombre del mensajero'],['Provincia','text','Provincia destino'],['Fecha de Envío','date','']].map(([lbl,type,ph]) => (
                <div key={lbl}>
                  <label style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>{lbl}</label>
                  <input type={type} placeholder={ph} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button style={lotStyles.btnSecondary} onClick={() => setShowNuevo(false)}>Cancelar</button>
                <button style={lotStyles.btnPrimary} onClick={() => setShowNuevo(false)}>Crear Lote</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lotStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  sub: { fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  tabBtn: { padding: '8px 18px', borderRadius: 8, border: '2px solid #ebebea', background: '#fff', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, color: '#888', cursor: 'pointer' },
  tabActive: { borderColor: 'oklch(0.55 0.18 260)', color: 'oklch(0.55 0.18 260)', background: 'oklch(0.55 0.18 260 / 0.05)' },
  loteCard: { background: '#fff', borderRadius: 12, border: '1px solid #ebebea', padding: '18px 20px' },
  loteId: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700, color: 'oklch(0.55 0.18 260)', letterSpacing: '0.04em' },
  pctBadge: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: '#888', background: '#f4f4f2', borderRadius: 5, padding: '2px 8px' },
  loteNombre: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em' },
  loteProv: { fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#888', marginTop: 2 },
  loteStat: { background: '#f9f9f7', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' },
  loteStatVal: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' },
  loteStatLabel: { fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: '#aaa' },
  progressBg: { height: 5, background: '#f0f0ee', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'oklch(0.55 0.18 260)', borderRadius: 4, transition: 'width 0.3s' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#fff', borderRadius: 16, width: '92%', maxWidth: 740, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  mHeader: { padding: '18px 22px', borderBottom: '1px solid #f0f0ee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 },
  mLoteId: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: 'oklch(0.55 0.18 260)', fontWeight: 700, letterSpacing: '0.04em', marginBottom: 2 },
  mNombre: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em' },
  closeBtn: { background: '#f4f4f2', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 13, color: '#666' },
  statsRow: { display: 'flex', gap: 12, padding: '14px 22px', borderBottom: '1px solid #f0f0ee', flexShrink: 0 },
  statChip: { flex: 1, background: '#f9f9f7', borderRadius: 10, padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  statVal: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: '-0.04em' },
  statLabel: { fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: '#aaa' },
  mBody: { flex: 1, overflowY: 'auto' },
  mFooter: { padding: '12px 22px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 },
  tableHead: { display: 'flex', gap: 8, padding: '9px 16px', background: '#f8f8f6', borderBottom: '1px solid #ebebea', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tableRow: { display: 'flex', gap: 8, padding: '10px 16px', alignItems: 'center' },
  tcCode: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: 'oklch(0.55 0.18 260)', fontWeight: 600, letterSpacing: '0.02em' },
};

Object.assign(window, { Rutas });
