// Shared types used by both the server and the designer-extension App Panel.

/** Shape of a record coming from the mock external product-source API. */
export interface SourceProduct {
  sku: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  stockStatus: "in_stock" | "out_of_stock" | "backorder";
  category: string;
  imageUrl: string;
}

export const CMS_FIELD_SCHEMA = [
  { slug: "name", displayName: "Name", type: "PlainText" },
  { slug: "slug", displayName: "Slug", type: "PlainText" },
  { slug: "sku", displayName: "SKU", type: "PlainText" },
  { slug: "price", displayName: "Price", type: "Number" },
  { slug: "currency", displayName: "Currency", type: "PlainText" },
  { slug: "stock-status", displayName: "Stock Status", type: "PlainText" },
  { slug: "image", displayName: "Image", type: "ImageRef" },
  { slug: "category", displayName: "Category", type: "PlainText" },
  { slug: "description", displayName: "Description", type: "RichText" },
] as const;

export type CmsFieldSlug = (typeof CMS_FIELD_SCHEMA)[number]["slug"];

export type FieldMapping = Partial<Record<CmsFieldSlug, keyof SourceProduct>>;

export interface MappingConfig {
  id: string;
  siteId: string;
  collectionId: string;
  fieldMap: FieldMapping;
  dryRun: boolean;
}

export interface SyncRunSummary {
  id: string;
  siteId: string;
  status: "running" | "completed" | "failed";
  dryRun: boolean;
  createdCount: number;
  updatedCount: number;
  archivedCount: number;
  skippedCount: number;
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
}
