# Samba share for `/home/server/home/server`

Fecha: 2026-07-22
Servidor destino: `10.0.0.240`

## Objetivo

Exponer la carpeta `/home/server/home/server` en la red local para equipos Windows mediante Samba, usando autenticacion por usuario y contraseña, sin acceso invitado.

## Estado actual validado

- La carpeta existe en el servidor:
  - `/home/server/home/server`
- Propietario actual:
  - `server:server`
- Permisos observados:
  - `/home/server` -> `drwxr-x---`
  - `/home/server/home` -> `drwxr-xr-x`
  - `/home/server/home/server` -> `drwxrwxr-x`
- Samba no esta instalado o no esta configurado:
  - `smbd` no esta activo
  - `testparm` no esta disponible
  - el puerto `445` no esta escuchando

## Decision aprobada

Se usara un usuario dedicado de comparticion, separado del usuario administrativo `server`.

## Enfoque recomendado

Configurar Samba en `10.0.0.240` con un share autenticado que apunte a `/home/server/home/server`, usando un usuario exclusivo para acceso desde Windows. La carpeta seguira viviendo en el filesystem local del servidor y no se movera.

## Diseno tecnico

### 1. Instalacion base

Instalar en Ubuntu:

- `samba`

Esto debe dejar disponibles:

- `smbd`
- `testparm`
- archivo de configuracion `/etc/samba/smb.conf`

### 2. Usuario dedicado

Crear un usuario local exclusivo para el share, por ejemplo:

- `celego-share`

Ese usuario no se usara para administracion del servidor. Su funcion sera autenticar acceso SMB.

Definir:

- password de sistema si hace falta para la cuenta
- password Samba con `smbpasswd`

La cuenta puede crearse sin shell interactivo si conviene, pero debe quedar utilizable por Samba.

### 3. Share Samba

Crear una seccion dedicada en `/etc/samba/smb.conf`, con un nombre simple para Windows. Recomendacion:

- nombre del share: `server`

Ruta:

- `path = /home/server/home/server`

Comportamiento:

- `browseable = yes`
- `read only = no`
- `guest ok = no`
- `valid users = celego-share`
- escritura solo para el usuario autorizado

### 4. Permisos filesystem

La carpeta compartida debe quedar accesible por el usuario Samba elegido.

Como el directorio real esta dentro del home de `server`, hay que garantizar que el usuario del share pueda atravesar la ruta sin abrir el home mas de la cuenta. La opcion preferida es:

- mantener la carpeta compartida en `/home/server/home/server`
- crear un grupo compartido si hace falta
- dar permisos de traversal y escritura solo donde corresponda

Si la estructura actual complica demasiado los permisos de paso por `/home/server`, la alternativa aceptable es usar ACLs sobre la ruta o ajustar permisos del home de forma minima y controlada. No se recomienda exponer el home completo.

### 5. Servicio y red

Al final de la configuracion:

- habilitar y arrancar `smbd`
- validar que `445/tcp` quede escuchando

### 6. Acceso desde Windows

El acceso esperado quedara asi:

```text
\\10.0.0.240\server
```

Con credenciales:

- usuario: el usuario Samba dedicado creado para el share
- password: la password definida durante la configuracion

## Flujo de implementacion

1. Instalar Samba en `10.0.0.240`
2. Crear el usuario dedicado del share
3. Configurar password Samba
4. Ajustar permisos/ACLs de la ruta `/home/server/home/server`
5. Agregar el bloque del share a `smb.conf`
6. Validar sintaxis con `testparm`
7. Reiniciar o recargar `smbd`
8. Confirmar `445/tcp` escuchando
9. Probar acceso autenticado desde Windows

## Validaciones de salida

La configuracion se considera correcta si se cumplen todas:

- `smbd` queda `active`
- `testparm` valida sin errores
- `445/tcp` escucha en `10.0.0.240`
- desde Windows se puede abrir `\\10.0.0.240\server`
- el acceso requiere usuario y contraseña
- el usuario autenticado puede leer y escribir dentro de `/home/server/home/server`
- no existe acceso invitado

## Riesgos y mitigaciones

### Permisos por estar dentro del home de `server`

Riesgo:
El usuario Samba puede no poder atravesar `/home/server`.

Mitigacion:
Aplicar permisos minimos o ACLs solo en la ruta necesaria para no abrir el home completo.

### Choque con seguridad local

Riesgo:
Una configuracion demasiado amplia podria exponer mas de la cuenta.

Mitigacion:
Usar `guest ok = no`, `valid users`, y restringir permisos al usuario dedicado.

### Credenciales mezcladas con administracion

Riesgo:
Usar `server` como cuenta SMB mezclaría acceso administrativo con comparticion.

Mitigacion:
Usar un usuario exclusivo para Samba, tal como fue aprobado.

## Resultado esperado

El `10.0.0.240` queda compartiendo `/home/server/home/server` hacia Windows mediante Samba, con autenticacion por usuario y contraseña y sin acceso anonimo.
