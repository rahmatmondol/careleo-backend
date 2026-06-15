import * as service from '../../services/customer/expense.service';
export async function listExpensesController(user: any, query: any){ return service.listExpenses(user.id, query); }
export async function createExpenseController(user: any, body: any){ return service.createExpense(user.id, body); }
export async function deleteExpenseController(params: any){ return service.deleteExpense(params.id); }
