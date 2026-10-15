'use client';
import {useEffect, useRef, useState} from 'react';
import {adsConfig, validAdUnit} from '../lib/ads-config';

declare global {
  interface Window {
    adsbygoogle?: object[];
    domainradarAdConsent?: boolean;
  }
}
let script: Promise<void> | undefined;
function loadAds() {
  return script ??= new Promise<void>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.async = true;
    tag.crossOrigin = 'anonymous';
    tag.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + adsConfig.publisherId;
    tag.onload = () => resolve();
    tag.onerror = () => {script = undefined; tag.remove(); reject(new Error('Ad script unavailable'));};
    document.head.appendChild(tag);
  });
}
/** The CMP must set the flag and dispatch this event after obtaining consent. */
export default function AdSlot({placement}: {placement: 'top' | 'bottom'}) {
  const slot = adsConfig.slots[placement];
  const active = adsConfig.enabled && validAdUnit(adsConfig.publisherId, slot);
  const [consent, setConsent] = useState(false);
  const element = useRef<HTMLModElement>(null);
  const submitted = useRef(false);
  useEffect(() => {
    const update = () => setConsent(window.domainradarAdConsent === true);
    update();
    window.addEventListener('domainradar:ad-consent', update);
    return () => window.removeEventListener('domainradar:ad-consent', update);
  }, []);
  useEffect(() => {
    if (!active || !consent || submitted.current || !element.current) return;
    let cancelled = false;
    loadAds().then(() => {
      if (cancelled || submitted.current || !element.current || window.domainradarAdConsent !== true) return;
      submitted.current = true;
      try {(window.adsbygoogle ??= []).push({});} catch { /* Ad blockers must not break the catalogue. */ }
    }).catch(() => {});
    return () => {cancelled = true;};
  }, [active, consent]);
  if (!adsConfig.preview && (!active || !consent)) return null;
  return <aside className={'ad-container ad-' + placement} aria-label="Advertisement">
    <small>Advertisement</small>
    {adsConfig.preview ? <div className="ad-preview">Responsive AdSense placement</div> :
      <ins ref={element} className="adsbygoogle" style={{display: 'block'}} data-ad-client={adsConfig.publisherId} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true"/>}
  </aside>;
}
