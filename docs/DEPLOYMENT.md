# Production Deployment

Galleria Principii ships as a single Docker image plus an nginx reverse proxy.
This document is the operator runbook for deploying to an Aliyun ECS host.

## Topology

- API (`apps/api`) — Fastify + Prisma + SQLite. One process, one container.
- Web (`apps/web`) — Vite/React static bundle. Built into the same image; nginx serves it from a shared volume.
- nginx — Public entrypoint on `:80`. Reverse-proxies `/api/*` to API and serves the SPA for everything else.
- Litestream — Continuously replicates `/data/prod.db` to a private OSS bucket.
- OSS media bucket — Stores artwork media. API issues short-lived signed URLs.

This deployment is single-instance only. SQLite cannot be shared between hosts; horizontal scaling requires migrating to PostgreSQL first.

## Prerequisites

### Aliyun resources

1. **ECS instance** — Ubuntu 22.04 or 24.04, x86_64, at least 2 vCPU / 2 GiB RAM, with a data disk of at least 20 GiB. Open inbound TCP `80` (and `22` for SSH) in the security group.
2. **Container Registry namespace** — already set up at `crpi-8rw8lz2mj8ksyb8x.cn-beijing.personal.cr.aliyuncs.com/rarara/my-image-registry`. Issue a registry password from the ACR console (Instance → Access Credential).
3. **OSS media bucket** — private bucket holding artwork media (e.g. `galleria-principii-media` in `oss-cn-beijing`). Already provisioned for the dev environment.
4. **OSS backups bucket** — separate private bucket (e.g. `galleria-principii-backups`) for Litestream replication. Distinct from the media bucket to keep blast-radius small.
5. **RAM users (two)** —
   - API reader: `oss:GetObject` on the media bucket only.
   - Litestream writer: `oss:PutObject`, `oss:GetObject`, `oss:DeleteObject`, `oss:ListObjects` on the backups bucket only.

### Host setup (one-time)

```sh
# As root on the ECS host
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Mount the data disk at /var/lib/docker/volumes (or wherever you want the
# `galleria-data` volume to live). Skip if you only have a single disk.

systemctl enable --now docker
docker login crpi-8rw8lz2mj8ksyb8x.cn-beijing.personal.cr.aliyuncs.com
```

## Initial deploy

### 1. Clone the repo onto the host

The repository ships the compose file and nginx config; only those two are needed at runtime. The application code itself ships in the image.

```sh
git clone https://github.com/<your-org>/galleria-principii.git /opt/galleria
cd /opt/galleria
```

### 2. Write `.env.production`

```sh
cp .env.production.example .env.production
chmod 600 .env.production
$EDITOR .env.production
```

Required keys (see `.env.production.example` for the full list):

| Variable | Purpose |
| --- | --- |
| `API_IMAGE` | Full image reference. CI updates this to a SHA on each release; the default `:latest` works for manual ops. |
| `ALIYUN_OSS_REGION`, `ALIYUN_OSS_BUCKET` | Media bucket. |
| `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | API reader RAM key. |
| `ALIYUN_OSS_SIGNED_URL_TTL_SECONDS` | Optional; defaults to 900. |
| `LITESTREAM_OSS_BUCKET`, `LITESTREAM_OSS_PATH` | Backups bucket and key prefix. |
| `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_ACCESS_KEY_SECRET` | Litestream writer RAM key. |
| `LOG_LEVEL` | Optional; `info` by default. Set to `off` to silence the Fastify logger. |

### 3. Pull and start

```sh
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f api
```

The `api` container runs `prisma migrate deploy` at startup (idempotent) before starting the server. The `web-assets` one-shot container copies the bundled web assets into the `galleria-web` volume; nginx serves them from there.

Verify:

```sh
curl -fsS http://127.0.0.1/health     # proxied to api /health
curl -fsS http://127.0.0.1/api/artworks | head -c 200
curl -fsSI http://127.0.0.1/ | head -1 # SPA index.html
```

### 4. Seed initial catalogue (one-time)

The bundled seed script wipes and re-inserts demo data and should never run in production. Use the `add-artwork` CLI inside the API container to ingest real manifests:

```sh
# Copy your manifest and media into the running container, then ingest.
docker cp ./my-artwork.json galleria-api:/tmp/
docker cp ./hero.png         galleria-api:/tmp/
docker compose exec api node apps/api/dist/cli/addArtwork.js /tmp/my-artwork.json
```

(Or run the CLI from your workstation against a temporary `DATABASE_URL` that points at a copy of the live DB pulled via Litestream.)

## Releases

CI publishes a new image to ACR on every push to `main`. Two tags are written: `:<short-sha>` and `:latest`.

To deploy a specific release on the ECS host:

```sh
cd /opt/galleria
git pull                                    # picks up new compose/nginx changes
sed -i "s|^API_IMAGE=.*|API_IMAGE=crpi-8rw8lz2mj8ksyb8x.cn-beijing.personal.cr.aliyuncs.com/rarara/my-image-registry:abc1234|" .env.production
docker compose pull api web-assets
docker compose up -d --no-deps api web-assets
docker compose exec api node -e "fetch('http://127.0.0.1:3000/health').then(r=>console.log(r.status))"
```

Rollback is the same flow with the previous SHA. The DB schema is migrated forward only; if a migration is incompatible with the previous image, roll the migration back manually before downgrading.

### Required GitHub secrets

The release workflow needs two repository secrets:

| Secret | Value |
| --- | --- |
| `ACR_USERNAME` | Aliyun account name shown in the ACR console (the `--username` value from the `docker login` snippet, e.g. `碣石潇湘无限路`). |
| `ACR_PASSWORD` | Registry password set in the ACR console (Instance → Access Credential). |

## Backups and restore

Litestream replicates `prod.db` to OSS every 10 seconds with a 24-hour snapshot cadence and 7-day retention (`docker/litestream.yml`). To list available generations:

```sh
docker compose run --rm --entrypoint litestream litestream \
  snapshots -config /etc/litestream.yml /data/prod.db
```

To restore into a fresh host:

```sh
# Stop the API so nothing writes to the DB while restoring.
docker compose stop api

# Run a one-shot litestream restore. The container already has the OSS
# credentials via .env.production and the same config file.
docker compose run --rm --entrypoint litestream litestream \
  restore -config /etc/litestream.yml -o /data/prod.db /data/prod.db

docker compose start api
```

Test the restore procedure quarterly against a throwaway VM. A backup that has never been restored is not a backup.

## Operations cheatsheet

```sh
docker compose ps                       # service status
docker compose logs -f api              # follow API logs
docker compose logs -f nginx            # follow nginx access/error logs
docker compose exec api sh              # shell into the API container
docker compose restart api              # restart just the API
docker compose down                     # stop everything (volumes preserved)
docker compose down -v                  # WIPE volumes including the SQLite DB

docker volume ls | grep galleria        # locate the data volume
docker run --rm -v galleria-principii_galleria-data:/data \
  alpine ls -lh /data                   # inspect DB file size
```

### Health and monitoring

- `/health` is served by Fastify and proxied by nginx with access logs suppressed.
- The API container has a Docker `HEALTHCHECK` that polls `/health`; `docker compose ps` shows `(healthy)`.
- Fastify logs to stdout when `LOG_LEVEL` is set; collect logs with `docker compose logs` or ship them via a Docker log driver (Aliyun SLS, Loki, etc.).
- OSS access patterns are observable in the Aliyun OSS console (bucket → Logging).

### Rotating secrets

1. Issue a new RAM key in the Aliyun console.
2. Update the corresponding variable in `.env.production`.
3. `docker compose up -d api` (re-creates the container with the new env) or `docker compose up -d litestream` for the backup key.
4. Disable the old RAM key after confirming the new container is healthy.

Never check `.env.production` into git. The repository's `.gitignore` already blocks it.

## Going further

- **TLS** — front the host with Aliyun SLB (recommended) or add a certbot sidecar and a `443` listener in `docker/nginx/nginx.conf`. The current setup is HTTP-only on purpose; revisit before exposing to the public internet.
- **Domain** — point an A record at the ECS public IP and add `server_name your.domain` to the nginx config.
- **PostgreSQL** — required before horizontal scaling. See `docs/DESIGN.md` and the Prisma migration notes; the schema is intentionally portable but the migrations on disk are SQLite-flavored and must be regenerated.
- **Media uploads** — the `add-artwork` CLI uploads directly to OSS. For production, prefer STS-issued temporary credentials over a long-lived RAM key on operator laptops.
