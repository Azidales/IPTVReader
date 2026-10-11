'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const crypto=require('node:crypto');

function resolveMpv(configured) {
  if(configured && path.basename(configured).toLowerCase()==='mpv.exe' && fs.existsSync(configured)) return configured;
  const binary=process.platform==='win32'?'mpv.exe':'mpv';
  const where=spawnSync(process.platform==='win32'?'where.exe':'which',[binary],{encoding:'utf8',windowsHide:true,timeout:3000});
  if(where.status===0) return where.stdout.trim().split(/\r?\n/)[0];
  return null;
}
function nativeWindowId(buffer) {
  if(!Buffer.isBuffer(buffer) || buffer.length<4) throw new Error('Identificador de janela inválido.');
  const id=buffer.readUInt32LE(0);
  if(!id) throw new Error('A superfície nativa de vídeo não está disponível.');
  return id;
}
const redact=s=>String(s).replace(/(?:https?|rtmps?|rtsp):\/\/\S+/gi,'[endereço ocultado]').slice(-360);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class MpvController {
  constructor(getBinary,onEvent=()=>{}){this.getBinary=getBinary;this.onEvent=onEvent;this.proc=null;this.socket=null;this.pipe=null;this.counter=0;this.wid=0;this.lastError='';}
  isActive(){return !!(this.proc && this.socket && !this.socket.destroyed);}
  async start(hwnd){
    if(this.isActive() && this.wid===hwnd)return;
    if(!Number.isInteger(hwnd)||hwnd<=0||hwnd>0xffffffff)throw new Error('Janela nativa de vídeo inválida.');
    const binary=resolveMpv(this.getBinary());
    if(!binary) throw new Error('mpv não encontrado. Instale o mpv no Windows ou selecione o arquivo mpv.exe nas configurações do IPTVReader.');
    this.close();this.wid=hwnd;this.lastError='';
    this.pipe=process.platform==='win32'?`\\\\.\\pipe\\iptvreader-${crypto.randomUUID()}`:path.join(require('node:os').tmpdir(),`iptvreader-${crypto.randomUUID()}.sock`);
    const proc=spawn(binary,['--no-config','--idle=yes','--force-window=yes','--osc=yes','--hwdec=auto-safe','--vo=gpu','--msg-level=all=warn','--wid='+hwnd,'--input-ipc-server='+this.pipe],{stdio:['ignore','ignore','pipe'],windowsHide:true});
    this.proc=proc;
    let launchError=null;
    proc.stderr?.on('data',chunk=>{this.lastError=redact(this.lastError+chunk.toString('utf8'));});
    proc.on('error',err=>{launchError=err;});
    proc.on('exit',code=>{if(this.proc===proc){this.proc=null;this.socket?.destroy();this.socket=null;this.onEvent({type:'error',detail:'mpv encerrou (código '+code+'). '+this.lastError});}});
    for(let attempt=0;attempt<35;attempt++){
      if(this.proc!==proc||launchError||proc.exitCode!==null)break;
      try{
        const socket=await new Promise((res,rej)=>{const s=net.createConnection(this.pipe);s.once('connect',()=>res(s));s.once('error',rej);});
        this.socket=socket;
        let pending='';
        socket.on('data',chunk=>{
          pending+=chunk.toString('utf8');
          if(pending.length>65536)pending='';
          let pos;
          while((pos=pending.indexOf('\n'))!==-1){
            const line=pending.slice(0,pos);pending=pending.slice(pos+1);
            try{
              const m=JSON.parse(line);
              if(m.event==='start-file')this.onEvent({type:'loading'});
              if(m.event==='file-loaded')this.onEvent({type:'playing'});
              if(m.event==='end-file'&&m.reason==='error')this.onEvent({type:'error',detail:'O mpv não conseguiu abrir a transmissão. Verifique o link e os codecs.'});
              if(m.event==='end-file'&&m.reason==='eof')this.onEvent({type:'finished'});
            }catch{}
          }
        });
        socket.on('error',()=>{});socket.on('close',()=>{if(this.socket===socket)this.socket=null;});
        return;
      }catch{await wait(200);}
    }
    const reason=redact(launchError?.message||this.lastError||'O canal IPC não abriu.');
    this.close();throw new Error('O mpv não iniciou corretamente. '+reason);
  }
  async play(url,hwnd){
    if(!/^https?:\/\//i.test(url) && !/^rtmps?:\/\//i.test(url) && !/^rtsp:\/\//i.test(url)) throw new Error('Protocolo não suportado pelo player desktop.');
    await this.start(hwnd);
    this.command(['loadfile',url,'replace']);
    return {ok:true};
  }
  command(value){ if(this.socket && !this.socket.destroyed){this.socket.write(JSON.stringify({command:value,request_id:++this.counter})+'\n');return true;}return false; }
  close(){const socket=this.socket,proc=this.proc;this.socket=null;this.proc=null;this.wid=0;if(socket)socket.destroy();if(proc && !proc.killed)proc.kill();}
}
module.exports={MpvController,resolveMpv,nativeWindowId};
