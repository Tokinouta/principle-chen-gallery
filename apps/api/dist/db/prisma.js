import { PrismaClient } from '@prisma/client';
export function createPrismaClient(databaseUrl) {
    return new PrismaClient({
        datasources: {
            db: { url: databaseUrl }
        },
        log: ['warn', 'error']
    });
}
//# sourceMappingURL=prisma.js.map