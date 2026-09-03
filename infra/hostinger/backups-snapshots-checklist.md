# Checklist de backups, snapshots y restauracion

## Alcance

El VPS Relay solo conserva metadata tecnica y blobs cifrados temporales. Aun
asi, se requiere backup operativo para recuperar configuracion, certificados,
logs y metadata no vencida.

## Politica tecnica sugerida

| Elemento | Retencion sugerida | Nota |
| --- | --- | --- |
| Snapshot pre-despliegue | 7 a 14 dias | Rollback rapido |
| Backup VPS automatico | Segun plan Hostinger | Confirmar frecuencia disponible |
| Volumen `relay_metadata` | 24 a 72 horas | No conservar mas que la retencion relay |
| Volumen `caddy_data` | Mientras exista dominio | Contiene certificados ACME |
| Logs Caddy/relay | 30 a 90 dias sin PII | Ajustar a politica aprobada |

## Checklist antes de produccion

| Paso | Estado |
| --- | --- |
| Activar backups disponibles en Hostinger | Pendiente |
| Crear snapshot antes del primer despliegue | Pendiente |
| Documentar nombre/fecha del snapshot base | Pendiente |
| Probar restauracion en ventana controlada | Pendiente |
| Confirmar que backups no contienen PII legible | Pendiente |
| Confirmar quien puede restaurar snapshots | Pendiente |
| Definir caducidad de snapshots manuales | Pendiente |

## Prueba trimestral de restauracion

1. Crear snapshot actual.
2. Restaurar en VPS temporal o ventana aprobada.
3. Levantar stack relay.
4. Ejecutar `curl https://<dominio>/health`.
5. Verificar que metadata se lee y no contiene PII.
6. Documentar resultado y eliminar entorno temporal.

## Rollback rapido

```bash
docker compose -f infra/hostinger/docker-compose.relay.yml down
git checkout <tag-o-commit-estable>
docker compose -f infra/hostinger/docker-compose.relay.yml up -d --build
docker compose -f infra/hostinger/docker-compose.relay.yml ps
```

