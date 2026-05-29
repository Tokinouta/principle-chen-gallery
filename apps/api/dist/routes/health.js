export const healthRoutes = async (app) => {
    app.get('/health', async () => {
        return { ok: true };
    });
};
//# sourceMappingURL=health.js.map