/**
 * Internal HTTP client for the freelancer-service.
 *
 * Mirrors shop-client.ts. All calls are best-effort — failures return null/[]
 * so a freelancer-service outage never breaks an AI reply.
 */

const FREELANCER_BASE = (process.env.FREELANCER_SERVICE_URL ?? 'http://freelancer-service:3020').replace(/\/$/, '');
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? '';

export type FreelancerListing = {
  serviceId: string;
  profileId: string;
  displayName: string;
  serviceType: string;
  title: string;
  price: string | number | null;
  billingPeriod: string;
  location: string | null;
  rating: string | number | null;
  isVerified: boolean;
};

export type FreelancerJob = { id: string; customerId: string; profileId: string; status: string };

/** List available freelancers for a service type (used by list_freelancers AI tool). */
export const listFreelancers = async (serviceType: string, location?: string): Promise<FreelancerListing[]> => {
  try {
    const url = new URL(`${FREELANCER_BASE}/api/v1/freelancer/internal/freelancers`);
    url.searchParams.set('serviceType', serviceType);
    if (location) url.searchParams.set('location', location);

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    });
    if (!res.ok) return [];
    const body: any = await res.json().catch(() => null);
    const list = body?.data?.freelancers ?? body?.freelancers ?? [];
    return Array.isArray(list) ? (list as FreelancerListing[]) : [];
  } catch (e: any) {
    console.warn('[freelancer-client] listFreelancers failed:', e?.message ?? e);
    return [];
  }
};

/** Send a job letter on behalf of a customer (AI send_job_letter tool path). */
export const sendJobLetter = async (params: {
  customerId: string; customerEmail: string; petId: string; petName?: string;
  profileId: string; serviceId?: string; message?: string; proposedSchedule?: string;
}): Promise<FreelancerJob | null> => {
  try {
    const res = await fetch(`${FREELANCER_BASE}/api/v1/freelancer/internal/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const body: any = await res.json().catch(() => null);
    return body?.data?.job ?? body?.job ?? null;
  } catch (e: any) {
    console.warn('[freelancer-client] sendJobLetter failed:', e?.message ?? e);
    return null;
  }
};

/** Auto-hire best freelancer (Premium; AI auto_hire_freelancer tool path). */
export const autoHireFreelancer = async (params: {
  customerId: string; customerEmail: string; petId: string; petName?: string; serviceType: string;
}): Promise<{ job: FreelancerJob; booking: unknown; freelancer: unknown } | null> => {
  try {
    const res = await fetch(`${FREELANCER_BASE}/api/v1/freelancer/internal/auto-hire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const body: any = await res.json().catch(() => null);
    return body?.data ?? null;
  } catch (e: any) {
    console.warn('[freelancer-client] autoHireFreelancer failed:', e?.message ?? e);
    return null;
  }
};
