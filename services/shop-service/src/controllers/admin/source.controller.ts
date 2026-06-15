import * as service from '../../services/admin/source.service';

const unwrap = (r: any, set: any) => {
  if (r?.status) set.status = r.status;
  if (r?.status && r?.error) return { error: r.error };
  if (r?.status) { const { status, ...rest } = r; return rest; }
  return r;
};

export async function listSourcesController() { return service.listSources(); }

export async function createSourceController(body: any, set: any) {
  return unwrap(await service.createSource(body), set);
}

export async function updateSourceController(params: any, body: any, set: any) {
  return unwrap(await service.updateSource(params.id, body), set);
}

export async function deleteSourceController(params: any, set: any) {
  return unwrap(await service.deleteSource(params.id), set);
}
