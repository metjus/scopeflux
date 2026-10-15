'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Globe2, Info, RefreshCw, Search } from 'lucide-react';

type DomainLookupProps = { onCheck: (domain: string) => Promise<void> };

export default function DomainLookup({ onCheck }: DomainLookupProps) {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onCheck(domain);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The domain could not be checked. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="domain-lookup" aria-labelledby="domain-lookup-title">
      <span className="info-icon"><Globe2 size={25} aria-hidden="true" /></span>
      <h2 id="domain-lookup-title">Which domain are you checking?</h2>
      <p>Enter any domain name, with any extension and no expiration-date limit. We check public registry data or a supported source, even when expiration is years away.</p>
      <form onSubmit={submit} aria-busy={loading}>
        <label htmlFor="any-domain">Domain name</label>
        <div className="domain-lookup-fields">
          <input
            ref={input}
            id="any-domain"
            name="domain"
            value={domain}
            onChange={event => { setDomain(event.target.value); setError(''); }}
            placeholder="example.com or example.co.uk"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            aria-describedby={error ? 'domain-lookup-help domain-lookup-error' : 'domain-lookup-help'}
            aria-invalid={Boolean(error)}
            required
          />
          <button className="primary" type="submit" disabled={loading}>
            {loading ? <RefreshCw size={18} className="spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
            {loading ? 'Checking…' : 'Check domain'}
          </button>
        </div>
        <p id="domain-lookup-help">Supports international names and endings beyond the discovery catalogue. Enter the domain itself, without a page path.</p>
        {error && <p className="lookup-error" id="domain-lookup-error" role="alert">{error}</p>}
      </form>
      <div className="lookup-examples">
        <span>Try a format</span>
        {['example.com', 'example.xyz', 'example.co.uk'].map(example => (
          <button key={example} type="button" disabled={loading} onClick={() => { setDomain(example); setError(''); input.current?.focus(); }}>
            {example}
          </button>
        ))}
      </div>
      <div className="lookup-explanation"><Info size={19} aria-hidden="true" /><p>Some registries do not publish RDAP data. We explain when a record cannot be verified and provide a registry reference. A missing record does not confirm availability, and an expiration date does not guarantee a release.</p></div>
    </section>
  );
}
