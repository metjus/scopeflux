'use client';
import {useEffect, useRef, useState} from 'react';
import {ArrowUpRight, Bell, LogOut, Trash2} from 'lucide-react';

type Props = {signedIn: boolean; account?: {email: string; name: string}; next: string};

// Top-right corner: "Sign in" for visitors, an account menu after sign-in.
export default function AccountMenu({signedIn, account, next}: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [deleting, setDeleting] = useState(false);
  // Email alerts: null until loaded; available is false until sending is configured.
  const [alerts, setAlerts] = useState<{enabled: boolean; available: boolean} | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!signedIn) return;
    fetch('/api/account/alerts').then(r => r.ok ? r.json() : null).then((data: {enabled: boolean; available: boolean} | null) => data && setAlerts(data)).catch(() => {});
  }, [signedIn]);
  async function toggleAlerts(enabled: boolean) {
    setSaving(true);
    try {
      const response = await fetch('/api/account/alerts', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({enabled})});
      if (response.ok) setAlerts(await response.json());
    } finally {setSaving(false);}
  }
  useEffect(() => {
    function close(event: PointerEvent) {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) menu.current.open = false;
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  if (!signedIn) {
    return <a className="signin" href={'/account/login?next=' + encodeURIComponent(next)} target="_top">Sign in <ArrowUpRight size={14}/></a>;
  }
  const label = account?.name || account?.email || 'Account';
  const initial = label.trim().charAt(0).toUpperCase() || 'A';

  async function deleteAccount() {
    if (!window.confirm('Delete your ScopeFlux account and your saved watchlist? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const response = await fetch('/api/account', {method: 'DELETE'});
      if (!response.ok) throw new Error();
      window.location.href = '/';
    } catch {
      setDeleting(false);
      window.alert('The account could not be deleted right now. Please try again, or write to hello@scopeflux.io.');
    }
  }

  return (
    <details className="account-menu" ref={menu}>
      <summary aria-label={'Account menu for ' + label}><span className="avatar" aria-hidden="true">{initial}</span></summary>
      <div className="account-panel">
        <strong>{account?.name || 'Signed in'}</strong>
        {account?.email && <span>{account.email}</span>}
        <label className="alert-toggle">
          <input type="checkbox" checked={!!alerts?.enabled} disabled={!alerts?.available || saving} onChange={event => toggleAlerts(event.target.checked)}/>
          <span><Bell size={15}/> Email alerts<small>{alerts && !alerts.available ? 'Coming soon' : 'A day before a saved domain is released'}</small></span>
        </label>
        <a href="/account/logout"><LogOut size={15}/> Sign out</a>
        <button type="button" onClick={deleteAccount} disabled={deleting}><Trash2 size={15}/> {deleting ? 'Deleting…' : 'Delete account'}</button>
      </div>
    </details>
  );
}
