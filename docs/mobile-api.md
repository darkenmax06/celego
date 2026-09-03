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

## 3) Asignaciones automaticas del mensajero

`GET /api/mobile/assignments?deviceId=DEV-228&page=1&pageSize=100`

Header:

`Authorization: Bearer <token>`

Para `MENSAJERO`, el `messengerId` viene del token y debe coincidir con el
dispositivo activo. Devuelve solo tarjetas abiertas asignadas al mensajero por
`Card.currentMessengerId`.

Estados incluidos:

- `DESPACHADA`
- `ENVIADA_INTERIOR`
- `EN_RUTA`

Estados excluidos:

- `ACUSE_RECIBIDO`
- `DEVUELTA_TIENDA`
- `ENTREGA_DIGITAL`
- `ENTREGADA`
- `RETORNADA`

La respuesta incluye datos operativos minimos: `cardId`, `routeId?`,
`routeItemId?`, nombre, direccion, provincia, zona, referencia, estado y token
de verificacion de cedula (`salt + hash + last4`). No expone TC ni cedula
completa.

## 4) Rutas del mensajero (legacy)

`GET /api/mobile/rutas?date=YYYY-MM-DD`

Header:

`Authorization: Bearer <token>`

Para `MENSAJERO`, el `messengerId` viene del token.
Para `ADMIN/OPERADOR`, se puede usar query opcional `messengerId`.

## 5) Subir evidencia fotografica legacy

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

## 6) Registrar dispositivo movil

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

## 7) Registrar manifiesto de evidencia cifrada

`POST /api/mobile/evidencias/cifradas`

Header:

`Authorization: Bearer <token>`

Body JSON: manifiesto tecnico sin PII. Debe incluir `deliveryId`, `deviceId`,
`objectId`, `cardId`, tipo de evidencia, metadatos de cifrado AES-256-GCM,
hash SHA-256 del blob cifrado y expiracion. No se aceptan nombres, cedulas,
telefonos, direcciones, tarjetas ni fotos legibles.

`routeItemId` es opcional y se mantiene para compatibilidad con rutas legacy.

## 8) Crear paquete offline de ruta (legacy)

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

## 9) Descargar paquete offline de ruta (legacy)

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

## 10) Estado de sincronizacion movil

`POST /api/mobile/sync/status`

Header:

`Authorization: Bearer <token>`

Body JSON:

```json
{
  "deviceId": "DEV-228",
  "evidenceObjectIds": ["OBJ-ACUSE-001"],
  "packageIds": ["PKG-ABC123"],
  "incidentIds": ["INC-001"],
  "clientQueueDepth": 2,
  "lastClientSyncAt": "2026-06-20T10:00:00.000Z"
}
```

El endpoint valida que el dispositivo exista, este `ACTIVE` y corresponda al
mensajero autenticado. Devuelve estado de evidencias, paquetes, incidencias y
hora del servidor.

## 11) Reportar incidencia movil

`POST /api/mobile/incidents`

Header:

`Authorization: Bearer <token>`

Body JSON:

```json
{
  "incidentId": "INC-LOCAL-001",
  "deviceId": "DEV-228",
  "cardId": "cuid-tarjeta",
  "routeItemId": "cuid-route-item",
  "type": "CUSTOMER_ABSENT",
  "severity": "MEDIUM",
  "title": "Cliente ausente",
  "description": "No hubo respuesta en la direccion indicada",
  "reportedAt": "2026-06-20T10:00:00.000Z"
}
```

No debe incluir cedula completa, tarjeta, telefono ni fotos. Si la incidencia
esta asociada a `cardId` o `routeItemId`, el backend valida usuario +
dispositivo + mensajero asignado + estado abierto.

## 12) Procesamiento interno de evidencias cifradas

`POST /api/internal/mobile/process-secure-evidence`

Uso esperado: servidor fisico Celego o job interno.

Opciones de autenticacion:

- Header `x-celego-internal-secret` cuando `INTERNAL_SYNC_SECRET` este definido.
- Token mobile de `ADMIN` u `OPERADOR` en ambientes de prueba.

Tambien se puede ejecutar:

```bash
npm run mobile:process-evidence
```

En esta fase, si `RELAY_REAL_DOWNLOAD` no es `true`, el worker marca el
procesamiento como descifrado local simulado. La integracion real con descarga
de blobs del relay queda preparada para el worker fisico.

## 13) Piloto movil admin

`GET /api/admin/mobile-pilot`

Uso esperado: portal local Celego, solo usuarios `ADMIN`.

Filtros opcionales:

- `from`: fecha inicial.
- `to`: fecha final.
- `messengerId`: mensajero especifico.
- `province`: provincia de trabajo.

Devuelve metricas agregadas de dispositivos, asignaciones abiertas, evidencias,
incidencias, cola de sincronizacion y checklist de salida. La respuesta esta
sanitizada: no retorna TC, cedula completa, direccion del cliente, blobs,
llaves ni fotos.

Comandos de simulacion:

```bash
npm run pilot:seed-mobile
npm run pilot:clear-mobile
```

