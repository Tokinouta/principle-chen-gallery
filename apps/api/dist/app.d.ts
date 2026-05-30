import Fastify from 'fastify';
import { type AppConfig } from './config/env.js';
import type { ArtworkRepository } from './repositories/artworkRepository.js';
import { type OssSigner } from './services/ossSigner.js';
export type AppDeps = {
    config?: AppConfig;
    repository?: ArtworkRepository;
    signer?: OssSigner;
};
export declare function buildApp(deps?: AppDeps): Fastify.FastifyInstance<import("node:http").Server<typeof import("node:http").IncomingMessage, typeof import("node:http").ServerResponse>, import("node:http").IncomingMessage, import("node:http").ServerResponse<import("node:http").IncomingMessage>, Fastify.FastifyBaseLogger, Fastify.FastifyTypeProviderDefault> & PromiseLike<Fastify.FastifyInstance<import("node:http").Server<typeof import("node:http").IncomingMessage, typeof import("node:http").ServerResponse>, import("node:http").IncomingMessage, import("node:http").ServerResponse<import("node:http").IncomingMessage>, Fastify.FastifyBaseLogger, Fastify.FastifyTypeProviderDefault>> & {
    __linterBrands: "SafePromiseLike";
};
