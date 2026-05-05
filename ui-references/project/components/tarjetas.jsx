// Tarjetas Module — con campos reales del Excel

const STATUS_OPTIONS = [
  { id:'DESPACHADA', label:'Despachada', color:'oklch(0.55 0.18 260)', bg:'oklch(0.55 0.18 260 / 0.1)' },
  { id:'EN RUTA', label:'En Ruta', color:'oklch(0.6 0.18 200)', bg:'oklch(0.6 0.18 200 / 0.1)' },
  { id:'ENTREGADA', label:'Entregada', color:'oklch(0.58 0.18 145)', bg:'oklch(0.58 0.18 145 / 0.1)' },
  { id:'RETORNADA', label:'Retornada', color:'oklch(0.65 0.22 25)', bg:'oklch(0.65 0.22 25 / 0.1)' },
  { id:'EN PROCESO', label:'En Proceso', color:'oklch(0.6 0.18 60)', bg:'oklch(0.6 0.18 60 / 0.1)' },
  { id:'ENTREGA DIGITAL', label:'Entrega Digital', color:'oklch(0.55 0.16 310)', bg:'oklch(0.55 0.16 310 / 0.1)' },
];

const MOTIVOS_RETORNO = ['FUERA DE RUTA','NO LOCALIZADO','DIRECCIÓN INCORRECTA','CLIENTE RECHAZÓ','EMPRESA CERRADA','OTRO'];
const PROVINCIAS = ['HIGUEY','PUNTA CANA','SAN PEDRO DE MACORIS','LA ROMANA','SANTIAGO','SANTO DOMINGO','SAN CRISTOBAL','PUERTO PLATA','BANI','SAN FRANCISCO'];

function StatusBadge({ statusId }) {
  const s = STATUS_OPTIONS.find(x => x.id === statusId);
  if (!s) return <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:11,color:'#aaa'}}>—</span>;
  return <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:11,fontWeight:600,color:s.color,background:s.bg,borderRadius:6,padding:'3px 8px',whiteSpace:'nowrap'}}>{s.label}</span>;
}

function TarjetaDetailModal({ t, onClose }) {
  const [tab, setTab] = React.useState('info');
  const telsUniq = t.telefonos ? [...new Map(t.telefonos.map(x => [x.num, x])).values()] : [];

  return (
    <div style={tStyles.overlay} onClick={onClose}>
      <div style={tStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={tStyles.mHeader}>
          <div>
            <div style={tStyles.mTC}>{t.tc}</div>
            <div style={tStyles.mNombre}>{t.nombre}</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <StatusBadge statusId={t.status} />
            <button onClick={onClose} style={tStyles.closeBtn}>✕</button>
          </div>
        </div>
        <div style={tStyles.mTabs}>
          {[['info','Información'],['bitacora','Bitácora'],['status','Cambiar Status']].map(([id,lbl]) => (
            <button key={id} onClick={() => setTab(id)} style={{...tStyles.tabBtn,...(tab===id?tStyles.tabActive:{})}}>{lbl}</button>
          ))}
        </div>
        <div style={tStyles.mBody}>
          {tab === 'info' && (
            <div>
              <div style={tStyles.infoGrid}>
                {[['Cédula',t.cedula],['Zona',t.zona],['Provincia',t.provincia],['Presinto',t.presinto],['F. Despacho',t.fechaDespacho],['Tipo Emisión',t.tipoEmision],['Contrato',t.contrato === 'S' ? 'Sí' : 'No'],['Suplidor',t.suplidor]].map(([k,v]) => (
                  <div key={k} style={tStyles.infoItem}><span style={tStyles.iKey}>{k}</span><span style={tStyles.iVal}>{v||'—'}</span></div>
                ))}
              </div>
              {t.direcciones && t.direcciones.length > 0 && (
                <div style={{marginTop:12}}>
                  <div style={tStyles.iKey}>Dirección completa</div>
                  <div style={{...tStyles.iVal,marginTop:4,lineHeight:1.6}}>{t.direcciones.join(' · ')}</div>
                </div>
              )}
              {t.refs && t.refs.length > 0 && (
                <div style={{marginTop:12}}>
                  <div style={tStyles.iKey}>Referencias</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>{t.refs.map(r => <span key={r} style={tStyles.refTag}>{r}</span>)}</div>
                </div>
              )}
              <div style={{marginTop:14}}>
                <div style={tStyles.iKey}>Teléfonos</div>
                <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:6}}>
                  {telsUniq.map((tel,i) => (
                    <div key={i} style={tStyles.telRowInfo}>
                      <span style={tStyles.telNum}>{tel.num}</span>
                      {tel.principal && <span style={tStyles.telPrincipal}>★ Principal</span>}
                      {tel.funciona ? <span style={tStyles.telOk}>✓ Funciona</span> : <span style={tStyles.telFail}>✗ No funciona</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {tab === 'bitacora' && (
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {[
                {fecha:'23/04/2026 08:30', status:'DESPACHADA', user:'Op. García', nota:'Recibida del banco — Presinto '+t.presinto},
                {fecha:'23/04/2026 14:00', status:'EN RUTA', user:'Op. Martínez', nota:'Asignada a mensajero'},
                ...(t.status==='RETORNADA' ? [{fecha:'26/04/2026 16:30', status:'RETORNADA', user:'Op. García', nota:t.comentarioContacto||'Retornada'}] : []),
              ].map((b,i,arr) => (
                <div key={i} style={{display:'flex',gap:12,padding:'12px 0',borderBottom:i<arr.length-1?'1px solid #f4f4f2':'none'}}>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
                    <div style={{width:10,height:10,borderRadius:'50%',background:STATUS_OPTIONS.find(s=>s.id===b.status)?.color||'#ccc',flexShrink:0}}></div>
                    {i<arr.length-1 && <div style={{width:1,flex:1,minHeight:20,background:'#ebebea',marginTop:4}}></div>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:2}}>
                      <StatusBadge statusId={b.status} />
                      <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:'#aaa'}}>{b.fecha}</span>
                    </div>
                    <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12.5,color:'#555'}}>{b.nota}</div>
                    <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:'#bbb',marginTop:2}}>{b.user}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === 'status' && (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:'#666',margin:'0 0 8px'}}>Selecciona el nuevo status:</p>
              {STATUS_OPTIONS.map(s => (
                <label key={s.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:8,border:`1.5px solid ${t.status===s.id?s.color:'#ebebea'}`,background:t.status===s.id?s.bg:'#fff',cursor:'pointer'}}>
                  <input type="radio" name="status_change" defaultChecked={t.status===s.id} style={{accentColor:s.color}} />
                  <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:'#333'}}>{s.label}</span>
                </label>
              ))}
              <div style={{marginTop:8}}>
                <label style={tStyles.iKey}>Motivo retorno (si aplica)</label>
                <select style={tStyles.select}>
                  <option value="">— Seleccionar —</option>
                  {MOTIVOS_RETORNO.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <button style={tStyles.btnPrimary}>Guardar cambio</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onClose }) {
  const [step, setStep] = React.useState(1);
  return (
    <div style={tStyles.overlay} onClick={onClose}>
      <div style={{...tStyles.modal,maxWidth:540}} onClick={e=>e.stopPropagation()}>
        <div style={tStyles.mHeader}><div style={tStyles.mNombre}>Importar Tarjetas</div><button onClick={onClose} style={tStyles.closeBtn}>✕</button></div>
        <div style={tStyles.mBody}>
          <div style={{display:'flex',gap:8,marginBottom:20}}>
            {['Archivo','Zona','Confirmar'].map((s,i) => (
              <div key={s} style={{display:'flex',alignItems:'center',gap:6,flex:1}}>
                <div style={{width:22,height:22,borderRadius:'50%',background:step>i+1?'oklch(0.58 0.18 145)':step===i+1?'oklch(0.55 0.18 260)':'#ebebea',color:step>=i+1?'#fff':'#bbb',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Space Grotesk',sans-serif",fontSize:11,fontWeight:700}}>{step>i+1?'✓':i+1}</div>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:step===i+1?'#333':'#bbb'}}>{s}</span>
                {i<2 && <div style={{flex:1,height:1,background:'#ebebea'}}></div>}
              </div>
            ))}
          </div>
          {step===1 && <div style={tStyles.dropZone}><div style={{fontSize:28,marginBottom:8}}>📂</div><div style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,color:'#555'}}>Arrastra tu archivo Excel aquí</div><div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:'#aaa',marginTop:4}}>Campos: TIPO ENTREGA, FECHA, PRESINTO, TC SANEADA, NOMBRE, ZONA, CÉDULA, DIRECCIÓN, TEL 1-8...</div></div>}
          {step===2 && <div style={{display:'flex',flexDirection:'column',gap:12}}><p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:'#555',margin:0}}>312 tarjetas detectadas. Asigna la zona:</p>{['METRO','ESTE','NORTE','SUR'].map(z=><label key={z} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:8,border:'1.5px solid #ebebea',cursor:'pointer'}}><input type="radio" name="zona" style={{accentColor:'oklch(0.55 0.18 260)'}} /><span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13}}>{z}</span></label>)}</div>}
          {step===3 && <div style={{background:'#f9f9f7',borderRadius:10,padding:'14px 16px'}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>{[['Archivo','data_import.xlsx'],['Total tarjetas','312'],['Zona','ESTE'],['Fecha despacho','23/04/2026'],['Duplicadas','0'],['Errores','0']].map(([k,v])=><div key={k}><div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:'#aaa',marginBottom:2}}>{k}</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:600,color:'#333'}}>{v}</div></div>)}</div></div>}
          <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:20}}>
            {step>1 && <button style={tStyles.btnSecondary} onClick={() => setStep(s=>s-1)}>← Atrás</button>}
            <button style={tStyles.btnPrimary} onClick={() => step<3?setStep(s=>s+1):onClose()}>{step<3?'Continuar →':'✓ Confirmar Importación'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tarjetas() {
  const [data, setData] = React.useState(REAL_TARJETAS);
  const [search, setSearch] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [filterProv, setFilterProv] = React.useState('all');
  const [selected, setSelected] = React.useState([]);
  const [detailTc, setDetailTc] = React.useState(null);
  const [showImport, setShowImport] = React.useState(false);
  const [showMasivo, setShowMasivo] = React.useState(false);

  const provincias = [...new Set(data.map(t => t.provincia))].sort();
  const filtered = data.filter(t => {
    const q = search.toLowerCase();
    const mQ = !q || t.tc.toLowerCase().includes(q) || t.nombre.toLowerCase().includes(q) || t.cedula.includes(q);
    const mS = filterStatus==='all' || t.status===filterStatus;
    const mP = filterProv==='all' || t.provincia===filterProv;
    return mQ && mS && mP;
  });
  const detailCard = data.find(t => t.tc === detailTc);
  const allSel = filtered.length>0 && filtered.every(t=>selected.includes(t.tc));
  const toggleSel = tc => setSelected(s => s.includes(tc)?s.filter(x=>x!==tc):[...s,tc]);

  return (
    <div style={tStyles.container}>
      <div style={tStyles.header}>
        <div>
          <h1 style={tStyles.title}>Tarjetas</h1>
          <p style={tStyles.sub}>{data.length} tarjetas · {data.filter(t=>t.status==='RETORNADA').length} retornadas · {data.filter(t=>t.status==='ENTREGADA').length} entregadas</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button style={tStyles.btnSecondary} onClick={()=>setShowImport(true)}>↑ Importar</button>
          <button style={tStyles.btnSecondary}>↓ Exportar</button>
          {selected.length>0 && <button style={tStyles.btnWarning} onClick={()=>setShowMasivo(true)}>Cambiar Status ({selected.length})</button>}
        </div>
      </div>

      <div style={tStyles.filters}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por TC, cédula o nombre..." style={tStyles.searchInput} />
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={tStyles.sel}>
          <option value="all">Todos los status</option>
          {STATUS_OPTIONS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={filterProv} onChange={e=>setFilterProv(e.target.value)} style={tStyles.sel}>
          <option value="all">Todas las provincias</option>
          {provincias.map(p=><option key={p}>{p}</option>)}
        </select>
      </div>

      <div style={tStyles.tableWrap}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'#f8f8f6'}}>
              <th style={tStyles.thChk}><input type="checkbox" checked={allSel} onChange={()=>setSelected(allSel?[]:filtered.map(t=>t.tc))} /></th>
              <th style={tStyles.th}>No. TC</th>
              <th style={tStyles.th}>Nombre / Cédula</th>
              <th style={tStyles.th}>Provincia</th>
              <th style={tStyles.th}>Teléfono Principal</th>
              <th style={tStyles.th}>Presinto</th>
              <th style={tStyles.th}>Despacho</th>
              <th style={tStyles.th}>Status</th>
              <th style={tStyles.th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => {
              const telPrincipal = t.telefonos?.find(x=>x.principal) || t.telefonos?.[0];
              return (
                <tr key={t.tc} style={{background:selected.includes(t.tc)?'oklch(0.55 0.18 260 / 0.04)':'#fff',borderBottom:'1px solid #f4f4f2'}}>
                  <td style={tStyles.tdChk}><input type="checkbox" checked={selected.includes(t.tc)} onChange={()=>toggleSel(t.tc)} /></td>
                  <td style={tStyles.td}><span style={tStyles.tcCode}>{t.tc}</span></td>
                  <td style={tStyles.td}>
                    <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:500,color:'#333'}}>{t.nombre}</div>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:11,color:'#aaa'}}>{t.cedula}</div>
                  </td>
                  <td style={tStyles.td}><span style={tStyles.provBadge}>{t.provincia}</span></td>
                  <td style={tStyles.td}><span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:12,color:'#555'}}>{telPrincipal?.num||'—'}</span></td>
                  <td style={tStyles.td}><span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:12,color:'#888'}}>{t.presinto}</span></td>
                  <td style={tStyles.td}><span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:11,color:'#888'}}>{t.fechaDespacho}</span></td>
                  <td style={tStyles.td}><StatusBadge statusId={t.status} /></td>
                  <td style={tStyles.td}><button style={tStyles.rowAction} onClick={()=>setDetailTc(t.tc)}>Ver →</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showMasivo && (
        <div style={tStyles.overlay} onClick={()=>setShowMasivo(false)}>
          <div style={{...tStyles.modal,maxWidth:460}} onClick={e=>e.stopPropagation()}>
            <div style={tStyles.mHeader}><div style={tStyles.mNombre}>Cambio Masivo — {selected.length} tarjetas</div><button onClick={()=>setShowMasivo(false)} style={tStyles.closeBtn}>✕</button></div>
            <div style={tStyles.mBody}>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {STATUS_OPTIONS.map(s=><label key={s.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,border:'1.5px solid #ebebea',cursor:'pointer'}}><input type="radio" name="masivo_s" style={{accentColor:s.color}} /><span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13}}>{s.label}</span></label>)}
              </div>
              <div style={{marginTop:12}}>
                <label style={tStyles.iKey}>Motivo retorno (si aplica)</label>
                <select style={tStyles.select}><option value="">— Seleccionar —</option>{MOTIVOS_RETORNO.map(m=><option key={m}>{m}</option>)}</select>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16}}>
                <button style={tStyles.btnSecondary} onClick={()=>setShowMasivo(false)}>Cancelar</button>
                <button style={tStyles.btnPrimary} onClick={()=>setShowMasivo(false)}>Aplicar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailCard && <TarjetaDetailModal t={detailCard} onClose={()=>setDetailTc(null)} />}
      {showImport && <ImportModal onClose={()=>setShowImport(false)} />}
    </div>
  );
}

const tStyles = {
  container:{padding:'28px 32px',maxWidth:1300},
  header:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20},
  title:{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:700,color:'#1a1a1a',margin:0,letterSpacing:'-0.03em'},
  sub:{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:'#888',margin:'4px 0 0'},
  btnPrimary:{background:'oklch(0.55 0.18 260)',color:'#fff',border:'none',borderRadius:8,padding:'9px 16px',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:500,cursor:'pointer',whiteSpace:'nowrap'},
  btnSecondary:{background:'#f4f4f2',color:'#333',border:'none',borderRadius:8,padding:'9px 14px',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:500,cursor:'pointer'},
  btnWarning:{background:'oklch(0.65 0.22 25)',color:'#fff',border:'none',borderRadius:8,padding:'9px 14px',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,cursor:'pointer'},
  filters:{display:'flex',gap:10,marginBottom:16,alignItems:'center'},
  searchInput:{flex:1,padding:'8px 14px',borderRadius:8,border:'1.5px solid #e8e8e6',fontFamily:"'DM Sans',sans-serif",fontSize:13,color:'#333',outline:'none',background:'#fff'},
  sel:{padding:'8px 12px',borderRadius:8,border:'1.5px solid #e8e8e6',fontFamily:"'DM Sans',sans-serif",fontSize:13,color:'#555',background:'#fff',cursor:'pointer',outline:'none'},
  tableWrap:{background:'#fff',borderRadius:12,border:'1px solid #ebebea',overflow:'hidden'},
  th:{fontFamily:"'Space Grotesk',sans-serif",fontSize:11,fontWeight:600,color:'#888',textTransform:'uppercase',letterSpacing:'0.05em',padding:'10px 14px',textAlign:'left',borderBottom:'1px solid #ebebea'},
  thChk:{padding:'10px 14px',borderBottom:'1px solid #ebebea',width:40},
  td:{padding:'11px 14px',borderBottom:'1px solid #f4f4f2',verticalAlign:'middle'},
  tdChk:{padding:'11px 14px',borderBottom:'1px solid #f4f4f2',width:40},
  tcCode:{fontFamily:"'Space Grotesk',sans-serif",fontSize:11.5,color:'oklch(0.55 0.18 260)',fontWeight:600,letterSpacing:'0.02em'},
  provBadge:{fontFamily:"'Space Grotesk',sans-serif",fontSize:11,fontWeight:600,color:'#666',background:'#f4f4f2',borderRadius:4,padding:'2px 7px'},
  rowAction:{background:'none',border:'none',color:'oklch(0.55 0.18 260)',fontFamily:"'DM Sans',sans-serif",fontSize:12,cursor:'pointer',fontWeight:500},
  overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'},
  modal:{background:'#fff',borderRadius:16,width:'90%',maxWidth:680,maxHeight:'85vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'},
  mHeader:{padding:'20px 24px',borderBottom:'1px solid #f0f0ee',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexShrink:0},
  mTC:{fontFamily:"'Space Grotesk',sans-serif",fontSize:11,color:'oklch(0.55 0.18 260)',fontWeight:600,marginBottom:2,letterSpacing:'0.02em'},
  mNombre:{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:700,color:'#1a1a1a',letterSpacing:'-0.02em'},
  closeBtn:{background:'#f4f4f2',border:'none',borderRadius:8,width:30,height:30,cursor:'pointer',fontSize:13,color:'#666'},
  mTabs:{display:'flex',borderBottom:'1px solid #f0f0ee',flexShrink:0},
  tabBtn:{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:400,color:'#aaa',background:'none',border:'none',padding:'11px 16px',cursor:'pointer',borderBottom:'2px solid transparent',whiteSpace:'nowrap'},
  tabActive:{color:'oklch(0.55 0.18 260)',fontWeight:600,borderBottom:'2px solid oklch(0.55 0.18 260)'},
  mBody:{padding:'20px 24px',overflowY:'auto',flex:1},
  infoGrid:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14},
  infoItem:{display:'flex',flexDirection:'column',gap:3},
  iKey:{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:'#aaa',textTransform:'uppercase',letterSpacing:'0.05em'},
  iVal:{fontFamily:"'DM Sans',sans-serif",fontSize:13.5,color:'#333',fontWeight:500},
  refTag:{background:'#f4f4f2',borderRadius:5,padding:'3px 8px',fontFamily:"'Space Grotesk',sans-serif",fontSize:11,color:'#555'},
  telRowInfo:{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#f9f9f7',borderRadius:8},
  telNum:{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,color:'#333',flex:1},
  telPrincipal:{fontFamily:"'Space Grotesk',sans-serif",fontSize:10,fontWeight:700,color:'oklch(0.6 0.18 60)',background:'oklch(0.6 0.18 60 / 0.12)',borderRadius:4,padding:'2px 6px'},
  telOk:{fontFamily:"'Space Grotesk',sans-serif",fontSize:10,fontWeight:700,color:'oklch(0.58 0.18 145)',background:'oklch(0.58 0.18 145 / 0.12)',borderRadius:4,padding:'2px 6px'},
  telFail:{fontFamily:"'Space Grotesk',sans-serif",fontSize:10,fontWeight:700,color:'oklch(0.65 0.22 25)',background:'oklch(0.65 0.22 25 / 0.12)',borderRadius:4,padding:'2px 6px'},
  select:{width:'100%',padding:'8px 12px',borderRadius:8,border:'1.5px solid #e8e8e6',fontFamily:"'DM Sans',sans-serif",fontSize:13,color:'#444',outline:'none',marginTop:4},
  dropZone:{border:'2px dashed #dededd',borderRadius:10,padding:'28px 20px',textAlign:'center',background:'#fafaf8',cursor:'pointer'},
};

Object.assign(window, { Tarjetas, StatusBadge, STATUS_OPTIONS, MOTIVOS_RETORNO, PROVINCIAS });
