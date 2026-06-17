import { compare } from "bcryptjs";
import { type NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tryWriteAuditEvent } from "@/lib/audit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          await tryWriteAuditEvent({
            entity: "AUTH",
            entityId: "credentials",
            action: "LOGIN",
            result: "FAILURE",
            actorEmail:
              typeof rawCredentials?.email === "string" ? rawCredentials.email : null,
            details: { reason: "INVALID_PAYLOAD" },
          });
          return null;
        }

        const email = parsed.data.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          await tryWriteAuditEvent({
            entity: "AUTH",
            entityId: user?.id ?? "unknown",
            action: "LOGIN",
            result: "FAILURE",
            actorEmail: email,
            targetUserId: user?.id,
            details: { reason: user ? "INACTIVE_USER" : "USER_NOT_FOUND" },
          });
          return null;
        }

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          await tryWriteAuditEvent({
            entity: "AUTH",
            entityId: user.id,
            action: "LOGIN",
            result: "FAILURE",
            actorEmail: email,
            targetUserId: user.id,
            details: { reason: "INVALID_PASSWORD" },
          });
          return null;
        }

        await tryWriteAuditEvent({
          entity: "AUTH",
          entityId: user.id,
          action: "LOGIN",
          userId: user.id,
          actorEmail: email,
          targetUserId: user.id,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id && token.role) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const getAuthSession = () => getServerSession(authOptions);
