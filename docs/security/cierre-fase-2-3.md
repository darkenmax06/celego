# Cierre de Fase 2 y Fase 3 - Backend + app movil MVP

## Estado

Fase 2 y Fase 3 quedan cerradas como base funcional en repositorio. El alcance
incluye backend, contratos, persistencia, app movil Expo/prebuild y pruebas
unitarias. No incluye aprobacion BPD/legal, MDM real, dispositivos corporativos
enrolados ni certificado mTLS por hardware.

## Fase 2 - Backend y sincronizacion

Entregables completados:

- Usuarios/roles y mensajeros usando el modelo existente.
- Dispositivos moviles con estado `PENDING`, `ACTIVE`, `LOST`, `REVOKED`.
- Entregas/rutas y paquetes offline por dispositivo.
- Relay de archivos cifrados en `apps/relay`.
- Recepcion de manifiestos cifrados en `/api/mobile/evidencias/cifradas`.
- Cola backend `MobileSyncJob` y bitacora `MobileSyncAttempt`.
- Incidencias moviles `MobileIncident`.
- Estado de sincronizacion `/api/mobile/sync/status`.
- Procesamiento interno `/api/internal/mobile/process-secure-evidence`.
- Script `npm run mobile:process-evidence`.
- Retencion tecnica de paquetes/evidencias vencidas.
- Tests de contratos, autorizacion, ruta offline, crypto y sync.

## Fase 3 - App movil MVP

Entregables completados:

- Login individual.
- Registro/latido de dispositivo.
- Descarga de paquete offline.
- Operacion offline con persistencia en `AsyncStorage`.
- Seleccion de entrega activa.
- Verificacion local de cedula con `salt + hash + last4`.
- Captura de foto de acuse y cedula desde camara.
- GPS foreground con `expo-location`.
- Cifrado local AES-256-GCM.
- Envoltorio RSA-OAEP-SHA256 de llave temporal.
- Hash SHA-256 del blob cifrado.
- Cola local de cargas y reintentos manuales.
- Subida de blob cifrado al Relay.
- Registro de manifiesto en core.
- Reporte de incidencias offline.
- Bloqueo de screenshots con `expo-screen-capture`.

## Pendientes que pertenecen a Fase 4/Fase 5

- Modo kiosco y politicas MDM.
- Android Keystore con hardware-backed keys.
- Root/jailbreak detection fuerte.
- Certificate pinning real.
- mTLS por dispositivo.
- OCR local para prevenir foto accidental de tarjeta.
- WorkManager Android para sincronizacion background garantizada.
- Pruebas en dispositivos fisicos corporativos.
- Pentest movil y API.

## Criterio de aceptacion interno

La base se considera lista para pruebas internas si:

- `npm run test` pasa.
- `npm run mobile:typecheck` pasa.
- `npm run build` pasa.
- `docker compose build` pasa.
- `docker compose up -d --force-recreate` levanta app y DB.
- `docker compose ps` muestra `celego-db` healthy y `celego-app` up.
- La app no usa `/api/mobile/rutas/pruebas` para el flujo seguro.
