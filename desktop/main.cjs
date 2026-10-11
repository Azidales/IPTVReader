'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const fs=require('node:fs');const fsp=fs.promises;
const path=require('node:path');const os=require('node:os');
const {pipeline}=require('node:stream/promises');
const {Readable,Transform}=require('node:stream');
const {Catalog}=require('./catalog.cjs');
const {MpvController,resolveMpv,nativeWindowId}=require('./mpv.cjs');
let window=null, videoHost=null, videoRect=null, videoSurfaceVisible=true, catalog=null, settings={mpvPath:''}, importing=false;
const settingsPath=()=>path.join(app.getPath('userData'),'desktop-settings.json');
const player=new MpvController(()=>settings.mpvPath,event=>notify('player:event',event));
function notify(type,value){if(window&&!window.isDestroyed())window.webContents.send(type,value);}
function ensureVideoHost(){
  if(videoHost && !videoHost.isDestroyed())return videoHost;
  if(!window || window.isDestroyed())throw new Error('Janela principal não disponível.');
  videoHost=new BrowserWindow({
    parent:window,frame:false,show:false,focusable:false,resizable:false,
    skipTaskbar:true,backgroundColor:'#000000',webPreferences:{
      sandbox:true,contextIsolation:true,nodeIntegration:false
    }
  });
  videoHost.setMenuBarVisibility(false);
  videoHost.on('closed',()=>{videoHost=null;player.close();});
  return videoHost;
}
function syncVideoHost(){
  if(!videoHost || videoHost.isDestroyed() || !window || window.isDestroyed())return;
  if(!videoRect || !videoSurfaceVisible || window.isMinimized() || !window.isVisible()){
    videoHost.hide();return;
  }
  const area=window.getContentBounds();
  const x=Math.max(0,Math.round(videoRect.x)),y=Math.max(0,Math.round(videoRect.y));
  const width=Math.min(Math.round(videoRect.width),Math.max(0,area.width-x));
  const height=Math.min(Math.round(videoRect.height),Math.max(0,area.height-y));
  if(width<80||height<45){videoHost.hide();return;}
  videoHost.setBounds({x:area.x+x,y:area.y+y,width,height});
  if(player.isActive())videoHost.showInactive();
}
async function persistSettings(){await fsp.writeFile(settingsPath(),JSON.stringify(settings));}
async function importSelected(file,name){
 if(importing) throw new Error('Já existe uma importação em andamento.');
 importing=true;
 try {const result=await catalog.importFile(file,name,x=>notify('catalog:progress',x));notify('catalog:updated',catalog.summaries());return result;}
 finally{importing=false;}
}
async function downloadPlaylist(raw){
 const url=new URL(String(raw));if(!['http:','https:'].includes(url.protocol))throw new Error('Informe uma URL HTTP ou HTTPS.');
 const destination=path.join(os.tmpdir(),`iptvreader-${require('node:crypto').randomUUID()}.m3u`);
 const response=await fetch(url,{signal:AbortSignal.timeout(180000),redirect:'follow'});
 if(!response.ok||!response.body)throw new Error(`Não foi possível baixar a playlist (HTTP ${response.status}).`);
 const maximum=400*1024*1024;let total=0;
 const limiter=new Transform({transform(chunk,_,cb){total+=chunk.length;if(total>maximum)cb(new Error('Playlist remota acima de 400 MB.'));else{notify('catalog:download',{bytes:total});cb(null,chunk);}}});
 try{await pipeline(Readable.fromWeb(response.body),limiter,fs.createWriteStream(destination,{flags:'wx'}));return destination;}
 catch(e){await fsp.rm(destination,{force:true});throw e;}
}
function setupIPC(){
 ipcMain.handle('catalog:sources',()=>catalog.summaries());
 ipcMain.handle('catalog:search',(_event,query)=>catalog.search(query||{}));
 ipcMain.handle('catalog:pick',async()=>{
  if(importing)throw new Error('Aguarde a importação atual.');
  const selected=await dialog.showOpenDialog(window,{title:'Importar lista M3U',properties:['openFile'],filters:[{name:'Playlists IPTV',extensions:['m3u','m3u8','txt']}]});
  if(selected.canceled||!selected.filePaths.length)return null;
  return importSelected(selected.filePaths[0],path.basename(selected.filePaths[0]));
 });
 ipcMain.handle('catalog:url',async(_event,raw)=>{
  if(importing)throw new Error('Aguarde a importação atual.');
  importing=true;let file=null;
  try{
   file=await downloadPlaylist(raw);
   importing=false;
   return await importSelected(file,'Playlist remota');
  }finally{importing=false;if(file)await fsp.rm(file,{force:true});}
 });
 ipcMain.handle('catalog:remove',async(_event,id)=>{const result=await catalog.remove(id);notify('catalog:updated',catalog.summaries());return result;});
 ipcMain.handle('player:play',async(_event,id)=>{
  const item=await catalog.item(id);if(!item)throw new Error('Item não encontrado no catálogo.');
  const host=ensureVideoHost();
  const handle=nativeWindowId(host.getNativeWindowHandle());
  try {await player.play(item.url,handle);syncVideoHost();return {name:item.name,group:item.group};}
  catch(err){host.hide();throw err;}
 });
 ipcMain.handle('player:command',(_event,cmd)=>{
  const allowed={pause:['cycle','pause'],stop:['stop'],mute:['cycle','mute'],fullscreen:['cycle','fullscreen']};
  if(!Object.hasOwn(allowed,cmd))throw new Error('Comando não permitido.');
  const ok=player.command(allowed[cmd]);if(cmd==='stop'){videoHost?.hide();notify('player:event',{type:'stopped'});}return ok;
 });
 ipcMain.handle('player:bounds',(_event,rect)=>{
  if(!rect || ![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite))return false;
  videoRect={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  syncVideoHost();return true;
 });
 ipcMain.handle('player:surface-visible',(_event,value)=>{
  videoSurfaceVisible=value===true;syncVideoHost();return true;
 });
 ipcMain.handle('player:status',()=>({ready:!!resolveMpv(settings.mpvPath),configured:settings.mpvPath||''}));
 ipcMain.handle('player:choose',async()=>{
  const result=await dialog.showOpenDialog(window,{title:'Selecione mpv.exe',properties:['openFile'],filters:[{name:'Reprodutor mpv',extensions:['exe']}]});
  if(result.canceled||!result.filePaths[0])return null;
  if(path.basename(result.filePaths[0]).toLowerCase()!=='mpv.exe')throw new Error('Selecione o executável mpv.exe.');
  settings.mpvPath=result.filePaths[0];await persistSettings();return {ready:true,configured:settings.mpvPath};
 });
 ipcMain.handle('player:download',()=>shell.openExternal('https://mpv.io/installation/'));
 ipcMain.handle('app:fullscreen',()=>{window.setFullScreen(!window.isFullScreen());return window.isFullScreen();});
}
function createWindow(){
 window=new BrowserWindow({title:'IPTVReader Desktop',width:1490,height:940,minWidth:1000,minHeight:650,backgroundColor:'#0b101b',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',event=>event.preventDefault());
 window.loadFile(path.join(__dirname,'..','dist-desktop','desktop.html'));
 window.on('move',syncVideoHost);
 window.on('resize',syncVideoHost);
 window.on('restore',syncVideoHost);
 window.on('minimize',()=>videoHost?.hide());
 window.on('hide',()=>videoHost?.hide());
 window.on('closed',()=>{player.close();if(videoHost&&!videoHost.isDestroyed())videoHost.destroy();videoHost=null;window=null;});
}
app.whenReady().then(async()=>{
 app.setAppUserModelId('com.iptvreader.desktop');
 try{settings=JSON.parse(await fsp.readFile(settingsPath(),'utf8'));}catch{settings={mpvPath:''};}
 catalog=new Catalog(app.getPath('userData'));await catalog.initialize();setupIPC();createWindow();
 app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
}).catch(err=>{dialog.showErrorBox('IPTVReader',String(err?.message||err));app.quit();});
app.on('window-all-closed',()=>{player.close();if(process.platform!=='darwin')app.quit();});
