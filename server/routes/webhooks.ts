import { Router } from "express";
import { db } from "../db";

const router = Router();

/** Fires when any CMS item changes on the site. If the changed item is one we synced and the
 * change did not originate from our own sync (its hash no longer matches), flag it as a
 * manual override so the next sync doesn't clobber the owner's edit. */
router.post("/collection-item-changed", (req, res) => {
  const payload = req.body?.payload as { siteId?: string; id?: string } | undefined;
  res.status(200).json({ received: true });
  if (!payload?.siteId || !payload?.id) return;

  const row = db
    .prepare(`SELECT id FROM synced_items WHERE site_id = ? AND cms_item_id = ?`)
    .get(payload.siteId, payload.id) as { id: string } | undefined;
  if (!row) return;

  // Ignore echoes of our own writes: sync updates touch updated_at within the last few seconds.
  const recent = db
    .prepare(`SELECT 1 FROM synced_items WHERE id = ? AND updated_at >= datetime('now', '-10 seconds')`)
    .get(row.id);
  if (recent) return;

  db.prepare(`UPDATE synced_items SET manual_override = 1 WHERE id = ?`).run(row.id);
});

router.post("/app-uninstalled", (req, res) => {
  const siteId = req.body?.payload?.siteId as string | undefined;
  if (!siteId) {
    res.status(400).json({ error: "Missing siteId" });
    return;
  }
  db.prepare(`DELETE FROM mapping_configs WHERE site_id = ?`).run(siteId);
  db.prepare(`DELETE FROM synced_items WHERE site_id = ?`).run(siteId);
  db.prepare(`DELETE FROM image_assets WHERE site_id = ?`).run(siteId);
  db.prepare(`UPDATE installations SET access_token = '', uninstalled_at = datetime('now') WHERE site_id = ?`).run(siteId);
  res.status(200).json({ ok: true });
});

export default router;
