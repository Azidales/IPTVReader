import type { Program } from './types';
export function xmltvTimestamp(value: string): number {
  const match = value.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*([+-]\d{4})?/);
  if (!match) return NaN;
  const [, yr, mo, day, hr, min, sec, tz] = match;
  const utc = Date.UTC(+yr, +mo-1, +day, +hr, +min, +(sec || '0'));
  if (!tz) return utc;
  const direction = tz[0] === '+' ? 1 : -1;
  return utc - direction * (Number(tz.slice(1,3)) * 60 + Number(tz.slice(3))) * 60000;
}
export function parseXmltv(text: string): Program[] {
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  if (xml.querySelector('parsererror')) throw new Error('XMLTV inválido.');
  const result: Program[] = [];
  for (const node of xml.getElementsByTagName('programme')) {
    const channelId = node.getAttribute('channel') || '';
    const start = xmltvTimestamp(node.getAttribute('start') || '');
    const end = xmltvTimestamp(node.getAttribute('stop') || '');
    const title = node.getElementsByTagName('title')[0]?.textContent?.trim() || '';
    if (channelId && title && Number.isFinite(start) && Number.isFinite(end)) result.push({ channelId, start, end, title,
      description: node.getElementsByTagName('desc')[0]?.textContent?.trim() || undefined });
  }
  return result;
}
export function currentProgram(programs: Program[], tvgId?: string, at = Date.now()): Program | undefined {
  return programs.find(p => p.channelId === tvgId && p.start <= at && p.end > at);
}
