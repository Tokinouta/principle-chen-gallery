import { buildApp } from './app.js';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';
const app = buildApp();
const shutdown = async () => {
    await app.close();
};
process.on('SIGINT', () => {
    void shutdown();
});
process.on('SIGTERM', () => {
    void shutdown();
});
try {
    await app.listen({ port, host });
}
catch (error) {
    app.log.error(error);
    process.exitCode = 1;
}
//# sourceMappingURL=server.js.map