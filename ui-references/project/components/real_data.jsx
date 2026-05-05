// ═══════════════════════════════════════════════════════════
// DATOS REALES — extraídos de los archivos Excel del cliente
// ═══════════════════════════════════════════════════════════

const REAL_TARJETAS = [
  { tc:"4921017885434643", nombre:"WALKIRIA RODRIGUEZ", cedula:"08500066587", zona:"HIGUEY", provincia:"HIGUEY", presinto:"54", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"23/04/2026", contrato:"N", tipoEmision:"REPOSICION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8095547895",principal:true,funciona:true},{num:"8097573255",principal:false,funciona:false}], direcciones:["CARLOS EMILIO CASTILLO NO 13 L","SAN RAFAEL DEL YUMA","SAN RAFAEL DEL YUMA","SAN RAFAEL DEL YUMA LA ALTAGRA"], refs:["REP_F"], status:"RETORNADA", comentarioContacto:"", contactado:false },
  { tc:"5188017811315176", nombre:"MARTIN CASTRO", cedula:"02800565679", zona:"HIGUEY", provincia:"HIGUEY", presinto:"25", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"23/04/2026", contrato:"S", tipoEmision:"EMISION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8095541985",principal:true,funciona:true}], direcciones:["LAS CABALLERISAS NO 6","LLAMAR ANTES DE ENTREGAR","SAN PEDRO","LA ALTAGRACIA","HIGUEY (MG)","PROXIMO A LA IGLESIA ASAMBLEA DE DIOS"], refs:["B Y L","PROPIETARIO","MARTIN CASTRO"], status:"EN RUTA", comentarioContacto:"", contactado:false },
  { tc:"4921017891591340", nombre:"RUBEN MORILLO", cedula:"02200176408", zona:"HIGUEY", provincia:"HIGUEY", presinto:"54", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"23/04/2026", contrato:"S", tipoEmision:"EMISION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8494501740",principal:true,funciona:true}], direcciones:[], refs:[], status:"DESPACHADA", comentarioContacto:"", contactado:false },
  { tc:"4921017896296282", nombre:"RAFAEL MATOS", cedula:"40202046116", zona:"HIGUEY", provincia:"HIGUEY", presinto:"25", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"23/04/2026", contrato:"S", tipoEmision:"EMISION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8492208530",principal:true,funciona:true},{num:"8492208530",principal:false,funciona:false}], direcciones:["KM 65 AUTOPISTA DEL ESTE","VILLA HERMOSA","LA ROMANA"], refs:[], status:"EN RUTA", comentarioContacto:"", contactado:false },
  { tc:"4921017888585261", nombre:"SANTA CASTILLO", cedula:"40240015010", zona:"HIGUEY", provincia:"HIGUEY", presinto:"25", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"23/04/2026", contrato:"S", tipoEmision:"EMISION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8296224009",principal:true,funciona:true},{num:"8095843280",principal:false,funciona:true}], direcciones:["VISTA AL CARIBE FASE II","PUNTA CANA","BAVARO"], refs:["DIRECTORA"], status:"DESPACHADA", comentarioContacto:"", contactado:false },
  { tc:"5415017894103501", nombre:"SONEL JEAN", cedula:"08500119196", zona:"HIGUEY", provincia:"HIGUEY", presinto:"54", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"23/04/2026", contrato:"N", tipoEmision:"REPOSICION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8098542210",principal:true,funciona:false}], direcciones:["CALLE JUAN PABLO DUARTE","HIGUEY CENTRO"], refs:[], status:"RETORNADA", comentarioContacto:"FUERA DE RUTA", contactado:true },
  { tc:"4921017851686577", nombre:"CARLOS CARVAJAL", cedula:"40227564750", zona:"HIGUEY", provincia:"HIGUEY", presinto:"25", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"29/04/2026", contrato:"S", tipoEmision:"EMISION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8097452234",principal:true,funciona:false},{num:"8497312209",principal:false,funciona:false}], direcciones:["URBANIZACION LOS ALAMOS","CALLE 3 CASA 14","SAN PEDRO DE MACORIS"], refs:[], status:"RETORNADA", comentarioContacto:"NO LOCALIZADO", contactado:false },
  { tc:"5415017848759077", nombre:"CRISTIAN NAVARRO", cedula:"40221746833", zona:"HIGUEY", provincia:"HIGUEY", presinto:"25", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"29/04/2026", contrato:"S", tipoEmision:"EMISION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8093741180",principal:true,funciona:true}], direcciones:["RES. PARADISE HILLS APT 2B","BAVARO PUNTA CANA"], refs:["NAVARRO"], status:"EN RUTA", comentarioContacto:"", contactado:false },
  { tc:"4921017845749009", nombre:"PATRICIA CONTRERAS", cedula:"40226788426", zona:"HIGUEY", provincia:"HIGUEY", presinto:"54", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"29/04/2026", contrato:"S", tipoEmision:"EMISION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8293476590",principal:true,funciona:true},{num:"8499023312",principal:false,funciona:false}], direcciones:["AVE. ESPANA NO 45","LA ROMANA CENTRO"], refs:[], status:"DESPACHADA", comentarioContacto:"", contactado:false },
  { tc:"4921017842059952", nombre:"SHAILYN JIMENEZ", cedula:"40211682204", zona:"HIGUEY", provincia:"HIGUEY", presinto:"54", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"29/04/2026", contrato:"N", tipoEmision:"REPOSICION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8298432210",principal:true,funciona:true}], direcciones:["BRISAS DEL ESTE","CALLE 8 NO 22","SAN PEDRO DE MACORIS"], refs:[], status:"EN RUTA", comentarioContacto:"", contactado:false },
  { tc:"5188017849945567", nombre:"AVIER JOSEPH", cedula:"40219934268", zona:"HIGUEY", provincia:"HIGUEY", presinto:"25", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"29/04/2026", contrato:"S", tipoEmision:"EMISION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8092341567",principal:true,funciona:true},{num:"8292341567",principal:false,funciona:true}], direcciones:["CALLE MELLA 33","HIGUEY"], refs:[], status:"DESPACHADA", comentarioContacto:"", contactado:false },
  { tc:"4921017843440838", nombre:"WANDALY MONEGRO", cedula:"40214799823", zona:"HIGUEY", provincia:"HIGUEY", presinto:"25", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"27/04/2026", contrato:"S", tipoEmision:"EMISION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8098754321",principal:true,funciona:true}], direcciones:["RESIDENCIAL PALMERAS","PUNTA CANA"], refs:[], status:"EN RUTA", comentarioContacto:"", contactado:false },
  { tc:"4921017819720940", nombre:"JEAN PIERRE DUVAL", cedula:"40219670169", zona:"SAN PEDRO", provincia:"SAN PEDRO DE MACORIS", presinto:"33", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"26/04/2026", contrato:"S", tipoEmision:"EMISION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8093453172",principal:true,funciona:true}], direcciones:["CALLE SÁNCHEZ NO 12","SAN PEDRO DE MACORIS"], refs:[], status:"RETORNADA", comentarioContacto:"", contactado:false },
  { tc:"4921017801557442", nombre:"CARLOS BENITEZ", cedula:"40243868193", zona:"HIGUEY", provincia:"HIGUEY", presinto:"54", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"26/04/2026", contrato:"S", tipoEmision:"EMISION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8295580472",principal:true,funciona:true},{num:"8095580472",principal:false,funciona:false}], direcciones:["LOS CORALES BAVARO","CALLE PRINCIPAL"], refs:[], status:"ENTREGADA", comentarioContacto:"Confirmó recepción", contactado:true },
  { tc:"4921017796491529", nombre:"PEDRO SANTOS", cedula:"40237573312", zona:"PUNTA CANA", provincia:"PUNTA CANA", presinto:"33", tipoEntrega:"AUTOMATICAS ZONA ESTE", fechaDespacho:"22/04/2026", contrato:"N", tipoEmision:"REPOSICION", suplidor:"MAIL BOXES INTERIOR ESTE", telefonos:[{num:"8093914831",principal:true,funciona:false}], direcciones:["PUNTA CANA VILLAGE CASA 44"], refs:[], status:"RETORNADA", comentarioContacto:"", contactado:false },
];

const REAL_URGENTES = [
  { tc:"4921017796491529", nombre:"PEDRO SANTOS", cedula:"40237573312", fechaDesp:"22/04/2026", provincia:"PUNTA CANA", telefonos:[{num:"8093914831",principal:true,funciona:false}], status:"RETORNADA", direccion:"", comentario:"", contactado:false },
  { tc:"4921017822495001", nombre:"ANA MARIA PEREZ", cedula:"40219737786", fechaDesp:"26/04/2026", provincia:"HIGUEY", telefonos:[{num:"8494788452",principal:true,funciona:true}], status:"RETORNADA", direccion:"CALLE DUARTE 23 HIGUEY", comentario:"", contactado:false },
  { tc:"4921017808546882", nombre:"JOSE RODRIGUEZ", cedula:"40208848008", fechaDesp:"25/04/2026", provincia:"HIGUEY", telefonos:[{num:"8293468806",principal:true,funciona:true}], status:"EN PROCESO", direccion:"LOS ALCARRIZOS HIGUEY", comentario:"", contactado:false },
  { tc:"5188017813899490", nombre:"MARIA BELEN", cedula:"40218835144", fechaDesp:"26/04/2026", provincia:"PUNTA CANA", telefonos:[{num:"8294927782",principal:true,funciona:true}], status:"RETORNADA", direccion:"BAVARO PUNTA CANA", comentario:"", contactado:false },
  { tc:"4921017821898354", nombre:"FELIX AUGUSTO", cedula:"40231609013", fechaDesp:"26/04/2026", provincia:"SAN PEDRO DE MACORIS", telefonos:[{num:"8092712493",principal:true,funciona:false}], status:"RETORNADA", direccion:"", comentario:"", contactado:false },
  { tc:"4966017831190729", nombre:"WANDALY MONEGRO", cedula:"40214799823", fechaDesp:"27/04/2026", provincia:"HIGUEY", telefonos:[{num:"8098754321",principal:true,funciona:true}], status:"EN PROCESO", direccion:"RESIDENCIAL PALMERAS PUNTA CANA", comentario:"", contactado:false },
  { tc:"4921017819720940", nombre:"JEAN PIERRE DUVAL", cedula:"40219670169", fechaDesp:"26/04/2026", provincia:"SAN PEDRO DE MACORIS", telefonos:[{num:"8093453172",principal:true,funciona:true}], status:"RETORNADA", direccion:"CALLE SANCHEZ NO 12", comentario:"", contactado:false },
  { tc:"4921017801557442", nombre:"CARLOS BENITEZ", cedula:"40243868193", fechaDesp:"26/04/2026", provincia:"HIGUEY", telefonos:[{num:"8295580472",principal:true,funciona:true}], status:"ENTREGA DIGITAL", direccion:"LOS CORALES BAVARO", comentario:"", contactado:false },
];

const REAL_RETORNOS = [
  { no:"1", tc:"4921017885434643", nombre:"WALKIRIA RODRIGUEZ", cedula:"08500066587", fecha:"23/04/2026", zona:"ESTE", comentario:"FUERA DE RUTA" },
  { no:"2", tc:"5415017894103501", nombre:"SONEL JEAN", cedula:"08500119196", fecha:"23/04/2026", zona:"ESTE", comentario:"FUERA DE RUTA" },
  { no:"3", tc:"4921017851686577", nombre:"CARLOS CARVAJAL", cedula:"40227564750", fecha:"29/04/2026", zona:"ESTE", comentario:"NO LOCALIZADO" },
  { no:"4", tc:"5415017848759077", nombre:"CRISTIAN NAVARRO", cedula:"40221746833", fecha:"29/04/2026", zona:"ESTE", comentario:"NO LOCALIZADO" },
  { no:"5", tc:"4921017845749009", nombre:"PATRICIA CONTRERAS", cedula:"40226788426", fecha:"29/04/2026", zona:"ESTE", comentario:"NO LOCALIZADO" },
  { no:"6", tc:"4921017842059952", nombre:"SHAILYN JIMENEZ", cedula:"40211682204", fecha:"29/04/2026", zona:"ESTE", comentario:"NO LOCALIZADO" },
  { no:"7", tc:"5188017849945567", nombre:"AVIER JOSEPH", cedula:"40219934268", fecha:"29/04/2026", zona:"ESTE", comentario:"NO LOCALIZADO" },
  { no:"8", tc:"4921017821898354", nombre:"FELIX AUGUSTO", cedula:"40231609013", fecha:"26/04/2026", zona:"ESTE", comentario:"FUERA DE RUTA" },
  { no:"9", tc:"4921017819720940", nombre:"JEAN PIERRE DUVAL", cedula:"40219670169", fecha:"26/04/2026", zona:"ESTE", comentario:"NO LOCALIZADO" },
  { no:"10", tc:"4921017796491529", nombre:"PEDRO SANTOS", cedula:"40237573312", fecha:"22/04/2026", zona:"ESTE", comentario:"RETORNADA MENSAJERO" },
];

// LOTE 22-4-2026 — estructura real por mensajero/provincia
const REAL_LOTES_MENSAJEROS = [
  { nombre:"SANDY CAINE", provincia:"SAN PEDRO", loteId:"0104", tarjetas:[
    { tc:"4921017695271437", cedula:"02400186330", telefono:"8298309301", nombre:"", recibida:false, retornada:false },
    { tc:"4921017745282518", cedula:"02300890247", telefono:"8095292483", nombre:"", recibida:false, retornada:false },
    { tc:"4921017885681477", cedula:"02301196180", telefono:"8296821848", nombre:"", recibida:false, retornada:false },
    { tc:"5415017883874575", cedula:"02301302218", telefono:"8298554334", nombre:"", recibida:false, retornada:false },
    { tc:"4921017886594982", cedula:"02301280059", telefono:"8492612629", nombre:"", recibida:false, retornada:false },
  ]},
  { nombre:"DAVID RUIZ", provincia:"HIGUEY DAVID", loteId:"0204", tarjetas:[
    { tc:"4025017877936253", cedula:"02400187793", telefono:"8293210011", nombre:"", recibida:false, retornada:false },
    { tc:"5427017667684837", cedula:"40227668849", telefono:"8096633210", nombre:"", recibida:false, retornada:false },
    { tc:"5188017880301033", cedula:"02800565679", telefono:"8095541985", nombre:"", recibida:false, retornada:false },
    { tc:"4921017882480238", cedula:"40202046116", telefono:"8492208530", nombre:"", recibida:false, retornada:false },
  ]},
  { nombre:"JENRY CONTRERAS", provincia:"PUNTA CANA", loteId:"0304", tarjetas:[
    { tc:"4921017869651721", cedula:"40240015010", telefono:"8296224009", nombre:"", recibida:false, retornada:false },
    { tc:"5400017868477586", cedula:"40221746833", telefono:"8093741180", nombre:"", recibida:false, retornada:false },
    { tc:"4921017861758461", cedula:"40226788426", telefono:"8293476590", nombre:"", recibida:false, retornada:false },
    { tc:"4921017862461731", cedula:"40211682204", telefono:"8298432210", nombre:"", recibida:false, retornada:false },
  ]},
];

const REAL_ESQUEMA_LOTES = [
  { lote:"0104", mensajero:"SANDY CAINE", provincia:"SAN PEDRO", fechaEnvio:"01/04/2026", fechaRetorno:"09/04/2026", status:"RETORNADO" },
  { lote:"0204", mensajero:"DAVID RUIZ", provincia:"HIGUEY", fechaEnvio:"01/04/2026", fechaRetorno:"09/04/2026", status:"RETORNADO" },
  { lote:"0304", mensajero:"JENRY CONTRERAS", provincia:"PUNTA CANA", fechaEnvio:"01/04/2026", fechaRetorno:"09/04/2026", status:"RETORNADO" },
  { lote:"0404", mensajero:"SANDY CAINE", provincia:"SAN PEDRO", fechaEnvio:"06/04/2026", fechaRetorno:"10/04/2026", status:"RETORNADO" },
  { lote:"0504", mensajero:"DAVID RUIZ", provincia:"HIGUEY", fechaEnvio:"06/04/2026", fechaRetorno:"10/04/2026", status:"RETORNADO" },
  { lote:"0604", mensajero:"JENRY CONTRERAS", provincia:"PUNTA CANA", fechaEnvio:"06/04/2026", fechaRetorno:"10/04/2026", status:"RETORNADO" },
  { lote:"2204", mensajero:"PEDRO SANTOS", provincia:"HIGUEY", fechaEnvio:"22/04/2026", fechaRetorno:"", status:"EN TRANSITO" },
  { lote:"2304", mensajero:"SANDY CAINE", provincia:"SAN PEDRO", fechaEnvio:"22/04/2026", fechaRetorno:"", status:"EN TRANSITO" },
];

Object.assign(window, { REAL_TARJETAS, REAL_URGENTES, REAL_RETORNOS, REAL_LOTES_MENSAJEROS, REAL_ESQUEMA_LOTES });
