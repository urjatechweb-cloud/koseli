# Work log

Append-only. Newest entries at the bottom.

---

## [2026-11-04] setup | docs/ wiki scaffolded

- Categories: concepts - architecture - subsystems - decisions - reference - operations - history
- Baseline commit: `27eb527`
- Created: `docs/{CLAUDE,index,log}.md`, `raw/`, 4 `.claude/commands/docs-*`,
  and `.claude/scripts/docs-lint.py`

- Started in **grow** mode: only the areas worked on so far are documented
- Wrote from code: [[pricing-and-fx]] (`src/server/pricing`, `src/server/fx`) and [[payments]] (`src/server/payments`, payment and FX API routes)

## [2026-11-04] grow | storefront

- New page [[storefront]]: customer pages, guest sessions and order creation
- [[payments]]: replaced the "auth fails closed" note with the cookie rule; added a note on the demo payment route
