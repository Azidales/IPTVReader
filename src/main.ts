import './styles/main.css';
import type { Channel, Program, Section, Source } from './core/types';
import { parseM3U } from './core/m3u';
import { parseXmltv, currentProgram } from './core/epg';
import { connectXtream, getEpisodes } from './core/xtream';
import { validateRemote } from './core/urls';
import { loadSources, saveSources, favorites, saveFavorites } from './core/storage';
import { PlayerManager } from './player/manager';

type FormMode = 'file' | 'm3u' | 'xtream' | 'direct';
const app = document.querySelector<HTMLDivElement>('#app')!;
const state = {
  sources: [] as Source[], section: 'live' as Section, query: '', group: 'Todas',
  selected: null as Channel | null, programs: [] as Program[],
  favoriteIds: favorites(), busy: false, channelLimit: 120, formMode: 'm3u' as FormMode
};
const icons = {
  play: '<path d="m8 5 12 7-12 7z"/>', tv: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 2l4 3 4-3M8 11v4m4-4v4"/>',
  movies: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 4l3 6m3-6 3 6"/>',
  series: '<rect x="5" y="3" width="16" height="16" rx="2"/><path d="M2 8v12h12m-5-12h8m-8 4h6"/>',
  star: '<path d="m12 2 3.1 6.4 7.1 1-5.1 5 .9 7-6-3.3-6 3.3 1-7-5.2-5 7.1-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
  radio: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M2 3l3 3M22 3l-3 3"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>', refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 9a7 7 0 0 1 12-2l2 5M4 12l2 5a7 7 0 0 0 12-2"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
};
const icon = (name: keyof typeof icons, size=18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const esc = (str: unknown): string => String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
const uid = () => crypto.randomUUID();
const count = (section: Section) => allItems().filter(x => section==='all'||(section==='favorite' ? state.favoriteIds.has(x.id) : x.type===section)).length;
const allItems = () => state.sources.flatMap(s => s.items);
const fmt = (value: number) => Intl.NumberFormat('pt-BR').format(value);
const nav: Array<[Section, string, keyof typeof icons]> = [ ['live','TV ao vivo','tv'], ['movie','Filmes','movies'], ['series','Séries','series'], ['favorite','Favoritos','star'], ['all','Todo o catálogo','grid'] ];
const videoArea = () => document.querySelector<HTMLVideoElement>('#main-video');
let player: PlayerManager | undefined;

function page(): void {
  app.innerHTML = `<div class="shell">
    <aside class="sidebar" id="sidebar"><div class="brand"><div class="brand-mark">${icon('play',23)}</div><div class="brand-copy"><b>IPTV<span>Reader</span></b><small>SUA CENTRAL DE TV</small></div></div>
    <div class="side-label">NAVEGAÇÃO</div><nav class="navigation" aria-label="Navegação principal">${nav.map(([id,name,ico]) => `<button data-nav="${id}" class="nav-item ${state.section===id?'active':''}">${icon(ico)}<span>${name}</span><span class="nav-count">${fmt(count(id))}</span></button>`).join('')}</nav>
    <div class="side-label side-label-sources">MINHAS FONTES <button class="icon-button" title="Adicionar fonte" aria-label="Adicionar fonte" id="side-add">${icon('plus',16)}</button></div><div class="sources" id="source-list">${renderSources()}</div>
    <div class="side-foot"><div class="foot-dot"></div> Player local • sem rastreamento <small>V 0.1 · GitHub Pages</small></div></aside>
    <main class="main"><header class="topbar"><button class="mobile-menu icon-button" id="mobile-menu" aria-label="Menu">${icon('menu',22)}</button><div class="breadcrumbs">BIBLIOTECA <span>/</span> <strong id="section-title">TV ao vivo</strong></div><div class="toolbar"><button class="button button-ghost" id="epg-import" title="Importar guia XMLTV">${icon('list',17)} <span>Importar EPG</span></button><button class="button button-primary" id="add-source">${icon('plus',19)} Adicionar fonte</button></div></header>
    <div class="workspace"><div class="heading"><div><div class="eyebrow"><span class="pulse"></span> SUA BIBLIOTECA DIGITAL</div><h1 id="page-title">TV ao vivo</h1><p id="page-caption">Seus canais, filmes e séries em um só lugar.</p></div><span class="library-stat" id="library-stat">${fmt(allItems().length)} itens adicionados</span></div>
    <section class="view-grid"><div class="player-panel"><div class="player-screen" id="screen"><video id="main-video" controls playsinline preload="none"></video><div class="screen-empty" id="screen-empty"><div class="empty-symbol">${icon('play',43)}</div><h2>Pronto para assistir</h2><p>Escolha um canal à direita ou adicione uma fonte para começar.</p><button class="button button-primary" id="empty-add">${icon('plus')} Adicionar conteúdo</button></div><div class="player-error hidden" id="player-error"></div></div><div class="now-playing"><div class="now-label"><span class="signal-dot"></span><span id="now-type">SEM REPRODUÇÃO</span></div><div class="now-row"><div class="now-logo" id="now-logo">${icon('tv',24)}</div><div class="now-details"><h3 id="now-name">Nenhum canal selecionado</h3><span id="now-group">Adicione sua primeira fonte IPTV para começar</span></div><button id="favorite-selected" class="icon-button" title="Adicionar aos favoritos" aria-label="Favoritar" disabled>${icon('star',20)}</button></div><div class="program-line" id="program-line"></div></div>
    <div class="help-inline">${icon('alert',16)} <span>GitHub Pages aceita streams HTTPS compatíveis com o navegador. CORS, codec e permissões do provedor podem limitar a reprodução.</span></div></div>
    <div class="library-panel"><div class="library-head"><div><h2>Explorar conteúdo</h2><p id="item-summary">Busque e selecione para assistir</p></div><button title="Recarregar conteúdo" class="icon-button" id="refresh" aria-label="Atualizar lista">${icon('refresh',18)}</button></div><div class="search-box">${icon('search',19)}<input id="search-input" type="search" placeholder="Buscar canais, filmes, séries..." autocomplete="off" aria-label="Pesquisar catálogo"></div><div class="filter-wrap"><select id="group-filter" aria-label="Filtrar por grupo"></select><span class="filter-count" id="filter-count"></span></div><div id="items" class="items"></div><button class="button more-button hidden" id="more">Carregar mais</button></div></section>
    <section class="below"><div><div class="below-label">SIMPLES. ABERTO. SEU.</div><h3>Seu conteúdo, no seu controle.</h3><p>O IPTVReader não fornece canais ou assinaturas. Conecte playlists e streams que você tem autorização para acessar.</p></div><button class="button button-outline" id="bottom-add">${icon('plus')} Conectar outra fonte</button></section></div></main></div>
    <dialog id="source-modal" class="modal"><form id="source-form"><div class="modal-top"><div><div class="eyebrow">CONFIGURAÇÃO</div><h2>Adicionar uma fonte</h2><p>Conecte uma lista ou um stream autorizado.</p></div><button type="button" class="icon-button" id="close-modal" aria-label="Fechar">${icon('close',22)}</button></div><div class="tabs" role="tablist">${([['m3u','URL M3U'],['file','Arquivo'],['xtream','Xtream'],['direct','Link direto']] as Array<[FormMode,string]>).map(([id,label])=>`<button type="button" class="tab" data-form-mode="${id}" role="tab">${label}</button>`).join('')}</div>
    <div class="form-fields" id="form-fields"></div><div class="form-error" id="form-error" role="alert"></div><div class="modal-footer"><button type="button" class="button button-ghost" id="cancel-modal">Cancelar</button><button type="submit" class="button button-primary" id="connect-button">${icon('plus',18)} Adicionar fonte</button></div></form></dialog>
    <dialog id="episodes-modal" class="modal"><div class="modal-top"><div><div class="eyebrow">EPISÓDIOS</div><h2 id="episodes-title">Série</h2><p>Escolha um episódio para reproduzir.</p></div><button class="icon-button" id="close-episodes" aria-label="Fechar">${icon('close',20)}</button></div><div id="episodes-list" class="episodes"></div></dialog>
    <input type="file" id="epg-file" accept=".xml,.xmltv,text/xml,application/xml" hidden />`;
  player = new PlayerManager(videoArea()!);
  videoArea()!.addEventListener('error', () => showPlayerError('Não foi possível reproduzir este stream. Verifique o formato, o codec e as permissões da fonte.'));
  videoArea()!.addEventListener('streamfatal', () => showPlayerError('Falha fatal de transmissão. O servidor pode estar indisponível ou bloqueando CORS.'));
  bind(); updateLibrary(); updateNow();
}
function renderSources(): string {
  if (!state.sources.length) return '<div class="no-sources">Nenhuma fonte conectada</div>';
  return state.sources.map(s => `<div class="source-entry"><div class="source-icon">${icon(s.kind==='file'?'upload':'radio',16)}</div><div class="source-title"><strong title="${esc(s.name)}">${esc(s.name)}</strong><small>${fmt(s.items.length)} itens · ${esc(s.kind.toUpperCase())}</small></div><button class="icon-button source-remove" data-remove="${esc(s.id)}" title="Excluir fonte" aria-label="Remover ${esc(s.name)}">${icon('trash',15)}</button></div>`).join('');
}
function getVisible(): Channel[] {
  let result = allItems().filter(item => state.section==='all'||(state.section==='favorite'?state.favoriteIds.has(item.id):item.type===state.section));
  if (state.group !== 'Todas') result=result.filter(item=>item.group===state.group);
  if (state.query) { const query=state.query.toLocaleLowerCase('pt-BR'); result=result.filter(item=>(item.name+' '+item.group).toLocaleLowerCase('pt-BR').includes(query)); }
  return result;
}
function updateLibrary(): void {
  const current = nav.find(x=>x[0]===state.section)?.[1] ?? 'TV ao vivo';
  document.querySelector('#section-title')!.textContent=current;
  document.querySelector('#page-title')!.textContent=current;
  document.querySelector('#page-caption')!.textContent=state.section==='favorite'?'Acesse rapidamente os conteúdos que você marcou.':'Explore seu catálogo e comece a assistir.';
  document.querySelector('#library-stat')!.textContent=`${fmt(allItems().length)} itens adicionados`;
  document.querySelector('#source-list')!.innerHTML=renderSources();
  document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(b=>{b.classList.toggle('active',b.dataset.nav===state.section);b.querySelector('.nav-count')!.textContent=fmt(count(b.dataset.nav as Section));});
  const choices = new Set(allItems().filter(c => state.section==='all'||(state.section==='favorite'?state.favoriteIds.has(c.id):c.type===state.section)).map(c=>c.group));
  const groups=['Todas',...Array.from(choices).sort((a,b)=>a.localeCompare(b,'pt-BR'))];
  if (!groups.includes(state.group)) state.group='Todas';
  const select=document.querySelector<HTMLSelectElement>('#group-filter')!;
  select.innerHTML=groups.map(g=>`<option value="${esc(g)}">${esc(g==='Todas'?'Todas as categorias':g)}</option>`).join('');select.value=state.group;
  const list=getVisible();
  document.querySelector('#filter-count')!.textContent=`${fmt(list.length)} itens`;
  document.querySelector('#item-summary')!.textContent=state.sources.length ? `${fmt(list.length)} resultados disponíveis` : 'Adicione uma fonte para começar';
  const container=document.querySelector('#items')!;
  if (!list.length) container.innerHTML=`<div class="items-empty">${icon('search',26)}<strong>${state.sources.length?'Nenhum conteúdo encontrado':'Seu catálogo está vazio'}</strong><p>${state.sources.length?'Tente outro termo ou categoria.':'Use “Adicionar fonte” para carregar sua primeira lista.'}</p></div>`;
  else container.innerHTML=list.slice(0,state.channelLimit).map(c=>{const prog=currentProgram(state.programs,c.tvgId);return `<button class="channel ${state.selected?.id===c.id?'selected':''}" data-channel="${esc(c.id)}"><div class="channel-logo">${c.logo?`<img src="${esc(c.logo)}" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.hidden=true">`:icon(c.type==='movie'?'movies':c.type==='series'?'series':'tv',22)}</div><div class="channel-body"><strong>${esc(c.name)}</strong><small>${esc(prog?.title||c.group)}</small></div><div class="channel-end">${state.favoriteIds.has(c.id)?'<span class="is-fav">★</span>':''}${icon('play',16)}</div></button>`;}).join('');
  document.querySelector('#more')!.classList.toggle('hidden', list.length<=state.channelLimit);
  // Event delegation avoids listeners on potentially thousands of channels.
}
function updateNow(): void {
  const c=state.selected;
  document.querySelector('#now-name')!.textContent=c?.name||'Nenhum canal selecionado';
  document.querySelector('#now-group')!.textContent=c ? `${c.group} · ${state.sources.find(s=>s.id===c.sourceId)?.name||'Fonte'}` : 'Adicione sua primeira fonte IPTV para começar';
  document.querySelector('#now-type')!.textContent=c ? ({live:'AO VIVO',movie:'FILME',series:'SÉRIE'}[c.type]) : 'SEM REPRODUÇÃO';
  document.querySelector('#now-logo')!.innerHTML=c?.logo ? `<img src="${esc(c.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.hidden=true">`:icon('tv',24);
  const fav=document.querySelector<HTMLButtonElement>('#favorite-selected')!;
  fav.disabled=!c; fav.classList.toggle('favorite-on',Boolean(c && state.favoriteIds.has(c.id)));
  const program=currentProgram(state.programs,c?.tvgId);
  document.querySelector('#program-line')!.textContent=program ? `Agora: ${program.title} (${new Date(program.start).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}–${new Date(program.end).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})})`:'';
}
function showPlayerError(message: string): void { const el=document.querySelector('#player-error')!;el.textContent=message;el.classList.remove('hidden'); }
async function selectChannel(channel: Channel): Promise<void> {
  state.selected=channel;updateNow();updateLibrary();
  if (channel.type==='series' && channel.seriesId!=null) { await showEpisodes(channel); return; }
  document.querySelector('#player-error')!.classList.add('hidden');
  document.querySelector('#screen-empty')!.classList.add('hidden');
  if (!channel.url) { showPlayerError('Este item não possui link de reprodução.'); return; }
  try { await player!.play(channel.url); } catch(e) { showPlayerError(errorMessage(e)); }
}
async function showEpisodes(c: Channel): Promise<void> {
  const dialog=document.querySelector<HTMLDialogElement>('#episodes-modal')!;
  document.querySelector('#episodes-title')!.textContent=c.name;
  const list=document.querySelector('#episodes-list')!;
  list.textContent='Consultando episódios...';dialog.showModal();
  try {
    const episodes=await getEpisodes(c);
    list.innerHTML=episodes.length?episodes.map(ep=>`<button class="episode" data-url="${esc(ep.url)}"><span>Temporada ${esc(ep.season)}</span><strong>${esc(ep.title)}</strong>${icon('play',16)}</button>`).join(''):'Nenhum episódio encontrado.';
  } catch(e){list.textContent=errorMessage(e);}
}
function errorMessage(e: unknown): string { return e instanceof Error ? e.message : 'Ocorreu um erro inesperado.'; }
function showToast(message: string, error=false): void {
  const current=document.querySelector('.toast');current?.remove();
  const toast=document.createElement('div');toast.className=`toast ${error?'toast-error':''}`;toast.textContent=message;document.body.append(toast);
  setTimeout(()=>toast.remove(),5000);
}
function openModal():void {const d=document.querySelector<HTMLDialogElement>('#source-modal')!;state.formMode='m3u';drawForm();d.showModal();}
function drawForm():void {
  document.querySelectorAll<HTMLButtonElement>('[data-form-mode]').forEach(x=>{x.classList.toggle('selected',x.dataset.formMode===state.formMode);x.setAttribute('aria-selected',String(x.dataset.formMode===state.formMode));});
  const name='<label>Nome da fonte<input name="name" type="text" maxlength="80" placeholder="Minha lista" /></label>';
  const body:Record<FormMode,string>={
    m3u:`${name}<label>URL da playlist M3U / M3U8<input name="url" type="url" required placeholder="https://servidor.exemplo/lista.m3u" /></label><p class="field-hint">O servidor da lista precisa autorizar acesso CORS a partir do navegador.</p>`,
    file:`${name}<label>Arquivo de playlist<input name="file" type="file" accept=".m3u,.m3u8,text/plain" required /></label><p class="field-hint">O arquivo é processado no próprio navegador e salvo localmente para próximos acessos.</p>`,
    xtream:`${name}<label>Endereço do servidor<input name="server" type="url" required placeholder="https://servidor.exemplo:porta" /></label><div class="field-row"><label>Usuário<input name="username" type="text" required autocomplete="off" /></label><label>Senha<input name="password" type="password" required autocomplete="off" /></label></div><p class="field-hint">Credenciais ficam somente na memória desta aba; Xtream não é salvo após fechar/atualizar a página. O servidor deve usar HTTPS e permitir CORS.</p>`,
    direct:`${name}<label>URL de vídeo (HLS, DASH, MP4, TS, FLV)<input name="url" type="url" required placeholder="https://servidor.exemplo/canal.m3u8" /></label><p class="field-hint">Um link direto adiciona um item ao catálogo. Streams HLS, DASH, MPEG-TS e arquivos de vídeo compatíveis são aceitos.</p>`
  };
  document.querySelector('#form-fields')!.innerHTML=body[state.formMode];document.querySelector('#form-error')!.textContent='';
}
async function addSource(event: Event): Promise<void> {
  event.preventDefault();if(state.busy)return;
  const form=document.querySelector<HTMLFormElement>('#source-form')!;
  const input=new FormData(form);const field=(key:string)=>String(input.get(key)||'').trim();
  const id=uid(), kind=state.formMode;
  const name=field('name')||({m3u:'Playlist M3U',file:'Arquivo M3U',xtream:'Xtream',direct:'Stream'}[kind]);
  state.busy=true;const submit=document.querySelector<HTMLButtonElement>('#connect-button')!;submit.disabled=true;submit.textContent='Conectando...';
  try {
    let source:Source;
    if (kind==='xtream') source=await connectXtream({server:field('server'),username:field('username'),password:field('password')},id,name);
    else if(kind==='direct') {
      const url=validateRemote(field('url'));source={id,name,kind,items:[{id:`${id}:0`,sourceId:id,name,group:'Links diretos',url,type:'live'}]};
    } else {
      let content:string, base:string|undefined;
      if(kind==='file') { const file=input.get('file'); if(!(file instanceof File)||!file.size) throw new Error('Selecione um arquivo M3U.'); if(file.size>25*1024*1024) throw new Error('O limite por arquivo é 25 MB.');content=await file.text(); }
      else {
        base=validateRemote(field('url'));
        const response=await fetch(base,{signal:AbortSignal.timeout(25000)});
        if(!response.ok)throw new Error(`Não foi possível baixar a lista: HTTP ${response.status}.`);
        const length=Number(response.headers.get('content-length')||0);
        if(length>25*1024*1024)throw new Error('A lista excede 25 MB.');
        content=await response.text();if(content.length>25*1024*1024)throw new Error('A lista excede 25 MB.');
      }
      const parsed=parseM3U(content,id,base);source={id,name,kind,items:parsed.items,epgUrl:parsed.epgUrl,originUrl:base};
    }
    state.sources.push(source);
    await saveSources(state.sources);
    state.section=source.items.some(i=>i.type==='live')?'live':'all';state.query='';state.group='Todas';state.channelLimit=120;
    document.querySelector<HTMLInputElement>('#search-input')!.value='';
    document.querySelector<HTMLDialogElement>('#source-modal')!.close();updateLibrary();
    showToast(`${fmt(source.items.length)} itens adicionados em “${source.name}”.`);
  }catch(e) { document.querySelector('#form-error')!.textContent=errorMessage(e); }
  finally {state.busy=false;submit.disabled=false;submit.innerHTML=`${icon('plus',18)} Adicionar fonte`;}
}
async function importEpg(file:File):Promise<void>{
  if(file.size>35*1024*1024){showToast('XMLTV excede 35 MB.',true);return;}
  try {const parsed=parseXmltv(await file.text());state.programs=parsed;updateLibrary();updateNow();showToast(`${fmt(parsed.length)} programas importados para esta sessão.`);}catch(e){showToast(errorMessage(e),true);}
}
async function refresh():Promise<void>{
  if (state.busy) return;
  const sources=state.sources.filter(s=>s.kind==='m3u' && s.originUrl);
  if(!sources.length){showToast('Não há playlists M3U remotas para atualizar.');return;}
  state.busy=true;
  let updated=0, failed=0;
  try {
    for(const source of sources){
      try {
        const response=await fetch(source.originUrl!,{signal:AbortSignal.timeout(25000),cache:'no-store'});
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        const text=await response.text();
        if(text.length>25*1024*1024) throw new Error('Lista acima de 25 MB');
        const parsed=parseM3U(text,source.id,source.originUrl);
        source.items=parsed.items;source.epgUrl=parsed.epgUrl;updated++;
      } catch {failed++; }
    }
    await saveSources(state.sources);
    updateLibrary();showToast(`${updated} lista(s) atualizada(s)${failed?` · ${failed} com erro (CORS, rede ou servidor)`:''}.`,Boolean(failed && !updated));
  }catch(e){showToast(errorMessage(e),true);}finally{state.busy=false;}
}
function bind():void {
  document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(b=>b.addEventListener('click',()=>{state.section=b.dataset.nav as Section;state.group='Todas';state.channelLimit=120;updateLibrary();document.querySelector('#sidebar')!.classList.remove('open');}));
  for(const id of ['side-add','add-source','empty-add','bottom-add']) document.querySelector('#'+id)?.addEventListener('click',openModal);
  document.querySelector('#mobile-menu')!.addEventListener('click',()=>document.querySelector('#sidebar')!.classList.toggle('open'));
  document.querySelector('#close-modal')!.addEventListener('click',()=>document.querySelector<HTMLDialogElement>('#source-modal')!.close());
  document.querySelector('#cancel-modal')!.addEventListener('click',()=>document.querySelector<HTMLDialogElement>('#source-modal')!.close());
  document.querySelector('#close-episodes')!.addEventListener('click',()=>document.querySelector<HTMLDialogElement>('#episodes-modal')!.close());
  document.querySelector('#source-form')!.addEventListener('submit',addSource);
  document.querySelectorAll<HTMLButtonElement>('[data-form-mode]').forEach(b=>b.addEventListener('click',()=>{state.formMode=b.dataset.formMode as FormMode;drawForm();}));
  document.querySelector('#search-input')!.addEventListener('input',(e)=>{state.query=(e.target as HTMLInputElement).value;state.channelLimit=120;updateLibrary();});
  document.querySelector('#group-filter')!.addEventListener('change',(e)=>{state.group=(e.target as HTMLSelectElement).value;state.channelLimit=120;updateLibrary();});
  document.querySelector('#more')!.addEventListener('click',()=>{state.channelLimit+=120;updateLibrary();});
  document.querySelector('#items')!.addEventListener('click',e=>{const button=(e.target as Element).closest<HTMLButtonElement>('[data-channel]');if(button){const c=allItems().find(c=>c.id===button.dataset.channel);if(c) void selectChannel(c);}});
  document.querySelector('#source-list')!.addEventListener('click',e=>{const b=(e.target as Element).closest<HTMLButtonElement>('[data-remove]');if(!b)return;const source=state.sources.find(x=>x.id===b.dataset.remove);if(!source)return;if(!confirm(`Excluir a fonte “${source.name}” do navegador?`))return;state.sources=state.sources.filter(s=>s.id!==source.id);if(state.selected?.sourceId===source.id){player?.stop();state.selected=null;document.querySelector('#screen-empty')!.classList.remove('hidden');updateNow();}void saveSources(state.sources).then(()=>{updateLibrary();showToast('Fonte removida.');}).catch(e=>showToast(errorMessage(e),true));});
  document.querySelector('#favorite-selected')!.addEventListener('click',()=>{const c=state.selected;if(!c)return;if(state.favoriteIds.has(c.id))state.favoriteIds.delete(c.id);else state.favoriteIds.add(c.id);saveFavorites(state.favoriteIds);updateNow();updateLibrary();});
  document.querySelector('#epg-import')!.addEventListener('click',()=>document.querySelector<HTMLInputElement>('#epg-file')!.click());
  document.querySelector('#epg-file')!.addEventListener('change',e=>{const file=(e.target as HTMLInputElement).files?.[0];if(file)void importEpg(file);});
  document.querySelector('#refresh')!.addEventListener('click',()=>void refresh());
  document.querySelector('#episodes-list')!.addEventListener('click',e=>{const b=(e.target as Element).closest<HTMLButtonElement>('[data-url]');if(!b)return;document.querySelector<HTMLDialogElement>('#episodes-modal')!.close();document.querySelector('#screen-empty')!.classList.add('hidden');document.querySelector('#player-error')!.classList.add('hidden');void player!.play(b.dataset.url!).catch(err=>showPlayerError(errorMessage(err)));});
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach(d=>d.addEventListener('click',(e)=>{if(e.target===d)d.close();}));
}
async function start():Promise<void>{
  try {state.sources=await loadSources();}catch {state.sources=[];}
  page();
}
void start();
