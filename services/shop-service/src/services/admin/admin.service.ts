import { Elysia, t } from 'elysia';
import { db } from '../../db';
import { categories, productBrands } from '../../db/schema';
import { asc, eq } from 'drizzle-orm';
import { toSlug } from '../../utils/common';
import { mapCategoryForAdmin } from '../../utils/mappers';

export function registerAdminRoutes(app: Elysia) {
  return app
    .get('/api/v1/shop/admin/categories', async () => {
      const rows = await db.select().from(categories).orderBy(asc(categories.name));
      const byId = new Map(rows.map((row) => [row.id, row]));
      return {
        categories: rows.map((row) => mapCategoryForAdmin(row, row.parentId ? byId.get(row.parentId) : null)),
      };
    })
    .post('/api/v1/shop/admin/categories', async ({ body, set }) => {
      const b = body as any;
      const categoryName = String(b.name || '').trim();
      if (!categoryName) {
        set.status = 400;
        return { error: 'Name is required' };
      }

      const slug = toSlug(categoryName);
      const exists = await db.select().from(categories).where(eq(categories.slug, slug));
      if (exists.length) {
        set.status = 409;
        return { error: 'Category already exists' };
      }

      const isActive = b.status
        ? String(b.status).toLowerCase() === 'active'
        : b.isActive !== false;

      const row = await db.insert(categories).values({
        name: categoryName,
        slug,
        description: b.description,
        imageUrl: b.imageUrl ?? b.image ?? null,
        parentId: b.parentId ?? b.parent ?? null,
        isActive,
        sortOrder: Number(b.order ?? b.sortOrder ?? 0),
      }).returning();

      const created = row[0];
      let parent = null as any;
      if (created?.parentId) {
        const p = await db.select().from(categories).where(eq(categories.id, created.parentId));
        parent = p[0] || null;
      }

      set.status = 201;
      return { category: mapCategoryForAdmin(created, parent) };
    }, {
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
        imageUrl: t.Optional(t.Union([t.String(), t.Null()])),
        image: t.Optional(t.Union([t.String(), t.Null()])),
        parentId: t.Optional(t.Union([t.String(), t.Null()])),
        parent: t.Optional(t.Union([t.String(), t.Null()])),
        isActive: t.Optional(t.Boolean()),
        status: t.Optional(t.String()),
        order: t.Optional(t.Numeric()),
        sortOrder: t.Optional(t.Numeric())
      })
    })
    .put('/api/v1/shop/admin/categories/:id', async ({ params, body, set }) => {
      const b = body as any;
      const updates: any = {
        description: b.description,
        imageUrl: b.imageUrl ?? b.image,
        parentId: b.parentId ?? b.parent ?? null,
        sortOrder: Number(b.order ?? b.sortOrder ?? 0),
        updatedAt: new Date(),
      };

      if (b.name !== undefined) {
        updates.name = String(b.name).trim();
        updates.slug = toSlug(String(b.name));
      }

      if (b.status !== undefined) {
        updates.isActive = String(b.status).toLowerCase() === 'active';
      } else if (b.isActive !== undefined) {
        updates.isActive = b.isActive !== false;
      }

      const row = await db.update(categories).set(updates).where(eq(categories.id, params.id)).returning();
      if (!row.length) { set.status = 404; return { error: 'Category not found' }; }

      const updated = row[0];
      let parent = null as any;
      if (updated?.parentId) {
        const p = await db.select().from(categories).where(eq(categories.id, updated.parentId));
        parent = p[0] || null;
      }

      return { category: mapCategoryForAdmin(updated, parent) };
    }, {
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        imageUrl: t.Optional(t.Union([t.String(), t.Null()])),
        image: t.Optional(t.Union([t.String(), t.Null()])),
        parentId: t.Optional(t.Union([t.String(), t.Null()])),
        parent: t.Optional(t.Union([t.String(), t.Null()])),
        isActive: t.Optional(t.Boolean()),
        status: t.Optional(t.String()),
        order: t.Optional(t.Numeric()),
        sortOrder: t.Optional(t.Numeric())
      })
    })
    .delete('/api/v1/shop/admin/categories/:id', async ({ params, set }) => {
      const row = await db.delete(categories).where(eq(categories.id, params.id)).returning();
      if (!row.length) { set.status = 404; return { error: 'Category not found' }; }

      try {
        const mediaServiceUrl = (Bun.env.MEDIA_SERVICE_URL || 'http://media-service:3017').replace(/\/$/, '');
        await fetch(`${mediaServiceUrl}/api/v1/media/links/entity/category/${params.id}`, {
          method: 'DELETE',
          headers: {
            'x-internal-key': Bun.env.INTERNAL_SERVICE_KEY || 'pawly-internal',
          },
        });
      } catch (error) {
        console.error('Failed to cleanup media links for deleted category:', error);
      }

      return { success: true };
    })
    .get('/api/v1/shop/admin/brands', async () => {
      const rows = await db.select().from(productBrands).orderBy(asc(productBrands.name));
      return { brands: rows };
    })
    .post('/api/v1/shop/admin/brands', async ({ body, set }) => {
      const b = body as any;
      const slug = toSlug(String(b.name));
      const exists = await db.select().from(productBrands).where(eq(productBrands.slug, slug));
      if (exists.length) { set.status = 409; return { error: 'Brand already exists' }; }
      const row = await db.insert(productBrands).values({ name: b.name, slug, description: b.description, logo: b.logo, website: b.website, email: b.email, phone: b.phone, isFeatured: !!b.isFeatured, isActive: b.isActive !== false }).returning();
      set.status = 201;
      return { brand: row[0] };
    }, { body: t.Object({ name: t.String(), description: t.Optional(t.String()), logo: t.Optional(t.String()), website: t.Optional(t.String()), email: t.Optional(t.String()), phone: t.Optional(t.String()), isFeatured: t.Optional(t.Boolean()), isActive: t.Optional(t.Boolean()) }) })
    .put('/api/v1/shop/admin/brands/:id', async ({ params, body, set }) => {
      const b = body as any;
      const updates: any = { ...b, updatedAt: new Date() };
      if (b.name) updates.slug = toSlug(String(b.name));
      const row = await db.update(productBrands).set(updates).where(eq(productBrands.id, params.id)).returning();
      if (!row.length) { set.status = 404; return { error: 'Brand not found' }; }
      return { brand: row[0] };
    })
    .delete('/api/v1/shop/admin/brands/:id', async ({ params, set }) => {
      const row = await db.delete(productBrands).where(eq(productBrands.id, params.id)).returning();
      if (!row.length) { set.status = 404; return { error: 'Brand not found' }; }

      try {
        const mediaServiceUrl = (Bun.env.MEDIA_SERVICE_URL || 'http://media-service:3017').replace(/\/$/, '');
        await fetch(`${mediaServiceUrl}/api/v1/media/links/entity/brand/${params.id}`, {
          method: 'DELETE',
          headers: {
            'x-internal-key': Bun.env.INTERNAL_SERVICE_KEY || 'pawly-internal',
          },
        });
      } catch (error) {
        console.error('Failed to cleanup media links for deleted brand:', error);
      }

      return { success: true };
    });
}
