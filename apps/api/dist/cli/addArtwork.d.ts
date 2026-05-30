import type { PrismaClient } from '@prisma/client';
import { type OssUploader } from '../services/ossUploader.js';
import { type ManifestErrorCategory } from './manifest.js';
export type RunCategory = ManifestErrorCategory | 'config-missing' | 'oss-credentials-missing' | 'oss-upload-failed' | 'db-unavailable' | 'db-transaction-failed' | 'unknown';
export type RunOptions = {
    manifestPath: string;
    dryRun: boolean;
    verbose: boolean;
    prisma: PrismaClient | null;
    uploader: OssUploader | null;
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
};
export declare function runAddArtwork(options: RunOptions): Promise<number>;
