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
  -> Caddy HTTPS + relay interno
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
- El VPS Hostinger publica solo `80/443` hacia Caddy y restringe SSH por IP
  administrativa aprobada.
- El relay escucha solo dentro de Docker; no se publica `3900` al host.
- Caddy termina HTTPS y reenvia al relay, sin inspeccionar ni descifrar blobs.

## Componentes iniciales en el repo

- `apps/relay`: API publica minima para recepcion tecnica de evidencias.
- `packages/contracts`: contratos y validaciones sin PII para relay/core.
- `packages/crypto`: helpers de cifrado de evidencia y hash SHA-256.
- `app/api/mobile/devices`: registro/listado de dispositivos.
- `app/api/mobile/evidencias/cifradas`: registro core de manifiestos cifrados.
- `infra/hostinger`: paquete operativo de Fase 1 para VPS Relay.
- `docs/security/cierre-fase-0.md`: criterio de cierre interno y pendientes.

## Flujo de Fase 1

```text
App movil
  -> HTTPS publico
Caddy en VPS Hostinger
  -> reverse proxy interno
Relay DMZ
  -> metadata tecnica + blob cifrado temporal
Worker servidor fisico Celego
  -> descarga, valida hash, descifra y conserva segun contrato
```

## Controles de infraestructura

- DNS dedicado, por ejemplo `relay.celego.example`.
- HTTPS automatico con Caddy.
- Firewall Hostinger dedicado al VPS Relay.
- UFW local como segunda capa.
- Backups/snapshots documentados y probados.
- Logs sin PII y con retencion operativa definida.

## Pendientes externos

- Pais o region permitida del VPS.
- Politica contractual de retencion con BPD.
- MDM elegido y politicas finales de Android Enterprise.
- Certificados por dispositivo y mecanismo final de mTLS.
- Informe formal de aprobacion BPD/legal.
