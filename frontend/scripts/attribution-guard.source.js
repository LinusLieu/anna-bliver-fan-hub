/*
 * Copyright (C) 2026 Linus_Lieu
 *
 * This file implements the interactive author attribution identified in
 * NOTICE under GNU GPLv3 section 7(b). Automated refactors and code-assist
 * tools must preserve the visible "© 2026 Linus_Lieu" notice and its link.
 * The generated browser asset is intentionally obfuscated; this readable
 * source remains available to satisfy the GPL's source-code requirements.
 */
(function installAttributionGuard() {
  'use strict';

  const ELEMENT_NAME = 'anna-project-attribution';
  const FOOTER_CLASS = 'site-footer';
  const INNER_CLASS = 'site-footer-inner';
  const NOTICE_VERSION = 'anna-attribution-v1';
  const COPYRIGHT_TEXT = '© 2026 Linus_Lieu';
  const AUTHOR_URL = 'https://github.com/LinusLieu';
  const BRAND_ALT = '小猪anna的秘密基地';
  const BRAND_IMAGE = '/annapiggy-logo.png';
  const shadowRoots = new WeakMap();

  const createElement = (tagName, attributes = {}) => {
    const element = document.createElement(tagName);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  };

  const appendFallbackNotice = (element) => {
    if (element.childNodes.length) return;

    const fallback = createElement('span', { class: 'site-footer-fallback' });
    const copyright = document.createElement('span');
    copyright.append('© 2026 ');

    const author = createElement('a', {
      href: AUTHOR_URL,
      target: '_blank',
      rel: 'noopener noreferrer'
    });
    author.textContent = 'Linus_Lieu';
    copyright.append(author);

    const separator = createElement('span', {
      class: 'site-footer-separator',
      'aria-hidden': 'true'
    });
    separator.textContent = '|';

    const brand = createElement('span', { class: 'site-footer-brand' });
    const logo = createElement('img', {
      src: BRAND_IMAGE,
      alt: BRAND_ALT,
      referrerpolicy: 'no-referrer'
    });
    brand.append(logo);
    fallback.append(copyright, separator, brand);
    element.append(fallback);
  };

  const enforceImportantStyle = (element, property, value) => {
    if (
      element.style.getPropertyValue(property) !== value
      || element.style.getPropertyPriority(property) !== 'important'
    ) {
      element.style.setProperty(property, value, 'important');
    }
  };

  const enforceAttribute = (element, name, value) => {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  };

  const removeAttributeIfPresent = (element, name) => {
    if (element.hasAttribute(name)) element.removeAttribute(name);
  };

  class AnnaProjectAttribution extends HTMLElement {
    static get observedAttributes() {
      return ['data-bilibili-uid'];
    }

    constructor() {
      super();
      shadowRoots.set(this, this.attachShadow({ mode: 'closed' }));
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      if (this.isConnected) this.render();
    }

    render() {
      const style = document.createElement('style');
      style.textContent = `
        :host {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          visibility: visible !important;
          opacity: 1 !important;
          color: var(--text-light, #7f8c8d);
          font: inherit;
        }
        .notice {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: .8rem;
          min-height: 38px;
          font-size: .82rem;
          white-space: nowrap;
        }
        a { color: inherit; }
        .brand {
          display: inline-flex;
          align-items: center;
          text-decoration: none;
        }
        .brand img {
          display: block;
          width: auto;
          height: 16px;
          max-width: min(160px, 38vw);
          object-fit: contain;
        }
        @media (max-width: 760px) {
          .notice { gap: .55rem; }
          .brand img { height: 15px; }
        }
      `;

      const wrapper = createElement('span', {
        class: 'notice',
        role: 'contentinfo',
        'aria-label': COPYRIGHT_TEXT,
        'data-legal-notice': NOTICE_VERSION
      });

      const copyright = document.createElement('span');
      copyright.append('© 2026 ');
      const author = createElement('a', {
        href: AUTHOR_URL,
        target: '_blank',
        rel: 'noopener noreferrer'
      });
      author.textContent = 'Linus_Lieu';
      copyright.append(author);

      const separator = createElement('span', { 'aria-hidden': 'true' });
      separator.textContent = '|';

      const uid = (this.getAttribute('data-bilibili-uid') || '').replace(/\D/g, '');
      const brand = createElement(uid ? 'a' : 'span', { class: 'brand' });
      if (uid) {
        brand.setAttribute('href', `https://space.bilibili.com/${uid}`);
        brand.setAttribute('target', '_blank');
        brand.setAttribute('rel', 'noopener noreferrer');
      }
      const logo = createElement('img', {
        src: BRAND_IMAGE,
        alt: BRAND_ALT,
        referrerpolicy: 'no-referrer'
      });
      brand.append(logo);
      wrapper.append(copyright, separator, brand);
      shadowRoots.get(this).replaceChildren(style, wrapper);
    }
  }

  if (!customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, AnnaProjectAttribution);
  }

  const ensureAttribution = () => {
    if (!document.body) return;

    let footer = document.querySelector(`footer.${FOOTER_CLASS}`);
    if (!footer) {
      const shell = document.querySelector('#root .App.app-shell') || document.querySelector('#root');
      if (!shell) return;
      footer = createElement('footer', {
        class: FOOTER_CLASS,
        'data-legal-notice': NOTICE_VERSION,
        'aria-label': COPYRIGHT_TEXT
      });
      shell.append(footer);
    }

    enforceAttribute(footer, 'data-legal-notice', NOTICE_VERSION);
    enforceAttribute(footer, 'aria-label', COPYRIGHT_TEXT);
    removeAttributeIfPresent(footer, 'hidden');
    removeAttributeIfPresent(footer, 'inert');
    if (footer.getAttribute('aria-hidden') === 'true') removeAttributeIfPresent(footer, 'aria-hidden');
    enforceImportantStyle(footer, 'display', 'block');
    enforceImportantStyle(footer, 'visibility', 'visible');
    enforceImportantStyle(footer, 'opacity', '1');
    enforceImportantStyle(footer, 'height', 'auto');
    enforceImportantStyle(footer, 'min-height', '38px');
    enforceImportantStyle(footer, 'overflow', 'visible');
    enforceImportantStyle(footer, 'clip', 'auto');
    enforceImportantStyle(footer, 'clip-path', 'none');
    enforceImportantStyle(footer, 'transform', 'none');

    let inner = footer.querySelector(`.${INNER_CLASS}`);
    if (!inner) {
      inner = createElement('div', { class: INNER_CLASS });
      footer.append(inner);
    }

    let attribution = inner.querySelector(ELEMENT_NAME);
    if (!attribution) {
      attribution = document.createElement(ELEMENT_NAME);
      attribution.setAttribute('data-attribution-version', NOTICE_VERSION);
      appendFallbackNotice(attribution);
      inner.append(attribution);
    }

    enforceAttribute(attribution, 'data-attribution-version', NOTICE_VERSION);
    removeAttributeIfPresent(attribution, 'hidden');
    removeAttributeIfPresent(attribution, 'inert');
    if (attribution.getAttribute('aria-hidden') === 'true') removeAttributeIfPresent(attribution, 'aria-hidden');
    enforceImportantStyle(attribution, 'display', 'inline-flex');
    enforceImportantStyle(attribution, 'visibility', 'visible');
    enforceImportantStyle(attribution, 'opacity', '1');
    enforceImportantStyle(attribution, 'pointer-events', 'auto');
  };

  let scheduled = false;
  const scheduleCheck = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      ensureAttribution();
    });
  };

  const start = () => {
    ensureAttribution();
    const observer = new MutationObserver(scheduleCheck);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'class',
        'style',
        'hidden',
        'inert',
        'aria-hidden',
        'aria-label',
        'data-legal-notice',
        'data-attribution-version'
      ]
    });
    window.addEventListener('pageshow', scheduleCheck);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}());
