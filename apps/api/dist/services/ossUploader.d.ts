import type { OssConfig } from '../config/env.js';
export interface OssUploader {
    head(ossKey: string): Promise<boolean>;
    put(ossKey: string, localPath: string, contentType: string): Promise<void>;
}
export declare class AliyunOssUploader implements OssUploader {
    private readonly client;
    constructor(config: OssConfig);
    head(ossKey: string): Promise<boolean>;
    put(ossKey: string, localPath: string, contentType: string): Promise<void>;
}
export declare class StubOssUploader implements OssUploader {
    readonly heads: string[];
    readonly puts: Array<{
        ossKey: string;
        localPath: string;
        contentType: string;
    }>;
    private readonly present;
    private readonly queuedErrors;
    preseedPresent(...ossKeys: string[]): void;
    queuePutError(error: Error): void;
    queueHeadError(error: Error): void;
    head(ossKey: string): Promise<boolean>;
    put(ossKey: string, localPath: string, contentType: string): Promise<void>;
    private takeQueued;
}
export declare function createOssUploader(config: OssConfig): OssUploader;
