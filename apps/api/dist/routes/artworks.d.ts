import type { FastifyPluginAsync } from 'fastify';
import type { ArtworkRepository } from '../repositories/artworkRepository.js';
import type { OssSigner } from '../services/ossSigner.js';
export type ArtworkRoutesDeps = {
    repository: ArtworkRepository;
    signer: OssSigner;
};
export declare function createArtworkRoutes(deps: ArtworkRoutesDeps): FastifyPluginAsync;
