import { SourceProduct } from "../../shared/types";

/** Mock external catalog source. In production, `fetchSourceCatalog` would call
 * `process.env.SOURCE_CATALOG_URL`; here it returns a representative in-memory fixture
 * so the sync engine, diffing, and mapping logic are exercised without a live dependency. */
const MOCK_CATALOG: SourceProduct[] = [
  {
    sku: "SKU-1001",
    name: "Aurora Desk Lamp",
    description: "A minimalist LED desk lamp with adjustable warmth and a weighted base.",
    price: 59.0,
    currency: "USD",
    stockStatus: "in_stock",
    category: "Lighting",
    imageUrl: "https://images.example.com/products/aurora-desk-lamp.jpg",
  },
  {
    sku: "SKU-1002",
    name: "Woven Storage Basket",
    description: "Hand-woven seagrass basket, medium size, natural finish.",
    price: 34.5,
    currency: "USD",
    stockStatus: "in_stock",
    category: "Storage",
    imageUrl: "https://images.example.com/products/woven-storage-basket.jpg",
  },
  {
    sku: "SKU-1003",
    name: "Ceramic Pour-Over Set",
    description: "Matte-glazed ceramic pour-over dripper with matching carafe.",
    price: 48.0,
    currency: "USD",
    stockStatus: "backorder",
    category: "Kitchen",
    imageUrl: "https://images.example.com/products/ceramic-pour-over.jpg",
  },
  {
    sku: "SKU-1004",
    name: "Recycled Wool Throw",
    description: "Heavyweight throw blanket woven from recycled wool fibers.",
    price: 89.0,
    currency: "USD",
    stockStatus: "out_of_stock",
    category: "Textiles",
    imageUrl: "https://images.example.com/products/recycled-wool-throw.jpg",
  },
];

export async function fetchSourceCatalog(): Promise<SourceProduct[]> {
  const url = process.env.SOURCE_CATALOG_URL;
  if (!url) return MOCK_CATALOG;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Source catalog fetch failed: ${res.status}`);
    return (await res.json()) as SourceProduct[];
  } catch {
    // Falls back to the fixture so sync/diff logic remains demonstrable without network access.
    return MOCK_CATALOG;
  }
}
