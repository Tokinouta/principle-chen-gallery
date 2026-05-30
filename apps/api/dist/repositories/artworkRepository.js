const MEDIA_INCLUDE = {
    orderBy: { sortOrder: 'asc' },
    include: { mediaAsset: true }
};
function normalizeSearchTerm(search) {
    return search?.trim().toLowerCase() ?? '';
}
function rowMatchesSearch(row, term) {
    if (term.length === 0) {
        return true;
    }
    const haystacks = [
        row.title,
        row.artist,
        row.medium,
        row.period,
        row.summary,
        row.description
    ];
    for (const link of row.media) {
        if (link.mediaAsset.caption)
            haystacks.push(link.mediaAsset.caption);
        if (link.mediaAsset.transcript)
            haystacks.push(link.mediaAsset.transcript);
    }
    return haystacks.some((value) => value.toLowerCase().includes(term));
}
export function createArtworkRepository(prisma) {
    return {
        async listPublished(search) {
            const term = normalizeSearchTerm(search);
            const rows = (await prisma.artwork.findMany({
                where: { status: 'published' },
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                include: { media: MEDIA_INCLUDE }
            }));
            return rows.filter((row) => rowMatchesSearch(row, term));
        },
        async findPublishedById(id) {
            const row = (await prisma.artwork.findFirst({
                where: { id, status: 'published' },
                include: { media: MEDIA_INCLUDE }
            }));
            return row;
        }
    };
}
//# sourceMappingURL=artworkRepository.js.map