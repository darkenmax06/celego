# Especificación: Actualizador y conciliador del consolidado débito

Estado: `HUMAN_GATE`

## 1. Requerimientos de Usuario (Spec Writer)

### Objetivo

Crear un módulo que reciba el consolidado débito vigente y uno o ambos archivos de novedades, devuelva el mismo consolidado actualizado y sincronice las tarjetas débito en Celego para rutas, seguimiento y reportes.

### Archivos inspeccionados

| Rol | Archivo | Hoja | Dimensión | Clave |
|---|---|---:|---:|---|
| Consolidado | `CONSOLIDADO CELERITA (DEBITO QR) 29-07-2026 (tercer corte) (1).xlsx` | `DATA` | 1,344 filas, 43 columnas | `N-SS` |
| Altas | `Entrega_tarjetas_débito 31-07-2026.xlsx` | `CELE` | 31 filas, 41 columnas | `NRO_SS` |
| Estados digitales | `report-mbe-republica-de-colombia (2).xlsx` | `Sheet1` | 1,000 filas, 21 columnas | `No. de orden` |

Hallazgos verificables del corte:

- Las 1,344 solicitudes del consolidado son únicas.
- Las 31 altas son únicas y ninguna existe todavía en el consolidado.
- El reporte digital contiene 980 solicitudes únicas y 20 claves repetidas con dos `Tracking number` distintos.
- Catorce de esas 20 solicitudes repetidas presentan estados contradictorios.
- 979 solicitudes del reporte coinciden con el consolidado.
- La fila con `No. de orden = 40229376807` no coincide y no cumple el patrón de solicitud `4-...`; debe reportarse como incidencia.
- Estados externos observados: `Entregado al cliente` (803), `Envio Creado` (103), `Cancelado / Orden anulada` (46), `En espera para salir de nuevo a ruta` (25), `En transito para entrega` (22) y `En estacion de ultima milla` (1).
- La fuente de altas no contiene una fecha de despacho confiable: 30 filas traen `FechaAsig - VAL = 00:00:00` y una trae una fecha histórica anterior; `FECHA_CREACION` representa creación de solicitud, no necesariamente despacho.
- Una alta comparte cédula con una gestión histórica, pero tiene otra solicitud; debe crearse como nuevo despacho y no descartarse por cliente duplicado.
- El libro consolidado contiene siete hojas, dos ocultas, una tabla `Table1` sobre `DATA`, fórmulas y tablas dinámicas. Debe editarse in-place y no reconstruirse desde cero.
- `DATA.ZONA` contiene en realidad el valor operativo `En proceso`; la zona logística de Celego debe calcularse aparte y no escribirse bajo ese encabezado por interpretación semántica.

### Historias de usuario

- [ ] Como Operador, quiero cargar el consolidado y un archivo de altas, de estados o ambos para procesar cada corte sin edición manual.
- [ ] Como Operador, quiero revisar una conciliación antes de aplicar cambios para detectar duplicados, faltantes, estados desconocidos y fechas inválidas.
- [ ] Como Operador, quiero descargar el consolidado actualizado conservando hojas, orden, formato y datos no afectados.
- [ ] Como Administrador, quiero un historial auditable de cortes y archivos para recuperar resultados y evitar reprocesamientos accidentales.
- [ ] Como responsable de rutas, quiero que las altas aplicadas queden disponibles inmediatamente en Celego.

### Criterios de aceptación

- [ ] El consolidado es obligatorio y se exige al menos un archivo de novedades.
- [ ] El rol de cada archivo se detecta por hoja y encabezados, no por nombre.
- [ ] La solicitud se conserva como texto con guiones y ceros.
- [ ] Un corte combinado agrega altas antes de aplicar estados.
- [ ] No se modifica el Excel ni la base de datos antes de mostrar la vista previa y recibir confirmación.
- [ ] El resultado conserva hojas, orden, ocultamiento, estilos, fórmulas, validaciones, tablas y pivotes; amplía `Table1` y marca pivotes para refrescar.
- [ ] Las altas idénticas ya existentes se omiten de forma idempotente y aparecen como advertencia.
- [ ] Los estados válidos sin solicitud coincidente se omiten como advertencia y aparecen en incidencias.
- [ ] Las incidencias distinguen advertencia, error de fila y bloqueo total; ninguna se resuelve silenciosamente.
- [ ] Al completar, se ofrecen el consolidado actualizado y un archivo de incidencias.
- [ ] La sincronización interna y el archivo resultante pertenecen a la misma ejecución auditable.

## 2. Diseño y Arquitectura (Designer)

### Enfoque elegido

Se recomienda un módulo dedicado `Consolidado débito` con tres etapas: archivos, prevalidación y aplicación. Integrarlo directamente en Tarjetas dejaría poco espacio para conflictos e historial; automatizar una carpeta de entrada se pospone hasta comprobar el flujo manual.

### Flujo de interfaz

1. **Archivos del corte**
   - `Consolidado actual`: obligatorio, hoja `DATA`.
   - `Nuevas tarjetas`: opcional, hoja `CELE` o encabezados equivalentes.
   - `Estados de entrega digital`: opcional, encabezados `No. de orden`, `Status` y `Fecha de último movimiento`.
   - Fecha de despacho requerida cuando hay altas; se prellena desde una fecha inequívoca del nombre del archivo y el operador debe confirmarla.
2. **Prevalidación**
   - Banda: `Consolidado actual -> Altas -> Estados -> Resultado`.
   - Conteos: actuales, altas válidas, duplicadas, estados coincidentes, sin coincidencia, sin cambio, conflictos y total proyectado.
   - Tabla de diferencias por fila, solicitud, cliente, estado anterior/externo/resultante y motivo.
3. **Aplicación**
   - Confirmación con conteos finales.
   - Estados visibles: validando, conciliando, generando Excel y sincronizando tarjetas.
   - Recibo persistente con usuario, hora, hash de fuentes, conteos, auditoría y descargas.

Orden de sincronización interna de cada corte:

1. sincronizar idempotentemente todas las filas válidas de `DATA` como despachos `DEBITO`;
2. anexar y sincronizar las altas válidas;
3. aplicar los estados digitales sobre los despachos ya resueltos;
4. recalcular métricas derivadas y cerrar la ejecución.

La primera carga del archivo real debe crear o reconciliar las 1,344 gestiones base antes de procesar las 31 altas y los 979 estados coincidentes. Repetir el mismo consolidado no crea tarjetas ni logs duplicados.

Nombre del resultado: `CONSOLIDADO_DEBITO_ACTUALIZADO_YYYY-MM-DD_HH-mm.xlsx`.

### Mapeo de altas hacia `DATA`

El libro actual utiliza un mapeo posicional de compatibilidad que no coincide con la semántica de varios encabezados. Para devolver “el mismo consolidado”, el archivo resultante debe conservar ese contrato mientras la base de datos usa un mapeo de dominio limpio.

| Destino `DATA` | Origen `CELE` / regla de compatibilidad |
|---|---|
| A `FECH ASIG` | Fecha de despacho confirmada por el usuario |
| B:AF | A:AE, desde `NRO_SS` hasta `FECHA_CREACION` |
| AG `ZONA` | AF `ESTADO` (`En proceso` en las 31 filas observadas) |
| AH `STATUS` | AG `MOTIVO_DEL_CIERRE`, solo si pertenece al catálogo aprobado; si no, incidencia |
| AI `COMENTARIO` | AH `DETALLE_CIERRE` |
| AJ `QUIEN RECIBE` | AI `NOTA` |
| AK `INFO TERCERO` | AJ `FechaAsig - VAL` normalizado; `0` cuando la fuente trae `00:00:00` |
| AL `FECHA DE ENTREGA` | AK `BusqSol - DEL` |
| AM `Comentario BPD` | AL `BusqCed - CALL` |
| AN `AREAS REMOTAS` | AM `NoAsig - RE` |
| AO `Status Cc` | AN `Dups` |
| AP `Contacto Cc` | AO `Val Sol` |
| AQ `No. Contact` | vacío |

La compatibilidad AL:AP es semánticamente incoherente, pero reproduce las filas ya importadas. La decisión de limpiarla se pospone: esta fase la conserva para no alterar hojas auxiliares, pivotes o controles manuales.

Para Celego, en cambio, `productType=DEBITO`, `requestNumber=NRO_SS`, `dispatchDate=fecha confirmada`, provincia/municipio/dirección/teléfonos se leen por sus encabezados reales y la zona logística se resuelve desde `ProvinceConfig`. La información fuente completa queda en el snapshot del corte.

Al sincronizar `DATA` completa, usar `N-SS`, `FECH ASIG` y los campos semánticos del cliente. Los estados legados se normalizan mediante un catálogo explícito; valores de devolución conservan el texto original como razón. Filas activas sin estado se consideran `DESPACHADA`, nunca entregadas por inferencia.

Mapeo de estados legados de `DATA`:

| `DATA.STATUS` | `CardStatus` | Razón / dato adicional |
|---|---|---|
| vacío, `EN PROCESO`, `CNT BPD - EN PROCESO` | `DESPACHADA` | Sin razón de retorno |
| `EN RUTA` | `EN_RUTA` | Sin razón de retorno |
| `TD- ENTREGADO` | `ENTREGADA` | Fecha válida de `FECHA DE ENTREGA`, si existe |
| `TD- RETIRADA EN OFICINA` | `ENTREGADA` | Marcar modalidad como retiro en oficina |
| `NO LOCALIZADO` | `DESPACHADA` (propuesto) | Conservar como nota de intento; sigue activa para ruta y SLA |
| `TD- DEVUELTO DIRECCION IMCOMPLETA` | `RETORNADA` | Conservar el texto como razón |
| `TD- DEVUELTO NO LOCALIZADO` | `RETORNADA` | Conservar el texto como razón |
| `TD- NO APLICA PASAPORTE` | `RETORNADA` | Conservar el texto como razón |
| `TD- NO LE INTERESA` | `RETORNADA` | Conservar el texto como razón |
| `TD- SOLICITADA POR ERROR` | `RETORNADA` | Conservar el texto como razón |
| `TD- ZONA FUERA DE COBERTURA` | `RETORNADA` | Conservar el texto como razón |

Un valor legado fuera de este catálogo es `ROW_ERROR`, conserva su texto en el snapshot y no se convierte por aproximación.

### Mapeo inicial de estados externos

| Estado externo | Estado Celego propuesto | Valor propuesto en `DATA.STATUS` | Regla adicional |
|---|---|---|---|
| `Entregado al cliente` | `ENTREGADA` | `TD- ENTREGADO` | Completar fecha si está vacía o no es fecha; nunca sobrescribir una fecha válida |
| `Envio Creado` | `DESPACHADA` | `EN PROCESO` | Propuesta a aprobar; no degradar un estado posterior |
| `En transito para entrega` | `EN_RUTA` | `EN RUTA` | Propuesta a aprobar; conservar tracking y operador |
| `En estacion de ultima milla` | `EN_RUTA` | `EN RUTA` | Propuesta a aprobar; conservar tracking y operador |
| `En espera para salir de nuevo a ruta` | `EN_RUTA` | `EN RUTA` | Propuesta a aprobar; conservar tracking y operador |
| `Cancelado / Orden anulada` | `RETORNADA` | `TD- DEVUELTO ORDEN ANULADA` | Propuesta genérica: no deducir motivo específico desde notas; agregar valor a `LISTA` |

Solo `Entregado al cliente -> TD- ENTREGADO` queda confirmado por los datos actuales. Los demás valores son decisiones propuestas para este Human Gate. Un estado no listado bloquea esa fila hasta que un Administrador lo mapee, pero no invalida por sí solo las demás filas válidas. El valor externo original nunca se descarta y `Operador` nunca se interpreta como mensajero.

### Duplicados del reporte digital

Agrupar por `No. de orden` y conservar todos los eventos:

1. Si cualquier tracking está `Entregado al cliente`, el resultado agregado es entregado y no puede degradarse por otro tracking activo o cancelado.
2. Si no hay entrega y cualquier tracking está `Cancelado / Orden anulada`, el resultado agregado es retorno; no se inventa un motivo detallado.
3. Si no hay estado terminal, usar el evento con la `Fecha de último movimiento` más reciente.
4. Si dos eventos máximos tienen igual fecha pero resultados incompatibles, bloquear la solicitud como ambigua.
5. Mostrar siempre una advertencia cuando una solicitud tenga más de un tracking.

Si Celego contiene más de un despacho para la misma solicitud y el reporte externo no permite identificar el episodio, la fila se bloquea; no se elige silenciosamente.

### Identidad e idempotencia

- Identidad del despacho débito: `requestNumber + dispatchDate`.
- Identidad del evento externo: `trackingNumber + movementAt + externalStatus`.
- Validar la solicitud con `^4-\d{11}$`; una clave inválida nunca se busca como cédula ni crea una tarjeta.
- La cédula identifica al cliente, no al despacho: misma cédula con otra solicitud es una nueva gestión con advertencia informativa.
- Calcular SHA-256 de cada archivo fuente.
- Una repetición exacta se advierte; Administrador puede iniciar un corte nuevo solo con confirmación auditada.
- Un token de vista previa liga hashes, fecha de despacho, usuario y conteos; aplicar con entradas distintas exige validar nuevamente.

### Modelo de persistencia

Agregar:

- `DebitConsolidationRun`: estado `VALIDATING | READY | PROCESSING | COMPLETED | FAILED`, usuario, fecha de despacho, hashes, nombres, conteos, ruta/bytes del resultado y timestamps.
- `DebitConsolidationIssue`: ejecución, archivo, hoja, fila, solicitud, severidad, código y mensaje.
- `DebitStatusEvent`: ejecución, tarjeta, solicitud, tracking, estado externo, movimiento, operador, notas y resolución aplicada.

Los archivos y snapshots deben respetar la estrategia local ya usada por el proyecto. No se requiere servicio externo ni MCP.

### Atomicidad y recuperación

- Generar y validar el Excel resultante en una ruta temporal antes de mutar tarjetas.
- Ejecutar altas, transiciones, eventos y auditoría en una transacción de base de datos.
- Publicar el archivo solo cuando la transacción sea válida y marcar la ejecución `COMPLETED` al finalizar ambos resultados.
- Ante error, marcar `FAILED`, conservar incidencias y no presentar el corte como aplicado.
- La compensación elimina artefactos temporales; nunca sobrescribe el consolidado fuente.

### Severidad de incidencias

- `WARNING`: duplicado idéntico omitido, solicitud válida sin coincidencia, misma cédula con otra solicitud, múltiples trackings resueltos por precedencia o estado sin cambio. Permite aplicar.
- `ROW_ERROR`: solicitud con formato inválido, estado externo no mapeado, fecha inválida en una fila o valor de catálogo no aprobado. La fila se omite; aplicar exige reconocimiento explícito del Operador.
- `BLOCKING`: hoja/encabezado obligatorio ausente, más de un despacho interno candidato, empate multitracking incompatible, vista previa obsoleta, archivo corrupto o imposibilidad de preservar el libro. Deshabilita toda aplicación hasta corregir.

### Permisos

- `ADMIN`: validar, aplicar, descargar, consultar historial, configurar mapeos y autorizar repetición.
- `OPERADOR`: validar, aplicar, descargar y consultar historial; no fuerza conflictos ni modifica mapeos.
- `FACTURACION` y `MENSAJERO`: sin acceso al procesamiento.

### Historial de cortes

Mostrar fecha/hora, usuario, estado, archivos fuente, hashes, fecha de despacho, filas base sincronizadas, altas, estados actualizados, sin cambio, advertencias, errores y resultado. Una ejecución completada permite recuperar el consolidado y las incidencias; una fallida muestra causa y permite iniciar un corte nuevo, no reanudar parcialmente el anterior.

Estados de pantalla obligatorios: vacío, validando, listo, listo con advertencias, bloqueado, procesando, completado y fallido. Las cargas y tablas son operables con teclado, conservan foco visible y anuncian progreso. Advertencias seguras permiten aplicar solo después de confirmación explícita; incidencias `BLOCKING` mantienen la acción deshabilitada.

### Accesibilidad y errores

- Los estados no dependen solo del color.
- Mensajes persistentes identifican archivo, hoja, columna/fila y acción correctiva.
- El proceso bloquea doble envío y anuncia progreso.
- Se permite descargar incidencias antes de aplicar.

## 3. Lista de Tareas (Task Planner)

- [ ] Crear fixtures anonimizados con la estructura exacta de los tres libros inspeccionados.
- [ ] Implementar parsers estrictos por encabezados y normalización segura de identificadores/fechas.
- [ ] Implementar sincronización idempotente de `DATA` completa antes de altas y estados.
- [ ] Implementar mapeo de altas, resolución de zona y generación fiel del consolidado.
- [ ] Implementar agregación de múltiples trackings y catálogo administrable de estados.
- [ ] Crear modelos de ejecución, incidencias y eventos con índices e idempotencia.
- [ ] Crear APIs de validación, aplicación, historial y descargas con permisos.
- [ ] Registrar el nuevo módulo en navegación, ACL y configuración de módulos por rol.
- [ ] Sincronizar altas y estados con el servicio de dominio de tarjetas.
- [ ] Crear la pantalla `Consolidado débito`, la banda de conciliación y el recibo de ejecución.
- [ ] Probar archivos solo de altas, solo de estados, combinados, repetidos, inválidos y con conflicto.
- [ ] Probar carga inicial de 1,344 gestiones base y reimportación sin tarjetas ni logs duplicados.
- [ ] Verificar que hojas, orden, estilos, formatos de fecha y validaciones del Excel se preservan.
- [ ] Verificar con los archivos reales que 31 altas llevan `DATA` de 1,344 a 1,375 filas y `Table1` de `A1:AQ1345` a `A1:AQ1376`.
- [ ] Verificar 979 estados coincidentes, una solicitud inválida/no encontrada y 20 grupos multitracking.
- [ ] Probar que un fallo de Excel o base de datos no deja una ejecución presentada como completa.
- [ ] Ejecutar TypeScript, lint, build, pruebas y verificación visual del libro resultante.
- [ ] Ejecutar la verificación Docker obligatoria indicada en `AGENTS.md`.

### Evaluación de skills

No se requiere crear una skill personalizada para implementar esta feature. Las capacidades existentes de `Spreadsheets`, `postgresql`, `frontend-design`, `error-handling-patterns` y `systematic-debugging` cubren el trabajo. Los mapeos de columnas, estados e identidad son reglas del producto y deben vivir versionadas y probadas en Celego, no en una skill global del agente.

### Decisiones propuestas para aprobación en el Human Gate

1. La fecha de despacho es obligatoria para altas; se prellena desde el nombre del archivo y siempre se confirma.
2. Se aprueba el mapeo inicial de estados de esta spec, incluido `TD- DEVUELTO ORDEN ANULADA`; la razón canónica interna será `Orden anulada` y las notas externas solo se conservan como auditoría, sin inferir motivos específicos.
3. Para múltiples trackings rige `entregado > cancelado > último no terminal`; empates incompatibles se bloquean.
4. `Fecha de último movimiento` completa `FECHA DE ENTREGA` solo para `Entregado al cliente` cuando la celda está vacía o contiene un auxiliar no-fecha como `NotFound`; nunca sobrescribe una fecha válida y preserva el valor reemplazado en el snapshot.
5. El archivo conserva el mapeo posicional legado AL:AP; la base de datos usa campos semánticos separados.
6. Se exige vista previa y confirmación; no habrá procesamiento inmediato al seleccionar archivos.
7. Administrador y Operador aplican cortes; solo Administrador administra mapeos o autoriza repeticiones.
8. `NO LOCALIZADO` sin prefijo `TD- DEVUELTO` se considera un intento fallido activo (`DESPACHADA`); `TD- DEVUELTO NO LOCALIZADO` sí es terminal (`RETORNADA`).

*(Nota para la IA: Tras aprobar el Human Gate, ejecuta las tareas mediante sub-agentes en la rama `codex/consolidado-debito`. Al finalizar, verifica contra la suite de /tests antes de solicitar Merge a `dev`).*
