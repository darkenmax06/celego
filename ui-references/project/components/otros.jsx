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
