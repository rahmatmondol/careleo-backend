export const AuthModel = {
  /** Build upstream forward URL from incoming path and querystring. */
  buildForwardUrl(upstreamBase: string, incomingUrl: URL, path: string) {
    const suffix = path.replace(/^\/api\/v1\/auth/, '').replace(/^\/auth/, '');
    return `${upstreamBase}${suffix}${incomingUrl.search}`;
  },

  /** Clone and normalize request headers for upstream. */
  buildUpstreamHeaders(request: Request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('content-length');
    headers.set('x-service', 'auth-service');
    return headers;
  },
};
