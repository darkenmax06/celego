// Operativo de Llamadas — modal completo con teléfonos+checkbox principal, comentario, contactado

function ContactModal({ card, onClose, onNext, onPrev, idx, total }) {
  const [tels, setTels] = React.useState(
    card.telefonos && card.telefonos.length > 0
      ? card.telefonos.map((t, i) => ({ ...t }))
      : [{ num: '', principal: true, funciona: false }]
  );
  const [comentario, setComentario] = React.useState(card.comentarioContacto || '');
  const [contactado, setContactado] = React.useState(card.contactado || false);
  const [newTel, setNewTel] = React.useState('');

  const setPrincipal = (idx) => {
    setTels(prev => prev.map((t, i) => ({ ...t, principal: i === idx })));
  };
  const toggleFunciona = (idx) => {
    setTels(prev => prev.map((t, i) => i === idx ? { ...t, funciona: !t.funciona } : t));
  };
  const addTel = () => {
    if (newTel.trim()) {
      setTels(prev => [...prev, { num: newTel.trim(), principal: false, funciona: false }]);
      setNewTel('');
    }
  };
  const removeTel = (idx) => setTels(prev => prev.filter((_, i) => i !== idx));

  const statusColor = card.status === 'RETORNADA' ? 'oklch(0.65 0.22 25)'
    : card.status === 'EN RUTA' ? 'oklch(0.6 0.18 200)'
    : card.status === 'DESPACHADA' ? 'oklch(0.55 0.18 260)'
    : 'oklch(0.58 0.18 145)';

  const telPrincipal = tels.find(t => t.principal) || tels[0];

  return (
    <div style={opStyles.overlay}>
      <div style={opStyles.modal}>
        {/* Header */}
        <div style={opStyles.mTop}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={opStyles.mAvatar}>{card.nombre.split(' ').slice(0,2).map(w=>w[0]).join('')}</div>
            <div style={{ flex: 1 }}>
              <div style={opStyles.mNombre}>{card.nombre}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                <span style={opStyles.mTC}>{card.tc}</span>
                <span style={opStyles.mProv}>{card.provincia || card.zona}</span>
                <span style={{ ...opStyles.statusChip, color: statusColor, background: `${statusColor.replace(')', ' / 0.1)')}` }}>{card.status}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={opStyles.counterBadge}>{idx + 1} / {total}</span>
            <button style={opStyles.navBtn} onClick={onPrev} disabled={idx === 0}>←</button>
            <button style={opStyles.navBtn} onClick={onNext} disabled={idx === total - 1}>→</button>
            <button style={opStyles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={opStyles.mBody}>
          {/* Info esencial */}
          <div style={opStyles.infoBar}>
            <div style={opStyles.infoBarItem}>
              <span style={opStyles.infoBarKey}>Cédula</span>
              <span style={opStyles.infoBarVal}>{card.cedula}</span>
            </div>
            <div style={opStyles.infoBarItem}>
              <span style={opStyles.infoBarKey}>Presinto</span>
              <span style={opStyles.infoBarVal}>{card.presinto || '—'}</span>
            </div>
            <div style={opStyles.infoBarItem}>
              <span style={opStyles.infoBarKey}>Despacho</span>
              <span style={opStyles.infoBarVal}>{card.fechaDespacho || '—'}</span>
            </div>
            <div style={opStyles.infoBarItem}>
              <span style={opStyles.infoBarKey}>Emisión</span>
              <span style={opStyles.infoBarVal}>{card.tipoEmision || '—'}</span>
            </div>
          </div>

          {/* Dirección */}
          {card.direcciones && card.direcciones.length > 0 && (
            <div style={opStyles.dirBlock}>
              <div style={opStyles.secLabel}>Dirección</div>
              <div style={opStyles.dirText}>{card.direcciones.join(' · ')}</div>
              {card.refs && card.refs.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {card.refs.map(r => <span key={r} style={opStyles.refTag}>{r}</span>)}
                </div>
              )}
            </div>
          )}

          {/* Teléfonos — con checkboxes */}
          <div style={{ marginBottom: 16 }}>
            <div style={opStyles.secLabel}>Teléfonos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tels.map((t, i) => (
                <div key={i} style={{ ...opStyles.telRow, border: t.principal ? '1.5px solid oklch(0.6 0.18 60 / 0.4)' : '1.5px solid #ebebea', background: t.principal ? 'oklch(0.6 0.18 60 / 0.04)' : '#f9f9f7' }}>
                  {/* Marcar como principal */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <button
                      onClick={() => setPrincipal(i)}
                      title="Marcar como principal"
                      style={{ ...opStyles.starBtn, color: t.principal ? 'oklch(0.6 0.18 60)' : '#ccc' }}
                    >★</button>
                  </div>

                  {/* Número */}
                  <span style={opStyles.telNum}>{t.num}</span>

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {t.principal && <span style={opStyles.tagPrincipal}>Principal</span>}
                  </div>

                  {/* Funciona toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={t.funciona}
                      onChange={() => toggleFunciona(i)}
                      style={{ accentColor: 'oklch(0.58 0.18 145)', width: 14, height: 14 }}
                    />
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11.5, color: t.funciona ? 'oklch(0.58 0.18 145)' : '#aaa' }}>
                      {t.funciona ? '✓ Funciona' : 'No funciona'}
                    </span>
                  </label>

                  <button onClick={() => removeTel(i)} style={opStyles.removeTelBtn}>✕</button>
                </div>
              ))}
              {/* Agregar número */}
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <input
                  value={newTel}
                  onChange={e => setNewTel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTel()}
                  placeholder="Agregar número..."
                  style={opStyles.telInput}
                />
                <button style={opStyles.addTelBtn} onClick={addTel}>+ Agregar</button>
              </div>
            </div>
          </div>

          {/* Comentario */}
          <div style={{ marginBottom: 16 }}>
            <div style={opStyles.secLabel}>Comentario de contacto</div>
            <textarea
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              placeholder="Ej: Cliente confirmó disponible después de las 5pm, llamar al número principal..."
              style={opStyles.textarea}
              rows={3}
            />
          </div>

          {/* Contactado */}
          <label style={{ ...opStyles.contactadoRow, background: contactado ? 'oklch(0.58 0.18 145 / 0.07)' : '#f9f9f7', border: contactado ? '1.5px solid oklch(0.58 0.18 145 / 0.3)' : '1.5px solid #ebebea' }}>
            <div style={{ ...opStyles.checkBox, background: contactado ? 'oklch(0.58 0.18 145)' : '#fff', border: contactado ? '2px solid oklch(0.58 0.18 145)' : '2px solid #ddd' }}>
              {contactado && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
            </div>
            <input type="checkbox" checked={contactado} onChange={e => setContactado(e.target.checked)} style={{ display: 'none' }} />
            <div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, color: '#333' }}>Marcar como Contactado</div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11.5, color: '#aaa', marginTop: 1 }}>
                {telPrincipal ? `Tel. principal: ${telPrincipal.num}` : 'Sin teléfono principal'}
              </div>
            </div>
          </label>
        </div>

        <div style={opStyles.mFooter}>
          <button style={opStyles.btnSecondary} onClick={onClose}>Cerrar</button>
          <button style={opStyles.btnPrimary}>✓ Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

function ReporteContactosModal({ data, onClose }) {
  const contactadas = data.filter(c => c.contactado);
  const pendientes = data.filter(c => !c.contactado);

  return (
    <div style={opStyles.overlay} onClick={onClose}>
      <div style={{ ...opStyles.modal, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #f0f0ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}>Reporte de Contactos</div>
          <button onClick={onClose} style={opStyles.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total', val: data.length, color: '#333' },
              { label: 'Contactadas', val: contactadas.length, color: 'oklch(0.58 0.18 145)' },
              { label: 'Pendientes', val: pendientes.length, color: 'oklch(0.65 0.22 25)' },
            ].map(s => (
              <div key={s.label} style={{ background: '#f9f9f7', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, color: s.color, letterSpacing: '-0.04em' }}>{s.val}</div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#888' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #ebebea', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px', gap: 8, padding: '8px 14px', background: '#f8f8f6', borderBottom: '1px solid #ebebea', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>
              <span>Cliente / TC</span>
              <span>Tel. Principal</span>
              <span>Status</span>
              <span style={{ textAlign: 'center' }}>Contactado</span>
            </div>
            {data.map((c, i) => {
              const telP = c.telefonos?.find(t => t.principal) || c.telefonos?.[0];
              return (
                <div key={c.tc} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px', gap: 8, padding: '9px 14px', borderBottom: i < data.length - 1 ? '1px solid #f4f4f2' : 'none', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, fontWeight: 500, color: '#333' }}>{c.nombre}</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10.5, color: '#aaa' }}>{c.tc}</div>
                  </div>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#555' }}>{telP?.num || '—'}</span>
                  <StatusBadge statusId={c.status} />
                  <div style={{ textAlign: 'center' }}>
                    {c.contactado
                      ? <span style={{ color: 'oklch(0.58 0.18 145)', fontSize: 16 }}>✓</span>
                      : <span style={{ color: '#ddd', fontSize: 14 }}>○</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mensajero report section */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 10 }}>Generar reporte para mensajero</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...new Set(data.map(c => c.provincia || c.zona))].map(prov => {
                const tarjetas = data.filter(c => (c.provincia || c.zona) === prov);
                return (
                  <div key={prov} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f9f9f7', borderRadius: 8 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, color: '#333' }}>{prov}</span>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#aaa', marginLeft: 8 }}>{tarjetas.length} tarjetas</span>
                    </div>
                    <button style={{ ...opStyles.btnSecondary, padding: '6px 12px', fontSize: 12 }}>↓ Excel</button>
                    <button style={{ ...opStyles.btnPrimary, padding: '6px 12px', fontSize: 12 }}>↓ PDF</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 22px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button style={opStyles.btnSecondary} onClick={onClose}>Cerrar</button>
          <button style={opStyles.btnPrimary}>↓ Exportar reporte completo</button>
        </div>
      </div>
    </div>
  );
}

function Operativo() {
  const [cards, setCards] = React.useState(REAL_TARJETAS.filter(t => t.status !== 'ENTREGADA'));
  const [urgentes, setUrgentes] = React.useState(REAL_URGENTES);
  const [tab, setTab] = React.useState('activos'); // 'activos' | 'urgentes'
  const [filterProv, setFilterProv] = React.useState('all');
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [selectedIdx, setSelectedIdx] = React.useState(null);
  const [showReporte, setShowReporte] = React.useState(false);

  const activeData = tab === 'activos' ? cards : urgentes;
  const filtered = activeData.filter(c => {
    const mP = filterProv === 'all' || (c.provincia || c.zona) === filterProv;
    const mS = filterStatus === 'all' || c.status === filterStatus;
    const q = search.toLowerCase();
    const mQ = !q || c.tc.includes(q) || c.nombre.toLowerCase().includes(q) || c.cedula.includes(q);
    return mP && mS && mQ;
  });

  const provincias = [...new Set(activeData.map(c => c.provincia || c.zona))].sort();
  const contactadas = filtered.filter(c => c.contactado).length;

  return (
    <div style={opStyles.container}>
      <div style={opStyles.header}>
        <div>
          <h1 style={opStyles.title}>Operativo de Llamadas</h1>
          <p style={opStyles.sub}>{filtered.length} tarjetas · {contactadas} contactadas</p>
        </div>
        <button style={opStyles.btnPrimary} onClick={() => setShowReporte(true)}>↗ Reporte de Contactos</button>
      </div>

      {/* Tabs */}
      <div style={opStyles.tabsRow}>
        <button style={{ ...opStyles.tabBtn, ...(tab === 'activos' ? opStyles.tabActive : {}) }} onClick={() => setTab('activos')}>
          Tarjetas Activas <span style={opStyles.tabCount}>{cards.length}</span>
        </button>
        <button style={{ ...opStyles.tabBtn, ...(tab === 'urgentes' ? { ...opStyles.tabActive, color: 'oklch(0.65 0.22 25)', borderColor: 'oklch(0.65 0.22 25)' } : {}) }} onClick={() => setTab('urgentes')}>
          Urgentes <span style={{ ...opStyles.tabCount, ...(tab === 'urgentes' ? { background: 'oklch(0.65 0.22 25 / 0.12)', color: 'oklch(0.65 0.22 25)' } : {}) }}>{urgentes.length}</span>
        </button>
      </div>

      {/* Filters */}
      <div style={opStyles.filters}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar TC, cédula o nombre..." style={opStyles.searchInput} />
        <select value={filterProv} onChange={e => setFilterProv(e.target.value)} style={opStyles.sel}>
          <option value="all">Todas las provincias</option>
          {provincias.map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={opStyles.sel}>
          <option value="all">Todos los status</option>
          {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* List */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebea', overflow: 'hidden' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#ccc', fontFamily: "'DM Sans',sans-serif", fontSize: 14 }}>No hay tarjetas con estos filtros</div>
        )}
        {filtered.map((card, i) => {
          const telP = card.telefonos?.find(t => t.principal) || card.telefonos?.[0];
          return (
            <div key={card.tc} style={{ ...opStyles.listRow, borderBottom: i < filtered.length - 1 ? '1px solid #f4f4f2' : 'none', background: card.contactado ? 'oklch(0.58 0.18 145 / 0.03)' : '#fff' }}>
              <div style={opStyles.listAvatar}>{card.nombre.split(' ').slice(0,2).map(w=>w[0]).join('')}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={opStyles.listNombre}>{card.nombre}</span>
                  <span style={opStyles.listTC}>{card.tc}</span>
                  {card.contactado && <span style={opStyles.contactadoBadge}>✓ Contactado</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                  <span style={opStyles.listMeta}>{card.cedula}</span>
                  <span style={opStyles.listMeta}>·</span>
                  <span style={opStyles.listMeta}>{card.provincia || card.zona}</span>
                  {telP && <><span style={opStyles.listMeta}>·</span><span style={opStyles.listTel}>{telP.num}</span></>}
                  {card.comentarioContacto && <><span style={opStyles.listMeta}>·</span><span style={{ ...opStyles.listMeta, color: '#888', fontStyle: 'italic' }}>"{card.comentarioContacto}"</span></>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <StatusBadge statusId={card.status} />
                <button style={opStyles.callBtn} onClick={() => setSelectedIdx(i)}>Contactar →</button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedIdx !== null && filtered[selectedIdx] && (
        <ContactModal
          card={filtered[selectedIdx]}
          idx={selectedIdx}
          total={filtered.length}
          onClose={() => setSelectedIdx(null)}
          onNext={() => setSelectedIdx(i => Math.min(i + 1, filtered.length - 1))}
          onPrev={() => setSelectedIdx(i => Math.max(i - 1, 0))}
        />
      )}
      {showReporte && <ReporteContactosModal data={filtered} onClose={() => setShowReporte(false)} />}
    </div>
  );
}

const opStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  title: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  sub: { fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  tabsRow: { display: 'flex', gap: 8, marginBottom: 14 },
  tabBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, border: '2px solid #ebebea', background: '#fff', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, color: '#888', cursor: 'pointer' },
  tabActive: { borderColor: 'oklch(0.55 0.18 260)', color: 'oklch(0.55 0.18 260)', background: 'oklch(0.55 0.18 260 / 0.05)' },
  tabCount: { background: '#f0f0ee', color: '#888', borderRadius: 10, padding: '1px 8px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700 },
  filters: { display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' },
  searchInput: { flex: 1, padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#333', outline: 'none', background: '#fff' },
  sel: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#555', background: '#fff', cursor: 'pointer', outline: 'none' },
  listRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px' },
  listAvatar: { width: 36, height: 36, borderRadius: 10, background: 'oklch(0.55 0.18 260 / 0.12)', color: 'oklch(0.55 0.18 260)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700, flexShrink: 0 },
  listNombre: { fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 500, color: '#1a1a1a' },
  listTC: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#bbb', letterSpacing: '0.02em' },
  listMeta: { fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#bbb' },
  listTel: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#666', fontWeight: 500 },
  contactadoBadge: { background: 'oklch(0.58 0.18 145 / 0.12)', color: 'oklch(0.58 0.18 145)', fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '2px 6px' },
  callBtn: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, fontWeight: 500, cursor: 'pointer' },
  // Modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#fff', borderRadius: 16, width: '90%', maxWidth: 580, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' },
  mTop: { padding: '16px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 },
  mAvatar: { width: 44, height: 44, borderRadius: 12, background: 'oklch(0.55 0.18 260)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, flexShrink: 0 },
  mNombre: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em' },
  mTC: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: 'oklch(0.55 0.18 260)', fontWeight: 600, letterSpacing: '0.02em' },
  mProv: { fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#888', background: '#f4f4f2', borderRadius: 4, padding: '1px 7px' },
  statusChip: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, borderRadius: 5, padding: '2px 7px' },
  counterBadge: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#aaa', background: '#f4f4f2', borderRadius: 6, padding: '4px 8px' },
  navBtn: { background: '#f4f4f2', border: 'none', borderRadius: 7, width: 30, height: 30, cursor: 'pointer', fontSize: 14, color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  closeBtn: { background: '#f4f4f2', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 13, color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  mBody: { padding: '18px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 0 },
  mFooter: { padding: '12px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 },
  infoBar: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: '#f9f9f7', borderRadius: 10, padding: '12px 14px', marginBottom: 14 },
  infoBarItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  infoBarKey: { fontFamily: "'DM Sans',sans-serif", fontSize: 10.5, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 },
  infoBarVal: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: '#333' },
  dirBlock: { background: '#f4f4f2', borderRadius: 9, padding: '10px 13px', marginBottom: 14 },
  secLabel: { fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 },
  dirText: { fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#444', lineHeight: 1.5 },
  refTag: { background: '#ebebea', borderRadius: 5, padding: '2px 8px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#666' },
  telRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9 },
  starBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 },
  telNum: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: '#333', flex: 1, letterSpacing: '0.02em' },
  tagPrincipal: { background: 'oklch(0.6 0.18 60 / 0.15)', color: 'oklch(0.6 0.18 60)', fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px' },
  removeTelBtn: { background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 12, padding: '2px 5px' },
  telInput: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, outline: 'none' },
  addTelBtn: { background: '#f4f4f2', border: 'none', borderRadius: 7, padding: '8px 12px', fontFamily: "'DM Sans',sans-serif", fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  textarea: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#333', resize: 'vertical', outline: 'none', boxSizing: 'border-box' },
  contactadoRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', marginTop: 4 },
  checkBox: { width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' },
};

Object.assign(window, { Operativo });
