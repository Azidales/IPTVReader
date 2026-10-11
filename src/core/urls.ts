export function httpUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Digite uma URL válida, incluindo https://.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Apenas links HTTP e HTTPS são aceitos.');
  if (url.username || url.password) throw new Error('Credenciais embutidas na URL não são permitidas.');
  return url;
}
export function validateRemote(url: string): string { return httpUrl(url).href; }
export function resolveMediaUrl(value: string, base?: string): string | null {
  try {
    const parsed = base ? new URL(value.trim(), base) : new URL(value.trim());
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}
export function mayBeBlockedByHttps(url: string): boolean {
  return typeof location !== 'undefined' && location.protocol === 'https:' && url.startsWith('http:');
}
