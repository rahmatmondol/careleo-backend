import { db } from './services/shop-service/src/db';
import { products, orderItems } from './services/shop-service/src/db/schema';
async function main() {
  const allProducts = await db.select({ id: products.id, imageUrl: products.imageUrl, galleryImages: products.galleryImages, sku: products.sku }).from(products);
  console.log("Products:", JSON.stringify(allProducts, null, 2));
  process.exit(0);
}
main();
