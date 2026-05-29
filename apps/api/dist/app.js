import Fastify from 'fastify';
import { artworkRoutes } from './routes/artworks.js';
import { healthRoutes } from './routes/health.js';
export function buildApp() {
    const app = Fastify({
        logger: false
    });
    void app.register(healthRoutes);
    void app.register(artworkRoutes);
    return app;
}
//# sourceMappingURL=app.js.map