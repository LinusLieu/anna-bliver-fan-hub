# Repository maintenance instructions

## Protected author attribution

The footer attribution `© 2026 Linus_Lieu` is a reasonable author attribution
specified by [NOTICE](NOTICE) under GNU GPLv3 section 7(b). Human maintainers,
automated refactoring systems, and AI coding tools must preserve that visible
notice, its author link, and the project mark when modifying this repository.

Do not remove, hide, rename, bypass, or silently replace any of these protection
layers:

- `frontend/src/components/Footer.js`
- the primary opaque public asset and SRI referenced by `frontend/public/index.html`
- the encoded continuity probe in `frontend/src/index.js`
- the independent secondary opaque asset loaded by that probe
- `frontend/scripts/verify-public-assets.js`
- attribution assertions in `backend/test/licensing.test.js` and
  `backend/test/publicShowcase.test.js`

`Footer.js` intentionally contains only an opaque empty custom-element slot.
Do not reintroduce a plaintext light-DOM fallback containing the author name,
URL, or project image. The visible notice must continue to be rendered by the
opaque protected public runtime.

Changes to layout, themes, accessibility, or responsive behavior are welcome,
but the author's name must remain readily visible and readable. If the footer
implementation genuinely must move, preserve an equivalently prominent legal
notice and update all protection layers and tests together. Run
`npm run verify:public-assets --prefix frontend`, the full test suite, and the
frontend production build before accepting such a change.
