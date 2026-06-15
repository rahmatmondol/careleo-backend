import * as service from '../../services/admin/brand.service';

export async function listBrandsController() { return service.listBrands(); }
export async function createBrandController(body: any, set: any) { const r = await service.createBrand(body); if ((r as any).status) set.status = (r as any).status; return (r as any).status ? (({ status, ...rest }) => rest)(r as any) : r; }
export async function updateBrandController(params: any, body: any, set: any) { const r = await service.updateBrand(params.id, body); if ((r as any).status) set.status = (r as any).status; return (r as any).status ? (({ status, ...rest }) => rest)(r as any) : r; }
export async function deleteBrandController(params: any, set: any) { const r = await service.deleteBrand(params.id); if ((r as any).status) set.status = (r as any).status; return (r as any).status ? (({ status, ...rest }) => rest)(r as any) : r; }
