import type { FastifyPluginAsync } from 'fastify';

import { artworks } from '../data/artworks.js';
import type { Artwork } from '../types/artwork.js';

type ArtworkSearchQuery = {
  search?: string;
};

type ArtworkParams = {
  id: string;
};

const searchableText = (artwork: Artwork) => {
  return [
    artwork.title,
    artwork.artist,
    artwork.medium,
    artwork.period,
    artwork.summary,
    artwork.description
  ].join(' ');
};

export const artworkRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: ArtworkSearchQuery }>('/api/artworks', async (request) => {
    const search = request.query.search?.trim().toLowerCase();

    if (!search) {
      return artworks;
    }

    return artworks.filter((artwork) => searchableText(artwork).toLowerCase().includes(search));
  });

  app.get<{ Params: ArtworkParams }>('/api/artworks/:id', async (request, reply) => {
    const artwork = artworks.find((candidate) => candidate.id === request.params.id);

    if (!artwork) {
      return reply.status(404).send({ error: 'Artwork not found' });
    }

    return artwork;
  });
};
