import { SupportModel } from './model';

export const SupportService = {
  async createTicket(
    raisedBy: string,
    raiserRole: 'customer' | 'freelancer',
    body: { subject?: string; category?: string; relatedJobId?: string; priority?: string; message?: string },
  ) {
    if (!body.subject?.trim()) return { status: 400, error: 'Subject required' };
    const ticket = await SupportModel.insertTicket({
      raisedBy, raiserRole,
      subject: body.subject.trim(),
      category: body.category,
      relatedJobId: body.relatedJobId,
      priority: body.priority,
    });
    if (!ticket) return { status: 500, error: 'Failed to create ticket' };
    if (body.message?.trim()) {
      await SupportModel.insertMessage({ ticketId: ticket.id, senderId: raisedBy, senderRole: raiserRole, body: body.message.trim() });
    }
    return { data: { ticket } };
  },

  async listTickets(raisedBy: string) {
    return { data: { tickets: await SupportModel.listByRaiser(raisedBy) } };
  },

  async getTicket(raisedBy: string, ticketId: string) {
    const ticket = await SupportModel.findById(ticketId);
    if (!ticket) return { status: 404, error: 'Ticket not found' };
    if (ticket.raisedBy !== raisedBy) return { status: 403, error: 'Not authorized' };
    const messages = await SupportModel.listMessages(ticketId);
    return { data: { ticket, messages } };
  },

  async sendMessage(senderId: string, senderRole: 'customer' | 'freelancer', ticketId: string, body: string) {
    if (!body?.trim()) return { status: 400, error: 'Message body required' };
    const ticket = await SupportModel.findById(ticketId);
    if (!ticket) return { status: 404, error: 'Ticket not found' };
    if (ticket.raisedBy !== senderId) return { status: 403, error: 'Not authorized' };
    if (['resolved', 'closed'].includes(ticket.status)) return { status: 422, error: 'Ticket is closed' };

    const message = await SupportModel.insertMessage({ ticketId, senderId, senderRole, body: body.trim() });
    return { data: { message } };
  },
};
