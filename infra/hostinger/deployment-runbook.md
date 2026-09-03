# Runbook de despliegue Hostinger VPS Relay

## Supuestos

- VPS Ubuntu 24.04 o plantilla Docker equivalente.
- Dominio real apuntando al VPS con registro `A` y, si aplica, `AAAA`.
- Usuario sudo sin uso de root por password.
- SSH por llave publica.
- Firewall Hostinger y UFW configurados.
- Repo Celego clonado en `/opt/celego`.

## Preparacion inicial

```bash
sudo apt update
sudo apt -y upgrade
sudo apt -y install git curl ca-certificates ufw fail2ban
```

Si el VPS no usa plantilla Docker de Hostinger:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker version
docker compose version
```

## Usuario operativo

```bash
sudo adduser celego
sudo usermod -aG sudo celego
sudo usermod -aG docker celego
sudo mkdir -p /home/celego/.ssh
sudo cp ~/.ssh/authorized_keys /home/celego/.ssh/authorized_keys
sudo chown -R celego:celego /home/celego/.ssh
sudo chmod 700 /home/celego/.ssh
sudo chmod 600 /home/celego/.ssh/authorized_keys
```

Luego validar acceso como `celego` antes de deshabilitar root por password.

## Hardening SSH

Editar `/etc/ssh/sshd_config`:

```text
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
```

Aplicar:

```bash
sudo systemctl reload ssh
sudo systemctl status fail2ban --no-pager
```

## Clonar y configurar

```bash
sudo mkdir -p /opt/celego
sudo chown celego:celego /opt/celego
cd /opt/celego
git clone <REPO_URL> .
git checkout codex/evidencias-seguras-roadmap
cp infra/hostinger/.env.example infra/hostinger/.env
nano infra/hostinger/.env
```

Variables minimas:

```text
RELAY_DOMAIN=relay.celego.example
ACME_EMAIL=ti@celego.example
RELAY_PORT=3900
RELAY_METADATA_FILE=/data/metadata.json
```

## Despliegue

```bash
docker compose --env-file infra/hostinger/.env -f infra/hostinger/docker-compose.relay.yml build
docker compose --env-file infra/hostinger/.env -f infra/hostinger/docker-compose.relay.yml up -d --force-recreate
docker compose --env-file infra/hostinger/.env -f infra/hostinger/docker-compose.relay.yml ps
```

## Validacion

```bash
curl -sS https://relay.celego.example/health
docker logs --tail=100 celego-relay
docker logs --tail=100 celego-relay-caddy
```

Respuesta esperada:

```json
{"ok":true,"service":"celego-relay","status":"healthy"}
```

## Actualizacion segura

```bash
cd /opt/celego
git fetch origin
git checkout codex/evidencias-seguras-roadmap
git pull --ff-only
docker compose --env-file infra/hostinger/.env -f infra/hostinger/docker-compose.relay.yml build
docker compose --env-file infra/hostinger/.env -f infra/hostinger/docker-compose.relay.yml up -d --force-recreate
docker compose --env-file infra/hostinger/.env -f infra/hostinger/docker-compose.relay.yml ps
```

## Rollback

```bash
cd /opt/celego
git checkout <commit-estable>
docker compose --env-file infra/hostinger/.env -f infra/hostinger/docker-compose.relay.yml up -d --build --force-recreate
curl -sS https://relay.celego.example/health
```

Si el VPS falla por completo, restaurar snapshot Hostinger y validar DNS,
firewall, `docker compose ps` y healthcheck.

## Monitoreo minimo

- Revisar `docker compose ps` diariamente durante piloto.
- Revisar logs Caddy por errores `4xx/5xx`.
- Alertar si `/health` no responde.
- Alertar si el volumen de metadata crece fuera de lo esperado.
- Revisar que no aparezcan nombres, cedulas, direcciones, telefonos o tarjetas
  en metadata.

## Cierre post-despliegue

| Evidencia | Estado |
| --- | --- |
| DNS apunta al VPS | Pendiente |
| HTTPS valido en Caddy | Pendiente |
| Healthcheck responde `200` | Pendiente |
| Firewall Hostinger validado | Pendiente |
| UFW validado | Pendiente |
| Snapshot pre-produccion creado | Pendiente |
| Backup activo confirmado | Pendiente |
| Prueba anti-PII ejecutada | Pendiente |
| Aprobacion BPD/legal anexada | Pendiente |

