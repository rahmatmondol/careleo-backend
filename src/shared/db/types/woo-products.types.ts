export interface WooProductRow {
  id: string;
  wooProductId: string;
  sku?: string | null;
  name: string;
  type: 'simple' | 'variable';
  status: string;
  price?: string | null;
  stockStatus?: string | null;
  payloadJson?: unknown;
  syncedAt?: string | null;
}

export interface WooProductVariationRow {
  id: string;
  wooVariationId: string;
  wooProductId: string;
  attributesJson?: unknown;
  price?: string | null;
  stockStatus?: string | null;
  payloadJson?: unknown;
}
