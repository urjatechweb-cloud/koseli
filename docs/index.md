# Koseli -- documentation

Koseli (कोसेली): a gifting and services marketplace for Nepal and the Nepali diaspora. Next.js 14, Prisma, Postgres. Beta market: Pokhara.

This directory is a wiki maintained by an LLM: linked markdown pages, nothing outside the
repository. The rules are in [`CLAUDE.md`](CLAUDE.md).

## Start here

This wiki grows as work happens (`docs-mode: grow`). It only covers what has been worked on so far.

- **Pricing or money:** [[pricing-and-fx]], then [[payments]]
- **Payments or a gateway:** [[payments]]
- **Setup and run:** the repository `README.md`. No operations page yet

---

## concepts

_No pages yet._

## architecture

_No pages yet._

## subsystems

- [[pricing-and-fx]] -- vendor cost to NPR retail (20% margin engine), then NPR to the buyer's currency (NRB rates, 15-min quotes)
- [[payments]] -- Fonepay QR and web, Stripe, and the shared once-only settlement

## decisions

_No pages yet._

## reference

_No pages yet._

## operations

_No pages yet._

## history

_No pages yet._

---

## Using this wiki

```
/docs-sync     right after a deploy or release -- reads only what changed since verified_at
/docs-lint     integrity check (orphans, broken links, broken sources, stale, unverified)
/docs-query    ask the docs. If it is not there, the answer says so
/docs-status   commits not yet reflected, stale pages, recent work
```

Every page carries `verified_at`, the commit it was checked against. Change code, run
`/docs-sync`.
