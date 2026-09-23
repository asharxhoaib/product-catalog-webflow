import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db";
import { webflowClient } from "../services/webflow-client";
import { runSync, publishAfterSync } from "../services/sync";
import { CMS_FIELD_SCHEMA } from "../../shared/types";

const router = Router();

router.get("/sites/:siteId/collections", async (req, res) => {
  try {
    res.json(await webflowClient.listCollections(req.params.siteId));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Auto-creates a `Products` collection with the generated field schema. */
router.post("/sites/:siteId/collections/bootstrap", async (req, res) => {
  try {
    const collection = await webflowClient.createCollection(req.params.siteId, "Products", "products");
    for (const field of CMS_FIELD_SCHEMA) {
      if (field.slug === "name" || field.slug === "slug") continue; // built-in on every collection
      await webflowClient.createField(req.params.siteId, collection.id, {
        displayName: field.displayName,
        type: field.type,
      });
    }
    res.status(201).json(collection);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/sites/:siteId/mapping", (req, res) => {
  const row = db.prepare(`SELECT * FROM mapping_configs WHERE site_id = ?`).get(req.params.siteId);
  res.json({ mapping: row ?? null });
});

router.put("/sites/:siteId/mapping", (req, res) => {
  const { collectionId, fieldMap, dryRun } = req.body as {
    collectionId: string;
    fieldMap: Record<string, string>;
    dryRun?: boolean;
  };
  if (!collectionId || !fieldMap) {
    res.status(400).json({ error: "collectionId and fieldMap are required" });
    return;
  }
  db.prepare(
    `INSERT INTO mapping_configs (id, site_id, collection_id, field_map_json, dry_run)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(site_id) DO UPDATE SET collection_id = excluded.collection_id, field_map_json = excluded.field_map_json,
       dry_run = excluded.dry_run, updated_at = datetime('now')`
  ).run(uuid(), req.params.siteId, collectionId, JSON.stringify(fieldMap), dryRun ? 1 : 0);
  res.json({ ok: true });
});

router.post("/sites/:siteId/sync", async (req, res) => {
  try {
    const { dryRun, publish } = req.body as { dryRun?: boolean; publish?: boolean };
    const runId = await runSync(req.params.siteId, dryRun);
    if (publish && !dryRun) await publishAfterSync(req.params.siteId);
    res.json({ runId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/sites/:siteId/sync-runs", (req, res) => {
  const runs = db
    .prepare(`SELECT * FROM sync_runs WHERE site_id = ? ORDER BY started_at DESC LIMIT 50`)
    .all(req.params.siteId);
  res.json({ runs });
});

export default router;
