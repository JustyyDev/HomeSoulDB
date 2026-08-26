# HomeSoulDB

HomeSoulDB now hosts two public-facing surfaces from the same repo:

- the SoulScorch Engine wiki for `www.soulscorch.org`
- the HomeSoul Cove API for `api.soulscorch.org`

## Repo layout

- `wiki/`: static site for Cloudflare Pages
- `worker/`: Cloudflare Worker for HomeSoul Cove presence, chat, voice-room metadata, and catalog access
- `data/`: catalog, moderation, schema, and persisted local dev state
- `scripts/`: GitHub Actions validation and catalog compilation
- `server/`: local Node fallback server for development only

## Quick deploy plan

1. Create a Cloudflare Pages project from this repo with `wiki` as the output directory.
2. Deploy the Worker with Wrangler and bind it to `api.soulscorch.org`.
3. Fill in the D1 and KV IDs in [wrangler.toml](wrangler.toml).
4. Keep GitHub Actions validating and publishing `data/catalog.json`.

## HomeSoul Cove fields

Catalog entries may include the following Cove-specific metadata:

- `boothText`: short billboard copy for in-world marketplace stands.
- `boothTheme`: visual style hint for stand presentation.
- `compatibleModes`: runtime contexts such as `singleplayer` or `plaza-multiplayer`.
- `supportsTextChat`: whether the project is intended to participate in plaza chat flows.
- `supportsVoiceChat`: whether the project expects a compatible signaling or voice backend.
- `supportsAvatarShowcase`: whether the listing highlights custom avatar or character presentation.
- `supportsJamShowcase`: whether the project fits mod jam or game jam exhibition spaces.

## Moderation

Publishing rules are defined in [data/moderation.json](data/moderation.json) and enforced by [scripts/validate_and_compile.js](scripts/validate_and_compile.js). Billboard text is intentionally short so 3D stands stay readable in HomeSoul Cove.

## Commands

- `npm run check:catalog`
- `npm run check:server`
- `npm run check:worker`
- `npm run deploy:wiki`
- `npm run deploy:worker`