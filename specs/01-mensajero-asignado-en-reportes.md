# Especificación: Mensajero asignado persistente en reportes

Estado: `HUMAN_GATE`

## 1. Requerimientos de Usuario (Spec Writer)

### Objetivo

Conservar y exportar el último mensajero al que fue asignado cada despacho, aunque la tarjeta termine en `ENTREGADA`, `ENTREGA_DIGITAL`, `RETORNADA` o `DEVUELTA_TIENDA`.

### Hallazgo en el sistema actual

- El reporte general ya intenta leer `currentMessenger`.
- Al aprobar redacciones, `app/api/redacciones/route.ts` y `app/api/redacciones/aprobar/route.ts` limpian `currentMessengerId` en estados terminales.
- Por esa razón, el reporte pierde el mensajero precisamente después de cerrar la entrega o el retorno.
- `RouteItem -> Route -> Messenger` conserva parte del historial, pero hoy no existe un campo explícito y estable para “último mensajero asignado”.

### Historias de usuario

- [ ] Como Operador, quiero que el reporte muestre el mensajero asignado después de entregar, entregar digitalmente o retornar una tarjeta, para poder auditar la gestión realizada.
- [ ] Como Facturación, quiero que XLSX, CSV y PDF resuelvan el mismo mensajero, para evitar resultados distintos por formato.
- [ ] Como Administrador, quiero recuperar el mensajero de registros históricos cuando exista evidencia en rutas, lotes o la asignación actual.

### Criterios de aceptación

- [ ] Todo reporte que incluya mensajero exporta el último mensajero persistido; contratos existentes conservan su nombre de columna y contratos nuevos pueden usar `mensajeroAsignado`.
- [ ] La regla aplica como mínimo a `ENTREGADA`, `ENTREGA_DIGITAL`, `RETORNADA` y `DEVUELTA_TIENDA`.
- [ ] El cambio de estado terminal puede limpiar la asignación operativa actual, pero no el historial ni el último mensajero asignado.
- [ ] Si nunca existió asignación, se exporta `SIN ASIGNAR`.
- [ ] XLSX, CSV y PDF producen el mismo valor para una misma tarjeta.
- [ ] Reasignar una entrega actualiza el último mensajero asignado sin reescribir las asignaciones históricas.
- [ ] La corrección no altera el estado, la provincia, la zona ni la facturación de la tarjeta.
- [ ] Los registros anteriores al cambio se completan mediante un backfill idempotente.

## 2. Diseño y Arquitectura (Designer)

### Alternativas consideradas

1. **No limpiar `currentMessengerId`:** cambio pequeño, pero mezcla “asignación vigente” con “última asignación histórica” y rompe la semántica actual.
2. **Consultar siempre la última ruta:** evita un campo nuevo, pero encarece y complica cada reporte; tampoco cubre asignaciones manuales sin ruta.
3. **Persistir `lastAssignedMessengerId`:** opción recomendada. Separa estado vigente e histórico y permite un fallback auditable para datos anteriores.

### Modelo de datos

Agregar a `Card`:

- `lastAssignedMessengerId String?`
- relación `lastAssignedMessenger Messenger?`
- índice por `lastAssignedMessengerId`

`currentMessengerId` continúa significando asignación operativa vigente. `lastAssignedMessengerId` solo cambia cuando se asigna o reasigna un mensajero y nunca se limpia por una transición de estado.

### Escrituras de dominio

Centralizar la asignación para que los siguientes flujos actualicen ambos campos cuando corresponda:

- creación de ruta diaria;
- creación/asignación de lote;
- actualización individual o masiva con mensajero;
- reasignación posterior de entrega;
- importaciones que incluyan una asignación válida.

Las transiciones terminales pueden limpiar `currentMessengerId`; deben preservar `lastAssignedMessengerId`.

### Backfill y resolución

Orden de recuperación para registros históricos:

1. `currentMessengerId`, si existe;
2. comparar la última asignación de ruta por `Route.createdAt` con la reasignación por `reassignedAt` y elegir el evento posterior;
3. en un empate exacto entre ruta y reasignación, elegir la reasignación porque representa una corrección explícita;
4. sin valor si no existe evidencia.

El backfill guarda el resultado en `lastAssignedMessengerId` y puede ejecutarse varias veces sin cambiar registros ya correctos.

Crear un único resolver de lectura:

`lastAssignedMessenger -> currentMessenger -> evento más reciente entre ruta y reasignación -> SIN ASIGNAR`.

Para evidencias históricas, comparar `Route.createdAt` y `reassignedAt`; un empate favorece la reasignación explícita. Si dos evidencias del mismo instante apuntan a mensajeros incompatibles y no hay reasignación que desempate, registrar conflicto y no inventar el valor.

El resolver se reutiliza en reportes generales, contactos, redacciones, vencimientos, rutas y cualquier exportación que muestre mensajero.

### Interfaz y contrato de exportación

- Etiqueta visible: `Mensajero asignado`.
- Mantener `Mensajero reasignado` como campo separado cuando aplique; no sustituirlo silenciosamente.
- La UI de detalle muestra asignación vigente y último mensajero asignado como conceptos distintos.
- Los reportes existentes mantienen compatibilidad de columnas: la columna actual `mensajero` conserva su nombre y adopta el valor resuelto. Solo contratos/exportaciones nuevos pueden usar `mensajeroAsignado`.

### Errores y auditoría

- Una asignación a un mensajero inexistente o inactivo se rechaza antes de escribir.
- Toda reasignación conserva usuario, fecha y origen en la bitácora existente.
- El backfill genera un resumen de actualizados, sin evidencia y conflictos; no inventa asignaciones.

## 3. Lista de Tareas (Task Planner)

- [ ] Agregar relación e índice de `lastAssignedMessenger` al esquema Prisma y preparar migración/backfill idempotente.
- [ ] Crear servicio central de asignación y resolver compartido de mensajero.
- [ ] Actualizar rutas, lotes, edición individual, actualización masiva y reasignación para mantener el nuevo campo.
- [ ] Preservar el último mensajero en todas las transiciones terminales.
- [ ] Actualizar consultas y serialización de reportes XLSX, CSV y PDF.
- [ ] Añadir cobertura para asignación, reasignación, cierre terminal, registro sin mensajero y backfill histórico.
- [ ] Ejecutar TypeScript, lint, build y pruebas de reportes.
- [ ] Ejecutar la verificación Docker obligatoria indicada en `AGENTS.md`.

### Decisiones propuestas para aprobación en el Human Gate

1. Crear `lastAssignedMessengerId` en lugar de reutilizar `currentMessengerId` o consultar rutas en cada reporte.
2. Permitir que los estados terminales limpien la asignación vigente, pero nunca el último mensajero asignado.
3. Aprobar el desempate del backfill: asignación vigente; luego evento más reciente entre ruta y reasignación; en empate, reasignación.
4. Exportar `SIN ASIGNAR` cuando no exista evidencia, sin inferir mensajero desde operadores externos.

*(Nota para la IA: Tras aprobar el Human Gate, ejecuta las tareas mediante sub-agentes en la rama `codex/mensajero-asignado-reportes`. Al finalizar, verifica contra la suite de /tests antes de solicitar Merge a `dev`).*
