export interface WooOrderRow {
  id: string;
  wooOrderId: string;
  wooCustomerId?: string | null;
  status: string;
  currency: string;
  total: string;
  billingJson?: unknown;
  shippingJson?: unknown;
  lineItemsJson?: unknown;
  syncedAt?: string | null;
  createdAt: string;
}

export interface WooOrderItemCacheRow {
  id: string;
  wooOrderId: string;
  payloadJson?: unknown;
}
