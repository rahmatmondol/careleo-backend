import * as service from '../../services/admin/category.service';

export async function listCategoriesController() { return service.listCategories(); }

export async function createCategoryController(body: any, set: any) {
  const r = await service.createCategory(body);
  if ((r as any).status) set.status = (r as any).status;
  return (r as any).status ? (({ status, ...rest }) => rest)(r as any) : r;
}

export async function updateCategoryController(params: any, body: any, set: any) {
  const r = await service.updateCategory(params.id, body);
  if ((r as any).status) set.status = (r as any).status;
  return (r as any).status ? (({ status, ...rest }) => rest)(r as any) : r;
}

export async function deleteCategoryController(params: any, set: any) {
  const r = await service.deleteCategory(params.id);
  if ((r as any).status) set.status = (r as any).status;
  return (r as any).status ? (({ status, ...rest }) => rest)(r as any) : r;
}
