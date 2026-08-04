import { t } from 'elysia';
import { shopBase } from '../../base';
import { createExpenseController, deleteExpenseController, listExpensesController } from '../../controllers/customer/expense.controller';

export const expenseRoutes = shopBase()
  .get('/expenses', ({ query, user }) => listExpensesController(user, query))
  .post('/expenses', ({ body, user }) => createExpenseController(user, body), { body: t.Object({ petId: t.Optional(t.String()), amount: t.String(), category: t.String(), date: t.String(), description: t.Optional(t.String()) }) })
  .delete('/expenses/:id', ({ user, params }) => deleteExpenseController(user, params));
