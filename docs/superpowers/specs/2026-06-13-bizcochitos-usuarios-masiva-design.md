# Diseño de Bizcochitos, usuarios y actualización masiva

Fecha: 2026-06-13

## Objetivo

Corregir el catálogo de provincias en Actualización masiva, incorporar el proceso bancario de Bizcochitos para entregas digitales y convertir Configuración en una gestión completa y auditable de usuarios.

La implementación debe conservar los flujos operativos actuales, reutilizar la autorización existente y mantener trazabilidad histórica.

## Decisiones aprobadas

### Actualización masiva

- El selector mostrará todas las provincias activas de `ProvinceConfig`, no solo las provincias de las tarjetas pistoleadas.
- Al seleccionar una provincia, su zona configurada se completará automáticamente.
- La zona seguirá editable antes de aplicar el cambio.
- Provincia y zona se validarán nuevamente en el servidor.

### Bizcochitos

- Cada generación incluirá todas las tarjetas pendientes cuyo status actual sea `ENTREGA_DIGITAL`.
- Las tarjetas que ya están en `ENTREGA_DIGITAL` al desplegar la función quedarán pendientes para el primer Bizcochito.
- Después de exportar, cada ciclo digital incluido quedará marcado como procesado.
- Si una tarjeta sale de `ENTREGA_DIGITAL` y posteriormente vuelve a ese status, se abrirá un ciclo digital nuevo y volverá a quedar pendiente.
- El histórico permitirá descargar el Excel original inmutable y regenerar otro archivo con los datos actuales.
- Solo `ADMIN` y `OPERADOR` podrán generar o reexportar Bizcochitos.
- El Excel tendrá información operativa completa.
- La interfaz tendrá una pestaña dedicada `Bizcochitos` dentro de Entregas digitales.

### Usuarios

- La gestión será completa: crear, editar nombre, correo y rol, activar, desactivar, cambiar contraseña y consultar actividad.
- No habrá eliminación permanente de usuarios.
- La interfaz utilizará una tabla con buscador y filtros, más un panel lateral de detalle.
- La actividad incluirá accesos exitosos y fallidos, cambios administrativos, acciones operativas importantes y exportaciones.
- Solo administradores podrán gestionar usuarios y consultar esta actividad.

## Modelo de datos

### Card

Se agregarán:

- `digitalDeliveryCycle Int @default(0)`: número de veces que la tarjeta ha entrado a `ENTREGA_DIGITAL`.
- `bizcochito Boolean @default(false)`: indica si el ciclo digital vigente ya fue incluido.
- `bizcochitoAt DateTime?`: fecha de inclusión del ciclo vigente.

Reglas:

- Al transicionar desde otro status hacia `ENTREGA_DIGITAL`, se incrementa `digitalDeliveryCycle`, se asigna `bizcochito=false` y se limpia `bizcochitoAt`.
- Mantener una tarjeta que ya está en `ENTREGA_DIGITAL` no incrementa el ciclo.
- Cambiar hacia otro status no borra el histórico del ciclo anterior.

### BizcochitoBatch

Cabecera inmutable de cada generación:

- `id`
- `sequence` autoincremental
- `code` único con formato `BIZ-YYYYMMDD-####`
- `generatedById`
- `generatedAt`
- `itemCount`
- `originalFileName`
- `originalFile` como `Bytes @db.Bytea`
- `originalSha256`
- `createdAt`

### BizcochitoItem

Detalle histórico:

- `batchId`
- `cardId`
- `digitalDeliveryCycle`
- `snapshot Json`
- `createdAt`

La combinación `[cardId, digitalDeliveryCycle]` será única para impedir que el mismo ciclo aparezca en dos lotes.

El `snapshot` conservará exactamente los valores usados para generar el archivo original.

### AuditLog

Se ampliará la bitácora existente para distinguir actor, usuario afectado, resultado y contexto:

- actor autenticado o correo intentado;
- usuario objetivo opcional;
- tipo de evento;
- resultado exitoso o fallido;
- dirección IP y agente de usuario cuando estén disponibles;
- detalles estructurados sin contraseñas, cookies ni identificadores de sesión.

Se agregarán índices por actor, usuario objetivo, tipo de evento y fecha.

## Ciclo digital centralizado

Toda actualización de status deberá pasar por una función de dominio compartida. Esta resolverá:

1. status anterior y status nuevo;
2. incremento del ciclo digital;
3. reinicio de la marca de Bizcochito;
4. motivo de retorno;
5. creación de `CardStatusLog`;
6. evento de auditoría.

Esto debe cubrir como mínimo:

- modal de tarjeta;
- Actualización masiva;
- Entregas digitales por imágenes;
- importaciones;
- redacciones y otros procesos que cambien status.

Centralizar esta regla evita que una ruta de actualización olvide reabrir el ciclo.

## Generación de Bizcochitos

### Consulta

El panel mostrará:

- cantidad de ciclos pendientes;
- último Bizcochito generado;
- histórico paginado.

Un ciclo está pendiente cuando:

- la tarjeta tiene status `ENTREGA_DIGITAL`;
- `bizcochito=false`;
- `digitalDeliveryCycle > 0`;
- no existe `BizcochitoItem` para tarjeta y ciclo.

### Generación atómica

La API ejecutará una transacción serializable con reintentos controlados:

1. obtiene todos los ciclos pendientes;
2. vuelve a verificar que no hayan sido reclamados;
3. crea la cabecera;
4. crea los detalles con sus snapshots;
5. genera el Excel en memoria;
6. guarda el archivo y su hash;
7. marca las tarjetas como procesadas;
8. crea el evento de auditoría.

Si cualquier paso falla, no se crea el lote ni se marcan tarjetas.

Si no hay pendientes, se responde con un mensaje accionable y no se crea un lote vacío.

### Columnas del Excel

- Código de Bizcochito
- Ciclo digital
- TC
- Referencia externa
- Cliente
- Cédula
- Teléfonos
- Dirección
- Status
- Fecha de despacho
- Fecha de entrada a entrega digital
- Provincia original
- Zona original
- Provincia efectiva
- Zona efectiva o facturable
- Mensajero original o actual
- Mensajero reasignado
- Zona remota
- Tipo de emisión
- Tipo de entrega
- Suplidor
- Tipo de contrato

### Reexportaciones

- `Descargar original`: devuelve los bytes guardados sin recalcular información.
- `Regenerar actual`: consulta las mismas tarjetas del lote y genera un archivo nuevo con sus datos vigentes.
- Regenerar no cambia el lote, los snapshots ni las marcas de las tarjetas.
- Ambas acciones generan auditoría.

## Migración inicial

El bootstrap normalizará datos existentes:

- tarjetas actualmente en `ENTREGA_DIGITAL` con ciclo cero pasan a ciclo 1;
- quedan con `bizcochito=false`;
- las demás conservan ciclo cero;
- el proceso será idempotente.

## Actualización masiva

La pantalla cargará en paralelo:

- motivos de retorno;
- provincias activas.

El selector de provincia se construirá desde el catálogo completo. Al cambiar:

- provincia concreta: selecciona automáticamente su zona;
- `sin cambio`: devuelve la zona a `sin cambio`;
- el operador puede cambiar después la zona.

La API rechazará provincias inexistentes o inactivas y zonas fuera del catálogo permitido.

## Gestión de usuarios

### Navegación

Configuración tendrá pestañas accesibles:

- `General`: SLA, motivos y provincias.
- `Usuarios`: gestión y actividad.

La pestaña seleccionada será persistente.

### Lista

- búsqueda por nombre o correo;
- filtro por rol;
- filtro por estado;
- paginación;
- selección de usuario;
- acción `Nuevo usuario`.

### Panel lateral

Modos:

- crear usuario;
- editar perfil y rol;
- consultar actividad.

Acciones sensibles:

- cambiar contraseña mediante diálogo de confirmación;
- activar o desactivar;
- guardar cambios de rol.

### Reglas de seguridad

- un administrador no puede desactivarse;
- un administrador no puede quitarse su propio rol `ADMIN`;
- nunca puede quedar el sistema sin administradores activos;
- correo único y normalizado;
- contraseñas nunca se devuelven ni se registran;
- los cambios de rol deben afectar nuevas autorizaciones de forma consistente;
- no se permite eliminación permanente.

### Actividad

Se mostrarán:

- fecha y hora;
- tipo de evento;
- actor;
- resultado;
- descripción;
- entidad relacionada.

Filtros:

- rango de fechas;
- tipo de evento;
- resultado;
- actor.

## Eventos auditables

Como mínimo:

- inicio de sesión exitoso;
- inicio de sesión fallido;
- fallo de autorización;
- creación y modificación de usuarios;
- cambio de contraseña;
- activación, desactivación y cambio de rol;
- generación y reexportación de Bizcochitos;
- Actualización masiva;
- Status digitales;
- importaciones;
- rutas y redacciones;
- exportaciones de reportes y facturación.

## Interfaz visual

### Dominio

- mensajería de tarjetas;
- lotes bancarios;
- pistoleo;
- trazabilidad;
- entregas digitales;
- control operativo.

### Color y profundidad

- se mantiene el azul marino de Celego para acciones principales;
- ámbar suave identifica Bizcochitos sin convertirlo en decoración;
- verde comunica lotes listos;
- rojo se reserva para riesgos y fallos;
- profundidad mediante bordes suaves y sombras discretas existentes.

### Firma

El elemento distintivo será la tarjeta de ciclo:

- pastel lineal;
- cantidad pendiente;
- código del último lote;
- acción principal;
- estado de procesamiento.

## Manejo de errores

- errores 4xx con mensajes operativos para validaciones;
- errores 409 para conflictos de concurrencia;
- reintentos limitados para serialización;
- descarga original responde 404 si el archivo histórico no existe;
- errores de Excel no alteran tarjetas;
- mensajes de éxito y error con estilos diferenciados;
- botones bloqueados durante operaciones;
- confirmación antes de generar un Bizcochito.

## Validación

### Actualización masiva

- muestra provincias no presentes en las tarjetas pistoleadas;
- autocompleta zona;
- permite cambiar zona;
- rechaza catálogo inválido;
- aplica correctamente a todas las seleccionadas.

### Bizcochitos

- incluye todos los ciclos pendientes;
- no incluye ciclos procesados;
- reabre un ciclo al volver a `ENTREGA_DIGITAL`;
- evita duplicados concurrentes;
- conserva el archivo original;
- regenera con datos actuales;
- mantiene snapshots y marcas;
- aplica permisos.

### Usuarios y auditoría

- alta, consulta y actualización permitidas sin eliminación;
- reglas del administrador;
- correo único;
- contraseña protegida;
- filtros y paginación;
- accesos exitosos y fallidos;
- acciones operativas y exportaciones.

### Verificación técnica

- Prisma format y generate;
- TypeScript;
- lint;
- build;
- pruebas de API y dominio;
- pruebas de interfaz;
- revisión en navegador integrado;
- `docker compose build`;
- `docker compose up -d --force-recreate`;
- `docker compose ps`;
- logs si algún servicio falla.

## Fuera de alcance

- eliminación permanente de usuarios;
- permisos personalizados por usuario fuera de los roles existentes;
- envío automático del Excel al banco;
- programación automática de Bizcochitos;
- edición manual de lotes ya generados;
- almacenamiento externo de archivos.
