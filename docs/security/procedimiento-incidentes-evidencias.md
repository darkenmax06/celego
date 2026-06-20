# Procedimiento de incidentes de evidencias

## Objetivo

Responder de forma consistente ante perdida de dispositivo, exposicion
accidental de PII, falla de cifrado, acceso no autorizado o compromiso del VPS
Relay.

## Severidad

| Severidad | Condicion | Tiempo interno objetivo |
| --- | --- | --- |
| Critica | Evidencia legible expuesta, llave privada comprometida, acceso core no autorizado | Accion inmediata |
| Alta | Dispositivo perdido con evidencias pendientes, token activo, relay alterado | Menos de 2 horas |
| Media | Error de sincronizacion masivo, hash mismatch repetido, retencion vencida | Mismo dia |
| Baja | Alerta aislada sin evidencia de exposicion | Siguiente ciclo operativo |

## Flujo general

1. Detectar evento por reporte humano, monitoreo, logs o rechazo automatico.
2. Clasificar severidad y abrir registro de incidente.
3. Contener: revocar dispositivo, token, usuario, llave o acceso SSH.
4. Preservar evidencia tecnica sin copiar PII innecesaria.
5. Determinar alcance: rutas, entregas, dispositivos y ventanas de tiempo.
6. Remediar: rotacion, redeploy, bloqueo, limpieza o restauracion.
7. Validar recuperacion con healthcheck y pruebas controladas.
8. Notificar a BPD/legal si el protocolo aprobado lo exige.
9. Cerrar con causa raiz, acciones y responsables.

## Incidente: PII enviada al relay

- Bloquear endpoint o cliente que envia el payload.
- Confirmar si el relay rechazo antes de persistir.
- Si se persistio metadata prohibida, aislar volumen y tomar hash del archivo.
- Eliminar objeto/metadata segun instruccion de Seguridad.
- Abrir defecto de contrato o app movil.
- Agregar prueba automatizada que reproduzca el payload.

## Incidente: dispositivo perdido

- Marcar dispositivo `LOST` o `REVOKED`.
- Revocar token y certificado.
- Ejecutar bloqueo/borrado remoto por MDM cuando este disponible.
- Identificar rutas asignadas y evidencias pendientes.
- Reasignar entregas si aplica.
- Revisar ultimos eventos `lastSeenAt`, IP y sincronizaciones.

## Incidente: VPS Relay comprometido

- Cerrar SSH y limitar firewall a IP de emergencia.
- Detener compose si hay actividad activa sospechosa.
- Preservar logs Caddy/relay y metadata cifrada.
- Rotar secretos de despliegue y llaves SSH.
- Reconstruir VPS desde imagen limpia o snapshot verificado.
- No restaurar volumen si contiene artefactos alterados.
- Validar que no existia PII ni llave privada en el relay.

## Incidente: llave privada maestra comprometida

Este evento es critico y no debe poder originarse en el relay. Si ocurre en el
servidor fisico:

- Detener descifrado y cargas nuevas.
- Rotar par de llaves.
- Revocar llave anterior para nuevas evidencias.
- Evaluar si evidencias historicas requieren recifrado o destruccion
  criptografica.
- Notificar segun contrato y direccion.

## Registro minimo

- Fecha y hora de deteccion.
- Persona o sistema que detecta.
- Tipo de incidente.
- Entregas/rutas/dispositivos afectados.
- Acciones de contencion.
- Evidencia tecnica recolectada.
- Decisiones de notificacion.
- Cierre, causa raiz y tareas preventivas.

