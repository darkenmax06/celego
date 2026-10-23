import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { asRecord, parseMetadataPhones, splitPhonesFromRaw } from "@/lib/operativo-row";

type Context = {
  params: Promise<{ cardId: string }>;
};

/**
 * Calls overhaul: card summary + full call history (newest first).
 * Roles are the union of the `operativo` and `sla_vencidas` ACL entries.
 */
export async function GET(_request: NextRequest, context: Context) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const { cardId } = await context.params;

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      tc: true,
      requestNumber: true,
      status: true,
      productType: true,
      provincia: true,
      zona: true,
      slaDueDate: true,
      urgent: true,
      metadata: true,
      customer: {
        select: { nombre: true, cedula: true, direccionRaw: true, telefonosRaw: true },
      },
      currentMessenger: { select: { id: true, nombre: true, telefono: true } },
      groupMemberships: { select: { group: { select: { id: true, name: true } } } },
      callAssignment: {
        select: {
          createdAt: true,
          updatedAt: true,
          assignedTo: { select: { id: true, name: true } },
          assignedBy: { select: { id: true, name: true } },
        },
      },
      contacts: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  if (!card) {
    return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  }

  const operativo = asRecord(asRecord(card.metadata).operativo);
  const metaPhones = parseMetadataPhones(operativo).map((phone) => phone.num);
  const telefonos = metaPhones.length ? metaPhones : splitPhonesFromRaw(card.customer.telefonosRaw);

  return NextResponse.json({
    card: {
      id: card.id,
      tc: card.tc,
      requestNumber: card.requestNumber,
      nombre: card.customer.nombre,
      cedula: card.customer.cedula,
      status: card.status,
      productType: card.productType,
      provincia: card.provincia,
      zona: card.zona,
      direccion: card.customer.direccionRaw ?? "",
      telefonos,
      urgent: card.urgent,
      slaDueDate: card.slaDueDate?.toISOString() ?? null,
      mensajero: card.currentMessenger
        ? {
            id: card.currentMessenger.id,
            nombre: card.currentMessenger.nombre,
            telefono: card.currentMessenger.telefono,
          }
        : null,
      operativo,
      grupos: card.groupMemberships.map((member) => member.group.name),
      // Bare ids for the wizard's "Asignar a grupo" action (names resolve via `useCardGroups`).
      groupIds: card.groupMemberships.map((member) => member.group.id),
      asignacion: card.callAssignment
        ? {
            asignadoA: card.callAssignment.assignedTo,
            asignadoPor: card.callAssignment.assignedBy,
            createdAt: card.callAssignment.createdAt.toISOString(),
            updatedAt: card.callAssignment.updatedAt.toISOString(),
          }
        : null,
    },
    historial: card.contacts.map((contact) => ({
      id: contact.id,
      createdAt: contact.createdAt.toISOString(),
      usuario: contact.user ? { id: contact.user.id, name: contact.user.name } : null,
      contactado: contact.contactado,
      resultado: contact.resultado,
      canalContacto: contact.canalContacto,
      telefonosUsados: contact.telefonosUsados,
      telefonosDetalle: contact.telefonosDetalle,
      motivoNoContacto: contact.motivoNoContacto,
      nuevaDireccion: contact.nuevaDireccion,
      fechaPreferenciaEntrega: contact.fechaPreferenciaEntrega?.toISOString() ?? null,
      comentario: contact.comentario,
      snapshot: contact.snapshot,
    })),
  });
}
