# Celego server clone 68 to 240 design

Fecha: 2026-07-22
Origen de referencia: `10.0.0.68`
Destino nuevo: `10.0.0.240`

## Objetivo

Replicar la instalacion operativa de Celego desde `10.0.0.68` hacia `10.0.0.240` sin cambiar la IP del servidor nuevo. El resultado esperado es que ambos servidores puedan coexistir en la red y que Celego quede accesible en `http://10.0.0.240:3800` con la misma app, la misma base de datos y la misma forma de arranque que hoy existe en `10.0.0.68`.

## Estado actual validado

### Servidor origen `10.0.0.68`

- Hostname: `server`
- OS: `Ubuntu 26.04 LTS`
- Celego corre desde `/home/server/home/apps/celego`
- Servicio de arranque: `celego-compose.service`
- Estado del servicio: `enabled` y `active`
- Contenedores relevantes:
  - `celego-app`
  - `celego-db`
- Puerto publicado por Celego: `3800 -> 3000`
- Persistencia de PostgreSQL:
  - Volumen Docker: `celego_celego_pgdata`
  - Mountpoint: `/var/snap/docker/common/var-lib-docker/volumes/celego_celego_pgdata/_data`
- No se detecto `.env` activo con overrides; hoy la instalacion depende de defaults de `docker-compose.yml`

### Servidor destino `10.0.0.240`

- Responde por SSH
- Hostname actual: `server`
- No tiene `celego-compose.service`
- No se detecto proyecto Celego en `/home/server/home/apps/celego`
- No se confirmo Docker funcional aun
- Tiene espacio libre suficiente en disco para recibir la instalacion

## Alcance

Se clonara solo lo necesario para dejar Celego operativo en el `240`:

- Codigo y archivos del proyecto Celego
- Base de datos Celego
- Servicio `systemd` de arranque
- Estructura de carpetas de backups
- Validaciones de red y arranque

Queda fuera de alcance cualquier servicio ajeno a Celego encontrado en el `68`, en particular:

- `notionlocal_postgres`
- Cualquier publicacion de `5432` al host que no pertenezca a Celego

## Enfoque recomendado

Se usara una migracion logica y controlada:

1. Inspeccionar y preparar el servidor destino.
2. Instalar Docker en el `240` si hace falta, siguiendo el mismo esquema operativo del origen.
3. Copiar el proyecto Celego desde el `68` al `240` en la misma ruta.
4. Generar un dump fresco de la base Celego en el `68`.
5. Restaurar ese dump en el `240` dentro de un contenedor PostgreSQL de Celego.
6. Crear y habilitar `celego-compose.service` en el `240`.
7. Levantar Celego y validar acceso en `http://10.0.0.240:3800`.

Este enfoque evita copiar volumenes binarios completos de Docker entre hosts distintos y deja una ruta de recuperacion clara si hay que repetir la restauracion.

## Diseno tecnico

### 1. Preparacion del destino

Antes de copiar datos, validar en `10.0.0.240`:

- Presencia de `snap` y de `/snap/bin/docker`
- Estado del daemon Docker
- Disponibilidad del puerto `3800`
- Permisos de la ruta `/home/server/home/apps`

Si Docker no existe o no esta funcional, instalarlo antes de continuar. La expectativa es dejar el destino con el mismo esquema usado en el origen: Docker via Snap y Compose disponible como `/snap/bin/docker compose`.

### 2. Copia del proyecto

Copiar desde el origen hacia el destino:

- `/home/server/home/apps/celego`

Excluir:

- `node_modules` si existe dentro del proyecto
- artefactos temporales que no aporten al despliegue

Preservar:

- `docker-compose.yml`
- `Dockerfile`
- `docker-entrypoint.sh`
- scripts de proyecto
- carpeta `backups`

La copia deberia dejar el mismo layout operativo en ambos hosts para simplificar soporte posterior.

### 3. Migracion de base de datos

Generar un dump nuevo desde `celego-db` en el `68` usando `pg_dump` con salida comprimida `.sql.gz`.

Restauracion en `240`:

- Levantar primero el servicio `db` de Celego o un stack minimo con PostgreSQL
- Crear o reutilizar la base `celego`
- Restaurar el dump dentro del contenedor PostgreSQL del destino

Suposicion explicitada:

- Como en el origen no se detecto `.env` con valores distintos, se usaran los defaults del compose:
  - usuario: `celego`
  - password: `celego`
  - base: `celego`

### 4. Servicio de arranque

Crear en `240` el mismo servicio:

- `/etc/systemd/system/celego-compose.service`

Con el mismo `WorkingDirectory` y el mismo `ExecStart` observado en el `68`, adaptado a la ruta real si fuera necesario. Luego:

- `systemctl daemon-reload`
- `systemctl enable celego-compose.service`
- `systemctl start celego-compose.service`

### 5. Backups

Mantener en el destino:

- `/home/server/home/apps/celego/backups`

La automatizacion de backups preparada localmente no forma parte de esta clonacion base. Si el clon queda bien, se puede desplegar despues como segundo paso.

## Flujo de ejecucion

1. Confirmar Docker operativo en `240`.
2. Crear ruta `/home/server/home/apps/celego`.
3. Copiar proyecto desde `68` a `240`.
4. Crear dump nuevo de Celego en `68`.
5. Transferir dump al `240`.
6. Levantar stack o servicio `db` en `240`.
7. Restaurar dump en la base del `240`.
8. Instalar y habilitar `celego-compose.service`.
9. Levantar Celego completo en `240`.
10. Validar acceso HTTP y salud de contenedores.

## Validaciones de salida

El trabajo se considera correcto si se cumplen todas:

- `systemctl is-enabled celego-compose.service` devuelve `enabled` en `240`
- `systemctl is-active celego-compose.service` devuelve `active` en `240`
- `docker ps` en `240` muestra `celego-app` y `celego-db`
- `celego-db` queda `healthy`
- `http://10.0.0.240:3800` responde
- La app abre y autentica contra la base restaurada
- La ruta `/home/server/home/apps/celego/backups` existe en `240`

## Riesgos y mitigaciones

### Docker ausente o distinto en `240`

Riesgo:
El destino todavia no confirma Docker funcional.

Mitigacion:
Inspeccionar primero y, si falta, instalar Docker via Snap para mantener simetria con el origen.

### Puerto `3800` ocupado en `240`

Riesgo:
Otro servicio podria estar usando el mismo puerto.

Mitigacion:
Validarlo antes de levantar Celego. Si estuviera ocupado, detener el servicio en conflicto o decidir un puerto alterno antes de publicar la app.

### Datos inconsistentes por dump viejo

Riesgo:
Usar un backup viejo dejaria el `240` desactualizado.

Mitigacion:
Generar un dump nuevo justo antes de restaurar.

### Dependencias ajenas copiadas por accidente

Riesgo:
Arrastrar `notionlocal_postgres` o configuracion que no pertenece a Celego.

Mitigacion:
Limitar la clonacion al proyecto Celego y a su propia base, no al estado global completo de Docker del `68`.

## Testing operativo

Pruebas a ejecutar al final:

- `sudo /snap/bin/docker ps`
- `sudo /snap/bin/docker logs --tail=200 celego-app`
- `sudo /snap/bin/docker logs --tail=200 celego-db`
- `systemctl status celego-compose.service --no-pager`
- `Invoke-WebRequest http://10.0.0.240:3800` desde la red local

## Resultado esperado

El `10.0.0.240` queda como clon funcional de Celego a nivel de aplicacion y datos, manteniendo su propia IP, sin depender del `68` para operar y sin copiar servicios externos que no formen parte de Celego.
