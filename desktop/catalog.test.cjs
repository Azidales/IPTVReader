'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {mkdtemp,writeFile,rm}=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {Catalog,classify,attrs}=require('./catalog.cjs');
test('classifica formatos HTTP de canais, filmes e séries',()=>{
 assert.equal(classify('http://srv/live/user/key/44.ts','TV | Geral'),'live');
 assert.equal(classify('http://srv/movie/user/key/55.mp4','Filmes'),'movie');
 assert.equal(classify('http://srv/series/user/key/66.mp4','Séries'),'series');
});
test('lê atributos de playlist',()=>assert.deepEqual(attrs('#EXTINF:-1 tvg-name="Canal, HD" group-title="TV | Geral",Canal'),{'tvg-name':'Canal, HD','group-title':'TV | Geral'}));
test('importa, busca, pagina, persiste e remove playlist de teste',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'iptvreader-test-'));try{
  const file=path.join(dir,'sample.m3u');await writeFile(file,'#EXTM3U\n#EXTINF:-1 tvg-name="Canal A" group-title="TV | Geral",Canal A\nhttp://example.test/live/1.ts\n#EXTINF:-1 group-title="FILMES | Ação",Filme A\nhttp://example.test/movie/2.mp4\n#EXTINF:-1 group-title="SÉRIES | Drama",Episódio A\nhttp://example.test/series/3.mp4\n');
  const cat=new Catalog(dir);await cat.initialize();const result=await cat.importFile(file,'Teste');assert.equal(result.count,3);assert.equal(result.totals.series,1);
  const live=await cat.search({section:'live',size:1});assert.equal(live.total,1);assert.equal(live.rows[0].name,'Canal A');
  assert.equal((await cat.search({section:'movie',search:'Filme'})).total,1);
  const saved=await cat.item(live.rows[0].id);assert.equal(saved.url,'http://example.test/live/1.ts');
  const restored=new Catalog(dir);await restored.initialize();assert.equal((await restored.search({section:'series'})).total,1);
  await restored.remove(result.id);assert.equal((await restored.search({section:'all'})).total,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
