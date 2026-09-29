const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('[data-menu-button]');
const mobileNav = /** @type {HTMLElement | null} */ (document.querySelector('[data-mobile-nav]'));

const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 12);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

function closeMenu() {
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', 'Open menu');
  if (mobileNav) mobileNav.hidden = true;
}

menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  if (mobileNav) mobileNav.hidden = !open;
});
mobileNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});
window.matchMedia('(min-width: 801px)').addEventListener('change', (event) => {
  if (event.matches) closeMenu();
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealItems = document.querySelectorAll('[data-reveal]');
if (reducedMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((item) => item.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      currentObserver.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  revealItems.forEach((item) => observer.observe(item));
}

const privacyWindow = /** @type {HTMLElement | null} */ (document.querySelector('[data-privacy-window]'));
const privacyToggle = document.querySelector('[data-privacy-toggle]');
privacyToggle?.addEventListener('click', () => {
  const focusVerifier = privacyWindow?.dataset.scope !== 'verifier';
  if (privacyWindow) privacyWindow.dataset.scope = focusVerifier ? 'verifier' : 'both';
  privacyToggle.setAttribute('aria-pressed', String(focusVerifier));
  privacyToggle.innerHTML = `${focusVerifier ? 'Show both views' : 'Focus on verifier view'} <span aria-hidden="true">↗</span>`;
});

const proofDemo = /** @type {HTMLElement | null} */ (document.querySelector('[data-proof-demo]'));
const tierButtons = document.querySelectorAll('[data-tier]');
const proofIcon = document.querySelector('[data-proof-icon]');
const proofLabel = document.querySelector('[data-proof-label]');
const proofResult = document.querySelector('[data-proof-result]');
const proofVerifier = document.querySelector('[data-proof-verifier]');
const sampleMonthlySalary = 5000;

tierButtons.forEach((item) => item.addEventListener('click', () => {
  const button = /** @type {HTMLElement} */ (item);
  const tier = Number(button.dataset.tier);
  const qualifies = sampleMonthlySalary >= tier;
  tierButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  if (proofDemo) proofDemo.dataset.qualified = String(qualifies);
  if (proofIcon) proofIcon.textContent = qualifies ? '✓' : '—';
  if (proofLabel) proofLabel.textContent = qualifies ? 'QUALIFYING CLAIM' : 'NO QUALIFYING CLAIM';
  if (proofResult) proofResult.textContent = qualifies ? `Income ≥ $${tier.toLocaleString('en-US')}` : 'No claim issued';
  if (proofVerifier) proofVerifier.textContent = qualifies
    ? `Verifier sees the qualifying $${tier.toLocaleString('en-US')} tier. The $5,000 amount stays private.`
    : 'This salary is below the requested tier. No successful proof is produced for the verifier.';
}));
