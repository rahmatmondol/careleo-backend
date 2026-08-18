import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { jwt } from '@elysiajs/jwt';
import { rateLimit } from 'elysia-rate-limit';

import { healthRoutes } from './shared/http/health.routes';
import { ok } from './shared/http/response';
import { handleApiError } from './shared/http/error-handler';
import { attachCorrelationId } from './shared/http/correlation-id';
import { authController } from './modules/auth/index';
import { uploadsController, userController } from './modules/user/index';
import { usersController } from './modules/users/index';
import { petsController } from './modules/pets/index';
import { tasksController } from './modules/tasks/index';
import { remindersController } from './modules/reminders/index';
import { aiController } from './modules/ai/index';
import { adminController } from './modules/admin/index';
import { auditController } from './modules/audit/index';
import { syncController } from './modules/sync/index';
import { notificationsController } from './modules/notifications/index';
import { adoptionController, adminAdoptionController } from './modules/adoption/index';
import { vetsController } from './modules/vets/index';
import { vetsAdminController } from './modules/vets/admin-index';
import { walkersController } from './modules/walkers/index';
import { adminSubscriptionsController, subscriptionsController } from './modules/subscriptions/index';
import { adminRevenueCatController, revenueCatController } from './modules/subscriptions/revenuecat/index';
import { adminMarketingController, marketingController } from './modules/marketing/index';
import { petProfileController } from './modules/pet-profile/index';
import { foodInventoryController } from './modules/food-inventory/index';
import { vaccinationsController } from './modules/vaccinations/index';
import { caregiversController } from './modules/caregivers/index';
import { careController } from './modules/care/index';

// ─── Domains merged in from the former standalone services ────────────────
// Each of these used to be its own Bun process behind the api-gateway. They
// keep their public URLs (/api/v1/shop, /social, /media, /freelancer);
// only the hop that used to reach them changed. Controllers are aliased where
// a bare name (adminController, notificationsController) would collide with a
// native module's export.
import { domainAuth } from './shared/auth/domain-auth';
import { shopController } from './modules/shop/index';
import { mediaController } from './modules/media/index';

import { feedController } from './modules/social/feed/index';
import { postsController } from './modules/social/posts/index';
import { commentsController } from './modules/social/comments/index';
import { likesController } from './modules/social/likes/index';
import { followsController } from './modules/social/follows/index';
import { sharesController } from './modules/social/shares/index';
import { notificationsController as socialNotificationsController } from './modules/social/notifications/index';
import { bookmarksController } from './modules/social/bookmarks/index';
import { storiesController } from './modules/social/stories/index';
import { reportsController } from './modules/social/reports/index';
import { adminController as socialAdminController } from './modules/social/admin/index';
import { socialUploadsController } from './modules/social/uploads/index';

import { freelancerAuthController } from './modules/freelancer/auth/index';
import { profilesController } from './modules/freelancer/profiles/index';
import { servicesController } from './modules/freelancer/services/index';
import { jobsController } from './modules/freelancer/jobs/index';
import { bookingsController } from './modules/freelancer/bookings/index';
import { earningsController } from './modules/freelancer/earnings/index';
import { supportController } from './modules/freelancer/support/index';
import { internalController } from './modules/freelancer/internal/index';
import { adminController as freelancerAdminController } from './modules/freelancer/admin/index';

const prefix = process.env.API_PREFIX || '/api/v1';

export const app = new Elysia()
  .use(attachCorrelationId)
  .use(cors())
  /**
   * Global rate limit — 100 requests per minute per client.
   *
   * This lived in the api-gateway, which was the only thing in front of this
   * process. The gateway was removed once every domain became a module here
   * (its other jobs — CORS and Swagger — this app already did itself), so the
   * limit moved in with it. Tune with RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS.
   *
   * The RevenueCat webhook is exempt. It arrives from RevenueCat's servers, so
   * every delivery shares one client key, and renewals are batched — a busy
   * renewal hour would blow through 100/min and get throttled wholesale.
   * Retries would eventually get through, but each rejected delivery is a user
   * sitting on the wrong tier in the meantime, and the route is already
   * authenticated by a shared secret rather than by being hard to reach.
   */
  .use(
    rateLimit({
      duration: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
      max: Number(process.env.RATE_LIMIT_MAX) || 100,
      skip: (req) => new URL(req.url).pathname.endsWith('/subscriptions/revenuecat/webhook'),
    })
  )
  .use(
    // Register JWT plugin globally so modules can sign/verify access tokens.
    jwt({
      name: 'jwt',
      secret: process.env.JWT_ACCESS_SECRET || 'dev_jwt_secret_change_me',
    })
  )
  .use(swagger())
  .onAfterHandle(({ response }) => {
    // Pass through raw Response objects (file/stream responses).
    if (response instanceof Response) return response;

    // Normalize all successful JSON responses into a single envelope format.
    if (
      response &&
      typeof response === 'object' &&
      'success' in (response as Record<string, unknown>)
    ) {
      return response;
    }
    return ok(response);
  })
  .onError(({ error, set, code, path, request }) => {
    // Normalize all thrown errors into the centralized error envelope.
    return handleApiError(error, set, {
      code: String(code),
      path,
      method: request.method,
    });
  })
  .group(prefix, (api) =>
    api
      .use(healthRoutes)
      .use(authController)
      .use(userController)
      .use(uploadsController)
      .use(usersController)
      .use(petsController)
      .use(tasksController)
      .use(remindersController)
      .use(aiController)
      .use(adminController)
      .use(auditController)
      .use(syncController)
      .use(notificationsController)
      .use(adoptionController)
      .use(adminAdoptionController)
      // Before vetsController so `/vets/admin/*` is not swallowed by `/vets/:id`.
      .use(vetsAdminController)
      .use(vetsController)
      .use(walkersController)
      .use(adminSubscriptionsController)
      // Before subscriptionsController so `/subscriptions/revenuecat/*` is not
      // shadowed by any future `/subscriptions/:id` route.
      .use(revenueCatController)
      .use(adminRevenueCatController)
      .use(subscriptionsController)
      .use(adminMarketingController)
      .use(marketingController)
      .use(petProfileController)
      .use(foodInventoryController)
      .use(vaccinationsController)
      .use(caregiversController)
      .use(careController)

      // ─── Merged domains ────────────────────────────────────────────────
      // `domainAuth` derives an *optional* `user` for these modules and must be
      // registered before them; see shared/auth/domain-auth.ts for why they do
      // not use the per-handler `requireAuth` the native modules use.
      .use(domainAuth)
      .use(shopController)
      .use(mediaController)

      .use(feedController)
      .use(postsController)
      .use(commentsController)
      .use(likesController)
      .use(followsController)
      .use(sharesController)
      .use(socialNotificationsController)
      .use(bookmarksController)
      .use(storiesController)
      .use(reportsController)
      .use(socialAdminController)
      .use(socialUploadsController)

      .use(freelancerAuthController)
      .use(profilesController)
      .use(servicesController)
      .use(jobsController)
      .use(bookingsController)
      .use(earningsController)
      .use(supportController)
      .use(internalController)
      .use(freelancerAdminController)
  );
