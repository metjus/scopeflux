'use client';

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, Bookmark, Globe2,
  History, Info, Menu, Radar, Search, X,
} from 'lucide-react';
import { LEGAL_PAGES, PAGES } from '../lib/navigation';
import type { PageId } from '../lib/navigation';
import styles from './site-navigation.module.css';
import { BrandMark } from './brand-mark';

const PAGE_ICONS = {
  discover: Globe2,
  recent: History,
  watch: Bookmark,
  lookup: Search,
  sources: Activity,
  about: Info,
};

type SiteNavigationProps = {
  currentPage: PageId;
  watchCount: number;
  onNavigate: (page: PageId) => void;
};

export default function SiteNavigation({
  currentPage, watchCount, onNavigate,
}: SiteNavigationProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const compactLayout = window.matchMedia('(max-width: 1023px)');

    function handleLayoutChange() {
      setOpen(false);
      if (compactLayout.matches && panel.current?.contains(document.activeElement)) {
        toggle.current?.focus();
      } else if (!compactLayout.matches && document.activeElement === toggle.current) {
        panel.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.focus();
      }
    }

    compactLayout.addEventListener('change', handleLayoutChange);
    return () => compactLayout.removeEventListener('change', handleLayoutChange);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleLocationChange() {
      setOpen(false);
    }

    document.addEventListener('pointerdown', handleOutsidePress);
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePress);
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [open]);

  function followLink(event: MouseEvent<HTMLAnchorElement>, page: PageId) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setOpen(false);
    onNavigate(page);
  }

  return (
    <aside
      ref={root}
      className={styles.root}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <div className={styles.header}>
        <a className={styles.brand} href="#discover" aria-label="ScopeFlux home" onClick={event => followLink(event, 'discover')}>
          <span className={styles.brandIcon}><BrandMark size={24} /></span>
          <span>Scope<span className={styles.brandAccent}>Flux</span></span>
        </a>
        <button
          ref={toggle}
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls="site-navigation-panel"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setOpen(value => !value)}
        >
          {open ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          <span>{open ? 'Close' : 'Menu'}</span>
        </button>
      </div>

      <div ref={panel} id="site-navigation-panel" className={styles.panel} data-open={open}>
        <p className={styles.sectionLabel}>YOUR DOMAIN MAP</p>
        <nav className={styles.links} aria-label="Main navigation">
          {PAGES.map(page => {
            const Icon = PAGE_ICONS[page.id];
            return (
              <a
                key={page.id}
                href={`#${page.id}`}
                className={styles.link}
                aria-current={currentPage === page.id ? 'page' : undefined}
                onClick={event => followLink(event, page.id)}
              >
                <Icon className={styles.linkIcon} size={20} aria-hidden="true" />
                <span className={styles.linkText}>
                  <span>{page.label}</span>
                  <small>{page.description}</small>
                </span>
                {page.id === 'watch'
                  ? <span className={styles.count} aria-label={`${watchCount} saved domains`}>{watchCount}</span>
                  : <ArrowUpRight className={styles.linkArrow} size={15} aria-hidden="true" />}
              </a>
            );
          })}
        </nav>

        <div className={styles.promo}>
          <Radar size={41} aria-hidden="true" />
          <strong>A good name has its moment.</strong>
          <p>Save the domains you like and follow what changes.</p>
          <a href="#watch" onClick={event => followLink(event, 'watch')}>
            Build your watchlist <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
        <p className={styles.footnote}><span aria-hidden="true" /> Live sources · estimated dates</p>
        <nav className={styles.legal} aria-label="Privacy and contact">
          {LEGAL_PAGES.map(page => (
            <a
              key={page.id}
              href={`#${page.id}`}
              aria-current={currentPage === page.id ? 'page' : undefined}
              onClick={event => followLink(event, page.id)}
            >
              {page.label}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
