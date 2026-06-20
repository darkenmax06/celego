# Gobierno de datos para evidencias seguras

## Objetivo

Definir responsables, aprobaciones y controles para que Celego opere
evidencias de entrega con minimizacion de datos, trazabilidad y separacion clara
entre DMZ, servidor fisico y operacion diaria.

## Principios de gobierno

- Minimizacion: cada sistema recibe solo lo que necesita.
- Separacion de funciones: relay transporta, core valida, servidor fisico
  conserva y descifra.
- Menor privilegio: ningun usuario o servicio recibe acceso preventivo.
- Trazabilidad: toda consulta o cambio operativo debe quedar auditable.
- Revocacion rapida: dispositivo, usuario o llave comprometida se bloquea sin
  esperar cambios de codigo.

## Responsables

| Area | Responsabilidad |
| --- | --- |
| Direccion Celego | Aceptar riesgo residual y aprobar salida a produccion |
| Operaciones Celego | Definir flujo de entrega, rutas y excepciones |
| TI Celego | Administrar VPS, Docker, backups, llaves y monitoreo |
| Seguridad Celego | Revisar controles, incidentes, accesos y auditoria |
| Desarrollo | Mantener contratos, endpoints, pruebas y documentacion tecnica |
| BPD/legal | Aprobar retencion, pais del VPS, evidencias requeridas y notificaciones |
| Mensajero | Usar solo dispositivo asignado y reportar perdida o anomalia |
| Supervisor | Escalar incidentes y reasignar rutas cuando aplique |

## RACI de controles principales

| Control | Responsable | Aprueba | Consultado | Informado |
| --- | --- | --- | --- | --- |
| Retencion final de cedulas | Seguridad Celego | BPD/legal | TI, Operaciones | Desarrollo |
| Region del VPS | TI Celego | BPD/legal | Seguridad | Operaciones |
| Alta de dispositivo | Operaciones | TI/Supervisor | Seguridad | Mensajero |
| Revocacion de dispositivo | TI Celego | Seguridad | Operaciones | BPD si aplica |
| Rotacion de llaves | TI Celego | Seguridad | Desarrollo | Operaciones |
| Cambio de contrato API relay | Desarrollo | Seguridad | TI | Operaciones |
| Prueba de restauracion | TI Celego | Seguridad | Operaciones | Direccion |
| Cierre de incidente | Seguridad | Direccion/BPD si aplica | TI, Operaciones | Desarrollo |

## Clasificacion operativa

| Nivel | Datos | Tratamiento |
| --- | --- | --- |
| Critico | Cedula completa, foto de cedula, foto de acuse, llave privada | Solo servidor fisico o app antes de cifrar; nunca relay |
| Alto | Direccion, telefono, nombre, usuario, ruta, auditoria con IP | Core y app con necesidad operacional |
| Tecnico | `deliveryId`, `deviceId`, `objectId`, hash, tamano, expiracion | Permitido en relay |
| Publico interno | Runbooks sin secretos, checklists, diagramas | Repo y equipo autorizado |

## Flujo de aprobacion de cambios

1. Desarrollo propone cambio de contrato o arquitectura.
2. Seguridad revisa si aumenta datos, retencion, exposicion o privilegios.
3. TI valida impacto en VPS, Docker, DNS, certificados y backups.
4. Operaciones valida impacto en rutas, mensajeros y soporte.
5. BPD/legal aprueba si cambia retencion, pais, evidencia o notificacion.
6. Cambio se libera con pruebas `test`, `lint`, `build` y Docker.

## Evidencias de cumplimiento

- Commits y PRs asociados al cambio.
- Salidas de pruebas automatizadas.
- Capturas de configuracion firewall/backups cuando sea infraestructura.
- Registro de aprobacion externa cuando aplique.
- Bitacora de incidentes y acciones de remediacion.

