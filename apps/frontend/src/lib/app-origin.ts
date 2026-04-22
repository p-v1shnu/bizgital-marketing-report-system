const LOCAL_LIKE_HOSTS = new Set(['0.0.0.0', '127.0.0.1', '::1', '[::1]', 'localhost']);

export function normalizeLocalHost(hostname: string, port: string) {
  return LOCAL_LIKE_HOSTS.has(hostname)
    ? `localhost${port ? `:${port}` : ''}`
    : `${hostname}${port ? `:${port}` : ''}`;
}

export function resolveAppOrigin(request: Request) {
  const configuredAppOrigin = process.env.APP_ORIGIN?.trim();
  if (configuredAppOrigin) {
    try {
      const configuredUrl = new URL(configuredAppOrigin);
      const normalizedHost = normalizeLocalHost(configuredUrl.hostname, configuredUrl.port);
      return `${configuredUrl.protocol}//${normalizedHost}`;
    } catch {
      // Fall back to request URL.
    }
  }

  const requestUrl = new URL(request.url);
  const normalizedHost = normalizeLocalHost(requestUrl.hostname, requestUrl.port);
  return `${requestUrl.protocol}//${normalizedHost}`;
}

export function toAppUrl(request: Request, path: string) {
  return new URL(path, resolveAppOrigin(request));
}

export function resolveMicrosoftRedirectUri(
  request: Request,
  configuredRedirectUri: string
) {
  if (configuredRedirectUri) {
    try {
      const configuredUrl = new URL(configuredRedirectUri);
      const normalizedHost = normalizeLocalHost(configuredUrl.hostname, configuredUrl.port);
      return `${configuredUrl.protocol}//${normalizedHost}${configuredUrl.pathname}${configuredUrl.search}`;
    } catch {
      // Fall back to request URL.
    }
  }

  const requestUrl = new URL(request.url);
  const normalizedHost = normalizeLocalHost(requestUrl.hostname, requestUrl.port);
  return `${requestUrl.protocol}//${normalizedHost}/api/auth/microsoft/callback`;
}
