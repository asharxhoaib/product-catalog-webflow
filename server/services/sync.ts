import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { db } from "../db";
import { webflowClient } from "./webflow-client";
import { fetchSourceCatalog } from "./source-schema";
import { ensureImageAsset } from "./images";
import { FieldMapping, MappingConfig, SourceProduct } from "../../shared/types";

function hashRecord(product: SourceProduct): string {
  return crypto.createHash("sha256").update(JSON.stringify(product)).digest("hex");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildFieldData(product: SourceProduct, fieldMap: FieldMapping, imageAssetId: string | null): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [cmsField, sourceField] of Object.entries(fieldMap)) {
    if (cmsField === "image") continue; // handled separately via imageAssetId
    data[cmsField] = product[sourceField as keyof SourceProduct];
  }
  if (!data.slug) data.slug = slugify(product.name);
  if (imageAssetId && fieldMap.image) data.image = { fileId: imageAssetId };
  return data;
}

function getMappingConfig(siteId: string): MappingConfig {
  const row = db.prepare(`SELECT * FROM mapping_configs WHERE site_id = ?`).get(siteId) as
    | { id: string; site_id: string; collection_id: string; field_map_json: string; dry_run: number }
    | undefined;
  if (!row) throw new Error(`No mapping config saved for site ${siteId}. Configure it in the App Panel first.`);
  return {
    id: row.id,
    siteId: row.site_id,
    collectionId: row.collection_id,
    fieldMap: JSON.parse(row.field_map_json),
    dryRun: Boolean(row.dry_run),
  };
}

/** Pulls the source catalog, diffs against previously synced items by SKU, and
 * batches creates/updates/archives against the Data API. Returns the sync-run id. */
export async function runSync(siteId: string, overrideDryRun?: boolean): Promise<string> {
  const config = getMappingConfig(siteId);
  const dryRun = overrideDryRun ?? config.dryRun;

  const runId = uuid();
  db.prepare(
    `INSERT INTO sync_runs (id, site_id, status, dry_run) VALUES (?, ?, 'running', ?)`
  ).run(runId, siteId, dryRun ? 1 : 0);

  let created = 0;
  let updated = 0;
  let archived = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const sourceProducts = await fetchSourceCatalog();
    const sourceBySku = new Map(sourceProducts.map((p) => [p.sku, p]));

    const existingRows = db
      .prepare(`SELECT * FROM synced_items WHERE site_id = ? AND archived = 0`)
      .all(siteId) as Array<{ id: string; sku: string; cms_item_id: string | null; last_source_hash: string; manual_override: number }>;
    const existingBySku = new Map(existingRows.map((r) => [r.sku, r]));

    // Create/update pass
    for (const product of sourceProducts) {
      try {
        const newHash = hashRecord(product);
        const existing = existingBySku.get(product.sku);

        if (existing && existing.last_source_hash === newHash) {
          skipped++;
          continue;
        }

        if (existing && existing.manual_override) {
          // A manual in-Webflow edit was detected for this item; skip auto-overwrite to
          // avoid clobbering the site owner's price/description override.
          skipped++;
          continue;
        }

        let imageAssetId: string | null = null;
        if (config.fieldMap.image && !dryRun) {
          imageAssetId = await ensureImageAsset(siteId, product.imageUrl);
        }

        const fieldData = buildFieldData(product, config.fieldMap, imageAssetId);

        if (dryRun) {
          existing ? updated++ : created++;
          continue;
        }

        if (existing?.cms_item_id) {
          await webflowClient.updateItem(siteId, config.collectionId, existing.cms_item_id, { fieldData });
          db.prepare(
            `UPDATE synced_items SET last_source_hash = ?, updated_at = datetime('now') WHERE id = ?`
          ).run(newHash, existing.id);
          updated++;
        } else {
          const created_ = await webflowClient.createItem(siteId, config.collectionId, { fieldData });
          db.prepare(
            `INSERT INTO synced_items (id, site_id, sku, cms_item_id, last_source_hash)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(site_id, sku) DO UPDATE SET cms_item_id = excluded.cms_item_id, last_source_hash = excluded.last_source_hash, updated_at = datetime('now')`
          ).run(uuid(), siteId, product.sku, created_.id, newHash);
          created++;
        }
      } catch (err) {
        errors.push(`${product.sku}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Archive pass: items previously synced but no longer present in the source catalog.
    for (const row of existingRows) {
      if (sourceBySku.has(row.sku)) continue;
      try {
        if (!dryRun && row.cms_item_id) {
          await webflowClient.updateItem(siteId, config.collectionId, row.cms_item_id, {
            fieldData: {},
            isArchived: true,
          });
          db.prepare(`UPDATE synced_items SET archived = 1, updated_at = datetime('now') WHERE id = ?`).run(row.id);
        }
        archived++;
      } catch (err) {
        errors.push(`${row.sku} (archive): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    db.prepare(
      `UPDATE sync_runs SET status = 'completed', created_count = ?, updated_count = ?, archived_count = ?, skipped_count = ?, error_json = ?, finished_at = datetime('now')
       WHERE id = ?`
    ).run(created, updated, archived, skipped, JSON.stringify(errors), runId);
  } catch (err) {
    db.prepare(
      `UPDATE sync_runs SET status = 'failed', error_json = ?, finished_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify([...errors, err instanceof Error ? err.message : String(err)]), runId);
  }

  return runId;
}

export async function publishAfterSync(siteId: string): Promise<void> {
  await webflowClient.publishSite(siteId, []);
}
