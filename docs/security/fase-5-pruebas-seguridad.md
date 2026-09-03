# Fase 5 - Pruebas de seguridad

## Objetivo

Validar que la arquitectura de evidencias seguras resiste los escenarios
operativos mas probables antes de iniciar piloto de campo. Esta fase no
reemplaza un pentest externo; deja una bateria interna repetible para detectar
regresiones.

## Alcance en repo

- Pruebas unitarias de autorizacion movil.
- Pruebas API contra asignaciones, evidencias cifradas, incidencias y relay.
- Validacion de payloads sin PII para relay y core.
- Rechazo de tarjetas cerradas o ajenas.
- Rechazo de dispositivos `PENDING`, `LOST` o `REVOKED`.
- Rechazo de hashes de blob incorrectos en relay.
- Rechazo de identificadores de evidencia reutilizados con metadata distinta.

## Escenarios obligatorios

| Escenario | Resultado esperado | Evidencia |
| --- | --- | --- |
| Mensajero intenta operar tarjeta de otro | `403` y sin escritura | `tests/mobile/mobile-security-api.test.ts` |
| Tarjeta cerrada recibe evidencia | `403 card_not_open_for_mobile` | `tests/mobile/mobile-security-api.test.ts` |
| `routeItemId` no corresponde al `cardId` | `400` y sin transaccion | `tests/mobile/mobile-security-api.test.ts` |
| Dispositivo revocado reporta incidencia | `403 Dispositivo no activo` | `tests/mobile/mobile-security-api.test.ts` |
| Relay recibe nombre, cedula, telefono o tarjeta | `400 relay_payload_contains_pii` | `tests/relay/relay-api.test.ts` |
| Relay recibe blob con hash distinto | `400 encrypted_blob_sha256_mismatch` | `tests/relay/relay-api.test.ts` |
| Admin consulta piloto | Resumen sin TC, cedula, direccion, blob ni llaves | `tests/mobile/mobile-pilot-api.test.ts` |

## Comandos de cierre

```bash
npm run test
npm run mobile:typecheck
npm run lint
npm run build
docker compose build
docker compose up -d --force-recreate
docker compose ps
```

Si un servicio falla:

```bash
docker compose logs --tail=200
```

## Pendientes externos

- Pentest formal por tercero.
- Pruebas con dispositivos fisicos corporativos.
- Pruebas de MDM, modo kiosco y borrado remoto.
- Certificate pinning real y mTLS por dispositivo.
- Validacion formal con BPD/legal.
