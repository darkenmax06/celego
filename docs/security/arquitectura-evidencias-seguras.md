# Arquitectura de evidencias seguras

## Objetivo

El flujo de evidencias debe proteger la foto de cedula y el acuse desde la
captura en el celular hasta el servidor fisico de Celego. El VPS Relay no debe
ver fotos legibles ni datos personales completos.

## Zonas

```text
Celular corporativo
  -> evidencia cifrada localmente
VPS Relay / DMZ
  -> solo blob cifrado y metadata tecnica
Servidor fisico Celego
  -> descifra, conserva, audita y reporta
```

## Reglas de frontera

- El relay solo acepta `deliveryId`, `deviceId`, `objectId`, hash, tamano,
  expiracion, estado tecnico y metadatos criptograficos.
- El relay rechaza nombres, cedulas completas, telefonos, direcciones,
  numeros de tarjeta y fotos legibles.
- La base core puede asociar evidencia cifrada a ruta, tarjeta, mensajero y
  dispositivo, pero la llave privada maestra vive solo en el servidor fisico.
- Los celulares no deben conectarse directamente a la red interna, base de
  datos, MinIO ni portal administrativo.

## Componentes iniciales en el repo

- `apps/relay`: API publica minima para recepcion tecnica de evidencias.
- `packages/contracts`: contratos y validaciones sin PII para relay/core.
- `packages/crypto`: helpers de cifrado de evidencia y hash SHA-256.
- `app/api/mobile/devices`: registro/listado de dispositivos.
- `app/api/mobile/evidencias/cifradas`: registro core de manifiestos cifrados.

## Pendientes externos

- Pais y proveedor definitivo del VPS.
- Politica contractual de retencion con BPD.
- MDM elegido y politicas finales de Android Enterprise.
- Certificados por dispositivo y mecanismo final de mTLS.
