# Reglas de Codex para Celego

## Docker obligatorio tras cambios

Siempre que se realicen cambios en el proyecto (codigo, configuracion o dependencias), se debe actualizar el entorno Docker antes de dar por finalizada la tarea.

Pasos obligatorios:

1. `docker compose build`
2. `docker compose up -d --force-recreate`
3. Verificar estado con `docker compose ps`

Si algun servicio falla, revisar con `docker compose logs --tail=200`.

## Data-view routing

Use `.agents/skills/celego-data-views/SKILL.md` only for Celego Next.js web data-view requests under `app/**` or `components/**`; it does not apply to `mobile/**`.
