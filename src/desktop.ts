import './styles/desktop.css';
type Section='live'|'movie'|'series'|'all'|'favorite';
type Item={id:string;name:string;group:string;type:string;logo:string};
type Source={id:string;name:string;count:number;totals:{live:number;movie:number;series:number};groups:[string,number][];createdAt:string};
type Results={rows:Item[];total:number;page:number;size:number};
type MpvStatus={ready:boolean;configured:string};
type DesktopAPI={
  sources():Promise<Source[]>;search(q:{section:Section;search:string;group:string;page:number;size:number;favorites?:string[]}):Promise<Results>;
  pickPlaylist():Promise<Source|null>;importUrl(url:string):Promise<Source|null>;removeSource(id:string):Promise<boolean>;
  play(id:string):Promise<{name:string;group:string}>;playerBounds(rect:{x:number;y:number;width:number;height:number}):Promise<boolean>;playerSurfaceVisible(visible:boolean):Promise<boolean>;playerCommand(cmd:string):Promise<boolean>;
  playerStatus():Promise<MpvStatus>;chooseMpv():Promise<MpvStatus|null>;downloadMpv():Promise<void>;fullscreen():Promise<boolean>;
  onProgress(cb:(data:{count:number;bytes:number;totalBytes:number;done?:boolean})=>void):()=>void;
  onPlayerEvent(cb:(event:{type:string;detail?:string})=>void):()=>void;
  onDownload(cb:(data:{bytes:number})=>void):()=>void;onUpdate(cb:(sources:Source[])=>void):()=>void;
};
declare global{interface Window{iptvDesktop:DesktopAPI}}
const api=window.iptvDesktop;
const $=(s:string)=>document.querySelector<HTMLElement>(s)!;
const escapeHtml=(v:unknown)=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]!));
const nf=(n:number)=>new Intl.NumberFormat('pt-BR').format(n);
const state={section:'live' as Section,query:'',group:'',page:0,source:[] as Source[],results:{rows:[],total:0,page:0,size:80} as Results,selected:null as Item|null,busy:false,mpvReady:false,favorites:new Set<string>(),seq:0};
try{const saved=JSON.parse(localStorage.getItem('iptvreader-desktop-favorites')||'[]');if(Array.isArray(saved))state.favorites=new Set(saved.filter((x:unknown)=>typeof x==='string'));}catch{}
function favorite(id:string){if(state.favorites.has(id))state.favorites.delete(id);else state.favorites.add(id);localStorage.setItem('iptvreader-desktop-favorites',JSON.stringify([...state.favorites]));void updateList();}
const icons:Record<Section,string>={live:'▣',movie:'▤',series:'▥',all:'▦',favorite:'★'};
function installUI(){
  $('#app').innerHTML=`<div class="layout">
  <aside class="side"><div class="logo"><div class="logo-mark">▶</div><div><b>IPTV<span>Reader</span></b><small>DESKTOP • WINDOWS</small></div></div>
  <div class="side-label">BIBLIOTECA</div><nav id="navigation"></nav>
  <div class="side-label source-head">FONTES <button id="import-side" class="circle-btn" title="Adicionar fonte">＋</button></div><div id="source-list" class="source-list"></div>
  <div class="side-bottom"><span class="status-dot"></span> Reprodução local e direta <small>Sem gateway e sem assinaturas do aplicativo</small></div></aside>
  <main class="main"><header class="topbar"><div class="crumb">IPTVREADER <span>/</span> <strong id="crumb">TV ao vivo</strong></div><div class="top-actions"><button id="fullscreen" class="neutral-btn">⛶ Tela cheia</button><button id="add-source" class="primary-btn">＋ Importar M3U</button></div></header>
  <div class="body"><div class="title-row"><div><div class="eyebrow">✦ SUA CENTRAL DE ENTRETENIMENTO</div><h1 id="heading">TV ao vivo</h1><p>Seu catálogo, seus dispositivos, sem depender de um navegador.</p></div><span class="total-badge" id="total-items">0 itens</span></div>
  <div class="columns"><div class="watch-column"><section class="watch-card"><div class="player-surface"><div class="surface-glow"></div><div class="screen-center"><div class="play-emblem">▶</div><h2 id="player-title">Pronto para assistir</h2><p id="player-hint">Selecione um item do catálogo. O vídeo será reproduzido pelo mpv nesta área, dentro do IPTVReader.</p></div></div>
    <div class="watch-info"><div class="watch-kicker"><span class="live-mark"></span><span id="now-type">NENHUMA REPRODUÇÃO</span></div><div class="watch-details"><div class="watch-icon">▶</div><div><h3 id="now-name">Nenhum conteúdo selecionado</h3><p id="now-group">Importe sua lista para começar.</p></div><button id="fav-selected" class="circle-btn" title="Favoritar" disabled>☆</button></div>
    <div class="watch-controls"><button data-command="pause" class="neutral-btn">⏯ Pausar / continuar</button><button data-command="mute" class="neutral-btn">♫ Mudo</button><button data-command="stop" class="neutral-btn">■ Parar</button></div></div></section>
    <section class="mpv-card" id="mpv-card"><div><strong>Reprodutor mpv</strong><p id="mpv-status">Verificando instalação...</p></div><div class="mpv-actions"><button id="choose-mpv" class="neutral-btn">Selecionar mpv.exe</button><button id="download-mpv" class="outline-btn">Obter mpv ↗</button></div></section>
    <div class="tip">ℹ A reprodução é integrada ao IPTVReader com mpv nativo. Links HTTP continuam funcionando fora das restrições do navegador. Os dados da playlist ficam apenas neste computador.</div>
  </div><section class="catalog"><div class="catalog-heading"><div><h2>Explorar conteúdo</h2><p id="result-count">Selecione um canal, filme ou episódio</p></div><button id="refresh-btn" class="circle-btn" title="Atualizar catálogo">↻</button></div>
  <div class="search-box"><span>⌕</span><input id="search" type="search" autocomplete="off" placeholder="Pesquisar em 330 mil itens..." /></div><select id="groups" aria-label="Filtrar por categoria"><option value="">Todas as categorias</option></select>
  <div id="rows" class="rows"></div><div class="pagination"><button id="previous" class="neutral-btn">← Anterior</button><span id="page-info">0 / 0</span><button id="next" class="neutral-btn">Próximo →</button></div></section></div>
  </div></main></div>
  <dialog id="source-dialog" class="source-dialog"><form id="source-form"><div class="dialog-head"><div><div class="eyebrow">CONEXÃO</div><h2>Adicionar lista IPTV</h2></div><button type="button" id="close-dialog" class="circle-btn">✕</button></div><p class="dialog-help">Escolha um arquivo M3U do computador ou importe uma lista por URL HTTP/HTTPS. Arquivos grandes são processados progressivamente.</p><button type="button" id="select-file" class="primary-btn full">Escolher arquivo .m3u do Windows</button><div class="separator">ou</div><label class="input-label">URL da lista M3U<input name="playlistUrl" id="playlist-url" type="url" placeholder="http://servidor.exemplo/lista.m3u" /></label><button type="submit" class="neutral-btn full">Importar URL</button><div id="import-status" class="import-status"></div></form></dialog>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>`;
  document.querySelector('#navigation')!.addEventListener('click',ev=>{const el=(ev.target as HTMLElement).closest<HTMLElement>('[data-section]');if(el)void changeSection(el.dataset.section as Section);});
  document.querySelector('#rows')!.addEventListener('click',ev=>{const el=(ev.target as HTMLElement).closest<HTMLElement>('[data-id]');if(!el)return;const id=el.dataset.id!;const row=state.results.rows.find(x=>x.id===id);if(!row)return;if((ev.target as HTMLElement).closest('[data-fav]'))favorite(id);else void play(row);});
  document.querySelector('#source-list')!.addEventListener('click',ev=>{const button=(ev.target as HTMLElement).closest<HTMLElement>('[data-delete]');if(button){const id=button.dataset.delete!,src=state.source.find(s=>s.id===id);if(src&&confirm(`Remover ${src.name} e seus ${nf(src.count)} itens deste computador?`))void remove(id);}});
  for(const id of ['#add-source','#import-side'])$(id).addEventListener('click',openDialog);
  $('#close-dialog').addEventListener('click',closeDialog);
  $('#select-file').addEventListener('click',()=>void importFile());
  $('#source-form').addEventListener('submit',ev=>{ev.preventDefault();const url=($('#playlist-url') as HTMLInputElement).value.trim();if(url)void importUrl(url);});
  $('#search').addEventListener('input',()=>{state.query=($('#search') as HTMLInputElement).value;state.page=0;debouncedSearch();});
  $('#groups').addEventListener('change',()=>{state.group=($('#groups') as HTMLSelectElement).value;state.page=0;void updateList();});
  $('#previous').addEventListener('click',()=>{if(state.page>0){state.page--;void updateList();}});
  $('#next').addEventListener('click',()=>{if((state.page+1)*80<state.results.total){state.page++;void updateList();}});
  $('#refresh-btn').addEventListener('click',()=>void updateList());
  $('#fav-selected').addEventListener('click',()=>{if(state.selected)favorite(state.selected.id);});
  $('#choose-mpv').addEventListener('click',async()=>{try{await api.chooseMpv();await refreshMpv();}catch(e){message(String(e),true);}});
  $('#download-mpv').addEventListener('click',()=>void api.downloadMpv());
  $('#fullscreen').addEventListener('click',()=>void api.fullscreen());
  document.querySelectorAll<HTMLElement>('[data-command]').forEach(b=>b.addEventListener('click',()=>void api.playerCommand(b.dataset.command!).catch(e=>message(String(e),true))));
  window.addEventListener('keydown',ev=>{if(ev.key==='F11'){ev.preventDefault();void api.fullscreen();}});
  api.onProgress(p=>{const pct=p.totalBytes?Math.round(p.bytes*100/p.totalBytes):0;$('#import-status').textContent=`Importando... ${nf(p.count)} entradas processadas · ${pct}%`;});
  api.onDownload(p=>{$('#import-status').textContent=`Baixando M3U: ${nf(Math.round(p.bytes/1024/1024))} MB`;});
  api.onUpdate(s=>{state.source=s;drawSources();void updateList();});
  api.onPlayerEvent(event=>{
    if(event.type==='loading'){$('#mpv-status').textContent='Carregando transmissão...';}
    if(event.type==='playing'){$('#mpv-status').textContent='Reproduzindo dentro do IPTVReader';}
    if(event.type==='finished'){$('#mpv-status').textContent='Reprodução finalizada';}
    if(event.type==='stopped'){$('#mpv-status').textContent='Reprodução interrompida';}
    if(event.type==='error'){$('#mpv-status').textContent='Erro na reprodução';message(event.detail||'Falha no mpv.',true);}
  });
  const surface=$('.player-surface');
  let scheduled=0;
  const updateBounds=()=>{
    cancelAnimationFrame(scheduled);
    scheduled=requestAnimationFrame(()=>{
      const r=surface.getBoundingClientRect();
      void api.playerBounds({x:r.x,y:r.y,width:r.width,height:r.height}).catch(()=>{});
    });
  };
  new ResizeObserver(updateBounds).observe(surface);
  window.addEventListener('scroll',updateBounds,true);
  window.addEventListener('resize',updateBounds);
  updateBounds();
}
const labels:Record<Section,string>={live:'TV ao vivo',movie:'Filmes',series:'Séries',all:'Todo o catálogo',favorite:'Favoritos'};
let debounce:number|undefined;
function debouncedSearch(){clearTimeout(debounce);debounce=window.setTimeout(()=>void updateList(),280);}
async function changeSection(section:Section){state.section=section;state.group='';state.page=0;($('#search') as HTMLInputElement).value='';state.query='';$('#heading').textContent=labels[section];$('#crumb').textContent=labels[section];drawNav();drawGroups();await updateList();}
function drawNav(){const sums=state.source.reduce((acc,s)=>({live:acc.live+s.totals.live,movie:acc.movie+s.totals.movie,series:acc.series+s.totals.series}),{live:0,movie:0,series:0});const nums={...sums,all:sums.live+sums.movie+sums.series,favorite:state.favorites.size};
  $('#navigation').innerHTML=(Object.keys(labels) as Section[]).map(k=>`<button class="nav-item ${state.section===k?'active':''}" data-section="${k}"><span class="nav-icon">${icons[k]}</span><span>${labels[k]}</span><span class="nav-count">${nf(nums[k])}</span></button>`).join('');
  $('#total-items').textContent=`${nf(nums.all)} itens na biblioteca`;
}
function drawSources(){drawNav();$('#source-list').innerHTML=state.source.length?state.source.map(x=>`<div class="source-item"><span>▣</span><div title="${escapeHtml(x.name)}"><b>${escapeHtml(x.name)}</b><small>${nf(x.count)} itens</small></div><button data-delete="${x.id}" title="Remover fonte">✕</button></div>`).join(''):'<div class="sources-empty">Nenhuma fonte adicionada</div>';drawGroups();}
function drawGroups(){const filter=$('#groups') as HTMLSelectElement;const aggregate=new Map<string,number>();for(const src of state.source)for(const [g,n] of src.groups)aggregate.set(g,(aggregate.get(g)||0)+n);
 const groups=[...aggregate.keys()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 filter.innerHTML='<option value="">Todas as categorias</option>'+groups.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)} (${nf(aggregate.get(x)!)})</option>`).join('');filter.value=state.group;
}
async function updateList(){const token=++state.seq;try{
 const result=await api.search({section:state.section,search:state.query,group:state.group,page:state.page,size:80,favorites:state.section==='favorite'?[...state.favorites]:undefined});if(token!==state.seq)return;
 state.results=result;$('#result-count').textContent=`${nf(result.total)} resultados`;
 $('#rows').innerHTML=result.rows.length?result.rows.map(row=>`<div class="catalog-row ${row.id===state.selected?.id?'chosen':''}" data-id="${row.id}" tabindex="0"><div class="item-img">${/^https?:\/\//.test(row.logo)?`<img src="${escapeHtml(row.logo)}" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.hidden=true">`:'▶'}</div><div class="item-text"><strong title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</strong><small>${escapeHtml(row.group)}</small></div><button class="fav-btn" data-fav="1" title="Favoritar">${state.favorites.has(row.id)?'★':'☆'}</button><span class="item-arrow">▶</span></div>`).join(''):'<div class="results-empty">Nenhum conteúdo encontrado. Importe sua M3U ou modifique os filtros.</div>';
 const totalPages=Math.max(1,Math.ceil(result.total/result.size));$('#page-info').textContent=`Página ${nf(state.page+1)} de ${nf(totalPages)}`;
 ($('#previous') as HTMLButtonElement).disabled=state.page===0;($('#next') as HTMLButtonElement).disabled=state.page+1>=totalPages;
 drawNav();
 }catch(e){if(token===state.seq)message(String(e),true);}}
async function play(row:Item){state.selected=row;$('#now-name').textContent=row.name;$('#now-group').textContent=row.group;$('#player-title').textContent=row.name;$('#now-type').textContent=labels[row.type as Section]?.toUpperCase()||'REPRODUÇÃO';$('#player-hint').textContent='Carregando vídeo integrado...';($('#fav-selected') as HTMLButtonElement).disabled=false;$('#fav-selected').textContent=state.favorites.has(row.id)?'★':'☆';
 try{const r=$('.player-surface').getBoundingClientRect();await api.playerBounds({x:r.x,y:r.y,width:r.width,height:r.height});await api.play(row.id);$('#player-hint').textContent='Reprodução inicializada. Aguardando vídeo.';message('Inicializando reprodução integrada.');}
 catch(e){$('#player-hint').textContent='Não foi possível abrir o vídeo.';message((e as Error).message||String(e),true);}
 void updateList();}
async function refreshMpv(){const st=await api.playerStatus();state.mpvReady=st.ready;$('#mpv-status').textContent=st.ready?'mpv encontrado — pronto para reprodução':'mpv não encontrado — selecione mpv.exe ou instale o reprodutor';$('#mpv-card').classList.toggle('missing',!st.ready);}
function openDialog(){$('#source-dialog').setAttribute('open','');$('#import-status').textContent='';void api.playerSurfaceVisible(false);}
function closeDialog(){$('#source-dialog').removeAttribute('open');void api.playerSurfaceVisible(true);}
function setBusy(b:boolean){state.busy=b;(['#select-file','#source-form button[type="submit"]','#close-dialog'] as string[]).forEach(k=>{($(k) as HTMLButtonElement).disabled=b;});}
async function importFile(){if(state.busy)return;setBusy(true);try{const result=await api.pickPlaylist();if(result){closeDialog();state.source=await api.sources();drawSources();await changeSection('live');message(`${nf(result.count)} itens importados com sucesso.`);}}catch(e){$('#import-status').textContent=String((e as Error).message||e);}finally{setBusy(false);}}
async function importUrl(url:string){if(state.busy)return;setBusy(true);try{const result=await api.importUrl(url);if(result){closeDialog();state.source=await api.sources();drawSources();await changeSection('live');message(`${nf(result.count)} itens importados com sucesso.`);}}catch(e){$('#import-status').textContent=String((e as Error).message||e);}finally{setBusy(false);}}
async function remove(id:string){try{await api.removeSource(id);state.source=await api.sources();drawSources();await updateList();message('Fonte removida.');}catch(e){message(String(e),true);}}
function message(text:string,error=false){const toast=$('#toast');toast.className=`toast visible ${error?'error':''}`;toast.textContent=text;setTimeout(()=>{if(toast.textContent===text)toast.classList.remove('visible');},6500);}
async function init(){if(!api){document.body.textContent='Esta página deve ser aberta pelo aplicativo IPTVReader Desktop.';return;}
 installUI();state.source=await api.sources();drawSources();await updateList();await refreshMpv();}
void init().catch(e=>message(String(e),true));
