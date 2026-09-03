# Hostinger VPS Relay - Fase 1

Este directorio contiene el paquete operativo para desplegar el Relay DMZ de
Celego en un VPS Hostinger.

## Archivos

- `docker-compose.relay.yml`: stack Docker del relay y Caddy.
- `Dockerfile.relay`: imagen del servicio relay.
- `Caddyfile`: HTTPS automatico y reverse proxy.
- `.env.example`: plantilla de variables sin secretos reales.
- `deployment-runbook.md`: pasos de despliegue, validacion y rollback.
- `firewall-checklist.md`: reglas Hostinger y UFW.
- `backups-snapshots-checklist.md`: backups, snapshots y restauracion.

## Frontera DMZ

El VPS no debe tener:

- Conexion a la base de datos core.
- Llave privada maestra.
- Archivos `.env` del portal.
- Fotos legibles.
- Nombre, cedula completa, direccion, telefono o tarjeta en metadata.

## Exposicion esperada

- Publico: `80/tcp` y `443/tcp` hacia Caddy.
- Administracion: `22/tcp` solo desde IP administrativa aprobada.
- Interno Docker: relay en `3900/tcp`, sin publicar al host.

