'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const use=(key)=>(...args)=>ipcRenderer.invoke(key,...args);
contextBridge.exposeInMainWorld('iptvDesktop',Object.freeze({
  sources:use('catalog:sources'),search:use('catalog:search'),pickPlaylist:use('catalog:pick'),importUrl:use('catalog:url'),removeSource:use('catalog:remove'),
  play:use('player:play'),playerCommand:use('player:command'),playerStatus:use('player:status'),chooseMpv:use('player:choose'),downloadMpv:use('player:download'),fullscreen:use('app:fullscreen'),
  onProgress:(cb)=>{const fn=(_e,p)=>cb(p);ipcRenderer.on('catalog:progress',fn);return()=>ipcRenderer.removeListener('catalog:progress',fn);},
  onDownload:(cb)=>{const fn=(_e,p)=>cb(p);ipcRenderer.on('catalog:download',fn);return()=>ipcRenderer.removeListener('catalog:download',fn);},
  onUpdate:(cb)=>{const fn=(_e,p)=>cb(p);ipcRenderer.on('catalog:updated',fn);return()=>ipcRenderer.removeListener('catalog:updated',fn);}
}));
