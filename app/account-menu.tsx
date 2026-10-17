'use client';
import {useEffect, useRef, useState} from 'react';
import {ArrowUpRight, LogOut, Trash2} from 'lucide-react';

type Props = {signedIn: boolean; account?: {email: string; name: string}; next: string};

// Top-right corner: "Sign in" for visitors, an account menu after sign-in.
export default function AccountMenu({signedIn, account, next}: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [deleting, setDeleting] = useState(false);
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
        <a href="/account/logout"><LogOut size={15}/> Sign out</a>
        <button type="button" onClick={deleteAccount} disabled={deleting}><Trash2 size={15}/> {deleting ? 'Deleting…' : 'Delete account'}</button>
      </div>
    </details>
  );
}
