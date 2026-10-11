export type Engine = 'native' | 'hls' | 'dash' | 'mpegts' | 'unsupported';
export function detectEngine(url: string): Engine {
  let path = url;
  try { path = new URL(url).pathname.toLowerCase(); } catch { /* already a path */ }
  if (/\.m3u8?$/.test(path)) return 'hls';
  if (/\.mpd$/.test(path)) return 'dash';
  if (/\.(ts|m2ts|flv)$/.test(path)) return 'mpegts';
  if (/^(rtsp|rtmp|udp):/i.test(url)) return 'unsupported';
  return 'native';
}

export class PlayerManager {
  private destroyEngine: (() => void) | null = null;
  private generation = 0;
  constructor(private video: HTMLVideoElement) {}
  async play(url: string): Promise<Engine> {
    this.stop();
    const current = this.generation;
    const engine = detectEngine(url);
    if (engine === 'unsupported') throw new Error('Este protocolo precisa de um gateway: não é reproduzível diretamente no GitHub Pages.');
    if (location.protocol === 'https:' && url.startsWith('http:')) {
      throw new Error('Este stream usa HTTP, bloqueado por uma página HTTPS. Utilize uma fonte HTTPS ou um gateway autorizado.');
    }
    const video = this.video;
    video.poster = '';
    video.playsInline = true;
    if (engine === 'hls') {
      // Safari e plataformas sem MSE usam reprodução HLS nativa.
      const mod = await import('hls.js');
      if (current !== this.generation) return engine;
      const Hls = mod.default;
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(url));
        hls.on(Hls.Events.MANIFEST_PARSED, () => { void video.play().catch(() => {}); });
        hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal: boolean; type: string }) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else video.dispatchEvent(new Event('streamfatal'));
          }
        });
        this.destroyEngine = () => hls.destroy();
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
      } else throw new Error('Este navegador não suporta HLS nem Media Source Extensions.');
    } else if (engine === 'dash') {
      const { MediaPlayer } = await import('dashjs');
      if (current !== this.generation) return engine;
      const dash = MediaPlayer().create();
      dash.initialize(video, url, true);
      this.destroyEngine = () => dash.destroy();
    } else if (engine === 'mpegts') {
      const { default: mpegts } = await import('mpegts.js');
      if (current !== this.generation) return engine;
      if (!mpegts.isSupported()) throw new Error('Este navegador não suporta reprodução MPEG-TS por MSE.');
      const mpeg = mpegts.createPlayer({ type: /\.flv(?:$|\?)/i.test(url) ? 'flv' : 'mpegts', url, isLive: true });
      mpeg.attachMediaElement(video);
      mpeg.load();
      this.destroyEngine = () => { mpeg.pause(); mpeg.unload(); mpeg.detachMediaElement(); mpeg.destroy(); };
    } else video.src = url;
    // A interface preserva controles nativos; alguns navegadores exigem gesto explícito.
    try { await video.play(); } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') return engine;
      // HLS às vezes só consegue começar após receber o manifesto.
    }
    return engine;
  }
  stop(): void {
    this.generation++;
    try { this.destroyEngine?.(); } catch { /* best effort */ }
    this.destroyEngine = null;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
}
