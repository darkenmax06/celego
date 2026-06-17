# Roadmap de Bizcochitos, usuarios y actualización masiva

Fecha: 2026-06-13

Estado: pendiente de autorización para implementar

## Resultado esperado

Entregar tres mejoras conectadas:

1. Actualización masiva con catálogo completo y zona automática.
2. Ciclos e histórico de Bizcochitos para entregas digitales.
3. Gestión completa y auditable de usuarios.

## Fase 0. Protección y línea base

Objetivo: preparar una implementación verificable sin mezclar cambios.

Tareas:

- revisar todos los puntos que modifican status de tarjeta;
- inventariar eventos de auditoría existentes;
- registrar casos de prueba y datos de muestra;
- confirmar el mapeo de las columnas aprobadas con el esquema existente;
- verificar respaldo y persistencia del volumen PostgreSQL.

Criterio de salida:

- matriz de transiciones de status completa;
- lista de endpoints afectados;
- línea base de build, tipos y salud Docker.

## Fase 1. Corrección de Actualización masiva

Objetivo: resolver primero el defecto independiente y de menor riesgo.

Tareas:

- cargar provincias activas desde Configuración;
- reemplazar el listado derivado de tarjetas pistoleadas;
- autocompletar zona al seleccionar provincia;
- permitir edición posterior de zona;
- validar provincia y zona en la API;
- mantener el borrador persistente actual.

Pruebas:

- provincia sin tarjetas pistoleadas disponible;
- cambio provincia-zona;
- zona manual;
- provincia inactiva;
- lote parcial y lote completo.

Criterio de salida:

- todos los selectores muestran opciones válidas;
- la aplicación masiva conserva trazabilidad.

## Fase 2. Dominio de ciclos digitales

Objetivo: crear una única regla para entrada a `ENTREGA_DIGITAL`.

Tareas:

- agregar campos de ciclo y marca a `Card`;
- crear servicio compartido de transición;
- integrar modal, masiva, imágenes, importaciones y redacciones;
- añadir logs y auditoría;
- normalizar tarjetas digitales existentes como ciclo 1 pendiente;
- hacer bootstrap idempotente.

Pruebas:

- primera entrada digital;
- actualización repetida sin cambio;
- salida y regreso a digital;
- cambio por cada endpoint;
- datos existentes.

Criterio de salida:

- ninguna vía de status puede omitir el ciclo.

## Fase 3. Persistencia histórica de Bizcochitos

Objetivo: garantizar lotes inmutables y ciclos sin duplicados.

Tareas:

- crear `BizcochitoBatch`;
- crear `BizcochitoItem`;
- agregar secuencia y código;
- agregar snapshots;
- almacenar Excel binario y hash;
- crear restricciones e índices;
- implementar consulta de pendientes;
- implementar transacción serializable con reintentos.

Pruebas:

- lote vacío;
- lote exitoso;
- error durante generación;
- dos operadores generando simultáneamente;
- integridad del hash;
- restricción tarjeta-ciclo.

Criterio de salida:

- un ciclo aparece como máximo en un Bizcochito;
- no existen lotes parcialmente creados.

## Fase 4. Excel y APIs de Bizcochitos

Objetivo: completar generación, original y regenerado.

Tareas:

- crear generador Excel compartido;
- incluir todas las columnas aprobadas;
- crear API de resumen e histórico;
- crear API de generación;
- crear descarga original;
- crear regeneración actual;
- auditar generación y descargas;
- restringir a `ADMIN` y `OPERADOR`.

Pruebas:

- contenido y formato Excel;
- original idéntico por hash;
- regenerado refleja datos actuales;
- regenerado no modifica histórico;
- permisos y mensajes de error.

Criterio de salida:

- ciclo completo disponible desde API y descargable.

## Fase 5. Interfaz de Bizcochitos

Objetivo: incorporar el proceso sin sobrecargar la carga de imágenes.

Tareas:

- añadir tabs `Procesar imágenes` y `Bizcochitos`;
- añadir tarjeta de pendientes;
- añadir botón con icono de pastel;
- añadir confirmación previa;
- añadir histórico paginado;
- añadir acciones original y regenerar;
- añadir estados cargando, vacío, éxito y error;
- persistir la pestaña seleccionada.

Pruebas:

- navegación por teclado;
- botón bloqueado sin pendientes;
- prevención de doble clic;
- actualización del contador;
- descargas desde histórico;
- presentación móvil y escritorio.

Criterio de salida:

- el flujo puede ejecutarse completamente desde la interfaz.

## Fase 6. Auditoría estructurada

Objetivo: soportar actividad de usuarios y trazabilidad transversal.

Tareas:

- ampliar `AuditLog`;
- crear servicio único de auditoría;
- registrar acceso exitoso y fallido;
- registrar fallos de autorización;
- normalizar eventos administrativos;
- normalizar operaciones y exportaciones;
- evitar datos sensibles;
- añadir índices y paginación.

Pruebas:

- eventos completos;
- actor y objetivo correctos;
- intentos sin usuario existente;
- ausencia de contraseñas y sesiones;
- filtros eficientes.

Criterio de salida:

- cada evento aprobado puede consultarse de forma uniforme.

## Fase 7. Backend de gestión de usuarios

Objetivo: completar operaciones administrativas seguras.

Tareas:

- paginar y filtrar usuarios;
- permitir editar nombre, correo y rol;
- mantener activación y contraseña;
- impedir auto-desactivación;
- impedir auto-reducción de rol;
- proteger al último administrador activo;
- registrar cada operación;
- crear endpoint de actividad por usuario.

Pruebas:

- correo duplicado;
- cambio de rol;
- último administrador;
- acciones sobre usuario propio;
- usuario inactivo;
- contraseña;
- permisos no administrativos.

Criterio de salida:

- todas las reglas administrativas se aplican en servidor.

## Fase 8. Interfaz de usuarios

Objetivo: reemplazar el formulario lineal por una herramienta administrativa.

Tareas:

- dividir Configuración en `General` y `Usuarios`;
- añadir búsqueda, rol, estado y paginación;
- crear tabla seleccionable;
- crear panel lateral;
- crear modo alta y edición;
- crear diálogo de contraseña;
- añadir vista y filtros de actividad;
- diferenciar mensajes de éxito y error;
- persistir filtros y usuario seleccionado.

Pruebas:

- alta, edición y activación;
- panel y filtros;
- actividad;
- teclado y foco;
- confirmaciones;
- estados vacíos y errores.

Criterio de salida:

- un administrador realiza toda la gestión sin prompts nativos.

## Fase 9. Validación integral y despliegue

Objetivo: cerrar regresiones y dejar Docker actualizado.

Tareas:

- ejecutar Prisma format y generate;
- ejecutar TypeScript;
- ejecutar lint;
- ejecutar build;
- probar transiciones de status;
- probar concurrencia de Bizcochitos;
- validar archivos Excel;
- validar usuarios y auditoría;
- revisar interfaz en navegador;
- ejecutar Docker obligatorio.

Comandos finales:

1. `docker compose build`
2. `docker compose up -d --force-recreate`
3. `docker compose ps`
4. `docker compose logs --tail=200` si existe algún fallo

Criterio de salida:

- servicios saludables;
- `/api/health` responde correctamente;
- esquema aplicado;
- flujos aprobados pasan pruebas.

## Orden recomendado de autorización

La implementación puede ejecutarse como una sola iniciativa, pero debe revisarse en estos hitos:

1. Fases 1 y 2: selectores y ciclos.
2. Fases 3 a 5: Bizcochitos completo.
3. Fases 6 a 8: usuarios y auditoría.
4. Fase 9: validación y despliegue.

## Riesgos y mitigaciones

### Status actualizado por rutas distintas

Mitigación: servicio único de transición y prueba de todos los endpoints.

### Generaciones concurrentes

Mitigación: transacción serializable, restricción única y reintentos.

### Crecimiento de archivos binarios

Mitigación: guardar únicamente XLSX originales, hash y metadatos; monitorear tamaño.

### Auditoría con datos sensibles

Mitigación: lista permitida de campos y pruebas que prohíban contraseñas, cookies y sesiones.

### Bloqueo administrativo

Mitigación: impedir auto-reducción y proteger al último administrador activo.

## Estimación relativa

- Fase 1: pequeña.
- Fase 2: mediana y transversal.
- Fases 3 a 5: grandes.
- Fases 6 a 8: grandes.
- Fase 9: mediana.

La mayor complejidad está en centralizar todas las transiciones de status y garantizar generación concurrente sin duplicados.

## Autorización requerida

No se inicia implementación hasta recibir autorización explícita sobre este roadmap.
