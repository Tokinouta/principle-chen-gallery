import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import OSS from 'ali-oss';
export class AliyunOssUploader {
    client;
    constructor(config) {
        if (!config.credentials) {
            throw new Error('AliyunOssUploader requires OSS credentials');
        }
        this.client = new OSS({
            region: config.region,
            bucket: config.bucket,
            endpoint: config.endpoint,
            accessKeyId: config.credentials.accessKeyId,
            accessKeySecret: config.credentials.accessKeySecret,
            stsToken: config.credentials.stsToken,
            secure: true
        });
    }
    async head(ossKey) {
        try {
            await this.client.head(ossKey);
            return true;
        }
        catch (error) {
            if (isNotFoundError(error)) {
                return false;
            }
            throw error;
        }
    }
    async put(ossKey, localPath, contentType) {
        const fileStat = await stat(localPath);
        const stream = createReadStream(localPath);
        const options = {
            contentLength: fileStat.size,
            mime: contentType
        };
        await this.client.putStream(ossKey, stream, options);
    }
}
function isNotFoundError(error) {
    if (typeof error !== 'object' || error === null) {
        return false;
    }
    const candidate = error;
    if (candidate.status === 404)
        return true;
    if (candidate.code === 'NoSuchKey')
        return true;
    if (candidate.name === 'NoSuchKeyError')
        return true;
    return false;
}
export class StubOssUploader {
    heads = [];
    puts = [];
    present = new Set();
    queuedErrors = [];
    preseedPresent(...ossKeys) {
        for (const key of ossKeys) {
            this.present.add(key);
        }
    }
    queuePutError(error) {
        this.queuedErrors.push({ kind: 'put', error });
    }
    queueHeadError(error) {
        this.queuedErrors.push({ kind: 'head', error });
    }
    async head(ossKey) {
        this.heads.push(ossKey);
        const queued = this.takeQueued('head');
        if (queued)
            throw queued;
        return this.present.has(ossKey);
    }
    async put(ossKey, localPath, contentType) {
        const queued = this.takeQueued('put');
        if (queued)
            throw queued;
        this.puts.push({ ossKey, localPath, contentType });
        this.present.add(ossKey);
    }
    takeQueued(kind) {
        const index = this.queuedErrors.findIndex((entry) => entry.kind === kind);
        if (index === -1)
            return null;
        const [entry] = this.queuedErrors.splice(index, 1);
        return entry.error;
    }
}
export function createOssUploader(config) {
    if (!config.credentials) {
        throw new Error('OSS credentials required');
    }
    return new AliyunOssUploader(config);
}
//# sourceMappingURL=ossUploader.js.map