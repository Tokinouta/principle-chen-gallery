import { presentArtwork, presentArtworks } from '../services/artworkPresenter.js';
export function createArtworkRoutes(deps) {
    const { repository, signer } = deps;
    return async (app) => {
        app.get('/api/artworks', async (request, reply) => {
            try {
                const rows = await repository.listPublished(request.query.search);
                return await presentArtworks(rows, signer);
            }
            catch (error) {
                request.log.error({ err: error }, 'Failed to list artworks');
                return reply.status(503).send({ error: 'Catalogue temporarily unavailable' });
            }
        });
        app.get('/api/artworks/:id', async (request, reply) => {
            try {
                const row = await repository.findPublishedById(request.params.id);
                if (!row) {
                    return reply.status(404).send({ error: 'Artwork not found' });
                }
                return await presentArtwork(row, signer);
            }
            catch (error) {
                request.log.error({ err: error }, 'Failed to load artwork');
                return reply.status(503).send({ error: 'Catalogue temporarily unavailable' });
            }
        });
    };
}
//# sourceMappingURL=artworks.js.map