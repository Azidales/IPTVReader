'use strict';
// Native owned video surface, without Electron's DirectComposition surface.
let api;
function win32(){
 if(api)return api;
 if(process.platform!=='win32')throw new Error('O player nativo requer Windows.');
 const koffi=require('koffi'),user32=koffi.load('user32.dll');
 api={
  create:user32.func('uintptr_t __stdcall CreateWindowExW(uint32_t, const char16_t *, const char16_t *, uint32_t, int, int, int, int, uintptr_t, uintptr_t, uintptr_t, void *)'),
  position:user32.func('bool __stdcall SetWindowPos(uintptr_t, uintptr_t, int, int, int, int, uint32_t)'),
  show:user32.func('bool __stdcall ShowWindow(uintptr_t, int)'),
  valid:user32.func('bool __stdcall IsWindow(uintptr_t)'),
  visible:user32.func('bool __stdcall IsWindowVisible(uintptr_t)'),
  destroy:user32.func('bool __stdcall DestroyWindow(uintptr_t)')
 };
 return api;
}
class NativeVideoHost {
 constructor(parent){
  this.parent=parent;this.api=win32();
  this.parentId=parent.getNativeWindowHandle().readUInt32LE(0);
  // WS_POPUP | WS_CLIPSIBLINGS | WS_CLIPCHILDREN | SS_BLACKRECT;
  // WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW keeps it owned by the app, without
  // a taskbar entry or focus theft. mpv creates its child inside this HWND.
  this.hwnd=Number(this.api.create(0x08000080,'STATIC','IPTVReader video',0x86000004,0,0,1,1,this.parentId,0,0,null));
  if(!this.hwnd)throw new Error('Não foi possível criar a superfície Win32 do vídeo.');
 }
 isDestroyed(){return !this.hwnd||!this.api.valid(this.hwnd);}
 isVisible(){return !this.isDestroyed()&&this.api.visible(this.hwnd);}
 getNativeWindowHandle(){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(this.hwnd));return b;}
 getBounds(){return this.bounds;}
 setBounds(bounds){
  const pixels=require('electron').screen.dipToScreenRect(this.parent,bounds);
  if(!this.api.position(this.hwnd,0,pixels.x,pixels.y,pixels.width,pixels.height,0x0010))throw new Error('Falha ao posicionar a superfície de vídeo.');
  this.bounds={...bounds};
 }
 showInactive(){if(!this.isDestroyed())this.api.show(this.hwnd,8);}
 hide(){if(!this.isDestroyed())this.api.show(this.hwnd,0);}
 destroy(){if(!this.isDestroyed())this.api.destroy(this.hwnd);this.hwnd=0;}
}
module.exports={NativeVideoHost};
