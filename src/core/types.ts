export type ContentType = 'live' | 'movie' | 'series';
export type SourceKind = 'file' | 'm3u' | 'xtream' | 'direct' | 'demo';
export interface Channel {
  id: string;
  sourceId: string;
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;
  type: ContentType;
  seriesId?: number;
  xtream?: { base: string; username: string; password: string };
}
export interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  items: Channel[];
  epgUrl?: string;
  originUrl?: string;
}
export interface Program { channelId: string; title: string; start: number; end: number; description?: string }
export type Section = 'live' | 'movie' | 'series' | 'favorite' | 'all';
