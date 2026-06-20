# Cierre de Fase 0 - Evidencias seguras

## Alcance cerrado

La Fase 0 define el marco de seguridad para capturar, transportar, conservar y
auditar evidencias de entrega sin exponer cedulas, fotos legibles o datos de
tarjeta en el VPS Relay.

Este cierre cubre:

- Mapa de datos por componente.
- Clasificacion de datos.
- Matriz de riesgos y controles.
- Matriz de acceso por rol.
- Gobierno y responsables.
- Politica de cedulas y evidencias.
- Retencion tecnica.
- Procedimientos de incidente.
- Checklist de aprobacion BPD/legal.

## Criterios de aceptacion internos

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| Relay no acepta PII | Cerrado | Contratos `packages/contracts` y pruebas Vitest |
| Relay no recibe llave privada | Cerrado | Arquitectura DMZ y compose Fase 1 |
| App movil cifra antes de enviar | Definido | Politica y helpers `packages/crypto` |
| Core registra manifiesto cifrado | Cerrado base | Endpoint `/api/mobile/evidencias/cifradas` |
| Endpoint legacy queda marcado | Cerrado | `docs/mobile-api.md` |
| Retencion relay 24-72h | Cerrado tecnico | Politica de retencion |
| Incidente de dispositivo documentado | Cerrado | Runbooks de incidente |
| Aprobacion BPD/legal | Pendiente externo | Checklist formal |

## Pendientes externos

Estos puntos no se inventan en codigo ni documentacion interna:

- Retencion contractual final en servidor fisico y backups.
- Pais o region permitida del VPS.
- Tiempo contractual de notificacion ante incidente.
- Usuarios BPD/Celego autorizados para consultar cedulas.
- Informe formal de aprobacion y fecha de inicio productivo.
- MDM definitivo y politicas Android Enterprise.

## Decisiones tecnicas aprobadas para Fase 1

- VPS Relay en Hostinger como DMZ.
- Caddy como reverse proxy estandar por HTTPS automatico.
- Exposicion publica solo por puertos `80` y `443`.
- SSH restringido por IP administrativa aprobada.
- Relay interno Docker sin puerto publico directo.
- Metadata relay sin nombre, cedula completa, direccion, telefono ni tarjeta.
- Retencion relay maxima tecnica sugerida: 72 horas.

## Evidencia minima antes de pasar a produccion

Antes de operar con evidencias reales, TI debe anexar:

- Captura de reglas firewall Hostinger.
- Salida de `docker compose ps` en el VPS.
- Resultado de `curl https://<dominio>/health`.
- Captura o export de backup/snapshot activo.
- Registro de prueba de restauracion.
- Acta de aprobacion BPD/legal.

