# Runbook diario del piloto movil

## Antes de iniciar

1. Confirmar que el servidor local responde `/api/health`.
2. Confirmar que Docker muestra app y DB arriba.
3. Confirmar que el relay responde `/health`.
4. Abrir `/flota` y revisar dispositivos pendientes.
5. Abrir `/piloto-movil` y revisar score.
6. Revisar que no haya `DEAD_LETTER` ni incidencias criticas sin decision.

## Durante el turno

- Mensajero inicia sesion con usuario individual.
- App registra o late dispositivo.
- App sincroniza asignaciones automaticamente.
- Mensajero captura evidencia solo desde la app.
- App cifra evidencia antes de subir.
- Relay recibe solo blob cifrado y metadata tecnica.
- Core registra manifiesto y procesa cola.

## Monitoreo cada 2 horas

- Dispositivos sin latido.
- Evidencias `UPLOADED_RELAY` que no avanzan.
- Incidencias `HIGH` o `CRITICAL`.
- Jobs `RETRY_SCHEDULED` y `DEAD_LETTER`.
- Reportes de problemas de camara, GPS o datos.

## Cierre del dia

1. Ejecutar `npm run mobile:process-evidence`.
2. Revisar `/piloto-movil`.
3. Registrar conteo de evidencias descifradas.
4. Registrar incidencias pendientes.
5. Confirmar que no se usaron datos fuera del alcance.
6. Documentar ajustes UX u operativos.
7. Decidir si se repite piloto, se corrige o se escala.

## Comandos utiles

```bash
npm run pilot:seed-mobile
npm run mobile:process-evidence
npm run test
docker compose ps
docker compose logs --tail=200
```

Para limpiar la simulacion:

```bash
npm run pilot:clear-mobile
```

## Escalamiento

| Condicion | Accion |
| --- | --- |
| Dispositivo perdido | Marcar `LOST` en Flota, revocar paquetes y abrir incidente |
| Evidencia no avanza | Revisar cola, relay y `mobile:process-evidence` |
| PII detectada en payload | Detener piloto y corregir contrato/app |
| Acceso cruzado confirmado | Bloquear piloto y abrir incidente critico |
| Relay caido | Pausar subidas, conservar cola local y revisar VPS |
