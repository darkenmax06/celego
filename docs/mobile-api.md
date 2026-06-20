# Mobile API (Mensajeros)

## 1) Login

`POST /api/mobile/auth/login`

Body JSON:

```json
{
  "email": "mensajero@celego.local",
  "password": "Secreto123",
  "messengerId": "cuid-del-mensajero"
}
```

Respuesta:

```json
{
  "token": "BearerToken",
  "user": {
    "id": "cuid",
    "name": "Nombre",
    "email": "mensajero@celego.local",
    "role": "MENSAJERO",
    "messengerId": "cuid-del-mensajero"
  },
  "expiresInSeconds": 1296000
}
```

## 2) Perfil token

`GET /api/mobile/me`

Header:

`Authorization: Bearer <token>`

## 3) Rutas del mensajero

`GET /api/mobile/rutas?date=YYYY-MM-DD`

Header:

`Authorization: Bearer <token>`

Para `MENSAJERO`, el `messengerId` viene del token.
Para `ADMIN/OPERADOR`, se puede usar query opcional `messengerId`.

## 4) Subir evidencia fotografica legacy

`POST /api/mobile/rutas/pruebas`

> Estado: legacy. Este endpoint guarda imagenes legibles en `public/uploads` y
> queda solo para compatibilidad del MVP actual. El flujo nuevo debe usar
> evidencia cifrada antes de salir del dispositivo.

Header:

`Authorization: Bearer <token>`

Body `multipart/form-data`:

- `routeItemId` (string, requerido)
- `file` (image/jpeg|png|webp|heic|heif, requerido, max 10MB)
- `note` (string, opcional)
- `markAs` (`EN_RUTA` | `ACUSE_RECIBIDO` | `DEVUELTA_TIENDA`, opcional)

Las fotos se guardan en `public/uploads/proofs/YYYY/MM`.

## 5) Registrar dispositivo movil

`POST /api/mobile/devices`

Header:

`Authorization: Bearer <token>`

Body JSON:

```json
{
  "deviceId": "DEV-228",
  "label": "Celego Android 228",
  "platform": "ANDROID",
  "publicKey": "-----BEGIN PUBLIC KEY-----...",
  "certificateFingerprint": "sha256:..."
}
```

Los mensajeros registran dispositivos en estado `PENDING`. Un `ADMIN` u
`OPERADOR` puede registrar/actualizar un dispositivo con estado `ACTIVE`.

## 6) Registrar manifiesto de evidencia cifrada

`POST /api/mobile/evidencias/cifradas`

Header:

`Authorization: Bearer <token>`

Body JSON: manifiesto tecnico sin PII. Debe incluir `deliveryId`, `deviceId`,
`objectId`, `routeItemId`, tipo de evidencia, metadatos de cifrado AES-256-GCM,
hash SHA-256 del blob cifrado y expiracion. No se aceptan nombres, cedulas,
telefonos, direcciones, tarjetas ni fotos legibles.

## 7) Crear paquete offline de ruta

`POST /api/mobile/route-packages`

Header:

`Authorization: Bearer <token>`

Roles: `ADMIN` u `OPERADOR`.

Body JSON:

```json
{
  "routeId": "cuid-ruta",
  "deviceId": "DEV-228",
  "expiresAt": "2026-06-21T23:59:59.999Z"
}
```

El paquete se genera para un dispositivo `ACTIVE` asignado al mismo mensajero de
la ruta. Incluye nombre/direccion operacional minima, pero no incluye TC ni
cedula completa. La cedula se valida offline con `salt + hash + last4`.

## 8) Descargar paquete offline de ruta

`POST /api/mobile/route-packages/download`

Header:

`Authorization: Bearer <token>`

Body JSON:

```json
{
  "packageId": "PKG-ABC123",
  "deviceId": "DEV-228"
}
```

El backend valida usuario, dispositivo, mensajero, estado y expiracion antes de
entregar el manifiesto del paquete.

