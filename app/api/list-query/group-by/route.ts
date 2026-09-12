import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { compile, ListQueryValidationError } from "@/lib/list-query";
import { getListQueryDescriptor } from "@/lib/list-query/registry";
import { RESOURCE_SECURITY } from "@/lib/list-query/security";
import { CARD_GROUP_NONE_TOKEN } from "@/lib/list-query/card-group-where";
import { compileOffFilterWhere } from "@/lib/list-query/off-filter-count";

/**
 * SDD card-groups — Stage C, Task C2.
 *
 * "Grupo" is not a scalar column, so it cannot go through `allowedFields` and
 * `prisma.<model>.groupBy`. It is counted through `CardGroupMember` instead,
 * and only for the resources whose list `where` really is a compiled `Card`
 * predicate.
 *
 * `/operativo` is deliberately absent, exactly as in
 * `OFF_FILTER_COUNT_RESOURCES`: `app/api/operativo/contacto/route.ts`
 * hand-builds its `where` across three tab branches and then filters rows in
 * memory, so no honest server total exists for it. The screen renders only
 * what it is showing rather than a fabricated total.
 */
const CARD_GROUP_BY_FIELD = "grupo";
const CARD_GROUP_BY_RESOURCES = ["tarjetas", "sla-vencidas"] as const;

export async function GET(request: NextRequest) {
  const resource = request.nextUrl.searchParams.get("resource")?.trim();
  const by = request.nextUrl.searchParams.get("by")?.trim();

  if (!resource || !by) {
    return NextResponse.json(
      { error: "Parametros 'resource' y 'by' son requeridos" },
      { status: 400 },
    );
  }

  const security = RESOURCE_SECURITY[resource];
  if (!security) {
    return NextResponse.json(
      { error: `Recurso no permitido o desconocido: ${resource}` },
      { status: 404 },
    );
  }

  const auth = await requireApiSession([...security.allowedRoles]);
  if ("error" in auth) return auth.error;

  if (by === CARD_GROUP_BY_FIELD) {
    if (!(CARD_GROUP_BY_RESOURCES as readonly string[]).includes(resource)) {
      return NextResponse.json(
        { error: `Agrupacion por grupo no disponible para el recurso: ${resource}` },
        { status: 400 },
      );
    }
    return groupByCardGroup(resource, request.nextUrl.searchParams);
  }

  if (!security.allowedFields.includes(by)) {
    return NextResponse.json(
      { error: `Campo no permitido para agrupacion: ${by}` },
      { status: 400 },
    );
  }

  let descriptor;
  try {
    descriptor = getListQueryDescriptor(resource);
  } catch {
    return NextResponse.json(
      { error: `Descriptor no registrado para recurso: ${resource}` },
      { status: 404 },
    );
  }

  let compiled;
  try {
    const baseConstraint = security.baseWhere ? security.baseWhere() : undefined;
    compiled = compile(
      descriptor,
      request.nextUrl.searchParams,
      baseConstraint ? { andPrefix: [baseConstraint] } : {},
    );
  } catch (error) {
    if (error instanceof ListQueryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const delegateName = security.prismaDelegate;
  const prismaModel = (prisma as unknown as Record<string, {
    groupBy?: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  }>)[delegateName];

  if (!prismaModel) {
    return NextResponse.json(
      { error: `Delegado Prisma no encontrado: ${delegateName}` },
      { status: 500 },
    );
  }

  try {
    if (typeof prismaModel.groupBy === "function") {
      const groups = await prismaModel.groupBy({
        by: [by],
        where: compiled.where,
        _count: { _all: true },
        orderBy: { [by]: "asc" },
      });

      const formatted = groups.map((item) => ({
        key: item[by] === null || item[by] === undefined ? "null" : String(item[by]),
        count: typeof item._count === "object" && item._count !== null && "_all" in item._count
          ? (item._count as { _all: number })._all
          : 0,
      }));

      return NextResponse.json({
        resource,
        by,
        groups: formatted,
        totalGroups: formatted.length,
      });
    }

    // Fallback if model delegate does not support groupBy in current Prisma client setup
    const rows = await prismaModel.findMany({
      where: compiled.where,
      select: { [by]: true },
    });

    const countMap = new Map<string, number>();
    for (const row of rows) {
      const rawVal = row[by];
      const key = rawVal === null || rawVal === undefined ? "null" : String(rawVal);
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    const formatted = Array.from(countMap.entries()).map(([key, count]) => ({
      key,
      count,
    }));

    return NextResponse.json({
      resource,
      by,
      groups: formatted,
      totalGroups: formatted.length,
    });
  } catch (error) {
    console.error("Error in group-by:", error);
    return NextResponse.json(
      { error: "Error al realizar la agrupacion en el servidor" },
      { status: 500 },
    );
  }
}

/**
 * Buckets a resource's matching cards by group membership, plus the count of
 * matching cards that belong to no group at all.
 *
 * The predicate comes from `compileOffFilterWhere`, the same source the
 * off-filter count uses, so it carries `RESOURCE_SECURITY[resource].baseWhere()`
 * and `contactoEstado`. Writing a second translation here is what would let
 * these totals drift away from the list they describe.
 */
async function groupByCardGroup(resource: string, params: URLSearchParams) {
  let cardWhere;
  try {
    cardWhere = compileOffFilterWhere(resource, params);
  } catch (error) {
    if (error instanceof ListQueryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const [memberships, ungrouped] = await Promise.all([
      prisma.cardGroupMember.groupBy({
        by: ["groupId"],
        where: { card: cardWhere },
        _count: { _all: true },
      }),
      prisma.card.count({
        where: { AND: [cardWhere, { groupMemberships: { none: {} } }] },
      }),
    ]);

    const groups = (memberships ?? [])
      .map((item) => ({
        key: String((item as { groupId: string }).groupId),
        count:
          typeof item._count === "object" && item._count !== null && "_all" in item._count
            ? (item._count as { _all: number })._all
            : 0,
      }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

    groups.push({ key: CARD_GROUP_NONE_TOKEN, count: ungrouped ?? 0 });

    return NextResponse.json({
      resource,
      by: CARD_GROUP_BY_FIELD,
      groups,
      totalGroups: groups.length,
    });
  } catch (error) {
    console.error("Error in group-by (grupo):", error);
    return NextResponse.json(
      { error: "Error al realizar la agrupacion en el servidor" },
      { status: 500 },
    );
  }
}
