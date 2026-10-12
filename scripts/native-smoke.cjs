const {app,BrowserWindow,BaseWindow,desktopCapturer,screen}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const output=process.env.IPTV_TEST_OUTPUT||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'iptvreader-smoke-'));fs.mkdirSync(output,{recursive:true});const folder=fs.mkdtempSync(path.join(output,'data-'));if(!process.env.MPV_PATH||!process.env.VIDEO_FIXTURE)throw new Error('Set MPV_PATH and VIDEO_FIXTURE to synthetic test assets.');
console.log=(...args)=>fs.appendFileSync(path.join(output,'smoke.log'),args.join(' ')+'\n');
console.error=console.log;
app.setPath('userData',folder);
fs.writeFileSync(path.join(folder,'desktop-settings.json'),JSON.stringify({mpvPath:process.env.MPV_PATH}));
const server=http.createServer((req,res)=>{
 if(req.url==='/list.m3u'){res.end('#EXTM3U\n#EXTINF:-1 group-title="Teste",Vídeo sintético HTTP\nhttp://127.0.0.1:' + server.address().port + '/stream.ts\n');return;}
 res.setHeader('Content-Type','video/mp4');fs.createReadStream(process.env.VIDEO_FIXTURE).pipe(res);
});server.listen(0,'127.0.0.1');
require('../desktop/main.cjs');
const {NativeVideoHost}=require('../desktop/video-host.cjs');
const originalBounds=NativeVideoHost.prototype.setBounds;
NativeVideoHost.prototype.setBounds=function(...args){originalBounds.apply(this,args);globalThis.testHost=this;};
const {MpvController}=require('../desktop/mpv.cjs');
const originalStart=MpvController.prototype.start;
MpvController.prototype.start=async function(...args){await originalStart.apply(this,args);globalThis.testPlayer=this;};
let requestId=10000;
function rpc(command){return new Promise((resolve,reject)=>{
 const id=++requestId,socket=globalThis.testPlayer.socket;let pending='';
 const timer=setTimeout(()=>{socket.off('data',onData);reject(new Error('IPC timeout'));},3000);
 function onData(chunk){pending+=chunk;let pos;while((pos=pending.indexOf('\n'))>=0){const line=pending.slice(0,pos);pending=pending.slice(pos+1);try{const m=JSON.parse(line);if(m.request_id===id){clearTimeout(timer);socket.off('data',onData);resolve(m);}}catch{}}}
 socket.on('data',onData);socket.write(JSON.stringify({command,request_id:id})+'\n');
});}
app.on('browser-window-created',(_e,w)=>{
 w.webContents.once('did-finish-load',async()=>{
  try {
   await new Promise(r=>setTimeout(r,1000));
   await w.webContents.executeJavaScript(`window.iptvDesktop.importUrl('http://127.0.0.1:${server.address().port}/list.m3u')`);
   await new Promise(r=>setTimeout(r,500));
   await w.webContents.executeJavaScript(`document.querySelector('[data-id]').click()`);
   await new Promise(r=>setTimeout(r,3000));
   console.log('WINDOWS',JSON.stringify(BaseWindow.getAllWindows().map(x=>({id:x.id,bounds:x.getBounds(),visible:x.isVisible(),webContents:!!x.webContents}))));
   console.log('STATUS',await w.webContents.executeJavaScript(`document.querySelector('#mpv-status').textContent`));
   for(const property of ['video-out-params','audio-params','time-pos','vo-configured','options/gpu-context'])console.log(property,JSON.stringify(await rpc(['get_property',property])));
   console.log('SCREENSHOT',JSON.stringify(await rpc(['screenshot-to-file',path.join(output,'mpv-frame.png'),'video'])));
   const host=globalThis.testHost;
   w.setAlwaysOnTop(true,'screen-saver');w.show();host.showInactive();
   await new Promise(r=>setTimeout(r,1000));
   const display=screen.getDisplayMatching(w.getBounds());
   const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:display.size.width,height:display.size.height}});
   console.log('SOURCES',JSON.stringify(sources.map(s=>({id:s.id,name:s.name}))));
   const source=sources.find(s=>s.display_id===String(display.id));
   if(!source)throw new Error('Native host capture unavailable');
   const crop=b=>({x:b.x-display.bounds.x,y:b.y-display.bounds.y,width:b.width,height:b.height});
   fs.writeFileSync(path.join(output,'integrated-top.png'),source.thumbnail.crop(crop(w.getBounds())).toPNG());
   await new Promise(r=>setTimeout(r,1500));
   const second=(await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:display.size.width,height:display.size.height}})).find(s=>s.display_id===String(display.id));
   fs.writeFileSync(path.join(output,'integrated-second.png'),second.thumbnail.crop(crop(w.getBounds())).toPNG());
   const firstVideo=source.thumbnail.crop(crop(host.getBounds())).toBitmap();
   const secondVideo=second.thumbnail.crop(crop(host.getBounds())).toBitmap();
   const colors=new Set();for(let i=0;i<firstVideo.length;i+=64)colors.add(firstVideo.readUInt32LE(i));
   if(colors.size<64||firstVideo.equals(secondVideo))throw new Error('Visual validation failed: black/static native video surface');
   w.setAlwaysOnTop(false);
   const assert=require('node:assert/strict'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
   await w.webContents.executeJavaScript(`window.iptvDesktop.playerCommand('pause')`);assert.equal((await rpc(['get_property','pause'])).data,true);
   await w.webContents.executeJavaScript(`window.iptvDesktop.playerCommand('pause')`);assert.equal((await rpc(['get_property','pause'])).data,false);
   await w.webContents.executeJavaScript(`window.iptvDesktop.playerCommand('mute')`);assert.equal((await rpc(['get_property','mute'])).data,true);
   await w.webContents.executeJavaScript(`window.iptvDesktop.playerSurfaceVisible(false)`);assert.equal(host.isVisible(),false);
   await w.webContents.executeJavaScript(`window.iptvDesktop.playerSurfaceVisible(true)`);assert.equal(host.isVisible(),true);
   w.minimize();await sleep(500);assert.equal(host.isVisible(),false);w.restore();await sleep(500);assert.equal(host.isVisible(),true);
   w.setFullScreen(true);await sleep(1000);assert.equal(w.isFullScreen(),true);assert.equal(host.isVisible(),true);w.setFullScreen(false);await sleep(500);
   const before=host.getBounds();w.setPosition(100,100);await sleep(500);assert.notEqual(host.getBounds().x,before.x);
   w.setSize(1300,850);await sleep(800);assert.equal(host.isVisible(),true);
   await w.webContents.executeJavaScript(`window.iptvDesktop.playerCommand('stop')`);assert.equal(host.isVisible(),false);w.setSize(1400,900);await sleep(500);assert.equal(host.isVisible(),false);
   console.log('LIFECYCLE PASS: pause, resume, mute, modal, minimize, restore, fullscreen, move, resize, stop');
   fs.writeFileSync(path.join(output,'smoke-ready.json'),JSON.stringify({ok:true}));
   app.quit();
  }catch(e){console.error(e);app.exit(1);}
 });
});
app.on('window-all-closed',()=>server.close());setTimeout(()=>app.exit(2),45000).unref();

