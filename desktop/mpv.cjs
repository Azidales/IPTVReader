'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const crypto=require('node:crypto');

function resolveMpv(configured) {
  if(configured && path.basename(configured).toLowerCase()==='mpv.exe' && fs.existsSync(configured)) return configured;
  const binary=process.platform==='win32'?'mpv.exe':'mpv';
  const where=spawnSync(process.platform==='win32'?'where':'which',[binary],{encoding:'utf8',windowsHide:true,timeout:3000});
  if(where.status===0) return where.stdout.trim().split(/\r?\n/)[0];
  return null;
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class MpvController {
  constructor(getBinary){this.getBinary=getBinary;this.proc=null;this.socket=null;this.pipe=null;this.counter=0;}
  async start(){
    if(this.proc && this.socket && !this.socket.destroyed)return;
    const binary=resolveMpv(this.getBinary());
    if(!binary) throw new Error('mpv não encontrado. Instale o mpv no Windows ou selecione o arquivo mpv.exe nas configurações do IPTVReader.');
    this.close();
    this.pipe=process.platform==='win32'?`\\\\.\\pipe\\iptvreader-${crypto.randomUUID()}`:path.join(require('node:os').tmpdir(),`iptvreader-${crypto.randomUUID()}.sock`);
    const proc=spawn(binary,['--no-config','--idle=yes','--force-window=yes','--fs','--osc=yes','--hwdec=auto-safe','--msg-level=all=error',`--input-ipc-server=${this.pipe}`],{stdio:'ignore',windowsHide:true});
    this.proc=proc;
    proc.on('error',()=>{if(this.proc===proc)this.close();});
    proc.on('exit',()=>{if(this.proc===proc)this.close();});
    for(let attempt=0;attempt<35;attempt++){
      if(this.proc!==proc)break;
      try{
        const socket=await new Promise((res,rej)=>{const s=net.createConnection(this.pipe);s.once('connect',()=>res(s));s.once('error',rej);});
        this.socket=socket;socket.on('error',()=>{});socket.on('close',()=>{if(this.socket===socket)this.socket=null;});
        return;
      }catch{await wait(200);}
    }
    this.close();throw new Error('O mpv não iniciou corretamente. Confira o arquivo mpv.exe e tente novamente.');
  }
  async play(url){
    if(!/^https?:\/\//i.test(url) && !/^rtmps?:\/\//i.test(url) && !/^rtsp:\/\//i.test(url)) throw new Error('Protocolo não suportado pelo player desktop.');
    await this.start();
    this.socket.write(JSON.stringify({command:['loadfile',url,'replace'],request_id:++this.counter})+'\n');
    this.socket.write(JSON.stringify({command:['set_property','fullscreen',true],request_id:++this.counter})+'\n');
    return {ok:true};
  }
  command(value){ if(this.socket && !this.socket.destroyed)this.socket.write(JSON.stringify({command:value,request_id:++this.counter})+'\n'); }
  close(){const socket=this.socket,proc=this.proc;this.socket=null;this.proc=null;if(socket)socket.destroy();if(proc && !proc.killed)proc.kill();}
}
module.exports={MpvController,resolveMpv};
