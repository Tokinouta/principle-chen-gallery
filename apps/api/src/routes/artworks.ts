import type { FastifyPluginAsync } from 'fastify';

import type { ArtworkRepository } from '../repositories/artworkRepository.js';
import { presentArtwork, presentArtworks } from '../services/artworkPresenter.js';
import type { OssSigner } from '../services/ossSigner.js';

type ArtworkSearchQuery = {
  search?: string;
};

type ArtworkParams = {
  id: string;
};

export type ArtworkRoutesDeps = {
  repository: ArtworkRepository;
  signer: OssSigner;
};

export function createArtworkRoutes(deps: ArtworkRoutesDeps): FastifyPluginAsync {
  const { repository, signer } = deps;

  return async (app) => {
    app.get<{ Querystring: ArtworkSearchQuery }>('/api/artworks', async (request, reply) => {
      try {
        const rows = await repository.listPublished(request.query.search);
        return await presentArtworks(rows, signer);
      } catch (error) {
        request.log.error({ err: error }, 'Failed to list artworks');
        return reply.status(503).send({ error: 'Catalogue temporarily unavailable' });
      }
    });

    app.get<{ Params: ArtworkParams }>('/api/artworks/:id', async (request, reply) => {
      try {
        const row = await repository.findPublishedById(request.params.id);
        if (!row) {
          return reply.status(404).send({ error: 'Artwork not found' });
        }
        return await presentArtwork(row, signer);
      } catch (error) {
        request.log.error({ err: error }, 'Failed to load artwork');
        return reply.status(503).send({ error: 'Catalogue temporarily unavailable' });
      }
    });
  };
}
