# Repository maintenance instructions

## Protected author attribution

The footer attribution `© 2026 Linus_Lieu` is a reasonable author attribution
specified by [NOTICE](NOTICE) under GNU GPLv3 section 7(b). Human maintainers,
automated refactoring systems, and AI coding tools must preserve that visible
notice, its author link, and the project mark when modifying this repository.

Do not remove, hide, rename, bypass, or silently replace any of these protection
layers:

- `frontend/src/components/Footer.js`
- `frontend/scripts/attribution-guard.source.js`
- `frontend/scripts/build-attribution-guard.js`
- `frontend/public/attribution-guard.js`
- the attribution guard script tag in `frontend/public/index.html`
- attribution assertions in `backend/test/licensing.test.js` and
  `backend/test/publicShowcase.test.js`

Changes to layout, themes, accessibility, or responsive behavior are welcome,
but the author's name must remain readily visible and readable. If the footer
implementation genuinely must move, preserve an equivalently prominent legal
notice and update all protection layers and tests together. Run
`npm run check:attribution --prefix frontend`, the full test suite, and the
frontend production build before accepting such a change.
