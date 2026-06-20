# Retencion de evidencias

## Valores tecnicos iniciales

| Ubicacion | Retencion inicial |
| --- | --- |
| App movil | Hasta confirmacion de sincronizacion; maximo 24 horas |
| Relay | Hasta descarga confirmada; maximo tecnico sugerido 72 horas |
| Servidor Celego | Segun contrato BPD y politica aprobada |
| Backups | Segun politica aprobada |
| Logs tecnicos | 6 a 12 meses, sin PII |

## Borrado

- En relay, borrar blob cifrado y metadata vencida.
- En app, borrar evidencia local y cola sincronizada.
- Para evidencia cifrada, destruir la llave o referencia que permite descifrar
  equivale a destruccion criptografica del contenido.

## Pendientes

- Confirmar retencion legal con BPD.
- Definir job automatico de limpieza del relay.
- Definir prueba trimestral de restauracion de backups.
