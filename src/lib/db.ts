import { PrismaClient } from '@prisma/client';

// Next.js dev mode re-evaluates modules on every hot reload. Without the global
// cache each reload would open a brand-new connection pool until Postgres refuses
// new connections. In production this branch never runs.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}