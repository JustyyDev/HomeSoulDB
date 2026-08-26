# Cloudflare Setup

This repo is prepared to host both of these from the same codebase:

- `www.soulscorch.org` using Cloudflare Pages from `wiki/`
- `api.soulscorch.org` using Cloudflare Workers from `worker/`

## 1. Create Cloudflare API token

Create a token with these permissions:

- `Account` -> `Cloudflare Workers Scripts:Edit`
- `Account` -> `D1:Edit`
- `Account` -> `Workers KV Storage:Edit`
- `Zone` -> `Workers Routes:Edit`
- `Zone` -> `Pages:Edit`

Save it as GitHub secret `CLOUDFLARE_API_TOKEN`.

## 2. Get account ID

Find your Cloudflare account ID in the Cloudflare dashboard and save it as GitHub secret `CLOUDFLARE_ACCOUNT_ID`.

## 3. Create KV namespace

Run:

```powershell
npx wrangler kv namespace create COVE_CACHE
npx wrangler kv namespace create COVE_CACHE --preview
```

Put the returned IDs into [wrangler.toml](wrangler.toml).

## 4. Create D1 database

Run:

```powershell
npx wrangler d1 create homesouldb-cove
```

Put the returned database ID into [wrangler.toml](wrangler.toml).

## 5. Create Pages project

Create a Cloudflare Pages project named `homesouldb-wiki` that deploys the `wiki/` directory.

Bind your domain like this:

- `www.soulscorch.org` -> Cloudflare Pages project
- `soulscorch.org` -> optional redirect to `www.soulscorch.org`

## 6. Bind Worker route

In Cloudflare Workers routes, bind the deployed Worker to:

- `api.soulscorch.org/*`

## 7. Enable GitHub Actions deployment

After the secrets are saved, pushing to `main` will deploy:

- Worker from [worker/index.js](worker/index.js)
- Wiki from [wiki/index.html](wiki/index.html)

## 8. Point the engine to the API

Set the engine's Cove API base URL to:

```text
https://api.soulscorch.org
```

## First local bootstrap

```powershell
npm install
npx wrangler login
npx wrangler d1 migrations apply homesouldb-cove --local
npx wrangler dev
```