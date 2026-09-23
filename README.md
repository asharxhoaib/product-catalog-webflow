# product-catalog-webflow

A Webflow App that syncs an external product catalog into a Webflow CMS
Collection: OAuth install, collection bootstrap, field mapping, SKU-based
diff-sync, content-hash-deduped image upload, publish step, and a webhook that
protects manual in-Webflow edits from being overwritten.

## OAuth scopes
`sites:read`, `cms:read`, `cms:write`, `assets:read`, `assets:write`.

## Data API endpoints used
- `GET/POST /v2/sites/{siteId}/collections` — discover / create the `Products` collection
- `POST /v2/collections/{id}/fields` — generate the field schema
- `POST/PATCH /v2/collections/{id}/items` — create/update/archive items
- `POST /v2/sites/{siteId}/assets` + presigned PUT — image upload
- `POST /v2/sites/{siteId}/publish` — optional publish after sync
- `POST /v2/sites/{siteId}/webhooks` — `collection_item_changed`, `app_uninstall`

Example (create item):
```bash
curl -X POST https://api.webflow.com/v2/collections/$COLLECTION_ID/items \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"fieldData":{"name":"Aurora Desk Lamp","slug":"aurora-desk-lamp","sku":"SKU-1001","price":59}}'
```

## Sync algorithm
1. Fetch source catalog (`server/services/source-schema.ts`, mock fixture by default).
2. Hash each source record; compare to `synced_items.last_source_hash` keyed by SKU.
3. Unchanged → skipped. New → created. Changed → updated. Missing from source → archived (`isArchived: true`, never hard-deleted).
4. Items flagged `manual_override` (set by the webhook when a non-sync edit is detected) are skipped so owner edits survive.
5. Images: downloaded, SHA-256 hashed, uploaded once via presigned URL; re-syncs reuse the stored asset id.
6. Dry-run mode computes counts without writing or uploading.

## Rate-limit strategy
Per-site token bucket (60 req/min) in `webflow-client.ts`; HTTP 429 triggers exponential backoff honoring `Retry-After` (up to 3 retries).

## Uninstall
`POST /webhooks/app-uninstalled` clears tokens, mapping config, synced-item mirror, and asset cache. CMS items already written stay in the site.

## Local dev
`cp .env.example .env`, fill in OAuth credentials, expose the server via a tunnel (e.g. ngrok) so Webflow webhooks can reach it. Source-only repo: no install/build/test was run.
