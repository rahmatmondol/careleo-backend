import * as service from '../../services/admin/attribute.service';

const unwrap = (r: any, set: any) => {
  if (r?.status) set.status = r.status;
  if (r?.status && r?.error) return { error: r.error };
  if (r?.status) { const { status, ...rest } = r; return rest; }
  return r;
};

export async function listAttributesController() { return service.listAttributes(); }

export async function getAttributeController(params: any, set: any) {
  return unwrap(await service.getAttribute(params.id), set);
}

export async function createAttributeController(body: any, set: any) {
  return unwrap(await service.createAttribute(body), set);
}

export async function updateAttributeController(params: any, body: any, set: any) {
  return unwrap(await service.updateAttribute(params.id, body), set);
}

export async function deleteAttributeController(params: any, set: any) {
  return unwrap(await service.deleteAttribute(params.id), set);
}

export async function listValuesController(params: any) { return service.listValues(params.id); }

export async function createValueController(params: any, body: any, set: any) {
  return unwrap(await service.createValue(params.id, body), set);
}

export async function updateValueController(params: any, body: any, set: any) {
  return unwrap(await service.updateValue(params.id, params.valueId, body), set);
}

export async function deleteValueController(params: any, set: any) {
  return unwrap(await service.deleteValue(params.id, params.valueId), set);
}
