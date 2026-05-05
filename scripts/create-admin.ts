import { hash } from "bcryptjs";
import { UserRole } from "@prisma/client";
import { ensureBaseCatalogs } from "../lib/bootstrap";
import { prisma } from "../lib/prisma";

function getArg(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

async function main() {
  const email = getArg("email");
  const password = getArg("password");
  const name = getArg("name") || "Administrador";
  const roleArg = (getArg("role") || "ADMIN").toUpperCase();

  if (!email || !password) {
    throw new Error("Uso: npm run create-admin -- --email=admin@celego.local --password=Secreto123 --name=Admin --role=ADMIN");
  }

  if (!(roleArg in UserRole)) {
    throw new Error(`Rol invalido: ${roleArg}`);
  }

  await ensureBaseCatalogs();

  const passwordHash = await hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: roleArg as UserRole,
      active: true,
    },
    create: {
      email,
      name,
      passwordHash,
      role: roleArg as UserRole,
      active: true,
    },
  });

  console.log(`Usuario listo: ${user.email} (${user.role})`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
