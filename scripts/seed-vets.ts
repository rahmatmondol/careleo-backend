/**
 * seed-vets.ts
 * ------------
 * Seed a couple of demo vets with services and weekly availability.
 *
 * This used to run implicitly: `VetsModel.ensureSeedData()` fired on the first
 * request that touched the module. That made "why are there vets in
 * production?" a real question, and it re-checked the row count on every call.
 * Seeding is now something you ask for.
 *
 * Idempotent: upserts by full name, so re-running refreshes the profile without
 * creating duplicates. Availability and services are replaced wholesale for the
 * vets it owns.
 *
 * Usage:
 *   bun run scripts/seed-vets.ts
 */

import { eq } from 'drizzle-orm';
import { db } from '../src/shared/db';
import { vetAvailability, vetServices, vets } from '../src/shared/db/schema';

const SEED = [
  {
    fullName: 'Dr. Sarah Ahmed',
    specialty: 'General Practice',
    location: 'Dhaka',
    rating: '4.8',
    consultationFee: '1200',
    email: 'sarah.ahmed@careleo.care',
    phone: '+880 1700 000001',
    experienceYears: 8,
    qualifications: ['DVM', 'MS in Veterinary Medicine'],
    bio: 'General practice with a focus on preventive care and nutrition.',
    services: [
      { name: 'General Checkup', fee: '1200' },
      { name: 'Vaccination', fee: '800' },
    ],
    availability: [
      { dayOfWeek: 'Monday', startTime: '10:00', endTime: '17:00', mode: 'both' },
      { dayOfWeek: 'Tuesday', startTime: '10:00', endTime: '17:00', mode: 'both' },
      { dayOfWeek: 'Wednesday', startTime: '10:00', endTime: '14:00', mode: 'video' },
    ],
  },
  {
    fullName: 'Dr. Tanvir Hasan',
    specialty: 'Dermatology',
    location: 'Chattogram',
    rating: '4.6',
    consultationFee: '1500',
    email: 'tanvir.hasan@careleo.care',
    phone: '+880 1700 000002',
    experienceYears: 12,
    qualifications: ['DVM', 'Diploma in Veterinary Dermatology'],
    bio: 'Skin, coat and allergy specialist for dogs and cats.',
    services: [{ name: 'Skin Consultation', fee: '1500' }],
    availability: [
      { dayOfWeek: 'Thursday', startTime: '09:00', endTime: '16:00', mode: 'both' },
      { dayOfWeek: 'Saturday', startTime: '09:00', endTime: '13:00', mode: 'visit' },
    ],
  },
];

async function main() {
  console.log('\n→ Seeding demo vets…\n');

  for (const entry of SEED) {
    const { services, availability, qualifications, ...profile } = entry;

    const values = {
      ...profile,
      qualificationsJson: JSON.stringify(qualifications),
      status: 'active',
      isAvailable: true,
      updatedAt: new Date(),
    };

    const [existing] = await db
      .select({ id: vets.id })
      .from(vets)
      .where(eq(vets.fullName, profile.fullName))
      .limit(1);

    let vetId: string;
    if (existing) {
      await db.update(vets).set(values).where(eq(vets.id, existing.id));
      vetId = existing.id;
      console.log(`  updated  ${profile.fullName}`);
    } else {
      const [row] = await db.insert(vets).values(values).returning({ id: vets.id });
      vetId = row.id;
      console.log(`  created  ${profile.fullName}`);
    }

    // Replace rather than append — otherwise every re-run doubles the rows and
    // the slots endpoint starts offering the same window several times over.
    await db.delete(vetServices).where(eq(vetServices.vetId, vetId));
    await db.delete(vetAvailability).where(eq(vetAvailability.vetId, vetId));

    if (services.length) {
      await db.insert(vetServices).values(services.map((s) => ({ ...s, vetId })));
    }
    if (availability.length) {
      await db.insert(vetAvailability).values(availability.map((a) => ({ ...a, vetId })));
    }
  }

  console.log('\n✓ Done.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ Seeding failed:', err);
  process.exit(1);
});
