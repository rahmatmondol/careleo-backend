/**
 * Freelancer marketplace access for the AI tools.
 *
 * This was an HTTP client pointed at `FREELANCER_SERVICE_URL`, authenticating
 * with the shared `INTERNAL_SERVICE_SECRET` against a set of `/internal/*`
 * endpoints that existed only so one service could act on another's data.
 *
 * The marketplace is a module in this process now, so these call
 * `InternalService` directly. The `/internal/*` routes still exist (see
 * `modules/freelancer/internal/index.ts`) but nothing in this repo calls them
 * over HTTP any more.
 *
 * Best-effort contract preserved: `[]` / `null` on failure, so a marketplace
 * error degrades an AI reply rather than failing the chat turn around it.
 */

import { InternalService } from './internal/service';

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

/** List available freelancers for a service type (used by the list_freelancers AI tool). */
export const listFreelancers = async (
  serviceType: string,
  location?: string,
): Promise<FreelancerListing[]> => {
  try {
    const result: any = await InternalService.listForServiceType(serviceType, location);
    const list = result?.data?.freelancers ?? [];
    return Array.isArray(list) ? (list as FreelancerListing[]) : [];
  } catch (e: any) {
    console.warn('[freelancer] listFreelancers failed:', e?.message ?? e);
    return [];
  }
};

/** Send a job letter on behalf of a customer (AI send_job_letter tool path). */
export const sendJobLetter = async (params: {
  customerId: string;
  customerEmail: string;
  petId: string;
  petName?: string;
  profileId: string;
  serviceId?: string;
  message?: string;
  proposedSchedule?: string;
}): Promise<FreelancerJob | null> => {
  try {
    const result: any = await InternalService.createJob(params);
    if (result?.status) {
      console.warn('[freelancer] sendJobLetter rejected:', result.error);
      return null;
    }
    return result?.data?.job ?? null;
  } catch (e: any) {
    console.warn('[freelancer] sendJobLetter failed:', e?.message ?? e);
    return null;
  }
};

/** Auto-hire the best freelancer (Premium; AI auto_hire_freelancer tool path). */
export const autoHireFreelancer = async (params: {
  customerId: string;
  customerEmail: string;
  petId: string;
  petName?: string;
  serviceType: string;
}): Promise<{ job: FreelancerJob; booking: unknown; freelancer: unknown } | null> => {
  try {
    const result: any = await InternalService.autoHire(params);
    if (result?.status) {
      console.warn('[freelancer] autoHireFreelancer rejected:', result.error);
      return null;
    }
    return result?.data ?? null;
  } catch (e: any) {
    console.warn('[freelancer] autoHireFreelancer failed:', e?.message ?? e);
    return null;
  }
};
