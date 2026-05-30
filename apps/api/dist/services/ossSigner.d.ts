import type { OssConfig } from '../config/env.js';
export type SignedObject = {
    url: string;
    expiresAt: string;
};
export interface OssSigner {
    signGetUrl(ossKey: string): Promise<SignedObject | null>;
}
export declare class NullOssSigner implements OssSigner {
    signGetUrl(): Promise<SignedObject | null>;
}
export declare class AliyunOssSigner implements OssSigner {
    private readonly client;
    private readonly ttlSeconds;
    constructor(config: OssConfig);
    signGetUrl(ossKey: string): Promise<SignedObject | null>;
}
export declare function createOssSigner(config: OssConfig): OssSigner;
