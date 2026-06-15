import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { cartItems, products, orders, orderItems, productInventoryLogs } from '../../db/schema';

export async function listCart(userId: string){
  const items = await db.select({ id: cartItems.id, userId: cartItems.userId, productId: cartItems.productId, quantity: cartItems.quantity, createdAt: cartItems.createdAt, product: { id: products.id, name: products.name, brand: products.brand, price: products.price, imageUrl: products.imageUrl } }).from(cartItems).leftJoin(products, eq(cartItems.productId, products.id)).where(eq(cartItems.userId, userId)).orderBy(desc(cartItems.createdAt));
  return { cart: items };
}
export async function addCart(userId: string, b: any){
  const existing = await db.select().from(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.productId, b.productId)));
  if (existing.length){ const result = await db.update(cartItems).set({ quantity: existing[0].quantity + (b.quantity || 1) }).where(eq(cartItems.id, existing[0].id)).returning(); return { message: 'Cart updated', item: result[0] }; }
  const result = await db.insert(cartItems).values({ userId, productId: b.productId, quantity: b.quantity || 1 }).returning();
  return { message: 'Added to cart', item: result[0] };
}
export async function updateCartItem(itemId: string, quantity: number){
  const result = await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, itemId)).returning();
  return { message: 'Cart item updated', item: result[0] };
}
export async function removeCartItem(itemId: string){
  await db.delete(cartItems).where(eq(cartItems.id, itemId));
  return { message: 'Item removed from cart' };
}
export async function checkout(userId: string){
  const items = await db.select().from(cartItems).where(eq(cartItems.userId, userId));
  if (!items.length) return { error: 'Cart is empty' };
  let total = 0; const orderItemsData: any[] = [];
  for (const item of items){
    const prod = await db.select().from(products).where(eq(products.id, item.productId));
    if (prod.length){
      const price = Number(prod[0].price); total += price * item.quantity;
      orderItemsData.push({ productId: prod[0].id, productName: prod[0].name, quantity: item.quantity, price: String(price) });
      const newStock = Math.max(0, Number(prod[0].stock || 0) - Number(item.quantity || 0));
      await db.update(products).set({ stock: newStock }).where(eq(products.id, prod[0].id));
      await db.insert(productInventoryLogs).values({ productId: prod[0].id, type: 'Sale', quantity: -Number(item.quantity || 0), note: 'Stock deducted from checkout', actor: 'System' });
    }
  }
  const order = await db.insert(orders).values({ userId, totalAmount: String(total) }).returning();
  for (const oi of orderItemsData) await db.insert(orderItems).values({ orderId: order[0].id, ...oi });
  await db.delete(cartItems).where(eq(cartItems.userId, userId));
  return { message: 'Order placed', order: order[0] };
}
