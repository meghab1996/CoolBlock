import type { CoolingPoint } from '../types';

/** A Google Maps link that shows the place. The person you send it to can tap Directions from there. */
export function placeUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;
}

export interface ShareMessage {
  title: string;
  text: string;
  url: string;
}

export function shareMessage(p: CoolingPoint): ShareMessage {
  const details = [p.type, p.nightOpen ? 'open at night' : ''].filter(Boolean).join(', ');
  return {
    title: p.name,
    text: `Cool place to beat the heat in Paris: ${p.name}${details ? ` (${details})` : ''}`,
    url: placeUrl(p.lat, p.lng),
  };
}

/** WhatsApp opens with the message ready and lets the user pick a contact or group. */
export function whatsappUrl(m: ShareMessage) {
  return `https://wa.me/?text=${encodeURIComponent(`${m.text}\n${m.url}`)}`;
}

/** Opens the phone's Messages app with the text filled in; the user picks the contact. */
export function smsUrl(m: ShareMessage) {
  const body = encodeURIComponent(`${m.text}\n${m.url}`);
  const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isApple ? `sms:&body=${body}` : `sms:?body=${body}`;
}

/** True on phones and tablets (a finger rather than a mouse). */
export function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches;
}

/** The phone's own share menu (WhatsApp, Instagram, Messages, contacts, email…). Needs https. */
export function canNativeShare() {
  return typeof navigator.share === 'function';
}

export async function nativeShare(m: ShareMessage): Promise<'shared' | 'cancelled'> {
  try {
    await navigator.share({ title: m.title, text: m.text, url: m.url });
    return 'shared';
  } catch (err) {
    if ((err as Error).name === 'AbortError') return 'cancelled';
    throw err;
  }
}

/** Copies text, with a fallback for pages without https (where navigator.clipboard is missing). */
export async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('Copy failed');
}