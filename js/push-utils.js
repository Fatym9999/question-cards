export function decodeApplicationKey(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

export function sameApplicationKey(subscription, expected) {
  const stored = subscription.options?.applicationServerKey;
  if (!stored) return false;
  const actual = new Uint8Array(stored);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}

export function supportedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
      && (['web.push.apple.com', 'fcm.googleapis.com'].includes(url.hostname)
        || /(^|\.)push\.services\.mozilla\.com$/.test(url.hostname)
        || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname));
  } catch { return false; }
}
