import { Elysia, t } from 'elysia';
import { createExpenseController, deleteExpenseController, listExpensesController } from '../../controllers/customer/expense.controller';

export const expenseRoutes = new Elysia()
  .get('/api/v1/shop/expenses', ({ query, user }) => listExpensesController(user, query))
  .post('/api/v1/shop/expenses', ({ body, user }) => createExpenseController(user, body), { body: t.Object({ petId: t.Optional(t.String()), amount: t.String(), category: t.String(), date: t.String(), description: t.Optional(t.String()) }) })
  .delete('/api/v1/shop/expenses/:id', ({ params }) => deleteExpenseController(params));
