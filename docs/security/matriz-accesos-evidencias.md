# Matriz de accesos de evidencias

## Reglas generales

- El acceso a evidencias legibles es excepcional y auditable.
- El relay nunca muestra ni almacena evidencia legible.
- La app movil solo puede operar rutas asignadas al mensajero/dispositivo.
- El servidor fisico conserva la capacidad de descifrado.
- Los accesos administrativos deben usar MFA cuando el proveedor lo permita.

## Accesos por rol humano

| Rol | App movil | Portal core | Relay VPS | Evidencia legible | Acciones permitidas |
| --- | --- | --- | --- | --- | --- |
| Mensajero | Si | No | Solo API publica | No persistente | Capturar, cifrar, sincronizar |
| Supervisor | No directo | Limitado | No | Solo si politica aprobada | Reasignar ruta, reportar incidente |
| Operador | No | Si | No | Segun BPD/legal | Gestionar rutas y dispositivos |
| Administrador | No | Si | No directo | Segun BPD/legal | Configuracion y auditoria |
| TI | No | Soporte tecnico | Si, sin PII | No | Infra, backups, logs tecnicos |
| Seguridad | No | Auditoria | Logs tecnicos | Segun aprobacion | Revisar controles e incidentes |
| BPD/legal | No | Reportes acordados | No | Segun contrato | Aprobar y auditar |

## Accesos por servicio

| Servicio | Puede leer core DB | Puede leer relay metadata | Puede descifrar evidencia | Puede recibir PII |
| --- | --- | --- | --- | --- |
| App movil | No | No | Solo evidencia local antes de limpiar | Minimo operacional |
| Relay DMZ | No | Si | No | No |
| Core API | Si | No directo | No con llave privada | Si, segun rol |
| Worker servidor fisico | Si | Si, por descarga controlada | Si | Si |
| Caddy | No | No | No | No |
| Backups VPS relay | No core | Si metadata tecnica | No | No |

## Controles de acceso obligatorios

- SSH con llave publica, sin password root.
- Firewall Hostinger y UFW alineados.
- Tokens de app con expiracion y revocacion.
- Dispositivo en estado `ACTIVE` para sincronizar.
- Dispositivo `LOST` o `REVOKED` bloqueado inmediatamente.
- Logs de acceso y cambios administrativos.
- Separacion de secretos: `.env` real fuera del repo.

## Revisiones periodicas

| Frecuencia | Revision |
| --- | --- |
| Semanal | Dispositivos activos, perdidos y revocados |
| Mensual | Usuarios con rol administrativo |
| Mensual | Reglas firewall y accesos SSH aprobados |
| Trimestral | Prueba de restauracion y rollback |
| Trimestral | Prueba de incidente de dispositivo |
| Semestral | Vigencia de retencion y aprobaciones BPD |

