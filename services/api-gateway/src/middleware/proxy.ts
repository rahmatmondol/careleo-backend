/**
 * Shared proxy helper used by all route files.
 * Forwards the incoming request to the target backend service,
 * preserving headers, method, and body.
 */
export async function proxyRequest(
  request: Request,
  targetBase: string
): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = `${targetBase}${url.pathname}${url.search}`;

  // Copy headers, stripping hop-by-hop headers
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower !== 'host' &&
      lower !== 'content-length' &&
      lower !== 'connection'
    ) {
      headers.set(key, value);
    }
  }

  const methodHasBody = request.method !== 'GET' && request.method !== 'HEAD';

  const res = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: methodHasBody ? request.body : undefined,
  });

  // Read the full body as binary to avoid corrupting non-text payloads
  // (e.g. images) when re-streaming through the gateway.
  const buffer = await res.arrayBuffer();

  // Copy upstream response headers, stripping ones that no longer match
  // the re-emitted body (encoding/length are recomputed by the runtime).
  const responseHeaders = new Headers();
  for (const [key, value] of res.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower !== 'content-encoding' &&
      lower !== 'content-length' &&
      lower !== 'transfer-encoding' &&
      lower !== 'connection'
    ) {
      responseHeaders.set(key, value);
    }
  }

  return new Response(buffer, {
    status: res.status,
    headers: responseHeaders,
  });
}
