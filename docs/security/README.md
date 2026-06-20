# Seguridad de evidencias - indice operativo

## Estado

Este paquete deja la Fase 0 y la Fase 1 listas como entregables internos para
ejecucion por TI, operaciones y seguridad. No reemplaza la aprobacion formal de
BPD/legal ni configura un VPS real.

## Documentos de Fase 0

- `arquitectura-evidencias-seguras.md`: zonas, fronteras y componentes.
- `mapa-de-datos.md`: ubicacion permitida de cada dato.
- `gobierno-datos.md`: responsables, aprobaciones y RACI.
- `matriz-accesos-evidencias.md`: permisos por rol y servicio.
- `matriz-riesgos-evidencias.md`: riesgos, controles y evidencias.
- `politica-cedulas-y-evidencias.md`: reglas de minimizacion y prohibiciones.
- `retencion-evidencias.md`: retencion tecnica y pendientes contractuales.
- `incidente-dispositivo.md`: respuesta rapida ante perdida/robo.
- `procedimiento-incidentes-evidencias.md`: flujo integral de incidente.
- `checklist-bpd-aprobacion.md`: paquete para aprobacion externa.
- `cierre-fase-0.md`: criterio de cierre y decisiones pendientes.
- `cierre-fase-2-3.md`: cierre backend + app movil MVP.

## Entregables de Fase 1

La ejecucion del VPS Relay queda bajo `infra/hostinger/`:

- `docker-compose.relay.yml`: Caddy publico + Relay interno.
- `Dockerfile.relay`: imagen reproducible del relay.
- `Caddyfile`: HTTPS automatico, proxy y headers.
- `.env.example`: variables sin secretos reales.
- `deployment-runbook.md`: despliegue y rollback.
- `firewall-checklist.md`: reglas Hostinger/UFW.
- `backups-snapshots-checklist.md`: backups, snapshots y restauracion.

## Regla de frontera

El relay vive en DMZ. No debe importar `lib/prisma`, no debe conectarse a la
base core, no debe recibir PII y no debe tener la llave privada maestra.

