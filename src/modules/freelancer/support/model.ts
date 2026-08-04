import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { supportTickets, supportMessages } from '@/shared/db/schema';

export const SupportModel = {
  async insertTicket(values: {
    raisedBy: string; raiserRole: string; subject: string;
    category?: string; relatedJobId?: string; priority?: string;
  }) {
    const [t] = await db.insert(supportTickets).values(values).returning();
    return t;
  },

  async listByRaiser(raisedBy: string) {
    return db.select().from(supportTickets)
      .where(eq(supportTickets.raisedBy, raisedBy)).orderBy(desc(supportTickets.createdAt));
  },

  async findById(id: string) {
    const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    return t ?? null;
  },

  async insertMessage(values: { ticketId: string; senderId: string; senderRole: string; body: string }) {
    const [m] = await db.insert(supportMessages).values(values).returning();
    return m;
  },

  async listMessages(ticketId: string) {
    return db.select().from(supportMessages)
      .where(eq(supportMessages.ticketId, ticketId)).orderBy(asc(supportMessages.createdAt));
  },
};
