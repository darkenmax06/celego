# Diseño de mejoras operativas de Celego

Fecha: 2026-06-13

## Objetivo

Implementar reasignaciones posteriores de entregas, corregir exportaciones incompletas o desordenadas, recuperar el progreso de trabajo por usuario y mejorar la consistencia visual sin alterar el flujo operativo aprendido por el equipo.

## Reglas aprobadas

- Una reasignación solo puede registrarse si la tarjeta ya está `ENTREGADA` o `ENTREGA_DIGITAL`.
- Registrar una reasignación no cambia el status de la tarjeta.
- La provincia seleccionada determina automáticamente la zona efectiva mediante `ProvinceConfig`.
- El mensajero debe estar activo y pertenecer a la provincia seleccionada.
- Si no hay mensajeros activos, la reasignación queda bloqueada.
- La reasignación más reciente gobierna facturación y reportes.
- Todas las reasignaciones permanecen visibles en la bitácora.
- Provincia y zona originales nunca se sobrescriben al crear una ruta.

## Modelo de datos

### Card

`provincia` y `zona` continúan representando la asignación original.

Se agregan campos efectivos opcionales:

- `effectiveProvince`
- `effectiveZone`
- `effectiveMessengerId`
- `reassignedAt`

Cuando no existe reasignación, la ubicación efectiva se resuelve con los valores originales.

### CardDeliveryReassignment

Historial inmutable de correcciones:

- tarjeta
- provincia y zona anteriores
- mensajero anterior
- provincia y zona nuevas
- mensajero nuevo
- nota
- usuario
- fecha

### RedactionItem

Se agrega `sequence` para preservar el orden pistoleado. Toda lectura destinada a pantalla o exportación debe ordenar por este campo.

### WorkflowDraft

Borrador por usuario, módulo y contexto:

- `userId`
- `module`
- `contextKey`
- `payload`
- `version`
- `updatedAt`

La combinación de usuario, módulo y contexto es única. `version` permite detectar conflictos de escritura.

## API y transacciones

### Reasignación

Un endpoint dedicado valida tarjeta, status, provincia y mensajero. En una sola transacción:

1. crea el historial;
2. actualiza los campos efectivos;
3. crea auditoría;
4. preserva el status.

Los errores esperados se devuelven como respuestas 4xx con mensajes accionables.

### Borradores

El API permite leer, guardar y eliminar borradores. El guardado compara la versión enviada con la versión vigente y responde `409` si otra pestaña o equipo modificó el borrador.

## Facturación y reportes

Una función compartida resuelve:

- zona facturable: efectiva o, si no existe, original;
- provincia efectiva;
- mensajero efectivo.

La regla se usa en resumen, factura y exportaciones para evitar divergencias.

Los reportes de tarjetas incluyen:

- Provincia original
- Provincia de reasignación
- Mensajero reasignado
- Zona facturable

Las columnas de reasignación quedan vacías cuando no aplican.

## Exportaciones

### Rutas

El PDF divide todas las filas en páginas. Cada página repite contexto y encabezados, mantiene numeración continua y reserva la fecha límite para la última página.

### Entregas y retornos

Pantalla, PDF y Excel usan `RedactionItem.sequence`. Las relaciones existentes reciben una secuencia estable durante la actualización de datos; no es posible reconstruir con certeza el orden histórico que nunca fue almacenado.

## Persistencia híbrida

### Servidor

Se guardan trabajos costosos o críticos:

- Redacción
- Rutas
- Modificación masiva
- Operativo
- Rastreo masivo
- formularios incompletos relevantes

### Navegador

Se guardan preferencias y contexto:

- pestaña activa
- filtros
- página
- filas seleccionadas
- modal abierto
- columnas visibles/exportables

No se guardan mensajes temporales, estados de carga ni errores.

Los archivos seleccionados en Entrega digital no pueden restaurarse; solo se conservan nombres y configuración.

## Dirección visual

Celego mantiene su identidad azul, densidad y navegación. Se crea un sistema compartido para:

- controles;
- pestañas;
- tablas;
- avisos;
- diálogos;
- estados vacíos;
- indicador de autoguardado.

La firma visual será una barra operativa discreta con contexto, conteos y estado `Guardado`, `Recuperado`, `Error` o `Conflicto`.

## Validación

- reasignación permitida y bloqueada según status;
- provincia y mensajero consistentes;
- facturación antes y después de reasignar;
- historial completo y status intacto;
- rutas con 42, 43, 84 y 85 tarjetas;
- orden idéntico entre pantalla, PDF y Excel;
- restauración y descarte de borradores;
- conflicto entre dos pestañas;
- lint y build;
- reconstrucción y verificación obligatoria con Docker Compose.
