import Fastify from 'fastify';
import { loadConfig } from './config/env.js';
import { createPrismaClient } from './db/prisma.js';
import { createArtworkRepository } from './repositories/artworkRepository.js';
import { createArtworkRoutes } from './routes/artworks.js';
import { healthRoutes } from './routes/health.js';
import { createOssSigner } from './services/ossSigner.js';
export function buildApp(deps = {}) {
    const config = deps.config ?? loadConfig();
    const repository = deps.repository ?? createArtworkRepository(createPrismaClient(config.databaseUrl));
    const signer = deps.signer ?? createOssSigner(config.oss);
    const app = Fastify({
        logger: false
    });
    void app.register(healthRoutes);
    void app.register(createArtworkRoutes({ repository, signer }));
    return app;
}
//# sourceMappingURL=app.js.map