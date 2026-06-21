# Cierre de Fase 5 y Fase 6 - Seguridad + piloto controlado

## Estado

Fase 5 y Fase 6 quedan cerradas como entregables internos de repositorio para
seguridad, simulacion y preparacion de piloto. No se declara completado un
pentest externo, MDM real ni piloto productivo con mensajeros reales.

## Fase 5 - Pruebas de seguridad

Entregables completados:

- Tests de autorizacion por tarjeta asignada.
- Tests API de evidencia cifrada con `cardId` y `routeItemId`.
- Rechazo de tarjetas cerradas.
- Rechazo de dispositivos no activos.
- Rechazo de acceso cruzado entre mensajeros.
- Rechazo de PII accidental en relay e incidencias.
- Rechazo de hashes incorrectos en relay.
- Rechazo de evidencia duplicada con metadata inconsistente.
- Checklist de pentest movil/API.

## Fase 6 - Piloto controlado

Entregables completados:

- API admin `/api/admin/mobile-pilot`.
- Pantalla admin `/piloto-movil`.
- Metricas de readiness, dispositivos, asignaciones, evidencias, sync e incidencias.
- Respuesta sanitizada sin TC, cedula completa, direccion, blobs ni llaves.
- Script `npm run pilot:seed-mobile`.
- Script `npm run pilot:clear-mobile`.
- Runbook diario del piloto.
- Documentacion de criterios de entrada/salida.

## Validacion requerida

Antes de usar el piloto interno:

```bash
npm run test
npm run mobile:typecheck
npm run lint
npm run build
docker compose build
docker compose up -d --force-recreate
docker compose ps
```

## Pendientes externos

- Pentest formal por tercero.
- Dispositivos fisicos corporativos.
- MDM real, modo kiosco y borrado remoto.
- Certificate pinning real.
- mTLS/certificados finales por dispositivo.
- Pais final del VPS aprobado por BPD/legal.
- Retencion contractual final.
- Piloto productivo con mensajeros reales y acta de operaciones.

## Decision de avance

El repo queda listo para pruebas internas y simulacion controlada. El paso a
campo debe aprobarse con evidencia de Fase 5, checklist diario de Fase 6,
confirmacion de TI/operaciones y aprobaciones externas pendientes.
