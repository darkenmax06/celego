# Politica inicial de cedulas y evidencias

## Principios

- La foto de cedula existe solo porque el proceso BPD la exige.
- La app no debe guardar fotos en galeria ni almacenamiento publico.
- La evidencia se cifra antes de salir del celular.
- El relay no recibe cedula en texto ni foto legible.
- El servidor fisico de Celego es el unico punto con capacidad de descifrado.

## Flujo esperado

1. La app captura foto desde camara interna.
2. La app genera llave temporal por evidencia.
3. La foto se cifra con AES-256-GCM.
4. La llave temporal se cifra con la llave publica de Celego.
5. La app envia al relay solo blob cifrado, hash y manifiesto tecnico.
6. El servidor Celego descarga, valida hash, descifra y audita.
7. La app elimina copia local cuando recibe confirmacion.
8. El relay elimina el objeto al vencer la retencion tecnica.

## Prohibiciones

- Importar fotos desde galeria.
- Enviar cedula completa al relay.
- Incluir nombre, direccion, telefono o tarjeta en metadata del relay.
- Guardar evidencia legible en `public/uploads` para el flujo nuevo.
- Compartir evidencia mediante apps externas.

## Pendiente contractual

BPD debe confirmar retencion final, usuarios autorizados para ver cedulas,
requerimientos de auditoria y pais permitido para el VPS.
