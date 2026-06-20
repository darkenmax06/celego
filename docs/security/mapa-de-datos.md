# Mapa de datos

| Dato | Celular | Relay | Servidor Celego |
| --- | --- | --- | --- |
| Nombre cliente | Ruta diaria minima | No permitido | Permitido |
| Cedula completa en texto | No persistir | No permitido | Permitido segun contrato |
| Foto cedula | Temporal cifrada | Solo cifrada | Original cifrado/descifrable |
| Foto acuse | Temporal cifrada | Solo cifrada | Original cifrado/descifrable |
| Direccion | Ruta diaria minima | No permitido | Permitido |
| Telefono | Solo si BPD permite | No permitido | Permitido |
| TC / tarjeta | No permitido | No permitido | Segun operacion actual |
| `deliveryId` | Permitido | Permitido | Permitido |
| `deviceId` | Permitido | Permitido | Permitido |
| GPS evidencia | Permitido | Permitido como coordenadas | Permitido |
| Hash SHA-256 | Permitido | Permitido | Permitido |
| Llave temporal cifrada | Permitido | Permitido | Permitido |
| Llave privada maestra | No permitido | No permitido | Permitido |

## Clasificacion

- Alta sensibilidad: fotos de cedula, fotos de acuse, cedula completa,
  direccion, telefono y datos de tarjeta.
- Sensibilidad tecnica: `deliveryId`, `deviceId`, `objectId`, hashes,
  timestamps, estado de sincronizacion y certificados.
- Auditoria: usuario, dispositivo, ruta, estado, fecha/hora, IP y resultado.

## Regla de minimizacion

Cada componente debe recibir solo los datos necesarios para su funcion. Si un
campo no es necesario para el relay, se rechaza aunque venga cifrado en otra
parte del paquete.
