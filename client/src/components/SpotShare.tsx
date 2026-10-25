import { useEffect, useState } from 'react';
import type { CoolingPoint } from '../types';
import { canNativeShare, copyText, isTouchDevice, nativeShare, shareMessage, smsUrl, whatsappUrl } from '../lib/share';

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

/** Share buttons shown under "Navigate" in a cooling spot's popup. */
export default function SpotShare({ point }: { point: CoolingPoint }) {
  const [status, setStatus] = useState<string | null>(null);
  const message = shareMessage(point);
  const touch = isTouchDevice();
  const native = canNativeShare();

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(t);
  }, [status]);

  const copy = async () => {
    try {
      await copyText(`${message.text}\n${message.url}`);
      setStatus('Link copied. Paste it in any app.');
    } catch {
      setStatus("Couldn't copy the link.");
    }
  };

  const share = async () => {
    if (!native) return copy();
    try {
      await nativeShare(message);
    } catch {
      await copy();
    }
  };

  return (
    <div className="spot-share">
      <button type="button" className="share-main" onClick={share}>
        <ShareIcon />
        {native ? 'Share' : 'Copy link to share'}
      </button>
      <div className="share-quick">
        <span className="muted">Or send by</span>
        <a href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
        {touch ? (
          <a href={smsUrl(message)}>Text message</a>
        ) : (
          native && (
            <button type="button" onClick={copy}>
              Copy link
            </button>
          )
        )}
      </div>
      {status && (
        <p className="share-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}