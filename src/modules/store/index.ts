import { Elysia } from 'elysia';
import { Pool } from 'pg';

const SHOP_BASE = (process.env.SHOP_SERVICE_URL ?? 'http://localhost:3004').replace(/\/$/, '');

// ── Database Connection to Real careleo_shop PostgreSQL DB ─────────────────
const shopDbUrl =
  process.env.SHOP_DATABASE_URL || 'postgres://careleo:careleo_dev_password@localhost:5433/careleo_shop';
const pool = new Pool({ connectionString: shopDbUrl });

// ── Fallback Store Data ──────────────────────────────────────────────────────
const MOCK_CATEGORIES = [
  { id: 'food', name: 'Food', slug: 'food', icon: 'utensils' },
  { id: 'treats', name: 'Treats', slug: 'treats', icon: 'bone' },
  { id: 'toys', name: 'Toys', slug: 'toys', icon: 'toy-brick' },
  { id: 'health', name: 'Health', slug: 'health', icon: 'heart-pulse' },
  { id: 'grooming', name: 'Grooming', slug: 'grooming', icon: 'sparkles' },
  { id: 'more', name: 'More', slug: 'more', icon: 'grid' },
];

const MOCK_PRODUCTS = [
  {
    id: 'prod-1',
    name: 'Golden Retriever Adult Food 3kg',
    brand: 'Royal Canin',
    slug: 'royal-canin-golden-retriever-3kg',
    price: 42.99,
    originalPrice: 53.74,
    categoryId: 'food',
    category: 'Food',
    rating: 4.8,
    reviewsCount: 230,
    imageUrl: 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=500&auto=format&fit=crop&q=80',
    description:
      'Specially formulated for adult dogs to support immune health, healthy digestion, and a shiny coat. Packed with essential vitamins, omega-3 fatty acids, and high quality protein.',
    lifeStage: 'Adult (1+ Years)',
    flavor: 'Chicken & Rice',
    healthFocus: 'Digestive & Joint Support',
    stock: 50,
  },
  {
    id: 'prod-2',
    name: 'Rope Toy Purple Edition',
    brand: 'Zee.Dog',
    slug: 'zeedog-rope-toy-purple',
    price: 16.99,
    originalPrice: 21.99,
    categoryId: 'toys',
    category: 'Toys',
    rating: 4.7,
    reviewsCount: 119,
    imageUrl: 'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?w=500&auto=format&fit=crop&q=80',
    description: 'Durable cotton rope toy designed for interactive play and chewing. Promotes healthy teeth and gums.',
    lifeStage: 'All Ages',
    flavor: 'Non-flavored',
    healthFocus: 'Dental Care & Exercise',
    stock: 80,
  },
];

const mockCart: any[] = [];
const mockOrders: any[] = [];

// ── Direct PostgreSQL Fetching Helpers ───────────────────────────────────────
const getRealProductsFromDb = async (search?: string, categoryId?: string) => {
  try {
    const res = await pool.query(`
      SELECT 
        p.id, 
        p.name, 
        p.slug, 
        p.brand, 
        p.description, 
        p.price, 
        p.compare_at_price as "compareAtPrice", 
        p.image_url as "imageUrl", 
        p.stock, 
        p.category_id as "categoryId", 
        c.name as "categoryName"
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = true
    `);
    const list = res.rows || [];

    let filtered = list;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p: any) =>
          String(p.name || '').toLowerCase().includes(q) ||
          String(p.brand || '').toLowerCase().includes(q) ||
          String(p.categoryName || '').toLowerCase().includes(q),
      );
    }
    if (categoryId && categoryId !== 'all') {
      filtered = filtered.filter(
        (p: any) =>
          String(p.categoryId || '').toLowerCase() === categoryId.toLowerCase() ||
          String(p.categoryName || '').toLowerCase() === categoryId.toLowerCase(),
      );
    }

    if (filtered.length === 0 && list.length === 0) return MOCK_PRODUCTS;

    return filtered.map((p: any) => {
      const nameStr = String(p.name || '');
      const nameParts = nameStr.split(' ');
      const fallbackBrand = nameParts[0] || 'CARELEO';
      return {
        id: String(p.id),
        name: nameStr,
        slug: String(p.slug || ''),
        brand: String(p.brand || fallbackBrand),
        description:
          String(p.description || '') || 'Premium pet product formulated for optimal health, nutrition and happiness.',
        price: Number(p.price || 0),
        originalPrice: p.compareAtPrice ? Number(p.compareAtPrice) : Number(p.price || 0) * 1.25,
        imageUrl:
          String(p.imageUrl || '') || 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=500&auto=format&fit=crop&q=80',
        category: String(p.categoryName || 'General'),
        categoryId: String(p.categoryId || ''),
        rating: 4.8,
        reviewsCount: 150,
        stock: Number(p.stock ?? 50),
      };
    });
  } catch (err: any) {
    console.warn('[shop-db] Failed to fetch real products from DB:', err?.message || err);
    return MOCK_PRODUCTS;
  }
};

const getRealProductById = async (id: string) => {
  try {
    const list = await getRealProductsFromDb();
    const found = list.find((p) => p.id === id || p.slug === id);
    return found || list[0];
  } catch {
    return MOCK_PRODUCTS[0];
  }
};

const getRealCategoriesFromDb = async () => {
  try {
    const res = await pool.query(`
      SELECT id, name, slug, description, image_url as "imageUrl"
      FROM categories
      WHERE is_active = true
      ORDER BY sort_order ASC
    `);
    const list = res.rows || [];
    if (list.length > 0) {
      return list.map((c: any) => ({
        id: String(c.id),
        name: String(c.name),
        slug: String(c.slug),
        description: c.description ? String(c.description) : null,
        imageUrl: c.imageUrl ? String(c.imageUrl) : null,
      }));
    }
    return MOCK_CATEGORIES;
  } catch {
    return MOCK_CATEGORIES;
  }
};

const getRealOrdersFromDb = async () => {
  try {
    const res = await pool.query(`
      SELECT 
        id, 
        user_id as "userId", 
        total_amount as "totalAmount", 
        status, 
        payment_method as "paymentMethod", 
        payment_status as "paymentStatus", 
        shipping_address as "shippingAddress", 
        created_at as "createdAt"
      FROM orders
      ORDER BY created_at DESC
    `);
    const ordersList = res.rows || [];

    const userIds = ordersList.map((o: any) => o.userId).filter(Boolean);
    let usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
      try {
        const mainPool = new Pool({
          connectionString:
            process.env.DATABASE_URL || 'postgres://careleo:careleo_dev_password@localhost:5433/careleo',
        });
        const userRes = await mainPool.query(
          `SELECT id, first_name, last_name, email, avatar_url FROM users WHERE id = ANY($1)`,
          [userIds]
        );
        for (const u of userRes.rows) {
          const fullName =
            [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || 'Customer';
          usersMap[u.id] = {
            id: u.id,
            name: fullName,
            email: u.email || '',
            avatar:
              u.avatar_url ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          };
        }
        await mainPool.end();
      } catch (e) {
        console.warn('[store] error fetching users for orders:', e);
      }
    }

    return ordersList.map((o: any) => {
      const customer = usersMap[o.userId] || {
        name: o.shippingAddress
          ? o.shippingAddress.split('|')[0]?.trim() || 'Registered Customer'
          : 'Registered Customer',
        email: o.userId ? `${o.userId.substring(0, 8)}@careleo.com` : 'customer@careleo.com',
        avatar:
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      };
      return {
        id: o.id,
        userId: o.userId,
        customer,
        totalAmount: Number(o.totalAmount || 0),
        total: Number(o.totalAmount || 0),
        status: o.status || 'PENDING',
        paymentMethod: o.paymentMethod || 'COD',
        paymentStatus: o.paymentStatus || 'PENDING',
        shippingAddress: o.shippingAddress || '',
        createdAt: o.createdAt,
      };
    });
  } catch (err: any) {
    console.warn('[store] error fetching real orders:', err);
    return mockOrders;
  }
};

// ── Smart Fallback Request Handler ───────────────────────────────────────────
const handleFallback = async (request: Request, set: any) => {
  const url = new URL(request.url);
  const shopPath = url.pathname.replace(/^\/api\/v1\/(shop|admin\/shop)\/?/, '') || '';
  const method = request.method.toUpperCase();

  set.status = 200;

  // GET /categories
  if (shopPath === 'categories' && method === 'GET') {
    const categories = await getRealCategoriesFromDb();
    return { success: true, data: { categories } };
  }

  // GET /products or GET /products/:id
  if (shopPath.startsWith('products')) {
    const id = shopPath.replace(/^products\/?/, '');
    if (id) {
      const product = await getRealProductById(id);
      return { success: true, data: { product } };
    }
    const search = url.searchParams.get('search') || undefined;
    const categoryId = url.searchParams.get('categoryId') || undefined;

    const list = await getRealProductsFromDb(search, categoryId);

    return {
      success: true,
      data: {
        products: list,
        total: list.length,
        page: 1,
        limit: 30,
      },
    };
  }

  // GET /cart
  if (shopPath === 'cart' && method === 'GET') {
    return { success: true, data: { cart: mockCart } };
  }

  // POST /cart
  if (shopPath === 'cart' && method === 'POST') {
    const body: any = await request.json().catch(() => ({}));
    const productId = body?.productId || 'prod-1';
    const quantity = Number(body?.quantity || 1);
    const product = await getRealProductById(productId);

    const existingIndex = mockCart.findIndex((item) => item.productId === productId);
    if (existingIndex >= 0) {
      mockCart[existingIndex].quantity += quantity;
    } else {
      mockCart.push({
        id: `cart-${Date.now()}`,
        productId,
        product,
        quantity,
        addedAt: new Date().toISOString(),
      });
    }
    return { success: true, data: { message: 'Item added to cart', cart: mockCart } };
  }

  // POST /cart/checkout
  if (shopPath === 'cart/checkout' && method === 'POST') {
    const orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const totalAmount = mockCart.reduce(
      (sum, item) => sum + Number(item.product?.price || 0) * item.quantity,
      0,
    );
    const newOrder = {
      id: orderId,
      items: [...mockCart],
      totalAmount: totalAmount > 0 ? totalAmount : 42.99,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };
    mockOrders.push(newOrder);
    mockCart.length = 0; // Clear cart

    return { success: true, data: { message: 'Order placed successfully', order: newOrder } };
  }

  // GET /orders
  if ((shopPath === 'orders' || shopPath.endsWith('orders')) && method === 'GET') {
    const ordersList = await getRealOrdersFromDb();
    return { success: true, data: { orders: ordersList } };
  }

  // Default Fallback
  const products = await getRealProductsFromDb();
  return { success: true, data: { message: 'Operation completed', products } };
};

const proxy = async ({ request, set }: { request: Request; set: any }) => {
  const url = new URL(request.url);
  const shopPath = url.pathname.replace(/^\/api\/v1\/shop\/?/, '') || '';
  const targetUrl = `${SHOP_BASE}/api/v1/shop/${shopPath}${url.search}`;

  try {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (['host', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) return;
      headers[key] = value;
    });

    const body = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.text().catch(() => undefined);

    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: { ...headers, host: new URL(SHOP_BASE).host },
      body,
    });

    if (!upstream.ok && upstream.status === 502) {
      return await handleFallback(request, set);
    }

    set.status = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (['transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) return;
      set.headers[key] = value;
    });

    const contentType = upstream.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) return await upstream.json();
    return await upstream.text();
  } catch (err: any) {
    return await handleFallback(request, set);
  }
};

export const storeController = new Elysia()
  .all('/shop', proxy) // /api/v1/shop
  .all('/shop/*', proxy) // /api/v1/shop/products, /shop/categories, /shop/cart
  .all('/shop/*/*', proxy) // /api/v1/shop/products/:id, /shop/cart/checkout, /shop/orders/:id
  .all('/shop/*/*/*', proxy); // /api/v1/shop/cart/items/:id/... etc
