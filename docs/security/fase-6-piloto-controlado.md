# Fase 6 - Piloto controlado

## Objetivo

Ejecutar una simulacion interna lista para convertirse en piloto de campo con
5 a 10 mensajeros, una provincia o zona controlada y entregas limitadas. En
esta entrega el piloto es de repo y simulacion; no declara produccion completa.

## Entregables de repo

- Endpoint admin `GET /api/admin/mobile-pilot`.
- Pantalla admin `/piloto-movil`.
- Datos demo con `npm run pilot:seed-mobile`.
- Limpieza demo con `npm run pilot:clear-mobile`.
- Checklist diario y matriz de salida.
- Pruebas automatizadas de sanitizacion y autorizacion.

## Criterios de entrada

- Fase 5 sin bloqueos criticos abiertos.
- Relay y core levantan en Docker.
- Al menos 5 dispositivos `ACTIVE`.
- Cada dispositivo activo esta asociado a un mensajero.
- Hay tarjetas abiertas asignadas por `Card.currentMessengerId`.
- No existen incidencias `HIGH` o `CRITICAL` sin decision.
- No hay jobs `DEAD_LETTER` sin investigacion.

## Flujo diario

1. Ejecutar `npm run pilot:seed-mobile` si se requiere simulacion.
2. Abrir `/piloto-movil` con usuario `ADMIN`.
3. Filtrar por provincia o mensajero.
4. Revisar score de preparacion y checklist.
5. Revisar dispositivos sin latido.
6. Revisar incidencias recientes.
7. Ejecutar sincronizacion desde app o simulacion.
8. Ejecutar `npm run mobile:process-evidence`.
9. Registrar hallazgos y decision del dia.

## Metricas minimas

| Metrica | Meta para piloto |
| --- | --- |
| Dispositivos activos | 5 a 10 |
| Dispositivos sin latido | 0 |
| Tarjetas abiertas visibles | Mayor que 0 |
| Incidencias HIGH/CRITICAL | 0 sin decision |
| Jobs DEAD_LETTER | 0 sin decision |
| Evidencias descifradas en core | Debe crecer durante pruebas |

## Criterios de salida

- Evidencias completas para tarjetas probadas.
- Fotos siguen cifradas fuera del core.
- No hay acceso cruzado entre mensajeros.
- No hay PII en relay ni en resumen de piloto.
- La app conserva cola local hasta confirmacion.
- Dispositivo perdido/revocado no puede operar.
- Incidencias quedan registradas y visibles.
- Operaciones entiende el runbook diario.

## Pendientes para piloto real

- Lista final de mensajeros y provincia.
- Dispositivos fisicos enrolados en MDM.
- Politica de modo kiosco aplicada.
- Prueba real de borrado remoto.
- Aprobacion BPD/legal.
- Ventana de soporte de TI durante salida a campo.
