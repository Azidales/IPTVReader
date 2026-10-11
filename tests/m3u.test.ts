import { describe, it, expect } from 'vitest';
import { parseM3U, classify } from '../src/core/m3u';
import { resolveMediaUrl, httpUrl } from '../src/core/urls';
import { detectEngine } from '../src/player/manager';
import { xmltvTimestamp } from '../src/core/epg';
describe('M3U parser',()=>{
  it('parses live channels, logos, group and relative urls',()=>{
    const src='#EXTM3U x-tvg-url="epg.xml"\n#EXTINF:-1 tvg-id="news.id" tvg-logo="https://img.test/logo.png" group-title="Notícias",Canal News\nstreams/live.m3u8\n#EXTINF:-1 group-title="Filmes",Um filme\nhttps://cdn.test/movie/1.mp4';
    const playlist=parseM3U(src,'s','https://example.test/path/list.m3u');
    expect(playlist.items).toHaveLength(2);
    expect(playlist.items[0]).toMatchObject({name:'Canal News',type:'live',tvgId:'news.id',group:'Notícias',url:'https://example.test/path/streams/live.m3u8'});
    expect(playlist.items[1].type).toBe('movie');
    expect(playlist.epgUrl).toBe('https://example.test/path/epg.xml');
  });
  it('rejects non-playlists and unsafe media protocols',()=>{
    expect(()=>parseM3U('hello','s')).toThrow();
    const result=parseM3U('#EXTM3U\n#EXTINF:-1,Ok\njavascript:alert(1)\n#EXTINF:-1,Bom\nhttps://safe.test/a.m3u8','s');
    expect(result.items).toHaveLength(1);
    expect(resolveMediaUrl('file:///a')).toBeNull();
  });
  it('handles EXTGRP and CRLF',()=>{
    const a=parseM3U('#EXTM3U\r\n#EXTINF:-1,Item\r\n#EXTGRP:News\r\nhttps://test.com/test.ts','s');
    expect(a.items[0].group).toBe('News');
  });
});
describe('engine selection',()=>{
  it('uses path extensions even with query strings',()=>{
    expect(detectEngine('https://a.test/a.m3u8?token=abc')).toBe('hls');
    expect(detectEngine('https://a.test/a.mpd')).toBe('dash');
    expect(detectEngine('https://a.test/a.ts')).toBe('mpegts');
    expect(detectEngine('https://a.test/a.mp4')).toBe('native');
    expect(detectEngine('rtsp://a.test')).toBe('unsupported');
  });
  it('classifies series/movie by category',()=>{
    expect(classify('https://example.test/a','Séries')).toBe('series');
    expect(classify('https://example.test/a','Cinema')).toBe('movie');
  });
  it('rejects dangerous URL schemes',()=>{expect(()=>httpUrl('javascript:alert(1)')).toThrow();});
});
it('converts XMLTV timestamps with timezone',()=>{
  expect(xmltvTimestamp('20261011123000 -0300')).toBe(Date.UTC(2026,9,11,15,30));
});
