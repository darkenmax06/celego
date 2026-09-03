# Especificación: Producto Crédito/Débito, rutas y vencimientos unificados

Estado: `HUMAN_GATE`

## 1. Requerimientos de Usuario (Spec Writer)

### Objetivo

Incorporar las tarjetas débito al dominio operativo de Celego sin tratarlas como tarjetas de crédito, y usar ambos productos en Tarjetas, Rutas, Reportes y alertas de vencimiento.

### Historias de usuario

- [ ] Como Operador, quiero distinguir Crédito y Débito en toda vista y exportación relevante.
- [ ] Como Operador, quiero buscar y asignar rutas por número de tarjeta, número de solicitud, referencia externa o cédula.
- [ ] Como Coordinador, quiero ver tarjetas de ambos productos próximas a vencer y vencidas para priorizar rutas.
- [ ] Como Facturación, quiero filtrar reportes por producto sin que una solicitud débito aparezca rotulada como número de tarjeta.
- [ ] Como Cliente interno, quiero que despachos repetidos se conserven como episodios independientes.

### Criterios de aceptación

- [ ] Existe un campo `productType` con valores `CREDITO` y `DEBITO`.
- [ ] Crédito usa `cardNumber`; Débito usa `requestNumber`; la UI nunca presenta una solicitud como TC.
- [ ] `Principal/Adicional` permanece separado de `Crédito/Débito`.
- [ ] Las tarjetas existentes se migran a `CREDITO` sin perder datos.
- [ ] Tarjetas, rutas, reportes y vencimientos permiten filtrar por producto.
- [ ] Rutas acepta identificadores mixtos y muestra una resolución antes de crear la asignación.
- [ ] Próximas a vencer incluye ambos productos y excluye estados terminales.
- [ ] El umbral de alerta es configurable y parte en tres días laborables.
- [ ] Las exportaciones incluyen Producto, Número de tarjeta, Número de solicitud, Identificador y Mensajero asignado.

## 2. Diseño y Arquitectura (Designer)

### Modelo de datos

Agregar enum:

`CardProductType { CREDITO, DEBITO }`

Evolucionar `Card`:

- `productType CardProductType @default(CREDITO)`
- `tc String?` como número de tarjeta de crédito, conservando compatibilidad de nombre físico inicialmente
- `requestNumber String?` para débito
- `lastAssignedMessengerId` según `specs/01-mensajero-asignado-en-reportes.md`
- índices `[productType, status, slaDueDate]`, `[productType, requestNumber]` y búsqueda por `tc`
- restricción única parcial PostgreSQL para `(requestNumber, dispatchDate)` cuando `productType = DEBITO`

Reglas de integridad del dominio:

- Crédito requiere `tc` y no requiere `requestNumber`.
- Débito requiere `requestNumber`; `tc` debe quedar vacío salvo que una fuente futura entregue un número real.
- Débito requiere también `dispatchDate` para que la identidad compuesta sea válida.
- Identificador visible: `tc` para Crédito y `requestNumber` para Débito.
- Identidad de despacho: Crédito conserva su regla existente; Débito usa `requestNumber + dispatchDate`.
- Si una búsqueda por cédula o solicitud resuelve varios despachos elegibles, se exige selección explícita.

El bootstrap/migración marca todas las tarjetas existentes como `CREDITO`. No se infiere Débito a partir de texto libre salvo durante la importación dedicada.

Volver `tc` nullable exige auditar todos los consumidores que hoy asumen TC obligatoria, como mínimo: lotes, urgencias, pistoleo/escaneo, dashboard, contacto operativo, Bizcochitos, redacciones, SLA, facturación y todas las exportaciones. Cada uno debe usar el identificador visible compartido o declarar explícitamente que solo acepta Crédito.

### Tarjetas

- Filtro `Producto: Todos | Crédito | Débito`.
- Columna genérica `Identificador` con badge de producto.
- Búsqueda: tarjeta, solicitud, referencia, cédula o cliente.
- Detalle con campos separados `Número de tarjeta` y `Número de solicitud`.
- Formularios y API validan el identificador requerido según producto.

### Rutas y segmentación

Mantener el pegado masivo y agregar selección desde pendientes.

Filtros de candidatos:

- producto;
- provincia/zona;
- días laborables restantes;
- estado;
- mensajero;
- urgente/remota.

La previsualización clasifica identificadores en encontrados, duplicados, no encontrados, ambiguos, ya asignados y no elegibles por estado terminal. La ruta no se crea mientras existan ambigüedades sin resolver.

Las rutas pueden mezclar Crédito y Débito. Pantalla y exportaciones muestran `Producto` e `Identificador`.

### Vencimientos

Renombrar `SLA vencidas` a `Vencimientos` con dos pestañas:

1. `Próximas`: `0..warningBusinessDays` días laborables restantes.
2. `Vencidas`: días laborables restantes menores que cero.

La banda operativa muestra `3 días -> 2 días -> 1 día -> Hoy -> Vencidas`, con total y desglose por producto. `warningBusinessDays` vive en `SLAConfig` y parte en `3`.

Filtros: producto, ventana SLA, provincia/zona, mensajero, estado y búsqueda. Columnas: producto, identificador, cliente/cédula, despacho, SLA, días restantes, estado, mensajero, provincia/zona y urgente.

Estados excluidos en ambas pestañas: `ENTREGADA`, `ENTREGA_DIGITAL`, `RETORNADA`, `ACUSE_RECIBIDO` y `DEVUELTA_TIENDA`.

El cálculo conserva la regla actual de días laborables: sábado y domingo no cuentan. Los feriados siguen fuera de alcance mientras no exista calendario corporativo.

Tarjetas legadas activas sin `dispatchDate` o `slaDueDate`, y filas fuente Débito rechazadas por fecha faltante, aparecen en una sección de calidad de datos; no deben desaparecer de la operación. Una fila Débito sin fecha confirmada no se persiste todavía como `Card`.

Para todo despacho Débito válido, calcular `slaDueDate` desde `dispatchDate` con `SLAConfig.businessDays`, extensiones aplicables y la función existente de días laborables. La sincronización del consolidado hace este backfill tanto para `DATA` base como para las altas. Si la fecha no es confiable, no se inventa ni se crea una tarjeta incompleta: la fila fuente queda en calidad de datos hasta corrección.

### Reportes

Agregar filtro `Producto` al reporte de tarjetas y a los reportes que enumeran tarjetas. Columnas comunes:

- `producto`;
- `numeroTarjeta`;
- `numeroSolicitud`;
- `identificador`;
- `mensajero` en reportes existentes, con el valor resuelto por la spec 01;
- `mensajeroAsignado` solo en contratos nuevos.

Para Débito, `numeroTarjeta` queda vacío y `numeroSolicitud` contiene el `N-SS`. Para Crédito ocurre lo inverso. XLSX, CSV y PDF comparten el mismo constructor de filas.

El cálculo de tarifas específicas de débito no forma parte de esta fase; el libro consolidado conserva sus hojas `TARIFAS` y resúmenes. Integrar esas tarifas a Facturación requerirá una spec posterior con reglas aprobadas.

### Navegación y lenguaje

- Añadir `Consolidado débito` después de `Tarjetas`.
- Renombrar `SLA vencidas` a `Vencimientos`.
- Mantener navegación lateral plana y el lenguaje visual azul existente.
- Sustituir textos exclusivos de TC por `Tarjeta / Solicitud` o `Identificador` donde el flujo sea mixto.

### Seguridad, auditoría y rendimiento

- `ADMIN` y `OPERADOR` gestionan tarjetas y rutas.
- `FACTURACION` consulta reportes y vencimientos.
- `MENSAJERO` solo consulta/gestiona sus rutas autorizadas.
- Los cambios de producto o identificador son auditables.
- Las listas permanecen paginadas y usan índices por producto, estado, SLA e identificadores.

## 3. Lista de Tareas (Task Planner)

- [ ] Agregar enum, campos, relaciones e índices; migrar registros existentes a Crédito.
- [ ] Agregar checks y el índice único parcial de identidad débito en PostgreSQL.
- [ ] Adaptar servicios de dominio, validadores y transiciones a identificadores opcionales por producto.
- [ ] Auditar y adaptar lotes, urgencias, escaneo, dashboard, Bizcochitos, redacciones, contacto, SLA, facturación y exportaciones que asumen `tc` obligatorio.
- [ ] Actualizar importación de crédito y conectar la importación dedicada de débito.
- [ ] Actualizar búsquedas, detalle, tabla y filtros de Tarjetas.
- [ ] Crear resolución previa y filtros de segmentación en Rutas.
- [ ] Actualizar exportaciones de rutas con Producto e Identificador.
- [ ] Evolucionar SLAConfig con `warningBusinessDays` y crear consultas Próximas/Vencidas.
- [ ] Calcular/backfillear SLA para `DATA` base y altas Débito; listar fechas faltantes en calidad de datos.
- [ ] Actualizar UI y exportaciones de Vencimientos.
- [ ] Añadir filtro/columnas de producto a reportes XLSX, CSV y PDF.
- [ ] Probar migración, búsquedas ambiguas, episodios repetidos, fines de semana y estados terminales.
- [ ] Probar permisos, paginación, consistencia de formatos y accesibilidad básica.
- [ ] Ejecutar TypeScript, lint, build, pruebas y verificación Docker obligatoria de `AGENTS.md`.

### Decisiones propuestas para aprobación en el Human Gate

1. `requestNumber + dispatchDate` identifica un despacho débito.
2. Una coincidencia de estado con varios despachos se bloquea como ambigua.
3. Próximas a vencer usa tres días laborables, configurable por Administrador.
4. Estados externos desconocidos bloquean únicamente su fila; el resto del corte puede aplicarse tras reconocimiento explícito, salvo que exista una ambigüedad estructural.
5. El consolidado conserva todas sus hojas y solo se modifica `DATA`/catálogo de estados.
6. Las tarifas débito dentro de Facturación quedan fuera de esta fase.
7. No se crea una skill nueva: las reglas son parte del producto y las skills existentes cubren la implementación.

*(Nota para la IA: Tras aprobar el Human Gate, ejecuta las tareas mediante sub-agentes en la rama `codex/producto-debito-vencimientos`. Al finalizar, verifica contra la suite de /tests antes de solicitar Merge a `dev`).*
