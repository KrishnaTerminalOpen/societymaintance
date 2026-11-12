import { PrismaClient } from '@prisma/client';

// Extend NodeJS global type for caching PrismaClient in dev to prevent connection exhaustion
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Polyfill JSON.stringify to safely serialize BigInt monetary values
// Converts BigInt to string or integer number representation when serialized
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

export * from '@prisma/client';

