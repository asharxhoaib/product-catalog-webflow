import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { db } from "../db";
import { webflowClient } from "./webflow-client";

/** Downloads a source image, dedupes by content hash against previously uploaded assets
 * for this site, and returns the Webflow asset id to reference from a CMS item's image field. */
export async function ensureImageAsset(siteId: string, imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download image ${imageUrl}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");

  const existing = db
    .prepare(`SELECT webflow_asset_id FROM image_assets WHERE site_id = ? AND content_hash = ?`)
    .get(siteId, contentHash) as { webflow_asset_id: string } | undefined;

  if (existing) return existing.webflow_asset_id;

  const fileName = imageUrl.split("/").pop() || `${contentHash}.jpg`;
  const presigned = await webflowClient.requestAssetUpload(siteId, fileName, contentHash);
  await webflowClient.uploadToPresignedUrl(presigned.uploadUrl, presigned.uploadDetails, buffer);

  db.prepare(
    `INSERT INTO image_assets (id, site_id, content_hash, source_url, webflow_asset_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(uuid(), siteId, contentHash, imageUrl, presigned.assetId);

  return presigned.assetId;
}
