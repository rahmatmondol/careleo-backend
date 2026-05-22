export interface WooCustomerRow {
  id: string;
  wooCustomerId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  billingJson?: unknown;
  shippingJson?: unknown;
  payloadJson?: unknown;
  syncedAt?: string | null;
}
