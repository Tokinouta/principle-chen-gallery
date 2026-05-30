import { PrismaClient } from '@prisma/client';

type SeedMediaAsset = {
  id: string;
  ossKey: string;
  mediaType: 'image' | 'video' | 'audio';
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  altText?: string;
  transcript?: string;
  caption?: string;
};

type SeedArtworkMedia = {
  id: string;
  role: 'primary' | 'thumbnail' | 'detail' | 'video' | 'audio' | 'soundtrack';
  sortOrder: number;
  mediaAsset: SeedMediaAsset;
};

type SeedArtwork = {
  id: string;
  title: string;
  artist: string;
  year: number;
  medium: string;
  period: string;
  summary: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  sortOrder: number;
  media: SeedArtworkMedia[];
};

const OSS_BUCKET = process.env.ALIYUN_OSS_BUCKET ?? 'galleria-principii-media';
const OSS_REGION = process.env.ALIYUN_OSS_REGION ?? 'oss-cn-hangzhou';

function primaryImage(artworkId: string, options: Omit<SeedMediaAsset, 'id' | 'ossKey' | 'mediaType' | 'mimeType' | 'byteSize'> & { mimeType?: string; byteSize?: number; ext?: string }): SeedArtworkMedia {
  const ext = options.ext ?? 'jpg';
  const id = `${artworkId}-primary`;
  return {
    id: `${artworkId}-link-primary`,
    role: 'primary',
    sortOrder: 0,
    mediaAsset: {
      id,
      ossKey: `artworks/${artworkId}/media/${id}/original.${ext}`,
      mediaType: 'image',
      mimeType: options.mimeType ?? 'image/jpeg',
      byteSize: options.byteSize ?? 480_000,
      width: options.width,
      height: options.height,
      altText: options.altText,
      caption: options.caption
    }
  };
}

function soundtrack(artworkId: string, options: { caption?: string; transcript?: string; durationSeconds?: number; byteSize?: number }): SeedArtworkMedia {
  const id = `${artworkId}-soundtrack`;
  return {
    id: `${artworkId}-link-soundtrack`,
    role: 'soundtrack',
    sortOrder: 1,
    mediaAsset: {
      id,
      ossKey: `artworks/${artworkId}/media/${id}/original.mp3`,
      mediaType: 'audio',
      mimeType: 'audio/mpeg',
      byteSize: options.byteSize ?? 2_400_000,
      durationSeconds: options.durationSeconds ?? 92,
      caption: options.caption,
      transcript: options.transcript
    }
  };
}

const artworks: SeedArtwork[] = [
  {
    id: 'ophelia-study',
    title: 'Study of Ophelia Among the Reeds',
    artist: 'Eleanor Ashcombe',
    year: 1864,
    medium: 'Oil on panel',
    period: 'Victorian Pre-Raphaelite',
    summary: 'A quiet riverbank meditation on Shakespearean melancholy.',
    description:
      'Ophelia rests among reeds and water roses, rendered with jewel-toned botanical detail and a Victorian fascination with literary tragedy.',
    status: 'published',
    sortOrder: 0,
    media: [
      primaryImage('ophelia-study', {
        width: 1600,
        height: 2000,
        altText: 'Ophelia among reeds and water roses, dim river light, jewel-toned botany.',
        caption: 'Primary panel study, exhibited London 1865.'
      }),
      soundtrack('ophelia-study', {
        caption: 'A short pianoforte theme commissioned for the panel.',
        transcript: 'Slow pianoforte in D minor, river and reed motifs woven through a Pre-Raphaelite lament.'
      })
    ]
  },
  {
    id: 'rose-window-morning',
    title: 'Morning at the Rose Window',
    artist: 'Beatrice Lydgate',
    year: 1872,
    medium: 'Watercolour and gouache',
    period: 'Victorian Gothic Revival',
    summary: 'Filtered chapel light falls across a carved stone sill.',
    description:
      'This intimate Gothic Revival interior studies coloured glass, dust, and devotional quiet in a provincial Victorian chapel.',
    status: 'published',
    sortOrder: 1,
    media: [
      primaryImage('rose-window-morning', {
        width: 1400,
        height: 1800,
        altText: 'Light through a rose-shaped stained glass window over carved stone.',
        caption: 'Morning interior, provincial chapel.'
      })
    ]
  },
  {
    id: 'foundry-at-dusk',
    title: 'Foundry at Dusk',
    artist: 'Thomas Wycliffe Hart',
    year: 1881,
    medium: 'Oil on canvas',
    period: 'Victorian Industrial',
    summary: 'Molten iron glows against a smoke-darkened city edge.',
    description:
      'A dramatic industrial scene balancing admiration for engineering with unease about labour, soot, and the expanding Victorian city.',
    status: 'published',
    sortOrder: 2,
    media: [
      primaryImage('foundry-at-dusk', {
        width: 1800,
        height: 1200,
        altText: 'Molten iron and silhouetted workers against a smoke-darkened skyline.',
        caption: 'Industrial Victorian dusk.'
      })
    ]
  },
  {
    id: 'fern-collector',
    title: 'The Fern Collector',
    artist: 'Clara Pendleton',
    year: 1878,
    medium: 'Tempera on board',
    period: 'Victorian Aesthetic',
    summary: 'A pteridomania portrait surrounded by patterned fronds.',
    description:
      'The sitter catalogs rare ferns in a glasshouse, reflecting the Victorian appetite for botany, ornament, and domestic science.',
    status: 'published',
    sortOrder: 3,
    media: [
      primaryImage('fern-collector', {
        width: 1500,
        height: 1900,
        altText: 'A seated Victorian woman cataloging ferns in a glasshouse.',
        caption: 'Pteridomania portrait, glasshouse interior.'
      })
    ]
  },
  {
    id: 'widows-lace',
    title: "Widow's Lace at Whitby",
    artist: 'Marian Elmsworth',
    year: 1869,
    medium: 'Charcoal and white chalk',
    period: 'Victorian Social Realism',
    summary: 'A lacemaker pauses beside a harbour window.',
    description:
      'Soft chalk highlights pick out thread, weathered hands, and mourning dress in a restrained study of coastal Victorian labour.',
    status: 'published',
    sortOrder: 4,
    media: [
      primaryImage('widows-lace', {
        width: 1300,
        height: 1700,
        altText: 'A lacemaker in mourning dress beside a harbour window.',
        caption: 'Whitby harbour interior, dawn.'
      })
    ]
  },
  {
    id: 'orchid-house',
    title: 'The Orchid House',
    artist: 'Frederick Anstey Vale',
    year: 1890,
    medium: 'Albumen silver print',
    period: 'Victorian Photography',
    summary: 'A glasshouse photograph of orchids, iron ribs, and humid light.',
    description:
      'An early photographic composition that records exotic orchids and the engineered transparency of the late Victorian conservatory.',
    status: 'published',
    sortOrder: 5,
    media: [
      primaryImage('orchid-house', {
        width: 1700,
        height: 1300,
        altText: 'Orchids beneath iron conservatory ribs, soft humid light.',
        caption: 'Albumen print, late Victorian conservatory.'
      })
    ]
  }
];

async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.artworkMedia.deleteMany(),
    prisma.mediaAsset.deleteMany(),
    prisma.artwork.deleteMany()
  ]);

  for (const artwork of artworks) {
    await prisma.artwork.create({
      data: {
        id: artwork.id,
        title: artwork.title,
        artist: artwork.artist,
        year: artwork.year,
        medium: artwork.medium,
        period: artwork.period,
        summary: artwork.summary,
        description: artwork.description,
        status: artwork.status,
        sortOrder: artwork.sortOrder
      }
    });

    for (const link of artwork.media) {
      await prisma.mediaAsset.create({
        data: {
          id: link.mediaAsset.id,
          ossBucket: OSS_BUCKET,
          ossRegion: OSS_REGION,
          ossKey: link.mediaAsset.ossKey,
          mediaType: link.mediaAsset.mediaType,
          mimeType: link.mediaAsset.mimeType,
          byteSize: link.mediaAsset.byteSize,
          width: link.mediaAsset.width ?? null,
          height: link.mediaAsset.height ?? null,
          durationSeconds: link.mediaAsset.durationSeconds ?? null,
          altText: link.mediaAsset.altText ?? null,
          transcript: link.mediaAsset.transcript ?? null,
          caption: link.mediaAsset.caption ?? null
        }
      });

      await prisma.artworkMedia.create({
        data: {
          id: link.id,
          artworkId: artwork.id,
          mediaAssetId: link.mediaAsset.id,
          role: link.role,
          sortOrder: link.sortOrder
        }
      });
    }
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seed(prisma);
    process.stdout.write(`Seeded ${artworks.length} artworks\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
