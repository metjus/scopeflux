// The sidebar is a modal drawer only at the layout's mobile breakpoint.
export function initNavigation({
  doc = document,
  win = window,
  onSearchShortcut = () => {},
  onNavigate = () => {},
} = {}) {
  const sidebar = doc.querySelector('#sidebar'),
    main = doc.querySelector('.main-shell');
  const toggle = doc.querySelector('#menu-toggle'),
    dismiss = doc.querySelector('#menu-close'),
    backdrop = doc.querySelector('#menu-backdrop');
  const media = win.matchMedia('(max-width: 720px)');
  let opened = false;
  function sync() {
    const modal = media.matches && opened;
    sidebar.classList.toggle('open', modal);
    doc.body.classList.toggle('navigation-open', modal);
    toggle.setAttribute('aria-expanded', String(modal));
    backdrop.hidden = !modal;
    sidebar.inert = media.matches && !modal;
    main.inert = modal;
    if (media.matches && !modal) sidebar.setAttribute('aria-hidden', 'true');
    else sidebar.removeAttribute('aria-hidden');
    if (modal) {
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
    } else {
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
    }
  }
  function close({ restoreFocus = false } = {}) {
    const wasOpen = opened;
    opened = false;
    sync();
    if (wasOpen && restoreFocus) toggle.focus();
  }
  function open() {
    if (!media.matches) return;
    opened = true;
    sync();
    (sidebar.querySelector('nav a[aria-current="page"]') || dismiss).focus();
  }
  toggle.addEventListener('click', () => (opened ? close({ restoreFocus: true }) : open()));
  dismiss.addEventListener('click', () => close({ restoreFocus: true }));
  backdrop.addEventListener('click', () => close({ restoreFocus: true }));
  sidebar.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (link) {
      close();
      onNavigate(link.getAttribute('href'));
    }
  });
  media.addEventListener('change', () => close());
  doc.querySelector('#skip-to-content').addEventListener('click', event => {
    event.preventDefault();
    close();
    doc.querySelector('#main').focus();
  });
  doc.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      close();
      onSearchShortcut();
      return;
    }
    if (!opened) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ restoreFocus: true });
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [
      ...sidebar.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'),
    ].filter(el => !el.hidden && !el.closest('[hidden]') && el.getClientRects().length);
    const first = controls[0],
      last = controls.at(-1);
    if (!first) {
      event.preventDefault();
      dismiss.focus();
      return;
    }
    if (event.shiftKey && (doc.activeElement === first || !sidebar.contains(doc.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (doc.activeElement === last || !sidebar.contains(doc.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  });
  sync();
  return { close };
}
