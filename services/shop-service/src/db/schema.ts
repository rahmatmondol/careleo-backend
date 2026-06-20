import { pgTable, uuid, varchar, timestamp, decimal, integer, boolean, date, text } from 'drizzle-orm/pg-core';

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).unique().notNull(),
  description: varchar('description', { length: 500 }),
  imageUrl: varchar('image_url', { length: 255 }),
  parentId: uuid('parent_id'),
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
  attributeId: uuid('attribute_id').references(() => productAttributes.id).notNull(),
  value: varchar('value', { length: 120 }).notNull(),
  label: varchar('label', { length: 120 }),
  color: varchar('color', { length: 20 }),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
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
});

export const productSeo = pgTable('product_seo', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  slug: varchar('slug', { length: 255 }),
  metaTitle: varchar('meta_title', { length: 255 }),
  metaDescription: varchar('meta_description', { length: 500 }),
  metaKeywords: varchar('meta_keywords', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productAttributeAssignments = pgTable('product_attribute_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  attributeId: uuid('attribute_id').references(() => productAttributes.id).notNull(),
  attributeValueId: uuid('attribute_value_id').references(() => productAttributeValues.id),
  rawValue: varchar('raw_value', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const cartItems = pgTable('cart_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  quantity: integer('quantity').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const wishlistItems = pgTable('wishlist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const addresses = pgTable('addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
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
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(),
  shippingAddress: varchar('shipping_address', { length: 500 }),
  // Payment. Cash-on-delivery is the launch default; online providers
  // (bKash/SSLCommerz/Stripe) plug in by setting paymentMethod + paymentStatus.
  paymentMethod: varchar('payment_method', { length: 30 }).default('COD').notNull(),
  paymentStatus: varchar('payment_status', { length: 30 }).default('PENDING').notNull(),
  // Origin of the order: 'checkout' (user), 'subscription' (recurring), 'auto_reorder' (AI).
  source: varchar('source', { length: 30 }).default('checkout').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  productId: uuid('product_id').notNull(),
  productName: varchar('product_name', { length: 200 }).notNull(),
  quantity: integer('quantity').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
});

export const productSubscriptions = pgTable('product_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  productId: uuid('product_id').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  frequencyDays: integer('frequency_days').notNull(),
  nextOrderDate: date('next_order_date'),
  lastOrderedAt: timestamp('last_ordered_at'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  petId: uuid('pet_id'),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  date: date('date').notNull(),
  description: varchar('description', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productInventoryLogs = pgTable('product_inventory_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  quantity: integer('quantity').notNull(),
  note: varchar('note', { length: 500 }),
  actor: varchar('actor', { length: 120 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
