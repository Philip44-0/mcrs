# MCRS - Modular Cash Register System

[![CI](https://github.com/Philip44-0/mcrs/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Philip44-0/mcrs/actions/workflows/ci.yml)
[![License: GPL v2](https://img.shields.io/badge/License-GPL_v2-blue.svg)](LICENSE)

A modular cash register and order system for clubs, voluntary fire brigades and similar events.
Waiters take orders on their phones, administrators manage the menu, the tables and the stock, and
everything beyond a small skeleton is a replaceable module.

> **Status:** early development (milestone M0, foundation). The architecture is specified; the
> implementation has just begun.

## What it will do

- One login for waiters and administrators, with separate areas for each role.
- Administrators build the menu (categories, sub-categories, items with prices and optional stock
  limits), define tables and arrange the order of everything.
- Waiters pick a table, tap items to build the bill, add notes, send orders and settle the bill.
- Works on a phone first and on a desktop as well.
- Live updates: a sold-out item is greyed out on every phone within moments.
- Light and dark mode, selectable language (English by default).

## Modular by design

Only a small **skeleton** is fixed: the module loader, the contracts, events and hooks, the API
router and the Angular shell. Everything else is a **module** that can be removed or rewritten:
catalog, tables, orders, stock, reports, cancellations, printing, translations, themes and more.
Modules talk to each other through contracts, events and hooks and never touch each other's data.

The full design is in the [specification](docs/specification.md).

## Repository layout

```
mcrs/
  apps/
    client/      Angular app (the user interface)
    server/      Express server (API, later the module loader)
  packages/
    shared/      Contracts and types shared by client and server
    core-client/ Angular shell and slot system (placeholder for now)
  modules/       Modules (empty for now)
  docs/          Specification and guides
```

This is an npm workspaces monorepo: one `npm install` in the root sets up everything.

## Requirements

- [Node.js](https://nodejs.org) 24 (LTS)
- npm 11 (comes with Node 24; the exact version is pinned in `package.json`)

## Getting started

```
git clone https://github.com/Philip44-0/mcrs.git
cd mcrs
npm install
```

### Development

Run both sides in two terminals from the repository root:

```
npm run dev:server    # Express on http://localhost:3000, restarts on changes
npm run dev:client    # Angular on http://localhost:4200, /api is proxied to Express
```

Open <http://localhost:4200>. The request <http://localhost:4200/api/_core/health> returns the
server status through the proxy.

The server port can be changed with the environment variable `PORT` (default `3000`). For local
development you can put it into `apps/server/.env`, which is not committed:

```
PORT=3100
```

### Build and run

```
npm run build                    # builds client and server
npm start -w @mcrs/server        # runs the built server
```

### Checks

```
npm run lint            # ESLint
npm run format:check    # Prettier (use `npm run format` to fix)
npm test                # unit tests (run once, no watch mode)
```

The same checks run on every push in [GitHub Actions](.github/workflows/ci.yml).

## Roadmap

The work is organised in eleven milestones (M0 to M10), each with its own issues:

- [Milestones](https://github.com/Philip44-0/mcrs/milestones)
- [Issues](https://github.com/Philip44-0/mcrs/issues)

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. It explains branches, commit messages,
labels and the checks that have to pass.

## License

MCRS is released under the GNU General Public License v2.0 (GPL-2.0). See [LICENSE](LICENSE).