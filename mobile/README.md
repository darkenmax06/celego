# Celego Mobile (Mensajeros)

Aplicacion Expo para mensajeros:

- Login contra `POST /api/mobile/auth/login`
- Consulta de rutas asignadas en `GET /api/mobile/rutas`
- Captura de foto con camara y subida de evidencia en `POST /api/mobile/rutas/pruebas`

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
- `Email` / `Password`: usuario activo en CELEGO.
- `Messenger ID`: obligatorio cuando el usuario tiene rol `MENSAJERO`.

Notas:

- Android emulador: usa `http://10.0.2.2:3000` para apuntar al localhost de la PC.
- Dispositivo fisico: usa la IP LAN de tu computadora, por ejemplo `http://192.168.1.20:3000`.

## Evidencias

Las fotos se guardan en:

- Disco: `public/uploads/proofs/YYYY/MM/...`
- URL publica: `/<ruta-archivo>`
- Metadata de tarjeta: `card.metadata.route.proofs[]`
