// Redaccion Module — con datos reales de ENTREGAS Y RETORNOS 24-4-2026.xlsx

function Redaccion() {
  const [mode, setMode] = React.useState('retorno');
  const [retornos, setRetornos] = React.useState(REAL_RETORNOS.map(r => ({ ...r })));
  const [entregas, setEntregas] = React.useState(
    REAL_TARJETAS.filter(t => t.status === 'ENTREGADA').map((t, i) => ({
      no: String(i + 1),
      tc: t.tc,
      nombre: t.nombre,
      cedula: t.cedula,
      fecha: t.fechaDespacho,
      zona: t.zona || t.provincia,
      comentario: '',
    }))
  );
  const [scanInput, setScanInput] = React.useState('');
  const [selected, setSelected] = React.useState([]);
  const [bulkMotivo, setBulkMotivo] = React.useState('');
  const [showApprove, setShowApprove] = React.useState(false);
  const [fecha, setFecha] = React.useState('24/04/2026');
  const [zona, setZona] = React.useState('ESTE');

  const lista = mode === 'retorno' ? retornos : entregas;

  const updateMotivo = (tc, val) => {
    if (mode === 'retorno') setRetornos(prev => prev.map(r => r.tc === tc ? { ...r, comentario: val } : r));
  };

  const toggleSelect = (tc) => setSelected(s => s.includes(tc) ? s.filter(x => x !== tc) : [...s, tc]);

  const applyBulk = () => {
    if (bulkMotivo && selected.length > 0) {
      setRetornos(prev => prev.map(r => selected.includes(r.tc) ? { ...r, comentario: bulkMotivo } : r));
      setSelected([]);
      setBulkMotivo('');
    }
  };

  const handleScan = (e) => {
    if (e.key === 'Enter' && scanInput.trim()) {
      const val = scanInput.trim();
      const found = REAL_TARJETAS.find(t => t.tc === val || t.cedula === val);
      if (found) {
        const newEntry = { no: String(lista.length + 1), tc: found.tc, nombre: found.nombre, cedula: found.cedula, fecha: found.fechaDespacho, zona: found.zona || found.provincia, comentario: '' };
        if (mode === 'retorno') setRetornos(prev => [...prev, newEntry]);
        else setEntregas(prev => [...prev, newEntry]);
      }
      setScanInput('');
    }
  };

  const removeRow = (tc) => {
    if (mode === 'retorno') setRetornos(prev => prev.filter(r => r.tc !== tc));
    else setEntregas(prev => prev.filter(r => r.tc !== tc));
  };

  return (
    <div style={redStyles.container}>
      <div style={redStyles.header}>
        <div>
          <h1 style={redStyles.title}>Redacción</h1>
          <p style={redStyles.sub}>Acuses de entrega y retornos · Zona {zona}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="text" value={fecha} onChange={e => setFecha(e.target.value)} placeholder="Fecha" style={redStyles.dateInput} />
          <select value={zona} onChange={e => setZona(e.target.value)} style={redStyles.sel}>
            {['METRO','ESTE','NORTE','SUR'].map(z => <option key={z}>{z}</option>)}
          </select>
          <button style={redStyles.btnSecondary}>↓ Excel</button>
          <button style={redStyles.btnSecondary}>↓ PDF</button>
          <button style={redStyles.btnPrimary} onClick={() => setShowApprove(true)}>✓ Aprobar Redacción</button>
        </div>
      </div>

      {/* Mode tabs */}
      <div style={redStyles.modeTabs}>
        <button style={{ ...redStyles.modeBtn, ...(mode === 'retorno' ? { ...redStyles.modeBtnActive, borderColor: 'oklch(0.65 0.22 25)', color: 'oklch(0.65 0.22 25)', background: 'oklch(0.65 0.22 25 / 0.05)' } : {}) }} onClick={() => setMode('retorno')}>
          Tarjetas Retornadas
          <span style={{ ...redStyles.modeCount, ...(mode === 'retorno' ? { background: 'oklch(0.65 0.22 25 / 0.15)', color: 'oklch(0.65 0.22 25)' } : {}) }}>{retornos.length}</span>
        </button>
        <button style={{ ...redStyles.modeBtn, ...(mode === 'entrega' ? redStyles.modeBtnActive : {}) }} onClick={() => setMode('entrega')}>
          Acuses de Entrega
          <span style={redStyles.modeCount}>{entregas.length}</span>
        </button>
      </div>

      {/* Scan bar */}
      <div style={redStyles.scanBar}>
        <div style={redStyles.scanIcon}>⊙</div>
        <input
          value={scanInput}
          onChange={e => setScanInput(e.target.value)}
          onKeyDown={handleScan}
          placeholder="Pistolear código de barras o digitar No. TC / Cédula... (↵ para agregar)"
          style={redStyles.scanInput}
          autoFocus
        />
        <span style={redStyles.scanHint}>↵ Enter para agregar</span>
      </div>

      {/* Bulk motivo for retornos */}
      {mode === 'retorno' && selected.length > 0 && (
        <div style={redStyles.bulkBar}>
          <span style={redStyles.bulkCount}>{selected.length} seleccionadas</span>
          <select value={bulkMotivo} onChange={e => setBulkMotivo(e.target.value)} style={redStyles.bulkSel}>
            <option value="">Seleccionar motivo...</option>
            {MOTIVOS_RETORNO.map(m => <option key={m}>{m}</option>)}
          </select>
          <button style={redStyles.btnPrimary} onClick={applyBulk}>Aplicar a seleccionadas</button>
          <button style={redStyles.btnSecondary} onClick={() => setSelected([])}>Cancelar</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebea', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: mode === 'retorno' ? '30px 40px 175px 130px 1fr 80px 220px 36px' : '30px 40px 175px 130px 1fr 80px 36px', gap: 8, padding: '9px 14px', background: '#f8f8f6', borderBottom: '1px solid #ebebea', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', alignItems: 'center' }}>
          <span></span>
          <span>No.</span>
          <span>No. TC</span>
          <span>Cédula</span>
          <span>Nombre</span>
          <span>Fecha</span>
          {mode === 'retorno' && <span>Motivo</span>}
          <span></span>
        </div>
        {lista.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#ccc', fontFamily: "'DM Sans',sans-serif", fontSize: 14 }}>
            No hay tarjetas. Usa la barra de escaneo para agregar.
          </div>
        )}
        {lista.map((row, i) => (
          <div key={row.tc} style={{ display: 'grid', gridTemplateColumns: mode === 'retorno' ? '30px 40px 175px 130px 1fr 80px 220px 36px' : '30px 40px 175px 130px 1fr 80px 36px', gap: 8, padding: '9px 14px', borderBottom: i < lista.length - 1 ? '1px solid #f4f4f2' : 'none', alignItems: 'center', background: selected.includes(row.tc) ? 'oklch(0.65 0.22 25 / 0.04)' : '#fff' }}>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {mode === 'retorno' && <input type="checkbox" checked={selected.includes(row.tc)} onChange={() => toggleSelect(row.tc)} style={{ accentColor: 'oklch(0.65 0.22 25)' }} />}
            </span>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#ccc', fontWeight: 600 }}>{row.no}</span>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11.5, color: 'oklch(0.55 0.18 260)', fontWeight: 600, letterSpacing: '0.02em' }}>{row.tc}</span>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#aaa' }}>{row.cedula}</span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#333', fontWeight: 400 }}>{row.nombre}</span>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11.5, color: '#888' }}>{row.fecha}</span>
            {mode === 'retorno' && (
              <input
                value={row.comentario}
                onChange={e => updateMotivo(row.tc, e.target.value)}
                placeholder="Motivo..."
                list="motivos-list"
                style={redStyles.motivoInput}
              />
            )}
            <button onClick={() => removeRow(row.tc)} style={redStyles.removeBtn}>✕</button>
          </div>
        ))}
        <datalist id="motivos-list">
          {MOTIVOS_RETORNO.map(m => <option key={m} value={m} />)}
        </datalist>
      </div>

      {/* Approve modal */}
      {showApprove && (
        <div style={redStyles.overlay} onClick={() => setShowApprove(false)}>
          <div style={redStyles.approveModal} onClick={e => e.stopPropagation()}>
            <div style={redStyles.approveHeader}>Confirmar Redacción</div>
            <div style={{ padding: '18px 20px' }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: '#555', margin: '0 0 16px' }}>
                Al aprobar se actualizarán los status en el sistema:
              </p>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, background: '#f9f9f7', borderRadius: 10, padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 800, color: 'oklch(0.65 0.22 25)', letterSpacing: '-0.05em' }}>{retornos.length}</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#666' }}>→ RETORNADAS</div>
                </div>
                <div style={{ flex: 1, background: '#f9f9f7', borderRadius: 10, padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 800, color: 'oklch(0.58 0.18 145)', letterSpacing: '-0.05em' }}>{entregas.length}</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#666' }}>→ ENTREGADAS</div>
                </div>
              </div>
              <div style={{ background: 'oklch(0.6 0.18 60 / 0.08)', borderRadius: 8, padding: '10px 12px', fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, color: '#666', marginBottom: 4 }}>
                ⚠ Esta acción actualizará el status de <strong>{retornos.length + entregas.length} tarjetas</strong> y no se puede deshacer.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid #f0f0ee' }}>
              <button style={redStyles.btnSecondary} onClick={() => setShowApprove(false)}>Cancelar</button>
              <button style={redStyles.btnPrimary} onClick={() => setShowApprove(false)}>✓ Aprobar y actualizar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const redStyles = {
  container: { padding: '28px 32px', maxWidth: 1300 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  title: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' },
  sub: { fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#888', margin: '4px 0 0' },
  btnPrimary: { background: 'oklch(0.55 0.18 260)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: '#f4f4f2', color: '#333', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  dateInput: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#444', outline: 'none', width: 110 },
  sel: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#555', background: '#fff', cursor: 'pointer', outline: 'none' },
  modeTabs: { display: 'flex', gap: 8, marginBottom: 14 },
  modeBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 8, border: '2px solid #ebebea', background: '#fff', fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 500, color: '#888', cursor: 'pointer' },
  modeBtnActive: { borderColor: 'oklch(0.55 0.18 260)', color: 'oklch(0.55 0.18 260)', background: 'oklch(0.55 0.18 260 / 0.05)' },
  modeCount: { background: '#f0f0ee', color: '#888', borderRadius: 10, padding: '1px 8px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700 },
  scanBar: { display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 10, border: '2px solid oklch(0.55 0.18 260 / 0.3)', padding: '10px 16px', marginBottom: 14 },
  scanIcon: { color: 'oklch(0.55 0.18 260)', fontSize: 18 },
  scanInput: { flex: 1, border: 'none', outline: 'none', fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: '#333' },
  scanHint: { fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#ccc', whiteSpace: 'nowrap' },
  bulkBar: { display: 'flex', alignItems: 'center', gap: 10, background: 'oklch(0.65 0.22 25 / 0.08)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, border: '1px solid oklch(0.65 0.22 25 / 0.2)' },
  bulkCount: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: 'oklch(0.65 0.22 25)', whiteSpace: 'nowrap' },
  bulkSel: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: 'none' },
  motivoInput: { width: '100%', padding: '5px 9px', borderRadius: 7, border: '1.5px solid #e8e8e6', fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: 'none', boxSizing: 'border-box' },
  removeBtn: { background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 12, padding: '2px 6px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  approveModal: { background: '#fff', borderRadius: 14, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' },
  approveHeader: { padding: '18px 20px', borderBottom: '1px solid #f0f0ee', fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, color: '#1a1a1a' },
};

Object.assign(window, { Redaccion });
