import type { Channel, ContentType, Source } from './types';
import { httpUrl } from './urls';

export interface XtreamCredentials { server: string; username: string; password: string }
interface XtreamItem { stream_id?: number; series_id?: number; name?: string; stream_icon?: string; cover?: string; category_id?: string; container_extension?: string; epg_channel_id?: string }
interface XtreamCategory { category_id?: string; category_name?: string }

export async function connectXtream(data: XtreamCredentials, sourceId: string, name: string): Promise<Source> {
  const base = httpUrl(data.server).href.replace(/\/$/, '');
  if (!data.username || !data.password) throw new Error('Informe o usuário e a senha Xtream.');
  const api = new URL(`${base}/player_api.php`);
  api.searchParams.set('username', data.username);
  api.searchParams.set('password', data.password);
  async function get(action?: string): Promise<any> {
    const url = new URL(api);
    if (action) url.searchParams.set('action', action);
    const response = await fetch(url, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Servidor Xtream respondeu HTTP ${response.status}.`);
    return response.json();
  }
  const auth = await get();
  if (auth?.user_info?.auth !== 1 && auth?.user_info?.auth !== '1') throw new Error('O servidor Xtream rejeitou as credenciais.');
  const plans: Array<[ContentType, string, string]> = [
    ['live', 'get_live_streams', 'get_live_categories'],
    ['movie', 'get_vod_streams', 'get_vod_categories'],
    ['series', 'get_series', 'get_series_categories']
  ];
  const results = await Promise.allSettled(plans.map(async ([type, action, cats]) => {
    const [streams, categories] = await Promise.all([get(action), get(cats).catch(() => [])]);
    const groupMap = new Map<string, string>((Array.isArray(categories) ? categories : []).map((c: XtreamCategory) => [String(c.category_id), c.category_name || 'Sem categoria']));
    return (Array.isArray(streams) ? streams : []).map((item: XtreamItem): Channel | null => {
      const streamId = type === 'series' ? item.series_id : item.stream_id;
      if (streamId == null) return null;
      const ext = type === 'movie' ? (item.container_extension || 'mp4').replace(/[^a-z0-9]/gi, '') : 'm3u8';
      const media = new URL(`${base}/${type === 'movie' ? 'movie' : 'live'}/${encodeURIComponent(data.username)}/${encodeURIComponent(data.password)}/${streamId}.${ext}`);
      return {
        id: `${sourceId}:${type}:${streamId}`, sourceId, name: item.name || `${type} ${streamId}`,
        url: type === 'series' ? '' : media.href,
        logo: item.stream_icon || item.cover || undefined,
        group: groupMap.get(String(item.category_id)) || 'Sem categoria',
        tvgId: item.epg_channel_id || undefined,
        type,
        seriesId: type === 'series' ? Number(streamId) : undefined,
        xtream: type === 'series' ? { base, username: data.username, password: data.password } : undefined
      };
    }).filter((item: Channel | null): item is Channel => Boolean(item));
  }));
  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  if (!items.length) throw new Error('Autenticação aceita, mas nenhum catálogo foi recebido. Verifique a API e o CORS do servidor.');
  return { id: sourceId, name, kind: 'xtream', items };
}

export interface Episode { id: string; title: string; season: string; url: string }
export async function getEpisodes(channel: Channel): Promise<Episode[]> {
  if (!channel.xtream || channel.seriesId == null) throw new Error('Série sem informações Xtream.');
  const { base, username, password } = channel.xtream;
  const api = new URL(`${base}/player_api.php`);
  for (const [key, value] of Object.entries({ username, password, action: 'get_series_info', series_id: String(channel.seriesId) })) api.searchParams.set(key, value);
  const response = await fetch(api, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Falha ao consultar episódios: HTTP ${response.status}`);
  const json = await response.json();
  return Object.entries(json?.episodes || {}).flatMap(([season, items]) => (Array.isArray(items) ? items : []).map((item: any): Episode => ({
    id: String(item.id), title: String(item.title || `Episódio ${item.episode_num || item.id}`), season,
    url: `${base}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${item.id}.${String(item.container_extension || 'mp4').replace(/[^a-z0-9]/gi, '')}`
  })));
}
