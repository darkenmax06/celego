import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { compile, ListQueryValidationError } from "@/lib/list-query";
import { getListQueryDescriptor } from "@/lib/list-query/registry";
import { RESOURCE_SECURITY } from "@/lib/list-query/security";

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
