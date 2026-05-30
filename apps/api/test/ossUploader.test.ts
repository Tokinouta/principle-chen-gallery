import { describe, expect, it } from 'vitest';

import type { OssConfig } from '../src/config/env';
import { AliyunOssUploader, StubOssUploader, createOssUploader } from '../src/services/ossUploader';

function configWith(credentials: OssConfig['credentials']): OssConfig {
  return {
    region: 'oss-cn-hangzhou',
    bucket: 'test-bucket',
    signedUrlTtlSeconds: 900,
    credentials
  };
}

describe('StubOssUploader', () => {
  it('head returns false by default and true for preseeded keys', async () => {
    const stub = new StubOssUploader();
    expect(await stub.head('artworks/x/media/y/original.jpg')).toBe(false);
    stub.preseedPresent('artworks/x/media/y/original.jpg');
    expect(await stub.head('artworks/x/media/y/original.jpg')).toBe(true);
    expect(stub.heads).toEqual([
      'artworks/x/media/y/original.jpg',
      'artworks/x/media/y/original.jpg'
    ]);
  });

  it('put records the call, resolves, and subsequent head returns true for that key', async () => {
    const stub = new StubOssUploader();
    await stub.put('artworks/a/media/b/original.mp3', '/tmp/local.mp3', 'audio/mpeg');
    expect(stub.puts).toEqual([
      { ossKey: 'artworks/a/media/b/original.mp3', localPath: '/tmp/local.mp3', contentType: 'audio/mpeg' }
    ]);
    expect(await stub.head('artworks/a/media/b/original.mp3')).toBe(true);
  });

  it('queued put error is thrown exactly once then subsequent puts succeed', async () => {
    const stub = new StubOssUploader();
    stub.queuePutError(new Error('boom'));
    await expect(stub.put('k1', '/tmp/a', 'image/jpeg')).rejects.toThrow('boom');
    await expect(stub.put('k2', '/tmp/b', 'image/jpeg')).resolves.toBeUndefined();
    expect(stub.puts).toEqual([
      { ossKey: 'k2', localPath: '/tmp/b', contentType: 'image/jpeg' }
    ]);
  });

  it('records each head call in order', async () => {
    const stub = new StubOssUploader();
    await stub.head('k1');
    await stub.head('k2');
    expect(stub.heads).toEqual(['k1', 'k2']);
  });
});

describe('createOssUploader', () => {
  it('returns an AliyunOssUploader when credentials are present', () => {
    const uploader = createOssUploader(
      configWith({ accessKeyId: 'AKID', accessKeySecret: 'SECRET' })
    );
    expect(uploader).toBeInstanceOf(AliyunOssUploader);
  });

  it('throws when credentials are missing', () => {
    expect(() => createOssUploader(configWith(null))).toThrow(/OSS credentials required/);
  });
});

describe('AliyunOssUploader', () => {
  it('throws at construction time if credentials are missing', () => {
    expect(() => new AliyunOssUploader(configWith(null))).toThrow(/requires OSS credentials/);
  });
});
