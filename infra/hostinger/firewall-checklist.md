# Checklist firewall Hostinger + UFW

## Politica objetivo

- Denegar todo trafico entrante no autorizado.
- Permitir `80/tcp` y `443/tcp` publicos solo para Caddy.
- Permitir `22/tcp` solo desde IP administrativa aprobada.
- No publicar `3900/tcp` del relay en el host.
- Mantener reglas Hostinger y UFW sincronizadas.

## Checklist Hostinger

| Paso | Estado |
| --- | --- |
| Crear grupo firewall dedicado `celego-relay-prod` | Pendiente |
| Asociar solo el VPS relay al grupo | Pendiente |
| Regla inbound `80/tcp` desde `0.0.0.0/0` y `::/0` | Pendiente |
| Regla inbound `443/tcp` desde `0.0.0.0/0` y `::/0` | Pendiente |
| Regla inbound `22/tcp` solo desde IP administrativa | Pendiente |
| Eliminar regla SSH abierta a internet | Pendiente |
| Confirmar politica deny para puertos no declarados | Pendiente |
| Documentar captura de pantalla de reglas aprobadas | Pendiente |

## Checklist UFW en Ubuntu

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <IP_ADMIN>/32 to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

## Validacion

```bash
curl -I http://relay.celego.example/health
curl -I https://relay.celego.example/health
docker compose -f infra/hostinger/docker-compose.relay.yml ps
```

## Evidencia requerida

- Captura o export de firewall Hostinger.
- Salida de `sudo ufw status verbose`.
- Salida de `docker compose ps`.
- Resultado `200` del healthcheck HTTPS.

