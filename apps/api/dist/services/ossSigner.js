import OSS from 'ali-oss';
export class NullOssSigner {
    async signGetUrl() {
        return null;
    }
}
export class AliyunOssSigner {
    client;
    ttlSeconds;
    constructor(config) {
        if (!config.credentials) {
            throw new Error('AliyunOssSigner requires OSS credentials');
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
        this.ttlSeconds = config.signedUrlTtlSeconds;
    }
    async signGetUrl(ossKey) {
        try {
            const url = this.client.signatureUrl(ossKey, {
                expires: this.ttlSeconds,
                method: 'GET'
            });
            const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000).toISOString();
            return { url, expiresAt };
        }
        catch {
            return null;
        }
    }
}
export function createOssSigner(config) {
    if (!config.credentials) {
        return new NullOssSigner();
    }
    return new AliyunOssSigner(config);
}
//# sourceMappingURL=ossSigner.js.map