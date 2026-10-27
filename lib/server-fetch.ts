import { ProxyAgent } from 'undici';

let agent: ProxyAgent | undefined;
let agentUrl: string | undefined;
// Node fetch no utiliza HTTPS_PROXY automáticamente. Respeta la ruta de red del
// entorno sin desactivar TLS ni imprimir URLs de proxy o credenciales.
export const serverFetch: typeof fetch = (input, init) => {
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  const url = new URL(
    typeof input === 'string' || input instanceof URL
      ? input.toString()
      : input.url,
  );
  const bypass = (process.env.NO_PROXY || process.env.no_proxy || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some(
      (host) =>
        host === '*' ||
        url.hostname === host ||
        (host.startsWith('.') && url.hostname.endsWith(host)),
    );
  const options = {
    ...init,
    cache: 'no-store' as RequestCache,
    signal: init?.signal || AbortSignal.timeout(15000),
  };
  if (!proxy || bypass) return fetch(input, options);
  if (agentUrl !== proxy) {
    agent = new ProxyAgent(proxy);
    agentUrl = proxy;
  }
  return fetch(input, { ...options, dispatcher: agent } as RequestInit);
};
