# Matriz de riesgos de evidencias

| Riesgo | Impacto | Control inicial |
| --- | --- | --- |
| Relay con PII accidental | Alto | Contratos estrictos y guardas anti-PII |
| Foto legible en almacenamiento publico | Alto | Flujo nuevo exige blob cifrado; endpoint legacy documentado |
| Mensajero accede entrega ajena | Alto | Autorizacion por usuario + dispositivo + ruta |
| Dispositivo robado activo | Alto | Estado `LOST`/`REVOKED`, revocacion de token y MDM |
| Reenvio de evidencia vieja | Medio | `objectId` unico, expiracion y timestamps |
| Blob manipulado | Alto | SHA-256 y AES-256-GCM con tag de autenticacion |
| Llave temporal expuesta | Alto | Llave temporal cifrada con llave publica del servidor fisico |
| Retencion excesiva en relay | Medio | Expiracion por evidencia y limpieza programada pendiente |
| Falta de auditoria | Alto | Registro core de evidencia y logs de estado de tarjeta |
| SSH expuesto a internet | Alto | Hostinger firewall + UFW restringido por IP administrativa |
| VPS contiene secretos core | Alto | `.env` separado y prohibicion de llave privada/base core en relay |
| Restauracion no probada | Medio | Checklist trimestral de backups/snapshots |
| DNS/HTTPS mal configurado | Medio | Caddy automatic HTTPS y healthcheck documentado |

## Criterio de aceptacion inicial

El sistema base debe poder demostrar que un paquete con nombre, cedula,
telefono, direccion o tarjeta es rechazado antes de persistirse en relay o core.

## Riesgo residual aceptable para piloto

El piloto puede iniciar solo si el relay sigue sin PII, los blobs estan cifrados,
el firewall esta limitado, hay snapshot previo y existe aprobacion externa para
la region y retencion. Si alguno de esos puntos falta, el piloto debe tratarse
como prueba interna sin evidencias reales.
