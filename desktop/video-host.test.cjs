'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(){
 const handlers={},hosts=[];
 class NativeWindow {
  constructor(options){this.options=options;this.visible=options.show!==false;this.bounds={x:10,y:20,width:1000,height:700};this.events={};hosts.push(this);}
  on(name,fn){this.events[name]=fn;} isDestroyed(){return false;} isVisible(){return this.visible;} isMinimized(){return !!this.minimized;}
  setMenuBarVisibility(){} hide(){this.visible=false;} showInactive(){this.visible=true;} setBounds(b){this.bounds=b;} getContentBounds(){return this.bounds;}
  getNativeWindowHandle(){return Buffer.from([1,0,0,0]);} setFullScreen(v){this.fullscreen=v;} isFullScreen(){return !!this.fullscreen;}
 }
 class WebWindow extends NativeWindow {
  constructor(options){super(options);this.webContents={getZoomFactor:()=>this.zoom||1,send(){},setWindowOpenHandler(){},on(){}};}
  loadFile(){} destroy(){}
 }
 class Player {
  constructor(_binary,callback){this.callback=callback;} async play(){assert.equal(hosts[1].visible,true,'native host visible before mpv');assert.equal(hosts[1].bounds.width,400);}
  command(){return true;} close(){} isActive(){return true;}
 }
 const electron={app:{whenReady:()=>({then:()=>({catch(){}})}),on(){}},BrowserWindow:WebWindow,BaseWindow:NativeWindow,ipcMain:{handle:(key,fn)=>handlers[key]=fn},dialog:{},shell:{}};
 const context={require:name=>name==='electron'?electron:name==='./video-host.cjs'?{NativeVideoHost:class extends NativeWindow{constructor(parent){super({parent,show:false});}}}:name==='./mpv.cjs'?{MpvController:Player,nativeWindowId:b=>b.readUInt32LE(),resolveMpv:()=>true}:name==='./catalog.cjs'?{Catalog:class{}}:require(name),__dirname,module:{exports:{}},console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8')+'\nmodule.exports={setupIPC,createWindow,setCatalog:c=>catalog=c};',context);
 context.module.exports.setCatalog({item:async()=>({url:'http://example.test/video',name:'Synthetic',group:'Test'})});
 context.module.exports.setupIPC();context.module.exports.createWindow();
 return {handlers,hosts};
}
test('native host has no webContents and is positioned before mpv starts',async()=>{
 const {handlers,hosts}=harness();await handlers['player:bounds'](null,{x:100,y:100,width:400,height:225});
 await handlers['player:play'](null,'item');assert.equal(hosts[1].webContents,undefined);assert.equal(hosts[1].options.parent,hosts[0]);
 assert.deepEqual({...hosts[1].bounds},{x:110,y:120,width:400,height:225});
});
test('stop stays hidden after resize; dialogs and minimize hide the native surface',async()=>{
 const {handlers,hosts}=harness();const rect={x:100,y:100,width:400,height:225};await handlers['player:bounds'](null,rect);await handlers['player:play'](null,'item');
 handlers['player:surface-visible'](null,false);assert.equal(hosts[1].visible,false);handlers['player:surface-visible'](null,true);assert.equal(hosts[1].visible,true);
 hosts[0].minimized=true;hosts[0].events.minimize();assert.equal(hosts[1].visible,false);hosts[0].minimized=false;hosts[0].events.restore();assert.equal(hosts[1].visible,true);
 handlers['player:command'](null,'stop');await handlers['player:bounds'](null,rect);assert.equal(hosts[1].visible,false);
});
test('fullscreen belongs to app; zoom maps CSS coordinates to DIP and out-of-bounds hides video',async()=>{
 const {handlers,hosts}=harness();await handlers['player:bounds'](null,{x:100,y:100,width:400,height:225});await handlers['player:play'](null,'item');
 handlers['player:command'](null,'fullscreen');assert.equal(hosts[0].fullscreen,true);
 hosts[0].zoom=1.25;await handlers['player:bounds'](null,{x:100,y:100,width:400,height:225});assert.equal(hosts[1].bounds.width,500);assert.equal(hosts[1].bounds.x,135);
 await handlers['player:bounds'](null,{x:100,y:-50,width:400,height:225});assert.equal(hosts[1].visible,false);
});
