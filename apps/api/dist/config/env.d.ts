export type OssCredentials = {
    accessKeyId: string;
    accessKeySecret: string;
    stsToken?: string;
};
export type OssConfig = {
    region: string;
    bucket: string;
    endpoint?: string;
    signedUrlTtlSeconds: number;
    credentials: OssCredentials | null;
};
export type AppConfig = {
    databaseUrl: string;
    oss: OssConfig;
};
export declare function loadConfig(): AppConfig;
