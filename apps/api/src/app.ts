import Fastify, { type FastifyServerOptions } from 'fastify';

import { loadConfig, type AppConfig } from './config/env.js';
import { createPrismaClient } from './db/prisma.js';
import type { ArtworkRepository } from './repositories/artworkRepository.js';
import { createArtworkRepository } from './repositories/artworkRepository.js';
import { createArtworkRoutes } from './routes/artworks.js';
import { healthRoutes } from './routes/health.js';
import { createOssSigner, type OssSigner } from './services/ossSigner.js';

function resolveLoggerOption(): FastifyServerOptions['logger'] {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (!raw || raw === 'off' || raw === 'silent' || raw === 'false') {
    return false;
  }
  return { level: raw };
}

export type AppDeps = {
  config?: AppConfig;
  repository?: ArtworkRepository;
  signer?: OssSigner;
};

export function buildApp(deps: AppDeps = {}) {
  const config = deps.config ?? loadConfig();
  const repository = deps.repository ?? createArtworkRepository(createPrismaClient(config.databaseUrl));
  const signer = deps.signer ?? createOssSigner(config.oss);

  const app = Fastify({
    logger: resolveLoggerOption()
  });

  void app.register(healthRoutes);
  void app.register(createArtworkRoutes({ repository, signer }));

  return app;
}
