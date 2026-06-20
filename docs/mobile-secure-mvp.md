# MVP movil seguro - Fases 2 y 3

## Alcance cerrado en repo

La Fase 2 y Fase 3 quedan implementadas como base funcional de backend +
aplicacion movil:

- Login individual con token mobile existente.
- Registro/latido de dispositivo.
- Descarga de paquete offline por dispositivo activo.
- Validacion local de cedula con `salt + hash + last4`.
- Captura de foto desde camara.
- Cifrado local AES-256-GCM y wrapping RSA-OAEP-SHA256 con `node-forge`.
- Calculo SHA-256 del blob cifrado.
- Subida al Relay DMZ y registro del manifiesto en core.
- Cola offline con reintentos manuales.
- Estado de sincronizacion por evidencia/paquete/incidencia.
- Incidencias offline y sincronizacion posterior.
- Bloqueo de screenshots mediante `expo-screen-capture`.
- Jobs backend para procesamiento/retencion de evidencias.

## Flujo operativo

1. El operador crea ruta y paquete offline desde el portal/API.
2. TI registra y activa el dispositivo.
3. El mensajero inicia sesion en la app.
4. La app descarga el paquete asignado al dispositivo.
5. El mensajero selecciona una entrega.
6. La app valida cedula localmente sin enviar cedula completa al relay.
7. La app captura acuse y cedula.
8. La app cifra antes de subir.
9. La app envia blob cifrado al relay.
10. La app registra manifiesto tecnico en core.
11. El worker interno procesa/retiene segun politica.

## Pendiente nativo F4/F5

Estos controles requieren build nativo, MDM o dispositivo real:

- Android Keystore respaldado por hardware.
- Root/jailbreak detection fuerte.
- Certificate pinning real.
- mTLS por dispositivo.
- Modo kiosco.
- OCR local para detectar tarjeta/cedula.
- CameraX/Vision Camera con overlay final.
- WorkManager Android para sync en background fuera de Expo runtime.

## Comandos de verificacion

```bash
npm run test
npm run mobile:typecheck
npm run mobile:process-evidence
```

Para validar el entorno completo despues de cambios:

```bash
npm run lint
npm run build
docker compose build
docker compose up -d --force-recreate
docker compose ps
```
