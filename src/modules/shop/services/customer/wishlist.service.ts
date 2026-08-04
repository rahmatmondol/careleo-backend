import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { products, wishlistItems, cartItems } from '@/shared/db/schema';

export async function listWishlist(userId: string) {
  const items = await db
    .select({
      id: wishlistItems.id,
      userId: wishlistItems.userId,
      productId: wishlistItems.productId,
      createdAt: wishlistItems.createdAt,
      product: {
        id: products.id,
        name: products.name,
        brand: products.brand,
        price: products.price,
        imageUrl: products.imageUrl,
        isActive: products.isActive,
      },
    })
    .from(wishlistItems)
    .leftJoin(products, eq(wishlistItems.productId, products.id))
    .where(eq(wishlistItems.userId, userId))
    .orderBy(desc(wishlistItems.createdAt));

  return { wishlist: items };
}

export async function addWishlist(userId: string, productId: string) {
  const product = await db.select().from(products).where(eq(products.id, productId));
  if (!product.length) return { error: 'Product not found', status: 404 };

  const exists = await db.select().from(wishlistItems).where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)));
  if (exists.length) return { error: 'Product already in wishlist', status: 409 };

  const result = await db.insert(wishlistItems).values({ userId, productId }).returning();
  return { message: 'Added to wishlist', item: result[0] };
}

export async function removeWishlist(userId: string, productId: string) {
  const found = await db.select().from(wishlistItems).where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)));
  if (!found.length) return { error: 'Wishlist item not found', status: 404 };
  await db.delete(wishlistItems).where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)));
  return { message: 'Removed from wishlist' };
}

export async function moveWishlistToCart(userId: string, productId: string) {
  const found = await db.select().from(wishlistItems).where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)));
  if (!found.length) return { error: 'Wishlist item not found', status: 404 };

  const existingCart = await db.select().from(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)));
  if (existingCart.length) {
    await db.update(cartItems).set({ quantity: existingCart[0].quantity + 1 }).where(eq(cartItems.id, existingCart[0].id));
  } else {
    await db.insert(cartItems).values({ userId, productId, quantity: 1 });
  }
  await db.delete(wishlistItems).where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)));
  return { message: 'Moved to cart' };
}
