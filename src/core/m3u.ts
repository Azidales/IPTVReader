import type { Channel, ContentType } from './types';
import { resolveMediaUrl } from './urls';

export interface ParsedPlaylist { items: Channel[]; epgUrl?: string }
function attributes(line: string): Record<string,string> {
  const result: Record<string,string> = {};
  const pattern = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  for (const match of line.matchAll(pattern)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return result;
}
export function classify(url: string, group = ''): ContentType {
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return url.toLowerCase(); } })();
  const category = group.toLowerCase();
  if (/\/series\//.test(path) || /s[eé]ries|series/.test(category)) return 'series';
  if (/\/movie\//.test(path) || /filmes|movies|vod|cinema/.test(category) || /\.(mp4|mkv|avi|mov)(?:$|\?)/.test(path)) return 'movie';
  return 'live';
}
export function parseM3U(text: string, sourceId: string, baseUrl?: string): ParsedPlaylist {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines.some(line => line.trim().startsWith('#EXTM3U')) && !lines.some(line => line.trim().startsWith('#EXTINF'))) {
    throw new Error('Arquivo inválido: não encontrei uma lista M3U com #EXTINF.');
  }
  const header = lines.find(line => line.trim().startsWith('#EXTM3U')) || '';
  const meta = attributes(header);
  const epgUrl = resolveMediaUrl(meta['x-tvg-url'] || meta['url-tvg'] || '', baseUrl) ?? undefined;
  const items: Channel[] = [];
  let pending: { name: string; group: string; logo?: string; tvgId?: string } | null = null;
  let extGroup = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const attrs = attributes(line);
      const comma = line.lastIndexOf(',');
      const name = comma === -1 ? '' : line.slice(comma + 1).trim();
      pending = {
        name: attrs['tvg-name'] || name || 'Canal sem nome',
        group: attrs['group-title'] || extGroup || 'Sem categoria',
        logo: resolveMediaUrl(attrs['tvg-logo'] || '', baseUrl) ?? undefined,
        tvgId: attrs['tvg-id'] || undefined
      };
      extGroup = '';
    } else if (line.startsWith('#EXTGRP:')) {
      extGroup = line.slice(8).trim();
      if (pending && pending.group === 'Sem categoria') pending.group = extGroup;
    } else if (line && !line.startsWith('#') && pending) {
      const url = resolveMediaUrl(line, baseUrl);
      if (url) items.push({ id: `${sourceId}:${items.length}`, sourceId, ...pending, url, type: classify(url, pending.group) });
      pending = null;
    }
  }
  if (!items.length) throw new Error('Nenhum stream HTTP/HTTPS válido foi encontrado nesta lista.');
  return { items, epgUrl };
}
