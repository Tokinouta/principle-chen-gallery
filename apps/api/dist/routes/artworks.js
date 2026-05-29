import { artworks } from '../data/artworks.js';
const searchableText = (artwork) => {
    return [
        artwork.title,
        artwork.artist,
        artwork.medium,
        artwork.period,
        artwork.summary,
        artwork.description
    ].join(' ');
};
export const artworkRoutes = async (app) => {
    app.get('/api/artworks', async (request) => {
        const search = request.query.search?.trim().toLowerCase();
        if (!search) {
            return artworks;
        }
        return artworks.filter((artwork) => searchableText(artwork).toLowerCase().includes(search));
    });
    app.get('/api/artworks/:id', async (request, reply) => {
        const artwork = artworks.find((candidate) => candidate.id === request.params.id);
        if (!artwork) {
            return reply.status(404).send({ error: 'Artwork not found' });
        }
        return artwork;
    });
};
//# sourceMappingURL=artworks.js.map