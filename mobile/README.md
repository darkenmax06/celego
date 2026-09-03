# Celego Mobile (Mensajeros)

Aplicacion Expo para mensajeros:

- Login contra `POST /api/mobile/auth/login`
- Sincronizacion de tarjetas asignadas en `GET /api/mobile/assignments`
- Captura de evidencia cifrada por tarjeta asignada

## Requisitos

- Node.js 20+
- Expo CLI (`npx expo`)
- Backend CELEGO corriendo y accesible desde el telefono/emulador

## Ejecutar

```bash
cd mobile
npm install
npm start
```

## Generar APK (recomendado)

Desde la carpeta `mobile`:

```bash
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Al terminar, Expo te entrega un link para descargar el archivo `.apk`.

Opcional para instalar directo por USB:

```bash
npx eas-cli build:run --platform android
```

## Datos de conexion

En la pantalla de login:

- `Base URL`: URL de tu backend CELEGO.
- `Relay URL`: URL del relay de evidencias cifradas.
- `Email` / `Password`: usuario activo en CELEGO.
- `Messenger ID`: obligatorio cuando el usuario tiene rol `MENSAJERO`.

Notas:

- Android emulador: usa `http://10.0.2.2:3800` para Core y `http://10.0.2.2:3900` para Relay.
- Expo Go en telefono fisico: usa la IP LAN de tu computadora, por ejemplo `http://192.168.1.20:3800` para Core y `http://192.168.1.20:3900` para Relay.
- En desarrollo, la app intenta detectar automaticamente la IP de Expo/Metro y ofrece el boton `Usar IP de esta PC`.
- Para confirmar conectividad desde el telefono, abre `http://IP-DE-TU-PC:3800/api/health` en el navegador del telefono. Debe responder `{"ok":true,"service":"celego"}`.

## Evidencias

La app usa una cartera offline automatica:

- Al iniciar sesion o sincronizar, descarga tarjetas abiertas asignadas al mensajero.
- No descarga TC ni cedula completa.
- Valida cedula localmente con `salt + hash + last4`.
- Las fotos se cifran antes de salir del telefono y se suben via relay/core.
