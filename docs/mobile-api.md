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

## 4) Subir evidencia fotografica

`POST /api/mobile/rutas/pruebas`

Header:

`Authorization: Bearer <token>`

Body `multipart/form-data`:

- `routeItemId` (string, requerido)
- `file` (image/jpeg|png|webp|heic|heif, requerido, max 10MB)
- `note` (string, opcional)
- `markAs` (`EN_RUTA` | `ACUSE_RECIBIDO` | `DEVUELTA_TIENDA`, opcional)

Las fotos se guardan en `public/uploads/proofs/YYYY/MM`.

