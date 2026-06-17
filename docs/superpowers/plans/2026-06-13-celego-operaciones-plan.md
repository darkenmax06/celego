# Plan de implementación de mejoras operativas

## 1. Datos y dominio

- Extender Prisma con reasignaciones, secuencia y borradores.
- Generar Prisma Client.
- Centralizar la resolución de ubicación efectiva.
- Evitar que las rutas sobrescriban provincia y zona originales.

## 2. Reasignación de entrega

- Crear validadores y endpoint transaccional.
- Exponer provincias y mensajeros elegibles.
- Enriquecer detalle y bitácora de tarjeta.
- Añadir pestaña de reasignación al modal.

## 3. Facturación y reportes

- Aplicar zona efectiva en resumen.
- Aplicar zona efectiva en factura.
- Aplicar zona efectiva en exportación de facturación.
- Añadir columnas de reasignación en reportes.

## 4. Exportaciones operativas

- Paginar PDF de rutas sin pérdida.
- Agregar secuencia a relaciones nuevas.
- Normalizar secuencia de relaciones existentes.
- Ordenar consultas, PDF y Excel por secuencia.

## 5. Persistencia híbrida

- Crear API de borradores con control de versión.
- Crear hooks reutilizables de servidor y navegador.
- Integrar borradores en flujos críticos.
- Integrar preferencias en las demás pantallas aplicables.
- Añadir recuperación, descarte y conflictos.

## 6. Sistema visual

- Crear tokens y estados globales.
- Crear componentes compartidos de formularios y avisos.
- Añadir barra operativa de autoguardado.
- Mejorar modal, tablas y pantallas intervenidas.
- Mantener navegación y densidad existentes.

## 7. Verificación

- Ejecutar Prisma y TypeScript.
- Ejecutar lint y build.
- Probar casos funcionales y exportaciones.
- Ejecutar `docker compose build`.
- Ejecutar `docker compose up -d --force-recreate`.
- Verificar con `docker compose ps`.
- Revisar logs si algún servicio falla.
