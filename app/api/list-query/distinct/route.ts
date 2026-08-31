import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { compile, ListQueryValidationError } from "@/lib/list-query";
import { getListQueryDescriptor } from "@/lib/list-query/registry";
import { RESOURCE_SECURITY } from "@/lib/list-query/security";

export async function GET(request: NextRequest) {
  const resource = request.nextUrl.searchParams.get("resource")?.trim();
  const field = request.nextUrl.searchParams.get("field")?.trim();

  if (!resource || !field) {
    return NextResponse.json(
      { error: "Parametros 'resource' y 'field' son requeridos" },
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

  if (!security.allowedFields.includes(field)) {
    return NextResponse.json(
      { error: `Campo no permitido para valores distintos: ${field}` },
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
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  }>)[delegateName];

  if (!prismaModel) {
    return NextResponse.json(
      { error: `Delegado Prisma no encontrado: ${delegateName}` },
      { status: 500 },
    );
  }

  try {
    const whereWithField = {
      ...compiled.where,
      [field]: {
        ...((compiled.where as Record<string, unknown>)[field] as Record<string, unknown> || {}),
        not: null,
      },
    };

    const results = await prismaModel.findMany({
      where: whereWithField,
      select: { [field]: true },
      distinct: [field],
      orderBy: { [field]: "asc" },
      take: 300,
    });

    const values = results
      .map((item) => item[field])
      .filter((v) => v !== null && v !== undefined && v !== "");

    return NextResponse.json({
      resource,
      field,
      values,
      total: values.length,
    });
  } catch {
    // Fallback if scalar field ordering/filtering directly on nested or enum throws
    const results = await prismaModel.findMany({
      where: compiled.where,
      select: { [field]: true },
      take: 1000,
    });

    const distinctSet = new Set(
      results
        .map((item) => item[field])
        .filter((v) => v !== null && v !== undefined && v !== "")
    );
    const values = Array.from(distinctSet).sort();

    return NextResponse.json({
      resource,
      field,
      values,
      total: values.length,
    });
  }
}
