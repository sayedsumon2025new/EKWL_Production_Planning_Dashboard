/* Site-wide presentation preference. No report state or data is modified. */
(() => {
  'use strict';
  const key = 'ekwl-dashboard-theme';
  // The main dashboard can itself be framed by an in-app browser. Only our
  // explicitly marked Order Execution view delegates to its parent.
  const embedded = window.parent !== window &&
    document.documentElement.dataset.themeContext === 'execution';
  const valid = value => value === 'dark' ? 'dark' : 'light';
  let theme = 'light';
  try { theme = valid(localStorage.getItem(key)); } catch (_) { /* Sandboxed view or blocked storage. */ }
  const frame = () => document.getElementById('order-execution-frame');
  const send = () => frame()?.contentWindow?.postMessage({type: 'ekwl-theme', theme}, '*');
  function apply(value, persist = false) {
    theme = valid(value);
    document.documentElement.dataset.theme = theme;
    if (document.body && (embedded || document.getElementById('dark-btn'))) document.body.classList.toggle('dark', theme === 'dark');
    if (persist) { try { localStorage.setItem(key, theme); } catch (_) { /* Theme still works without storage. */ } }
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.setAttribute('aria-checked', String(theme === 'dark'));
      button.textContent = theme === 'dark' ? '☀ Light' : '☾ Dark';
      button.title = 'Switch the entire dashboard to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme';
    }
    const childButton = document.getElementById('dark-btn');
    if (childButton) childButton.textContent = theme === 'dark' ? '☀ Light' : '☾ Dark';
    if (!embedded) send();
    window.dispatchEvent(new CustomEvent('ekwl-theme-changed', {detail: {theme}}));
  }
  function toggle() {
    if (embedded) window.parent.postMessage({type: 'ekwl-theme-toggle'}, '*');
    else apply(theme === 'dark' ? 'light' : 'dark', true);
  }
  window.EKWLTheme = {toggle, get: () => theme};
  // Set the attribute before the first paint to avoid a flash on reload.
  apply(theme);
  window.addEventListener('message', event => {
    if (embedded) {
      if (event.source === window.parent && event.data?.type === 'ekwl-theme') apply(event.data.theme);
    } else if (event.source === frame()?.contentWindow) {
      if (event.data?.type === 'ekwl-theme-request') send();
      if (event.data?.type === 'ekwl-theme-toggle') toggle();
    }
  });
  window.addEventListener('storage', event => {
    if (!embedded && event.key === key) apply(event.newValue);
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('theme-toggle')?.addEventListener('click', toggle);
    frame()?.addEventListener('load', send);
    apply(theme);
    if (embedded) window.parent.postMessage({type: 'ekwl-theme-request'}, '*');
  });
})();
