import path from 'node:path';
export const APP_ORIGIN = 'replica://app';
export function trustedRenderer(value, developmentURL) {
  try {
    const url = new URL(value);
    if (developmentURL) return url.origin === new URL(developmentURL).origin;
    return url.protocol === 'replica:' && url.hostname === 'app' && !url.username && !url.password && !url.port;
  } catch { return false; }
}
export function localAsset(root, value) {
  if (!trustedRenderer(value)) return null;
  try {
    const name = decodeURIComponent(new URL(value).pathname);
    if (name.includes('\\') || name.includes('\0')) return null;
    const target = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    const relative = path.relative(root, target);
    return relative.startsWith('..') || path.isAbsolute(relative) ? null : target;
  } catch { return null; }
}
export function externalLink(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function deepLinkRoute(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'linear-replica:' || url.username || url.password || url.port || url.search) return null;
    const parts = [url.hostname, ...url.pathname.split('/').filter(Boolean)].map(decodeURIComponent);
    if (parts[0] === 'issue' && parts.length === 2 && /^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(parts[1])) return `#/issue/${encodeURIComponent(parts[1])}`;
    const pages = ['inbox','my-issues','projects','initiatives','views','cycles','triage','archive','reviews','agent','loops','settings','documents'];
    return parts.length === 1 && pages.includes(parts[0]) ? `#/${parts[0]}` : null;
  } catch { return null; }
}
