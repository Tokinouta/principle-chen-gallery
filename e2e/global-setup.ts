import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export default async function globalSetup(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..');
  const apiDir = resolve(repoRoot, 'apps/api');
  const dbPath = resolve(apiDir, 'prisma/e2e.db');
  const databaseUrl = 'file:./e2e.db';

  if (existsSync(dbPath)) {
    rmSync(dbPath);
  }

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    ALIYUN_OSS_REGION: process.env.ALIYUN_OSS_REGION ?? 'oss-cn-hangzhou',
    ALIYUN_OSS_BUCKET: process.env.ALIYUN_OSS_BUCKET ?? 'galleria-principii-media'
  };

  execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
    cwd: apiDir,
    stdio: 'inherit',
    env
  });

  execSync('npx tsx prisma/seed.ts', {
    cwd: apiDir,
    stdio: 'inherit',
    env
  });
}
