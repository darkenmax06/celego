# Procedimiento inicial de incidente de dispositivo

## Perdida o robo

1. Mensajero reporta el evento al supervisor.
2. Operador marca el dispositivo como `LOST` o `REVOKED`.
3. TI revoca certificado/sesion asociada.
4. MDM ejecuta bloqueo o borrado remoto.
5. Operaciones identifica rutas y evidencias pendientes.
6. Seguridad revisa ultimo `lastSeenAt`, cargas y auditoria.
7. Se documenta incidente y acciones tomadas.
8. Se notifica a BPD si el contrato o protocolo lo exige.

## Validaciones tecnicas

- Un dispositivo `LOST` o `REVOKED` no puede registrar evidencia cifrada.
- Un dispositivo sin mensajero asignado no puede operar una ruta.
- Un mensajero no puede usar un dispositivo asignado a otro mensajero.

## Evidencia de control

- Registro de estado del dispositivo.
- Auditoria de intentos rechazados.
- Reporte de rutas afectadas.
- Constancia de bloqueo/borrado remoto desde MDM.

## Escalamiento

Si el dispositivo perdido pudo contener evidencias sin sincronizar, Seguridad
debe abrir incidente formal y determinar si aplica notificacion a BPD segun el
protocolo aprobado. El relay por si solo no debe contener evidencia legible, por
lo que la revision se enfoca en estado del dispositivo, tokens, ruta y ventana
de exposicion.
