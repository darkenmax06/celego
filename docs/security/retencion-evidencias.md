# Retencion de evidencias

## Valores tecnicos iniciales

| Ubicacion | Retencion inicial |
| --- | --- |
| App movil | Hasta confirmacion de sincronizacion; maximo 24 horas |
| Relay | Hasta descarga confirmada; maximo tecnico sugerido 72 horas |
| Servidor Celego | Segun contrato BPD y politica aprobada |
| Backups | Segun politica aprobada |
| Logs tecnicos | 6 a 12 meses, sin PII |
| Snapshot VPS relay | Solo ventana operativa aprobada |

## Borrado

- En relay, borrar blob cifrado y metadata vencida.
- En app, borrar evidencia local y cola sincronizada.
- Para evidencia cifrada, destruir la llave o referencia que permite descifrar
  equivale a destruccion criptografica del contenido.

## Pendientes

- Confirmar retencion legal con BPD.
- Definir job automatico de limpieza del relay.
- Definir prueba trimestral de restauracion de backups.
- Definir caducidad de snapshots manuales de Hostinger.

## Regla para Fase 1

En el VPS Relay, la retencion no debe perseguir valor historico. Su funcion es
resiliencia temporal mientras el servidor fisico descarga, valida y confirma.
Si una evidencia supera la expiracion sin descarga, debe investigarse como falla
operativa y no extenderse silenciosamente.
