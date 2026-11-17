const ALLOWED_PUSH_EXACT_HOSTS = new Set([
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
  'push.api.opera.com',
]);

const ALLOWED_PUSH_SUFFIXES = [
  '.notify.windows.com',
  '.push.apple.com',
  '.push.services.mozilla.com',
  '.googleapis.com',
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (!endpoint || endpoint.length > 1000) return false;
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (ALLOWED_PUSH_EXACT_HOSTS.has(host)) return true;
  return ALLOWED_PUSH_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
