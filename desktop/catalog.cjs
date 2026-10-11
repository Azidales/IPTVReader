'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');
const { once } = require('node:events');

function attrs(line) {
  const out = {};
  for (const match of line.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g)) out[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return out;
}
function classify(url, group) {
  const g = group.toLowerCase();
  const p = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ''; } })();
  if (p.includes('/series/') || /s[eé]ries|series|novelas/.test(g)) return 'series';
  if (p.includes('/movie/') || /filmes|movies|vod|cinema/.test(g) || /\.(mp4|mkv|avi|mov)$/.test(p)) return 'movie';
  return 'live';
}
function checkStream(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'rtmp:', 'rtsp:'].includes(url.protocol);
  } catch { return false; }
}
function safeId(value) { return typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value); }

class Catalog {
  constructor(folder) { this.folder = path.join(folder, 'catalogs'); this.sources = new Map(); }
  async initialize() {
    await fsp.mkdir(this.folder, { recursive: true });
    for (const name of await fsp.readdir(this.folder)) {
      if (!name.endsWith('.meta.json')) continue;
      const id = name.slice(0, -'.meta.json'.length);
      if (!safeId(id)) continue;
      try {
        const meta = JSON.parse(await fsp.readFile(this.filename(id, 'meta.json'), 'utf8'));
        if (meta.id !== id) continue;
        this.sources.set(id, { meta, index: null });
      } catch { /* ignore incomplete imports */ }
    }
  }
  filename(id, ext) { if (!safeId(id)) throw new Error('Identificador inválido.'); return path.join(this.folder, `${id}.${ext}`); }
  summaries() { return [...this.sources.values()].map(x => x.meta).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  async getIndex(id) {
    const x = this.sources.get(id);
    if (!x) throw new Error('Fonte não encontrada.');
    if (!x.index) x.index = JSON.parse(await fsp.readFile(this.filename(id,'index.json'), 'utf8'));
    return x.index;
  }
  async importFile(filePath, displayName, progress = () => {}) {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || stat.size > 1024 * 1024 * 1024) throw new Error('Arquivo inválido ou maior que 1 GB.');
    const id = crypto.randomUUID();
    const temp = this.filename(id, 'part');
    const output = fs.createWriteStream(temp, { flags:'wx' });
    let offset = 0, count = 0, seenHeader = false, lastProgress = 0, pending = null;
    const index = [], groups = new Map(), totals = { live: 0, movie: 0, series: 0 };
    const reader = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 256 * 1024 });
    try {
      for await (const raw of readline.createInterface({input:reader,crlfDelay:Infinity})) {
        const line = raw.trim();
        if (line.startsWith('#EXTM3U')) seenHeader = true;
        if (line.startsWith('#EXTINF:')) {
          const a = attrs(line); const comma = line.lastIndexOf(',');
          pending = {name: a['tvg-name'] || (comma >= 0 ? line.slice(comma+1).trim() : '') || 'Sem nome',group:a['group-title']||'Sem categoria',logo:a['tvg-logo']||'',tvgId:a['tvg-id']||''};
        } else if (line.startsWith('#EXTGRP:') && pending && pending.group === 'Sem categoria') pending.group = line.slice(8).trim();
        else if (pending && line && !line.startsWith('#')) {
          if (checkStream(line)) {
            const type = classify(line, pending.group);
            const record = { id: `${id}:${count}`, sourceId:id, ...pending, type, url:line };
            const bytes = Buffer.from(JSON.stringify(record)+'\n');
            if (!output.write(bytes)) await once(output,'drain');
            index.push([offset,bytes.length,record.name,record.group,type,record.logo]);
            offset += bytes.length; count++; totals[type]++;
            groups.set(record.group,(groups.get(record.group)||0)+1);
          }
          pending = null;
        }
        if (count - lastProgress >= 10000) { progress({count, bytes:reader.bytesRead,totalBytes:stat.size}); lastProgress = count; }
      }
      output.end(); await once(output,'finish');
      if (!seenHeader || !count) throw new Error('M3U inválida ou sem links de reprodução aceitos.');
      const meta = {id,name:String(displayName||path.basename(filePath)).slice(0,120),kind:'file',count,totals,groups:[...groups].sort((a,b)=>a[0].localeCompare(b[0], 'pt-BR')),createdAt:new Date().toISOString()};
      await fsp.writeFile(this.filename(id,'index.json'),JSON.stringify(index));
      await fsp.rename(temp,this.filename(id,'ndjson'));
      await fsp.writeFile(this.filename(id,'meta.json'),JSON.stringify(meta));
      this.sources.set(id,{meta,index});
      progress({count, bytes:stat.size,totalBytes:stat.size,done:true});
      return meta;
    } catch (err) {
      reader.destroy();output.destroy();
      await Promise.all(['part','ndjson','index.json','meta.json'].map(ext=>fsp.rm(this.filename(id,ext),{force:true}).catch(()=>{})));
      throw err;
    }
  }
  async search({ section='live', group='', search='', page=0, size=80, favorites=[] }={}) {
    if (!['live','movie','series','all','favorite'].includes(section)) section='live';
    const target = String(search).trim().toLocaleLowerCase('pt-BR').slice(0,200);
    const selectedGroup = String(group).slice(0,300);
    const allowedFavorites = section==='favorite' ? new Set(Array.isArray(favorites) ? favorites.slice(0,50000) : []) : null;
    const requested = Number.isSafeInteger(page) ? Math.max(0,Math.min(page,100000)) : 0;
    const limit = Number.isSafeInteger(size) ? Math.max(1,Math.min(size,120)) : 80;
    const rows=[];let total=0;
    for(const {meta} of this.sources.values()) {
      const entries = await this.getIndex(meta.id);
      for(let i=0;i<entries.length;i++) {
        const [offset,len,name,entryGroup,type,logo]=entries[i];
        if(section!=='all' && section!==type && section!=='favorite')continue;
        if(allowedFavorites && !allowedFavorites.has(`${meta.id}:${i}`))continue;
        if(selectedGroup && entryGroup!==selectedGroup)continue;
        if(target && !name.toLocaleLowerCase('pt-BR').includes(target))continue;
        if(total >= requested*limit && rows.length < limit) rows.push({id:`${meta.id}:${i}`,name,group:entryGroup,type,logo});
        total++;
      }
    }
    return {rows,total,page:requested,size:limit};
  }
  async item(id) {
    const match=/^([0-9a-f-]{36}):(\d+)$/.exec(id||'');
    if(!match)return null;
    const index=await this.getIndex(match[1]); const row=index[Number(match[2])];
    if(!row)return null;
    const fh=await fsp.open(this.filename(match[1],'ndjson'),'r');
    try { const buff=Buffer.allocUnsafe(row[1]); await fh.read(buff,0,row[1],row[0]); return JSON.parse(buff.toString('utf8')); }
    finally {await fh.close();}
  }
  async remove(id) {
    if (!this.sources.has(id)) return false;
    this.sources.delete(id);
    await Promise.all(['ndjson','index.json','meta.json'].map(ext=>fsp.rm(this.filename(id,ext),{force:true})));
    return true;
  }
}
module.exports={Catalog,attrs,classify};
