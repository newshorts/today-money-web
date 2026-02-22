# Local Development — today-money-web

## Prereqs
- Docker (for Next.js container runtime)
- Postgres container `db_todaymoney` must be running and reachable by hostname from this container.

## Environment
Copy `.env.example` to `.env` and update secrets.

Key:
- `DATABASE_URL=postgresql://today:money@db_todaymoney:5432/todaymoney?schema=public`

## Running locally
Typical flows:
1. Install deps
2. `prisma generate`
3. `prisma migrate deploy` (or `migrate dev`)
4. Start Next.js

If using Docker:
- Build with `Dockerfile.dev`.
- Run the container on the same docker network as `db_todaymoney` so hostname resolution works.

Example (replace `YOUR_NETWORK`):
```bash
docker build -f Dockerfile.dev -t today-money-web-dev .
docker run --rm -it \
  -p 3000:3000 \
  --env-file .env \
  --network YOUR_NETWORK \
  today-money-web-dev
```

## Plaid Sandbox
Use `PLAID_ENV=sandbox` and sandbox credentials.

For webhook testing in local dev:
- Tunnel `POST /api/v1/plaid/webhook` using ngrok/cloudflared and set `PLAID_WEBHOOK_URL` accordingly.

## iOS Simulator connectivity
If the iOS app is pointing at a local backend:
- Use `http://localhost:<port>` for Simulator.
- Real device on LAN requires machine IP (ATS exceptions may be needed in iOS).
