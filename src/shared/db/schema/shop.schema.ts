import {
  index,
  pgTable,
  uuid,
  varchar,
  timestamp,
  decimal,
  integer,
  boolean,
  date,
  text,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { pets } from './pets.schema';

/**
 * Shop / commerce domain — ported from the standalone shop-service.
 *
 * `user_id` and `pet_id` columns were bare uuids while this lived in
 * `careleo_shop`; they are real foreign keys now that the tables share a
 * database with `users` and `pets`.
 *
 * Order rows deliberately do NOT cascade from `users`: an order is a financial
 * record. Users are soft-deleted (`users.status`) rather than hard-deleted, so
 * the restrictive default never blocks anything in practice.
 */

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).unique().notNull(),
  description: varchar('description', { length: 500 }),
  imageUrl: varchar('image_url', { length: 255 }),
  parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
    onDelete: 'set null',
  }),
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const productBrands = pgTable('product_brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 120 }).unique().notNull(),
  description: varchar('description', { length: 500 }),
  logo: varchar('logo', { length: 255 }),
  website: varchar('website', { length: 255 }),
  email: varchar('email', { length: 160 }),
  phone: varchar('phone', { length: 40 }),
  isFeatured: boolean('is_featured').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const productSources = pgTable('product_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 120 }).unique().notNull(),
  sourceType: varchar('source_type', { length: 30 }).default('supplier').notNull(),
  contactName: varchar('contact_name', { length: 120 }),
  email: varchar('email', { length: 160 }),
  contactPhone: varchar('contact_phone', { length: 40 }),
  address: varchar('address', { length: 255 }),
  website: varchar('website', { length: 255 }),
  taxId: varchar('tax_id', { length: 120 }),
  notes: varchar('notes', { length: 500 }),
  extra: text('extra'),
  isPreferred: boolean('is_preferred').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const productAttributes = pgTable('product_attributes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  code: varchar('code', { length: 100 }).unique(),
  slug: varchar('slug', { length: 100 }).unique().notNull(),
  description: varchar('description', { length: 500 }),
  inputType: varchar('input_type', { length: 30 }).default('select').notNull(),
  isRequired: boolean('is_required').default(false).notNull(),
  isFilterable: boolean('is_filterable').default(false).notNull(),
  isVisible: boolean('is_visible').default(true).notNull(),
  isVariant: boolean('is_variant').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const productAttributeValues = pgTable('product_attribute_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  attributeId: uuid('attribute_id')
    .references(() => productAttributes.id)
    .notNull(),
  value: varchar('value', { length: 120 }).notNull(),
  label: varchar('label', { length: 120 }),
  color: varchar('color', { length: 20 }),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .references(() => categories.id)
      .notNull(),
    brandId: uuid('brand_id').references(() => productBrands.id),
    sourceId: uuid('source_id').references(() => productSources.id),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 200 }).unique().notNull(),
    sku: varchar('sku', { length: 100 }).unique(),
    brand: varchar('brand', { length: 120 }),
    description: varchar('description', { length: 4000 }),
    shortDescription: varchar('short_description', { length: 500 }),
    subCategory: varchar('sub_category', { length: 120 }),
    productType: varchar('product_type', { length: 30 }).default('Simple'),
    status: varchar('status', { length: 30 }).default('Draft'),
    supplier: varchar('supplier', { length: 200 }),
    source: varchar('source', { length: 200 }),
    /**
     * Whether this product can ever be paid for by a subscription benefit.
     *
     * Opt-in (defaults to false) so a new product is ordinary paid stock until
     * someone says otherwise. A plan's `plan_coverage_rules` then decide which
     * of these flagged products *that* plan actually covers — both must agree
     * before a cart line is covered.
     */
    subscriptionIncluded: boolean('subscription_included').default(false).notNull(),
    /**
     * @deprecated Superseded by `subscriptionIncluded`, which says the same
     * thing without the double negative. Nothing reads this any more — despite
     * the admin UI's old note, the recurring-order runner never did. Kept so
     * the column (and its data) survives; drop it in a later migration.
     */
    excludeFromSubscription: boolean('exclude_from_subscription').default(false),
    tags: text('tags'),
    attributes: text('attributes'),
    variations: text('variations'),
    galleryImages: text('gallery_images'),
    seoSlug: varchar('seo_slug', { length: 255 }),
    metaTitle: varchar('meta_title', { length: 255 }),
    metaDescription: varchar('meta_description', { length: 500 }),
    metaKeywords: varchar('meta_keywords', { length: 500 }),
    price: decimal('price', { precision: 10, scale: 2 }).notNull(),
    costPrice: decimal('cost_price', { precision: 10, scale: 2 }).default('0').notNull(),
    compareAtPrice: decimal('compare_at_price', { precision: 10, scale: 2 }),
    imageUrl: varchar('image_url', { length: 255 }),
    stock: integer('stock').default(0),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_products_category_id').on(t.categoryId),
    index('idx_products_status_active').on(t.status, t.isActive),
  ],
);

export const productSeo = pgTable('product_seo', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  slug: varchar('slug', { length: 255 }),
  metaTitle: varchar('meta_title', { length: 255 }),
  metaDescription: varchar('meta_description', { length: 500 }),
  metaKeywords: varchar('meta_keywords', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productAttributeAssignments = pgTable('product_attribute_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  attributeId: uuid('attribute_id')
    .references(() => productAttributes.id)
    .notNull(),
  attributeValueId: uuid('attribute_value_id').references(() => productAttributeValues.id),
  rawValue: varchar('raw_value', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .references(() => products.id)
      .notNull(),
    quantity: integer('quantity').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_cart_items_user_id').on(t.userId)],
);

export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .references(() => products.id)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_wishlist_items_user_id').on(t.userId)],
);

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 50 }),
    fullName: varchar('full_name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 30 }).notNull(),
    line1: text('line1').notNull(),
    line2: text('line2'),
    city: varchar('city', { length: 120 }).notNull(),
    state: varchar('state', { length: 120 }),
    postalCode: varchar('postal_code', { length: 30 }),
    country: varchar('country', { length: 120 }).default('Bangladesh').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_addresses_user_id').on(t.userId)],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // No onDelete — an order is a financial record, see the file header.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
    /**
     * Money breakdown. `totalAmount` stays the full value of the goods (what
     * every existing report already sums); `coveredAmount` is the part the
     * user's subscription paid for and `payableAmount` is what they owe.
     * Invariant: subtotal = coveredAmount + payableAmount = totalAmount.
     */
    subtotal: decimal('subtotal', { precision: 10, scale: 2 }).default('0').notNull(),
    coveredAmount: decimal('covered_amount', { precision: 10, scale: 2 }).default('0').notNull(),
    payableAmount: decimal('payable_amount', { precision: 10, scale: 2 }).default('0').notNull(),
    /**
     * Which benefit period the coverage was drawn from, and the per-rule units
     * it consumed. Cancelling the order credits *this* period back rather than
     * whatever period happens to be current when the cancellation arrives.
     */
    benefitPeriodStart: timestamp('benefit_period_start', { withTimezone: true }),
    coverageMetaJson: text('coverage_meta_json'),
    status: varchar('status', { length: 50 }).default('PENDING').notNull(),
    /**
     * Which saved address was chosen, and a frozen copy of it. Both are kept
     * on purpose: editing or deleting a saved address must never rewrite where
     * a past order was delivered.
     */
    addressId: uuid('address_id').references(() => addresses.id, { onDelete: 'set null' }),
    shippingAddress: varchar('shipping_address', { length: 500 }),
    // Payment. Cash-on-delivery is the launch default; online providers
    // (bKash/SSLCommerz/Stripe) plug in by setting paymentMethod + paymentStatus.
    paymentMethod: varchar('payment_method', { length: 30 }).default('COD').notNull(),
    paymentStatus: varchar('payment_status', { length: 30 }).default('PENDING').notNull(),
    // Origin of the order: 'checkout' (user), 'subscription' (recurring), 'auto_reorder' (AI).
    source: varchar('source', { length: 30 }).default('checkout').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_orders_user_id').on(t.userId),
    index('idx_orders_status_created').on(t.status, t.createdAt),
  ],
);

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .references(() => orders.id)
    .notNull(),
  /**
   * Intentionally NOT a foreign key. An order line is a point-in-time snapshot
   * (`productName` and `price` are copied in) and must survive the product
   * being deleted from the catalogue.
   */
  productId: uuid('product_id').notNull(),
  productName: varchar('product_name', { length: 200 }).notNull(),
  quantity: integer('quantity').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  /**
   * Subscription coverage for this line. A line can be split: 3 of 5 units
   * covered when the budget runs out mid-line, so the quantity is recorded
   * alongside the money.
   */
  coveredQuantity: integer('covered_quantity').default(0).notNull(),
  coveredAmount: decimal('covered_amount', { precision: 10, scale: 2 }).default('0').notNull(),
});

export const productSubscriptions = pgTable(
  'product_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').default(1).notNull(),
    frequencyDays: integer('frequency_days').notNull(),
    nextOrderDate: date('next_order_date'),
    lastOrderedAt: timestamp('last_ordered_at'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_product_subscriptions_due').on(t.isActive, t.nextOrderDate)],
);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id').references(() => pets.id, { onDelete: 'set null' }),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    date: date('date').notNull(),
    description: varchar('description', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_expenses_user_date').on(t.userId, t.date)],
);

export const productInventoryLogs = pgTable('product_inventory_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  quantity: integer('quantity').notNull(),
  note: varchar('note', { length: 500 }),
  actor: varchar('actor', { length: 120 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
