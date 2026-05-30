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

const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;

function readString(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function requireString(name: string): string {
  const value = readString(name);
  if (!value) {
    throw new Error(`Required environment variable ${name} is missing or empty`);
  }
  return value;
}

function readSignedUrlTtlSeconds(): number {
  const raw = readString('ALIYUN_OSS_SIGNED_URL_TTL_SECONDS');
  if (!raw) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `ALIYUN_OSS_SIGNED_URL_TTL_SECONDS must be a positive integer, received "${raw}"`
    );
  }
  return parsed;
}

function readCredentials(): OssCredentials | null {
  const accessKeyId = readString('ALIBABA_CLOUD_ACCESS_KEY_ID');
  const accessKeySecret = readString('ALIBABA_CLOUD_ACCESS_KEY_SECRET');
  if (!accessKeyId || !accessKeySecret) {
    return null;
  }
  const stsToken = readString('ALIBABA_CLOUD_SECURITY_TOKEN');
  return stsToken ? { accessKeyId, accessKeySecret, stsToken } : { accessKeyId, accessKeySecret };
}

export function loadConfig(): AppConfig {
  return {
    databaseUrl: requireString('DATABASE_URL'),
    oss: {
      region: requireString('ALIYUN_OSS_REGION'),
      bucket: requireString('ALIYUN_OSS_BUCKET'),
      endpoint: readString('ALIYUN_OSS_ENDPOINT'),
      signedUrlTtlSeconds: readSignedUrlTtlSeconds(),
      credentials: readCredentials()
    }
  };
}
