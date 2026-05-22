export const WooCommerceModel = {
  async accept(eventType: string) {
    return { accepted: true, eventType };
  }
};
