# Checklist de aprobacion BPD/legal

## Proposito

Este checklist separa lo que Celego puede cerrar tecnicamente de lo que requiere
aprobacion externa de BPD/legal. No debe iniciarse produccion con evidencias
reales sin completar las decisiones marcadas como externas.

## Paquete que Celego entrega a revision

- Arquitectura de zonas: app movil, relay DMZ, servidor fisico Celego.
- Mapa de datos y clasificacion.
- Politica de cedulas y evidencias.
- Retencion propuesta por ubicacion.
- Matriz de accesos por rol.
- Procedimiento de incidente y notificacion.
- Guia de VPS Hostinger para relay.
- Evidencia de pruebas anti-PII y cifrado.

## Decisiones externas requeridas

| Decision | Responsable externo | Estado |
| --- | --- | --- |
| Pais/region permitida del VPS | BPD/legal | Pendiente |
| Retencion final de cedulas en servidor fisico | BPD/legal | Pendiente |
| Retencion de backups con evidencia descifrable | BPD/legal | Pendiente |
| Tiempo maximo de notificacion de incidente | BPD/legal | Pendiente |
| Roles autorizados para ver evidencia legible | BPD/legal | Pendiente |
| Formato de reporte y auditoria | BPD/legal | Pendiente |
| Aprobacion de salida productiva | BPD/legal | Pendiente |

## Preguntas de aprobacion

- El relay solo almacena metadata tecnica y blobs cifrados. Es aceptable esta
  arquitectura como zona DMZ?
- La region seleccionada del VPS cumple requerimientos contractuales?
- La retencion tecnica del relay de 24 a 72 horas es aceptable?
- Que retencion aplica a evidencia ya descargada en servidor fisico?
- Que usuarios pueden consultar fotos de cedula y bajo que motivo?
- Que eventos obligan notificacion formal?
- Que evidencia de auditoria espera BPD recibir?

## Criterio de salida

La Fase 1 puede quedar tecnicamente lista, pero produccion requiere:

- Documento o correo formal de aprobacion.
- Region VPS autorizada.
- Retencion final aprobada.
- Contactos de incidente y escalamiento.
- Prueba de despliegue y restauracion anexada.

