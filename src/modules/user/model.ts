export const UserModel = {
  async getMe() {
    return { id: 'todo', name: 'Rahmat' };
  },
  async updateMe(payload: Record<string, unknown>) {
    return { updated: true, payload };
  }
};
