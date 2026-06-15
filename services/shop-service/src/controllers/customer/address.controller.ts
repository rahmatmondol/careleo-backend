import * as service from '../../services/customer/address.service';

export async function listAddressesController(user: any){ return service.listAddresses(user.id); }
export async function createAddressController(user: any, body: any){ return service.createAddress(user.id, body); }
export async function updateAddressController(user: any, params: any, body: any, set: any){
  const r = await service.updateAddress(user.id, params.id, body); if ((r as any).error) set.status = (r as any).status; return r;
}
export async function deleteAddressController(user: any, params: any, set: any){
  const r = await service.deleteAddress(user.id, params.id); if ((r as any).error) set.status = (r as any).status; return r;
}
export async function defaultAddressController(user: any, params: any, set: any){
  const r = await service.setDefaultAddress(user.id, params.id); if ((r as any).error) set.status = (r as any).status; return r;
}
