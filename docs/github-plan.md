# MCRS - GitHub plan (preview)

This file is a readable preview of `github-plan.json`. The script `create-github-plan.ps1` creates exactly this content on GitHub.

## Overview

| Milestone                                                          | Issues |
| ------------------------------------------------------------------ | ------ |
| M0 - Foundation: workspace and dev setup                           | 6      |
| M1 - The Engine Room: core server                                  | 9      |
| M2 - A Place to Keep Things: storage contract and SQLite           | 6      |
| M3 - Who Goes There: authentication and the client shell           | 10     |
| M4 - The Control Panel: settings and dialogs                       | 4      |
| M5 - Building the Menu: catalog and tables                         | 7      |
| M6 - From Tap to Table: ordering                                   | 9      |
| M7 - Always Up To Date: stock and live updates                     | 7      |
| M8 - Make It Yours: comfort modules                                | 7      |
| M9 - Power Tools: import/export, output, reports and cancellations | 8      |
| M10 - Ready for the Real World: PWA, HTTPS and release             | 7      |

Total: 11 milestones, 80 issues, 29 labels.

## Label legend

| Label            | Meaning                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------- |
| `feature`        | New functionality that users or module authors can see or use                           |
| `chore`          | Setup, tooling, dependencies and maintenance without new features                       |
| `test`           | Automated tests, conformance suites and test infrastructure                             |
| `docs`           | Documentation: README, guides, specification and code comments                          |
| `security`       | Authentication, authorization, hardening and anything that protects data                |
| `ui`             | User interface, layout, mobile usability and accessibility                              |
| `scope`          | Group: part of the skeleton; add one of core-server, core-client, shared or tooling     |
| `core-server`    | The server skeleton: loader, registry, events, hooks, routes, SSE                       |
| `core-client`    | The Angular skeleton: shell, slots, routing, handshake, design tokens                   |
| `shared`         | Contracts, types and utilities shared by client and server                              |
| `tooling`        | Build scripts, generators, CI and developer experience                                  |
| `module`         | Group: work on a module under modules/; add the module's own label (auth, catalog, ...) |
| `storage-sqlite` | Required (storage): default SQLite storage, implements storage@1                        |
| `auth`           | Required: login, sessions, users, roles, CSRF protection, rate limiting                 |
| `settings`       | Required: settings cog, expandable sections, module overview                            |
| `dialogs`        | Dialog service and popups (dialog@1)                                                    |
| `catalog`        | Categories, sub-categories and items with prices and availability                       |
| `tables`         | Table labels that the admin defines and waiters pick                                    |
| `orders`         | Waiter flow: draft bill, sending orders, notes and paying                               |
| `stock`          | Remaining quantities, sold-out handling, reservation on send                            |
| `back-button`    | Visible back button in the top bar                                                      |
| `theme`          | Light, dark and system appearance                                                       |
| `i18n`           | Translations and language picker (Transloco, English default)                           |
| `reorder`        | Moving list entries: up/down buttons and desktop drag and drop                          |
| `import-export`  | JSON export and import with checksums and compatibility report                          |
| `output`         | Tickets and receipts to printers and displays (output.target)                           |
| `reports`        | Sales summaries and their export                                                        |
| `cancellations`  | Cancelling sent lines with reasons and an audit log                                     |
| `pwa`            | Installable app, service worker and offline order queue                                 |

---

# Milestone: M0 - Foundation: workspace and dev setup

### Goal

Turn the Angular scaffold into a clean monorepo that a newcomer can clone, install and run in a few minutes. After M0 there is a running Express server, a running Angular app and a proxy that connects them, but no business logic yet. Everything later builds on this layout, so it is worth getting the structure, the tooling and the documentation right now.

### In scope

- npm workspaces layout from the specification (apps, packages, modules, tools)
- Root package.json, packages/shared stub, apps/server skeleton, apps/client moved into place
- Dev proxy between ng serve and Express
- Code style tooling and continuous integration
- README, CONTRIBUTING and the specification committed into the repository

### Out of scope

- The module loader and any module (starts in M1)
- Authentication, database and every user-facing feature

### Deliverables

- npm install in the repository root works without errors
- Both sides start with one command each and /api/_core/health answers through the proxy
- A GitHub Actions workflow builds and tests on every push
- docs/specification.md, README.md and CONTRIBUTING.md exist

### Definition of done

- [ ] A fresh clone can be installed and started by following only the README
- [ ] CI is green on the main branch
- [ ] The open setup reminders (tsconfig path mapping, proxy, packageManager in root) are all done

### Depends on

Nothing. This is the starting point.

### Reference

Specification: sections 1 to 4

## Issues

#### Lay the foundation: turn the repo into an npm workspaces monorepo

Labels: `chore` (maintenance and setup), `scope` (group: skeleton), `tooling` (build, CI and scripts)

##### Summary

Move the Angular scaffold into apps/client and create the root package.json with workspaces, so every later package can be linked by name instead of by relative path.

##### Acceptance criteria

- [ ] Root package.json has private:true, the packageManager field and workspaces for apps/_, packages/_, modules/*
- [ ] packages/shared exists with the name @mcrs/shared and main/types pointing at src/index.ts
- [ ] apps/client has its own package.json named @mcrs/client; its node_modules and package-lock.json are removed
- [ ] npm install in the root succeeds and npm ls @mcrs/shared shows the local folder

##### References

- Specification: section 3

#### Give the server a heartbeat: a minimal Express app in apps/server

Labels: `feature` (new functionality), `scope` (group: skeleton), `core-server` (server skeleton)

##### Summary

Create the first running piece of the server: a TypeScript Express app that answers a health request. It is the seed that the core server grows from in M1.

##### Acceptance criteria

- [ ] apps/server is a workspace with TypeScript, a dev script that restarts on changes and a build script
- [ ] GET /api/_core/health returns a small JSON status
- [ ] The port comes from an environment variable and defaults to 3000

##### References

- Specification: section 10

#### Bridge the gap: dev proxy between ng serve and Express

Labels: `chore` (maintenance and setup), `scope` (group: skeleton), `tooling` (build, CI and scripts), `core-client` (client skeleton)

##### Summary

Let the Angular dev server forward /api calls to Express so the browser sees a single origin and no CORS setup is needed. This is also the moment to finish the client configuration that was postponed earlier.

##### Acceptance criteria

- [ ] proxy.conf.json forwards /api to http://localhost:3000 and the client start script uses it
- [ ] tsconfig.json of the client maps @mcrs/shared to packages/shared/src/index.ts
- [ ] A short note in the README explains how to run both sides in two terminals
- [ ] The path mapping for @mcrs/core-client is added as soon as that package exists (tracked in M3)

##### References

- Specification: section 3, section 11

#### Keep it tidy: Prettier, ESLint and EditorConfig for the whole repo

Labels: `chore` (maintenance and setup), `scope` (group: skeleton), `tooling` (build, CI and scripts)

##### Summary

Agree on one code style for every workspace so that diffs stay small and reviews stay about content.

##### Acceptance criteria

- [ ] Shared Prettier config in the root, used by all workspaces
- [ ] ESLint configured for TypeScript on server and client
- [ ] .editorconfig present; npm run lint and npm run format work from the root

##### References

- Specification: section 17

#### Safety net: GitHub Actions that build and test every push

Labels: `chore` (maintenance and setup), `scope` (group: skeleton), `tooling` (build, CI and scripts)

##### Summary

Set up continuous integration early, so a broken build is noticed within minutes and never piles up.

##### Acceptance criteria

- [ ] Workflow runs npm ci, build, lint and test on push and pull request
- [ ] Uses the current Node LTS version and caches npm
- [ ] Status badge in the README

##### References

- Specification: section 17

#### Put the plan on paper: commit the specification, README and contributor guide

Labels: `docs` (documentation)

##### Summary

Make the repository self-explanatory. The specification is the source of truth for every later issue, so it belongs in the repo.

##### Acceptance criteria

- [ ] docs/specification.md contains the current draft
- [ ] README explains what MCRS is, how to install, how to start in development and how to build
- [ ] CONTRIBUTING.md describes labels, milestones, branch names and commit style
- [ ] License (GPL-2.0) mentioned in the README

##### References

- Specification: whole document

---

# Milestone: M1 - The Engine Room: core server

### Goal

Build the heart of MCRS: the part that reads the configuration, finds the modules, checks that they fit together and brings them to life in the right order. This is the only code that every installation shares, so it has to be small, strict and thoroughly tested. A module author should be able to rely on it without ever reading its source.

### In scope

- Loading and validating mcrs.config.json and every module.json
- Module sources: folder paths and npm packages
- Capability map, dependency resolution, cycle detection and load order
- Registry freeze and module fingerprints
- Lifecycle phases (register, start, stop) and graceful shutdown
- Event bus and hook registry (guards and filters)
- Route registry with mandatory access rules, uniform error format, security headers
- Handshake and health endpoints
- A test suite built on fake modules

### Out of scope

- Real modules such as storage or auth (a stub auth provider is enough for tests)
- Anything on the client side

### Deliverables

- packages/core-server and apps/server start a server from a config file with fake modules
- One readable startup report listing all problems at once
- Fingerprint utility in packages/shared, reusable by the client
- Automated tests for loader, hooks, routes and handshake

### Definition of done

- [ ] Every startup error case from the specification produces a clear message and exit code 1
- [ ] A route without an access rule is rejected at startup
- [ ] Guards roll back an action; event listeners never break the emitter
- [ ] Test coverage for the loader and the registry is complete

### Depends on

M0 (workspace, server skeleton, CI).

### Reference

Specification: sections 4 to 10

## Issues

#### Read the blueprint: load and validate mcrs.config.json and every module.json

Labels: `feature` (new functionality), `scope` (group: skeleton), `core-server` (server skeleton)

##### Summary

Parse the configuration and all module manifests and validate them against schemas, so that mistakes are reported with the exact location instead of surfacing as strange errors later.

##### Acceptance criteria

- [ ] JSON Schema for the config file and for module.json (id, version, mcrs range, parts, provides, requires, optional, configSchema)
- [ ] Each module's config block is validated against its own configSchema
- [ ] Error messages name the file and the property path
- [ ] Unknown properties produce a warning, not a crash

##### References

- Specification: sections 4 and 5

#### Load modules from anywhere: folder paths and npm packages

Labels: `feature` (new functionality), `scope` (group: skeleton), `core-server` (server skeleton), `tooling` (build, CI and scripts)

##### Summary

Allow a config entry to point at a folder outside modules/ or at an installed npm package, so modules can live in other repos or be shipped through a registry. Local and external modules must behave identically.

##### Acceptance criteria

- [ ] Config entries accept either path or package
- [ ] A package entry is resolved from node_modules and its module.json is read
- [ ] The fingerprint does not depend on where a module comes from
- [ ] The specification gets a section describing both options, including the warning that server modules run with the full rights of the server process

##### References

- Specification: sections 3 and 4 (needs an update)

#### Make the pieces fit: capability map, dependency resolution and load order

Labels: `feature` (new functionality), `scope` (group: skeleton), `core-server` (server skeleton)

##### Summary

Work out which module provides which capability, check that every requirement is met and compute a safe load order. All problems are collected and printed together.

##### Acceptance criteria

- [ ] Single-provider and multi-provider capabilities are supported
- [ ] Missing requirements, duplicate providers and dependency cycles are detected
- [ ] All errors appear in one report and the process exits with code 1
- [ ] Optional dependencies never block startup

##### References

- Specification: section 6

#### Freeze and fingerprint: lock the registry and compute module fingerprints

Labels: `feature` (new functionality), `scope` (group: skeleton), `core-server` (server skeleton), `shared` (shared contracts)

##### Summary

Make the module list immutable after startup and compute the two fingerprints that identify an installation. The algorithm lives in the shared package so that the client can use the same code.

##### Acceptance criteria

- [ ] fingerprint and clientFingerprint follow the algorithm in the specification
- [ ] The result is identical regardless of config order
- [ ] Any attempt to register a module after the freeze throws
- [ ] Unit tests with fixed expected hashes

##### References

- Specification: sections 6 and 9

#### Bring modules to life: register, start and stop lifecycle

Labels: `feature` (new functionality), `scope` (group: skeleton), `core-server` (server skeleton)

##### Summary

Implement the module context and the lifecycle phases, including a clean shutdown, so modules have a predictable environment.

##### Acceptance criteria

- [ ] ModuleContext offers id, config, log, routes, events, hooks and capabilities
- [ ] register runs in dependency order, then migrations, then start
- [ ] stop runs in reverse order on SIGINT and SIGTERM
- [ ] An error in a module aborts startup with the module id in the message

##### References

- Specification: section 6

#### Say it with events, guard with hooks: event bus and hook registry

Labels: `feature` (new functionality), `scope` (group: skeleton), `core-server` (server skeleton)

##### Summary

Provide the two ways modules communicate without knowing each other: events for notifications and hooks for checks and transformations.

##### Acceptance criteria

- [ ] Events are delivered asynchronously after commit; a failing listener is logged and ignored
- [ ] Guards run in priority order inside the transaction and can reject with a code and details
- [ ] Filters run as a chain; an exception keeps the unfiltered value
- [ ] Typed payloads can be declared in packages/shared

##### References

- Specification: section 8

#### No open doors: route registry with mandatory access rules

Labels: `feature` (new functionality), `security` (security), `scope` (group: skeleton), `core-server` (server skeleton)

##### Summary

Every route must declare who may call it. Routes without a rule are rejected at startup, which makes accidentally public endpoints impossible.

##### Acceptance criteria

- [ ] access accepts public, authenticated or a list of roles
- [ ] Routes are mounted under /api/<moduleId>/
- [ ] Uniform error format with code, message and details
- [ ] helmet, a JSON body size limit, request ids and structured logging are active

##### References

- Specification: section 10

#### Say hello: handshake and health endpoints

Labels: `feature` (new functionality), `scope` (group: skeleton), `core-server` (server skeleton)

##### Summary

Add the public endpoint that compares a client's module list with the server's, and a health endpoint for monitoring.

##### Acceptance criteria

- [ ] POST /api/_core/handshake returns compatible, policy, both fingerprints and the diff lists
- [ ] A mismatch writes a WARN log with both fingerprints and the diff
- [ ] GET /api/_core/health reports status and the fingerprints

##### References

- Specification: section 9

#### Trust but verify: core test suite built on fake modules

Labels: `test` (tests), `scope` (group: skeleton), `core-server` (server skeleton)

##### Summary

Prove the engine with small fake modules before any real module exists.

##### Acceptance criteria

- [ ] Tests for missing capability, duplicate provider and cycles
- [ ] Tests for fingerprint stability and handshake diff
- [ ] Test that a route without an access rule stops the startup
- [ ] Test that a failing guard rolls everything back

##### References

- Specification: section 17

---

# Milestone: M2 - A Place to Keep Things: storage contract and SQLite

### Goal

Give every module a safe, swappable way to persist data. This milestone defines the storage contract, a conformance test suite that any storage implementation must pass, and the default SQLite module. The contract is deliberately small (a collection store, not SQL), so that another database can be plugged in later without touching a single feature module.

### In scope

- The storage@1 contract with collections, queries, transactions and the atomic adjust operation
- Soft delete, restore and purge semantics
- Collection definitions with schema versions and migrations
- The storage-sqlite module (WAL mode, one file in the data directory)
- A reusable conformance test suite

### Out of scope

- Any feature module using the storage (starts in M3 and M5)
- Import and export (M9)
- Alternative database modules (can be written by others once the suite exists)

### Deliverables

- Storage contract and types in packages/shared
- runStorageConformance(factory) in packages/shared/conformance
- modules/storage-sqlite passing the full suite
- A short guide for writing another storage module

### Definition of done

- [ ] All conformance tests pass for storage-sqlite
- [ ] Concurrent adjust calls never push a value below its minimum
- [ ] Deleted records are hidden by default and restorable
- [ ] A collection can be migrated from one schema version to the next in a test

### Depends on

M1 (module loader, lifecycle, hooks).

### Reference

Specification: sections 7.1, 12.3 and 14

## Issues

#### Draw the line: define the storage contract in @mcrs/shared

Labels: `feature` (new functionality), `scope` (group: skeleton), `shared` (shared contracts), `module` (group: module), `storage-sqlite` (required module storage-sqlite)

##### Summary

Write the TypeScript interfaces for collections, records, queries and transactions. This is the promise every storage module makes to every other module.

##### Acceptance criteria

- [ ] StorageProvider, CollectionDef, Collection, Query, BaseRecord and Tx are exported
- [ ] BaseRecord contains id, createdAt, updatedAt, deletedAt and rev
- [ ] Doc comments describe the exact behaviour of each operation
- [ ] Collection names must start with the owning module id

##### References

- Specification: section 7.1

#### One test to rule them all: the storage conformance suite

Labels: `test` (tests), `scope` (group: skeleton), `shared` (shared contracts)

##### Summary

Write a test suite that takes a storage factory and verifies every promise of the contract. Anyone who writes a replacement storage module can run it to prove that their module is a valid drop-in.

##### Acceptance criteria

- [ ] runStorageConformance(factory) covers insert, get, list, update, remove, restore, purge
- [ ] Covers transactions with rollback, unique constraints and optimistic concurrency through rev
- [ ] Covers adjust under concurrent calls
- [ ] Documented so that outside authors can use it

##### References

- Specification: section 17

#### First tenant: the SQLite storage module

Labels: `feature` (new functionality), `module` (group: module), `storage-sqlite` (required module storage-sqlite)

##### Summary

Implement storage@1 on top of SQLite. The module is the default database and lives in a single file inside the data directory.

##### Acceptance criteria

- [ ] Decision between better-sqlite3 and node:sqlite is written down with reasons
- [ ] WAL mode is enabled; each collection maps to a table named like the collection
- [ ] IDs are UUIDv7 and may be supplied by the caller
- [ ] Passes the conformance suite

##### References

- Specification: section 12.3

#### Delete without regret: soft delete, restore and purge

Labels: `feature` (new functionality), `module` (group: module), `storage-sqlite` (required module storage-sqlite)

##### Summary

Make deletion safe by default. Normal removal only sets a timestamp, lists hide such records, and permanent deletion has to be requested explicitly.

##### Acceptance criteria

- [ ] remove sets deletedAt and restore clears it
- [ ] Queries exclude deleted records unless includeDeleted is set
- [ ] Unique constraints apply to non-deleted records only (partial indexes)
- [ ] purge removes the record permanently

##### References

- Specification: sections 7.1 and 14

#### Never lose a race: atomic adjust and transactions

Labels: `feature` (new functionality), `module` (group: module), `storage-sqlite` (required module storage-sqlite)

##### Summary

Provide the building block that makes the last Schnitzel safe: a single atomic operation that changes a number but never beyond its limits, plus transactions for multi-step changes.

##### Acceptance criteria

- [ ] adjust returns ok:false instead of crossing min or max
- [ ] transaction rolls back everything when the callback throws
- [ ] A test fires many concurrent adjust calls and the total never goes below the minimum

##### References

- Specification: section 7.1

#### Grow without breaking: schema versions and collection migrations

Labels: `feature` (new functionality), `module` (group: module), `storage-sqlite` (required module storage-sqlite)

##### Summary

Let modules evolve their data model over time. Each collection carries a schema version and a chain of migration functions that the storage runs at startup.

##### Acceptance criteria

- [ ] defineCollection compares the stored schema version with the declared one
- [ ] Missing migration steps abort startup with a clear message
- [ ] A migration runs inside a transaction
- [ ] Test: migrate a collection from version 1 to 3

##### References

- Specification: sections 6 and 7.1

---

# Milestone: M3 - Who Goes There: authentication and the client shell

### Goal

Bring the first real users into the system. The server learns who is calling (login, sessions, CSRF protection, rate limiting) and the Angular client gets its skeleton: shell, slots, generated module list, handshake and login screen. This is the largest milestone, because security and the client foundation have to be right from the start. When it is done, an admin can create the first account, log in on a phone and see an empty but real application shell.

### In scope

- Auth module: first-run setup, user model, password hashing, login, logout, JWT session cookie
- Rate limiting, lockout and CSRF double-submit protection
- Admin API for managing users and roles
- Client library core-client: shell, top bar, router areas, slot system
- Generator that builds the client's module list from mcrs.config.json
- Handshake call and the mismatch screen
- Login screen with role-based redirect and route guards

### Out of scope

- Settings and dialogs (M4)
- Any catalog or ordering screen

### Deliverables

- modules/auth with server and client part
- packages/core-client with shell and slots
- tools/gen-client-modules.mjs
- Login, logout, setup and mismatch screens working on mobile and desktop

### Definition of done

- [ ] The first admin can be created exactly once and only while no user exists
- [ ] Wrong passwords are rate limited and never reveal whether a user exists
- [ ] Every state-changing request without a valid CSRF token is rejected
- [ ] A client built from a different module list shows the mismatch screen with both fingerprints
- [ ] Admin-only routes cannot be reached by a waiter, verified by tests on the server

### Depends on

M1 (core server) and M2 (storage).

### Reference

Specification: sections 9, 11, 12.1 and 16

## Issues

#### Day one: first-run setup creates the first admin

Labels: `feature` (new functionality), `security` (security), `module` (group: module), `auth` (required module auth)

##### Summary

A fresh installation has no users. Provide a one-time setup that creates the first administrator and then closes itself for good.

##### Acceptance criteria

- [ ] GET /api/auth/setup-status tells the client whether setup is needed
- [ ] POST /api/auth/setup works only while zero users exist
- [ ] The client shows a setup screen when needed
- [ ] After the first user exists the endpoint answers with an error

##### References

- Specification: section 12.1

#### Passwords done right: user model and argon2id hashing

Labels: `feature` (new functionality), `security` (security), `module` (group: module), `auth` (required module auth)

##### Summary

Create the user collection and hash passwords with a modern algorithm. The choice between a native argon2 package and bcrypt is made and documented here.

##### Acceptance criteria

- [ ] Collection auth_users with username, displayName, passwordHash, roles, active, tokenVersion, mustChangePassword
- [ ] Usernames are unique and case-insensitive
- [ ] Minimum password length is configurable (default 8)
- [ ] Hashing library decision is documented, including installation notes for Windows and Raspberry Pi

##### References

- Specification: section 12.1

#### Open sesame: login, logout and the JWT session cookie

Labels: `feature` (new functionality), `security` (security), `module` (group: module), `auth` (required module auth)

##### Summary

Implement the session. A signed token in an HttpOnly cookie identifies the user, can expire, and can be revoked.

##### Acceptance criteria

- [ ] JWT (HS256) with sub, roles, tv and exp in the cookie mcrs_session
- [ ] 256-bit signing key is generated on first start and stored in the data directory
- [ ] Lifetime 12 hours with sliding refresh; raising tokenVersion logs a user out everywhere
- [ ] Cookie flags HttpOnly and SameSite=Lax; Secure follows the secureCookie setting (auto, true, false)

##### References

- Specification: section 12.1

#### Slow down, intruder: rate limiting and lockout on login

Labels: `security` (security), `module` (group: module), `auth` (required module auth)

##### Summary

Make guessing passwords impractical without locking out honest waiters for long.

##### Acceptance criteria

- [ ] Limits per IP and per username, configurable, with a temporary lockout
- [ ] Identical error message for unknown user and wrong password
- [ ] Unknown users still go through a dummy hash check so timing does not leak
- [ ] Tests cover the limit and the lockout expiry

##### References

- Specification: section 12.1

#### Trust no request: CSRF double-submit protection

Labels: `security` (security), `scope` (group: skeleton), `core-client` (client skeleton), `module` (group: module), `auth` (required module auth)

##### Summary

Because the session lives in a cookie, the browser attaches it automatically. A token that has to be echoed in a header prevents other websites from acting on a waiter's behalf.

##### Acceptance criteria

- [ ] Server sets the readable cookie mcrs_csrf
- [ ] Every POST, PUT, PATCH and DELETE needs the matching X-CSRF-Token header; the Origin header is checked too
- [ ] The Angular client sends the token automatically (withXsrfConfiguration)
- [ ] Tests: missing and wrong tokens are rejected

##### References

- Specification: sections 12.1 and 16

#### Manage the crew: admin API for users and roles

Labels: `feature` (new functionality), `security` (security), `module` (group: module), `auth` (required module auth)

##### Summary

Let admins create waiters and other admins, change roles, deactivate accounts and reset passwords.

##### Acceptance criteria

- [ ] CRUD under /api/auth/users, restricted to the admin role
- [ ] Deactivating a user or resetting a password bumps tokenVersion
- [ ] Destructive actions require the admin to re-enter their password
- [ ] The last active admin cannot be deleted or deactivated

##### References

- Specification: sections 12.1 and 16

#### Build the frame: Angular shell with top bar, router outlet and slots

Labels: `feature` (new functionality), `ui` (user interface), `scope` (group: skeleton), `core-client` (client skeleton)

##### Summary

Create the core-client library: the page frame, the three router areas (public, admin, waiter) and the slot system that lets modules contribute components without knowing each other.

##### Acceptance criteria

- [ ] packages/core-client is a workspace; the client has its dependency entry and tsconfig path mapping
- [ ] Slots are injection tokens with multi providers; shell.topbar.left and shell.topbar.right exist
- [ ] ClientModule registration interface (routes, slots, providers, styles) is implemented
- [ ] Mobile-first layout with design tokens and a minimum tap target of 44 px

##### References

- Specification: section 11

#### Write the guest list: generate the client module list from the config

Labels: `feature` (new functionality), `scope` (group: skeleton), `tooling` (build, CI and scripts)

##### Summary

Make mcrs.config.json the single source of truth for the client as well. A generator creates the file that imports only the installed modules, so removed modules are not even in the bundle.

##### Acceptance criteria

- [ ] tools/gen-client-modules.mjs reads the config and writes modules.generated.ts
- [ ] Runs automatically before start and build
- [ ] Works for modules from modules/ (path alias) and for npm packages
- [ ] Unknown or server-only modules are handled gracefully

##### References

- Specification: sections 4 and 11.1

#### Knock, knock: handshake call and the mismatch screen

Labels: `feature` (new functionality), `ui` (user interface), `scope` (group: skeleton), `core-client` (client skeleton)

##### Summary

Before the login screen, the client asks the server whether both sides have the same modules. If not, a screen that works without any module explains what differs.

##### Acceptance criteria

- [ ] Handshake runs on startup using the generated module list
- [ ] Mismatch screen shows both client fingerprints and the lists missing on client, missing on server and version mismatches
- [ ] Policy block stops the app; policy warn lets the user dismiss the screen
- [ ] The screen does not depend on dialogs or any other module

##### References

- Specification: section 9

#### One door for everyone: login screen, role redirect and route guards

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `auth` (required module auth)

##### Summary

A single login screen serves waiters and admins. After login the app sends each user to the right area, and guards keep people out of areas they may not use.

##### Acceptance criteria

- [ ] Login at /login; admin goes to /admin, waiter to /waiter/tables, users with both roles get a choice
- [ ] Functional route guards per area (the server remains the real authority)
- [ ] Logout clears the session and returns to /login
- [ ] Works comfortably on a phone

##### References

- Specification: sections 11.3 and 12.1

---

# Milestone: M4 - The Control Panel: settings and dialogs

### Goal

Add the two modules that almost everything else relies on for its user interface: the settings area behind the cog in the top-right corner and a dialog service for popups. Settings are also where the modular nature of MCRS becomes visible, because the module overview and its fingerprints live there.

### In scope

- Settings module with the cog, the settings page and expandable sections
- Section registry so that other modules can add their own settings
- Device-scoped settings (stored in the browser) and global settings (stored on the server)
- Read-only module overview with fingerprints
- Dialogs module providing the DialogService contract

### Out of scope

- Theme and language pickers (they are added in M8 through the section registry)
- Switching modules on or off from the UI (modules are only changed while the system is stopped)

### Deliverables

- modules/settings and modules/dialogs
- Section registry contract in packages/shared
- Admin-only module overview

### Definition of done

- [ ] A module can add a settings section without changing the settings module
- [ ] A waiter sees only their device sections, an admin also sees global sections
- [ ] The module overview shows id, version, parts, provides, requires and both fingerprints with a copy button
- [ ] Dialogs work with touch, keyboard and screen readers

### Depends on

M3 (auth, shell and slots).

### Reference

Specification: sections 11.6, 12.2 and 13

## Issues

#### Turn the cog: settings module with expandable sections

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `settings` (required module settings)

##### Summary

Add the settings cog to the top bar and a settings page whose sections can be expanded and collapsed. Other modules plug in through a registry.

##### Acceptance criteria

- [ ] Cog appears in shell.topbar.right
- [ ] Section registry contract with id, titleKey, scope, roles and component
- [ ] Sections are accordions and only shown to permitted roles
- [ ] Page is usable on a phone

##### References

- Specification: section 12.2

#### Two homes for settings: device storage versus global server storage

Labels: `feature` (new functionality), `module` (group: module), `settings` (required module settings)

##### Summary

Some settings belong to a single phone (theme, language), others to the whole installation (printers, stock rules). Store each kind in the right place.

##### Acceptance criteria

- [ ] Device settings are kept in the browser under mcrs.settings.<moduleId>
- [ ] Global settings use GET/PUT /api/settings/:moduleId, admin only, stored through storage
- [ ] Global values are validated against the module's configSchema

##### References

- Specification: section 12.2

#### Look under the hood: read-only module overview with fingerprints

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `settings` (required module settings)

##### Summary

Show administrators exactly what is installed. This is also the quickest way to compare two installations.

##### Acceptance criteria

- [ ] Table with id, version, parts, provides and requires for every module
- [ ] fingerprint and clientFingerprint with a copy button
- [ ] Admin only and strictly read-only

##### References

- Specification: sections 9 and 12.2

#### Pop it up: dialogs module with a DialogService contract

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `dialogs` (module dialogs)

##### Summary

Provide one consistent way to show popups. Feature modules depend on the dialog@1 capability, so anyone can ship their own dialog module.

##### Acceptance criteria

- [ ] dialog@1 contract in packages/shared (open, confirm, close)
- [ ] Implementation based on Angular CDK Dialog or the native dialog element
- [ ] Focus handling, Escape key and backdrop click
- [ ] Full-width sheet style on small screens

##### References

- Specification: section 11.6

---

# Milestone: M5 - Building the Menu: catalog and tables

### Goal

Let the administrator describe what is for sale and where. The catalog module manages categories, sub-categories and items with prices, and the tables module manages the table labels. Everything uses the nested list with a '+' tile at the bottom that was described in the original requirements. Deactivated entries stay visible but greyed out, and every entry can be edited, soft-deleted and, later, reordered.

### In scope

- Catalog data model and API (categories, sub-categories, items)
- Admin screens: three nested levels, each ending in a '+' tile that opens a dialog
- Item form with name, price and an extension slot for other modules
- Deactivation with the '(No longer available)' presentation
- Edit and delete (soft delete) on every row
- Tables module with free-form labels
- Sort order field and the list.row.controls slot

### Out of scope

- Waiter screens (M6)
- Quantity limits (stock module in M7)
- The reorder module itself (M8)

### Deliverables

- modules/catalog and modules/tables
- catalog@1 and tables@1 contracts
- Admin menu entries for both

### Definition of done

- [ ] An admin can build a full menu with two category levels and items on a phone
- [ ] Prices are stored as integer cents and shown with two decimals
- [ ] Deactivated entries are greyed out and labelled
- [ ] Deleted entries disappear from lists but remain in the database
- [ ] Table labels such as B1, B2 or 1, 2, 3 are accepted

### Depends on

M3 (auth, shell) and M4 (settings, dialogs).

### Reference

Specification: sections 7.3, 13.1 and 13.2

## Issues

#### Teach the system what is for sale: catalog data model and API

Labels: `feature` (new functionality), `module` (group: module), `catalog` (module catalog)

##### Summary

Create the collections and endpoints for categories, sub-categories and items, plus the catalog@1 contract that other modules use.

##### Acceptance criteria

- [ ] Category tree via parentId, limited to two levels in the UI
- [ ] Item with name, priceCents, active and sortOrder
- [ ] Contract methods getOrderable, listOrderables and reorder
- [ ] All write endpoints are admin only

##### References

- Specification: sections 7.3 and 13.1

#### The tree of choices: admin screens with the '+' tile

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `catalog` (module catalog)

##### Summary

Build the nested admin lists. Each level ends in a '+' tile that opens a dialog for creating a new entry, and tapping an entry opens the next level.

##### Acceptance criteria

- [ ] Level 1 categories, level 2 sub-categories, level 3 items
- [ ] The '+' tile is always the last element of a list
- [ ] Navigation through URLs such as /admin/catalog/:categoryId
- [ ] Usable one-handed on a phone

##### References

- Specification: sections 11.3 and 13.1

#### Name it, price it: the item form

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `catalog` (module catalog)

##### Summary

Create the form for items: name and price are required. Other modules can add their own fields through a slot.

##### Acceptance criteria

- [ ] Name and price are mandatory; price accepts two decimals and is stored as integer cents
- [ ] Slot catalog.item.form.field renders contributions from other modules
- [ ] Validation messages use translation keys
- [ ] Editing an item reuses the same form

##### References

- Specification: section 13.1

#### Switch it off, don't delete it: deactivation and the unavailable look

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `catalog` (module catalog)

##### Summary

Admins can deactivate categories and items. They stay in the list but are greyed out and marked as no longer available, for admins and waiters alike.

##### Acceptance criteria

- [ ] Toggle on every entry
- [ ] Greyed-out styling plus the translated text (No longer available)
- [ ] Unavailable items cannot be added by a waiter
- [ ] Availability is exposed through the Orderable contract

##### References

- Specification: section 13.1

#### Edit and delete everywhere: row actions with soft delete

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `catalog` (module catalog)

##### Summary

Every created entry gets Edit and Delete buttons. Delete is a soft delete that asks for confirmation.

##### Acceptance criteria

- [ ] Edit opens the form, Delete uses the dialog service for confirmation
- [ ] Deleted entries are hidden but not removed from storage
- [ ] Concurrent edits are detected through rev and reported
- [ ] Deleting a category warns about its contents

##### References

- Specification: sections 13.1 and 14

#### Name the tables: tables module with free-form labels

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `tables` (module tables)

##### Summary

Let the admin define which tables exist. Labels are free text, for example B1, B2, B3 or 1, 2, 3.

##### Acceptance criteria

- [ ] Collection tables_tables with label, active and sortOrder
- [ ] Admin list with '+' tile, edit and soft delete
- [ ] Labels are unique among non-deleted tables
- [ ] tables@1 contract for the waiter's table selection

##### References

- Specification: section 13.2

#### Prepare the order: sortOrder and the row controls slot

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `catalog` (module catalog), `tables` (module tables)

##### Summary

Store a sort order on every list and show it to waiters in exactly that sequence. The up, down and drag controls arrive later through the list.row.controls slot, so this milestone only needs the foundation.

##### Acceptance criteria

- [ ] sortOrder is persisted and used for admin and waiter lists
- [ ] Slot list.row.controls is rendered on every admin row
- [ ] Without any contributing module the order is simply stable (sortOrder, then creation time)

##### References

- Specification: sections 11.2 and 13.1

---

# Milestone: M6 - From Tap to Table: ordering

### Goal

The heart of the product: a waiter picks a table, walks through the menu, taps items and sends the order. This milestone delivers the whole waiter flow including the bill that is always one tap away, notes per line, safe sending with retries, and paying. Orders must be correct under pressure: two waiters ordering the last portion at the same moment, a phone that loses wifi in the middle of sending, a tap that arrives twice.

### In scope

- Table selection for waiters
- Navigation through categories and sub-categories with the state in the URL
- The draft bill on the client, the bill bar and the plus/minus controls
- Notes on order lines
- Transactional sending with guards and events
- Idempotent order IDs
- Paying and closing a bill
- Tests for concurrency and idempotency

### Out of scope

- Stock handling (M7), it plugs into the guards defined here
- Printing and displays (M9)
- Cancelling sent lines (M9)
- Split or partial payments

### Deliverables

- modules/orders with server and client part
- orders@1 contract
- Complete waiter flow on mobile
- Events orders.order.sent and orders.bill.paid and guards orders.order.sending and orders.bill.paying

### Definition of done

- [ ] A waiter can take an order from table selection to payment using only one hand
- [ ] Back from the bill returns to the sub-category the waiter came from
- [ ] Sending the same order twice creates it only once
- [ ] A guard rejection leaves no partial data behind
- [ ] Each table has exactly one open bill at a time

### Depends on

M5 (catalog and tables).

### Reference

Specification: sections 11.3 and 13.3

## Issues

#### Pick your table: the waiter's table selection screen

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `orders` (module orders), `tables` (module tables)

##### Summary

After login a waiter chooses the table they are serving. Tables with an open bill are easy to spot.

##### Acceptance criteria

- [ ] Route /waiter/tables lists the active tables in their sort order
- [ ] Tables with an open bill are highlighted
- [ ] Tapping a table opens its category list
- [ ] Large tap targets and a layout that works on small screens

##### References

- Specification: sections 11.3 and 13.2

#### Walk the menu: category and sub-category navigation with URL state

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `catalog` (module catalog), `orders` (module orders)

##### Summary

Let the waiter move through the categories to the items. The position is part of the URL, so back, refresh and deep links behave naturally.

##### Acceptance criteria

- [ ] Routes /waiter/t/:tableId/c/:categoryId/s/:subId
- [ ] Items appear in the admin's order; unavailable ones are greyed out and not tappable
- [ ] Browser back moves one level up and never loses the draft

##### References

- Specification: section 11.3

#### One tap, one item: the draft bill on the client

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `orders` (module orders)

##### Summary

Tapping an item adds one piece to the draft. The draft survives a page refresh and never touches the server until the order is sent.

##### Acceptance criteria

- [ ] A signal-based bill service holds the lines per table
- [ ] The draft is mirrored to local storage and restored on load
- [ ] Adding the same item again increases its quantity
- [ ] Tapping gives quick visual feedback

##### References

- Specification: section 13.3

#### The bill is always one tap away: bill bar with plus and minus

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `orders` (module orders)

##### Summary

A bar at the bottom of the screen shows the current total and opens the bill. In the bill, plus and minus change the draft lines, and a line at zero disappears.

##### Acceptance criteria

- [ ] Bill bar is fixed at the bottom and respects safe-area insets
- [ ] Bill view shows draft lines and, separately, already sent lines
- [ ] Plus and minus change draft lines only; reaching 0 removes the line
- [ ] Back from the bill returns to the previous sub-category

##### References

- Specification: sections 11.3 and 13.3

#### Add a note: free-text notes on order lines

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `orders` (module orders)

##### Summary

A note such as 'no onions' travels with the line to the kitchen and later to the reports.

##### Acceptance criteria

- [ ] Each draft line has an optional note, edited through a dialog
- [ ] The note is stored with the sent line
- [ ] Lines with different notes are kept apart

##### References

- Specification: section 13.3

#### Send it: transactional order sending with guards and events

Labels: `feature` (new functionality), `module` (group: module), `orders` (module orders)

##### Summary

Implement the server side of sending. Everything happens in one transaction, other modules may veto it through guards, and listeners are told only after the commit.

##### Acceptance criteria

- [ ] POST /api/orders/bills/:tableId/orders opens the bill if necessary and stores order and lines with snapshots of name and price
- [ ] Guards orders.order.sending run inside the transaction; a rejection rolls everything back and returns its code
- [ ] Event orders.order.sent is emitted after the commit
- [ ] Waiter and admin roles may send; everything else is denied

##### References

- Specification: section 13.3

#### Never twice: idempotent order IDs and safe retries

Labels: `feature` (new functionality), `module` (group: module), `orders` (module orders)

##### Summary

The phone creates the order ID. If the connection drops and the order is sent again, the server recognises it instead of creating a duplicate.

##### Acceptance criteria

- [ ] Client generates a UUIDv7 per order
- [ ] Same ID with identical content returns the existing order; different content returns 409
- [ ] The client keeps the draft until the server has confirmed the order
- [ ] Tested with a simulated lost response

##### References

- Specification: section 13.3

#### Settle up: pay and close a bill

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `orders` (module orders)

##### Summary

Closing a bill marks it as paid and makes it read-only. The table is free for the next guests.

##### Acceptance criteria

- [ ] POST /api/orders/bills/:id/pay with guard orders.bill.paying and event orders.bill.paid
- [ ] A paid bill cannot be changed
- [ ] Paying button in bill.footer.actions with a confirmation
- [ ] A new order for the same table opens a fresh bill

##### References

- Specification: section 13.3

#### Hammer it: concurrency and idempotency tests for orders

Labels: `test` (tests), `module` (group: module), `orders` (module orders)

##### Summary

Prove under load that orders stay consistent.

##### Acceptance criteria

- [ ] Many parallel sends of the same order ID produce one order
- [ ] A rolled-back order leaves no lines behind
- [ ] Two waiters send to the same table at the same time without losing lines

##### References

- Specification: section 17

---

# Milestone: M7 - Always Up To Date: stock and live updates

### Goal

Make the menu reflect reality. The stock module limits how many portions can be sold and marks items as sold out, and the live layer pushes changes to every phone within moments, so no waiter has to refresh to learn that the Schnitzel is gone. Stock and live updates are independent: either can be removed without breaking the other or the ordering flow.

### In scope

- Stock module with unlimited quantity as the default
- Guard on order sending that reserves quantities atomically
- Availability filter for the catalog (sold out means unavailable)
- Extra field in the item form through the existing slot
- Server-Sent Events hub in the core and a client live service
- Live updates for catalog, tables and stock

### Out of scope

- Restocking after cancellations (M9)
- Low-stock alerts and reports

### Deliverables

- modules/stock
- live@1 service in the core and LiveService in core-client
- Items that sell out disappear from the available state on every phone

### Definition of done

- [ ] Selling the last portion succeeds exactly once, even with two waiters at the same time
- [ ] A sold-out item is greyed out and marked on every connected phone within a few seconds
- [ ] A phone that lost its connection catches up after reconnecting
- [ ] Removing the stock module leaves a working system with unlimited items

### Depends on

M6 (orders) and M5 (catalog).

### Reference

Specification: sections 10, 13.3 and 13.4

## Issues

#### Count what is left: stock module with unlimited as the default

Labels: `feature` (new functionality), `module` (group: module), `stock` (module stock)

##### Summary

Store an optional remaining quantity per item. An item without a quantity is unlimited.

##### Acceptance criteria

- [ ] Collection stock_levels with itemId and quantity (null means unlimited)
- [ ] Admin endpoints to read and set quantities
- [ ] Blank input in the form means unlimited
- [ ] stock@1 contract exposes the current level

##### References

- Specification: section 13.4

#### Reserve at the last second: stock guard on order sending

Labels: `feature` (new functionality), `module` (group: module), `stock` (module stock)

##### Summary

When an order is sent, the stock module takes the quantities inside the same transaction. If anything is missing, the whole order is refused.

##### Acceptance criteria

- [ ] Guard on orders.order.sending uses the atomic adjust with min 0
- [ ] A rejection returns stock.soldOut with the item and the remaining amount
- [ ] All-or-nothing: partial reservations are rolled back
- [ ] Event stock.changed is emitted after the commit

##### References

- Specification: section 13.4

#### Sold out means sold out: availability filter for the catalog

Labels: `feature` (new functionality), `module` (group: module), `stock` (module stock), `catalog` (module catalog)

##### Summary

Mark items with quantity zero as unavailable, using the filter hook of the catalog.

##### Acceptance criteria

- [ ] Filter on catalog.items.list sets available:false and reason sold-out
- [ ] The waiter UI shows such items greyed out with (No longer available)
- [ ] Admins keep seeing the real quantity

##### References

- Specification: sections 8 and 13.4

#### Add the missing field: quantity input in the item form

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `stock` (module stock)

##### Summary

Contribute the optional quantity field to the item form through the slot, so the catalog stays unaware of stock.

##### Acceptance criteria

- [ ] Field appears through catalog.item.form.field only when the stock module is installed
- [ ] Blank means unlimited; values must be whole numbers of zero or more
- [ ] Saving updates the catalog item and the stock level together

##### References

- Specification: sections 11.2 and 13.4

#### The live wire: Server-Sent Events hub in the core

Labels: `feature` (new functionality), `scope` (group: skeleton), `core-server` (server skeleton)

##### Summary

Add the push channel to the skeleton so modules can publish changes with one call.

##### Acceptance criteria

- [ ] GET /api/_core/events requires a valid session
- [ ] live.publish(topic, payload, { roles }) delivers only to permitted roles
- [ ] Heartbeat every 25 seconds and a ring buffer for Last-Event-ID resume

##### References

- Specification: section 10

#### Listen on the phone: client live service with reconnect and resume

Labels: `feature` (new functionality), `scope` (group: skeleton), `core-client` (client skeleton)

##### Summary

Give the Angular app a service that keeps one SSE connection open, reconnects on its own and exposes topics as signals or observables.

##### Acceptance criteria

- [ ] LiveService.on(topic) for components and services
- [ ] Automatic reconnect with backoff and resume from the last event id
- [ ] The connection closes on logout

##### References

- Specification: section 10

#### Spread the word: live updates for catalog, tables and stock

Labels: `feature` (new functionality), `module` (group: module), `catalog` (module catalog), `tables` (module tables), `stock` (module stock)

##### Summary

Publish changes from the modules and update the open screens without a refresh.

##### Acceptance criteria

- [ ] Topics catalog.changed, tables.changed and stock.changed
- [ ] Open waiter screens update availability instantly
- [ ] Without the live capability everything still works, with refresh on navigation

##### References

- Specification: sections 10 and 13

---

# Milestone: M8 - Make It Yours: comfort modules

### Goal

Add the modules that make the application pleasant: a visible back button, light and dark themes, translations and reordering of lists. Each one is optional and removable, which doubles as a proof of the architecture: after this milestone the system must work equally well with any combination of them present or absent.

### In scope

- Back button module
- Design tokens and per-module styling rules
- Theme module with light, dark and system modes
- i18n module based on Transloco with English as the default
- A first extra language
- Reorder module with up/down buttons and desktop drag and drop

### Out of scope

- Additional languages beyond the first one
- Custom themes beyond light and dark

### Deliverables

- modules/back-button, theme, i18n and reorder
- Settings sections for theme and language
- Translation files per module under i18n/

### Definition of done

- [ ] Removing any of these modules still gives a working app
- [ ] Theme and language are remembered per device
- [ ] The order set by an admin is the order a waiter sees
- [ ] Every user-visible text goes through a translation key

### Depends on

M4 (settings), M5 (catalog and lists) and M3 (shell).

### Reference

Specification: sections 11.2 to 11.5, 13

## Issues

#### Take me back: the back button module

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `back-button` (module back-button)

##### Summary

Add the visible back button in the top-left corner of the shell.

##### Acceptance criteria

- [ ] Contributes to shell.topbar.left
- [ ] Uses browser history, with a parent-route fallback from route data
- [ ] Without the module the browser back button still works

##### References

- Specification: sections 11.2 and 11.3

#### One palette to rule them all: design tokens and per-module styling

Labels: `feature` (new functionality), `ui` (user interface), `scope` (group: skeleton), `core-client` (client skeleton)

##### Summary

Fix the set of CSS custom properties modules style themselves with, and show how a module overrides them in its own scope.

##### Acceptance criteria

- [ ] Tokens for colours, spacing, radius, font size and tap target are defined
- [ ] Light and dark palettes follow prefers-color-scheme by default
- [ ] Modules scope their overrides with data-mcrs-module
- [ ] A short styling guide for module authors

##### References

- Specification: section 11.4

#### Light, dark or system: the theme module

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `theme` (module theme)

##### Summary

Let users choose their appearance in the settings.

##### Acceptance criteria

- [ ] Settings section with light, dark and system
- [ ] Choice is stored per device and applied through data-theme
- [ ] No flash of the wrong theme on load

##### References

- Specification: section 11.4

#### Speak your language: i18n module with Transloco

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `i18n` (module i18n)

##### Summary

Replace the core's English-only translator with Transloco and add a language picker.

##### Acceptance criteria

- [ ] Implements the core TranslateService contract
- [ ] Loads i18n/<lang>.json from every installed module
- [ ] Language picker in the settings, stored per device
- [ ] English is the default and the fallback for missing keys

##### References

- Specification: section 11.5

#### Add a second language: German translations for all modules

Labels: `feature` (new functionality), `docs` (documentation), `module` (group: module), `i18n` (module i18n)

##### Summary

Provide the first additional language and document how to add more.

##### Acceptance criteria

- [ ] de.json for every module that has an en.json
- [ ] A check that finds keys missing in a language
- [ ] Guide: how to add a language by dropping in a file

##### References

- Specification: section 11.5

#### Move it up, move it down: reorder module with buttons

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `reorder` (module reorder)

##### Summary

Contribute up and down controls to every sortable list.

##### Acceptance criteria

- [ ] Contributes to list.row.controls
- [ ] Calls the reorder method of the owning module
- [ ] The new order is visible to waiters straight away

##### References

- Specification: sections 11.2 and 13.1

#### Drag it: desktop drag and drop for the reorder module

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `reorder` (module reorder)

##### Summary

On desktop screens lists can also be reordered by dragging.

##### Acceptance criteria

- [ ] Angular CDK drag and drop on pointer devices
- [ ] Buttons stay available for touch and keyboard users
- [ ] Order is saved in one request

##### References

- Specification: section 13.1

---

# Milestone: M9 - Power Tools: import/export, output, reports and cancellations

### Goal

Add the modules that turn the ordering flow into a full event solution: moving data between installations, sending tickets and receipts to printers and displays, analysing the day and correcting mistakes with a traceable audit log. All of them are optional and none of them may be required by another module. They only listen to events and use contracts.

### In scope

- Import/export container with per-module sections and checksums
- Dry-run import with a compatibility report
- Output module with routing rules and a first display and printer driver
- Reports module with daily summaries and export
- Cancellations module with audit log
- Restocking after cancellations

### Out of scope

- Cryptographic signing (HMAC) of exports, reserved for later
- Accounting or fiscal integrations

### Deliverables

- modules/import-export, output, reports, cancellations
- output.target@1 multi-provider contract and two reference drivers
- Admin menu entries for reports and import/export

### Definition of done

- [ ] An export from one installation can be imported into another with a clear compatibility report
- [ ] Order tickets arrive at the configured target for each category
- [ ] Reports match the paid bills to the cent
- [ ] Every cancellation is recorded with who, what, why and when
- [ ] Removing any of these modules leaves a working system

### Depends on

M6 (orders), M7 (stock) and M4 (settings).

### Reference

Specification: sections 13.5 to 13.7 and 15

## Issues

#### Pack it up: import/export container with module sections and checksums

Labels: `feature` (new functionality), `module` (group: module), `import-export` (module import-export)

##### Summary

Export all exportable modules into one JSON file with a manifest that records versions and checksums.

##### Acceptance criteria

- [ ] Container format as in the specification, including fingerprint and per-module schema version
- [ ] Modules implement exportData, importData and migrate
- [ ] Checksum is SHA-256 over canonical JSON
- [ ] Admin only

##### References

- Specification: section 15

#### Look before you leap: import dry run and compatibility report

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `import-export` (module import-export)

##### Summary

Before anything is changed, show what would happen to each module section.

##### Acceptance criteria

- [ ] Report states compatible, needs migration, module not installed, module missing in file or checksum failed
- [ ] Import runs in one transaction in replace or merge mode after confirmation
- [ ] Sections of modules that are not installed are reported and never imported

##### References

- Specification: section 15

#### Deliver the goods: output module with routing rules

Labels: `feature` (new functionality), `module` (group: module), `output` (module output)

##### Summary

Turn sent orders and paid bills into output jobs and route them to targets according to rules.

##### Acceptance criteria

- [ ] Listens to orders.order.sent and orders.bill.paid
- [ ] Targets are registered through the output.target@1 multi-provider capability
- [ ] Routing rules such as category Drinks goes to the bar printer are stored as global settings

##### References

- Specification: section 13.5

#### Show the kitchen: a display target for orders

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `output` (module output)

##### Summary

Provide a kitchen display page that shows incoming order tickets live.

##### Acceptance criteria

- [ ] Page for the display role, updated through live events
- [ ] Tickets show table, items, quantities and notes
- [ ] Large, readable layout for a wall-mounted screen

##### References

- Specification: section 13.5

#### Print it: a receipt and ticket printer target

Labels: `feature` (new functionality), `module` (group: module), `output` (module output)

##### Summary

Add a reference driver for ESC/POS network printers.

##### Acceptance criteria

- [ ] Prints order tickets and receipts
- [ ] Printer address and paper width are configurable in the settings
- [ ] Failures are logged and shown to the admin, without blocking orders

##### References

- Specification: section 13.5

#### Count the day: reports module with summaries and export

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `reports` (module reports)

##### Summary

Give admins a clear view of what was sold.

##### Acceptance criteria

- [ ] Revenue per item, category, waiter, table and day, using only the orders@1 contract
- [ ] JSON and CSV export
- [ ] Admin menu entry; removing the module affects nothing else

##### References

- Specification: section 13.6

#### Fix mistakes with a paper trail: cancellations module

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `cancellations` (module cancellations)

##### Summary

Allow cancelling sent lines with a reason and keep an audit log.

##### Acceptance criteria

- [ ] Action in bill.line.actions with a reason dialog
- [ ] Guard orders.order.cancelling allows additional rules; event orders.order.cancelled is emitted
- [ ] Log collection with line, quantity, reason, user and time
- [ ] Without the module, sent lines stay read-only

##### References

- Specification: section 13.7

#### Put it back on the shelf: stock restocks after cancellations

Labels: `feature` (new functionality), `module` (group: module), `stock` (module stock), `cancellations` (module cancellations)

##### Summary

Let the stock module react to cancelled lines.

##### Acceptance criteria

- [ ] Listener on orders.order.cancelled
- [ ] Config restockOnCancel, default true
- [ ] stock.changed is emitted afterwards

##### References

- Specification: sections 13.4 and 13.7

---

# Milestone: M10 - Ready for the Real World: PWA, HTTPS and release

### Goal

Prepare MCRS for its first real event. This milestone adds the optional offline capability, documents how to run the system on a local network with or without HTTPS, proves that every optional module can be removed, and produces the packaging and handbooks that let other people install it and write their own modules.

### In scope

- PWA module with service worker, installability and an offline queue
- Kill switch that removes stale service workers when the module is absent
- HTTPS options for local networks, documented and tested
- Removal tests for every optional module
- Packaging, start scripts and a deployment guide
- Module author's handbook

### Out of scope

- New features, the focus is hardening and documentation
- Cloud hosting and multi-server deployments (the server is a single process)

### Deliverables

- modules/pwa
- docs/https.md, docs/deployment.md and docs/module-authors.md
- Automated removal tests in CI
- A tagged release

### Definition of done

- [ ] The app installs on a phone over HTTPS and queues orders while offline
- [ ] Removing the PWA module and reloading gives a normal app without a stale cache
- [ ] The system boots and passes smoke tests with each optional module removed individually
- [ ] A stranger can set up a working installation using only the documentation

### Depends on

M0 to M9.

### Reference

Specification: sections 13.8, 17 and 19

## Issues

#### Install it like an app: the PWA module

Labels: `feature` (new functionality), `ui` (user interface), `module` (group: module), `pwa` (module pwa)

##### Summary

Make the client installable and cache its files for fast, offline-tolerant loading.

##### Acceptance criteria

- [ ] Web manifest, icons and an Angular service worker configuration
- [ ] Settings section reports the status (not available on plain HTTP)
- [ ] No effect at all when the module is not installed

##### References

- Specification: section 13.8

#### Survive the dead zone: offline queue for idempotent requests

Labels: `feature` (new functionality), `module` (group: module), `pwa` (module pwa)

##### Summary

Keep orders that could not be sent and retry them when the connection returns.

##### Acceptance criteria

- [ ] Queue persists in IndexedDB
- [ ] Retries use the original order ID, so duplicates are impossible
- [ ] Visible indicator for pending orders
- [ ] Conflicts such as a sold-out item are reported back to the waiter

##### References

- Specification: sections 13.3 and 13.8

#### Pull the plug cleanly: kill switch for stale service workers

Labels: `feature` (new functionality), `security` (security), `scope` (group: skeleton), `core-client` (client skeleton)

##### Summary

When the PWA module is removed, phones that still hold its service worker must return to a normal state.

##### Acceptance criteria

- [ ] The handshake tells the client whether the pwa module is installed
- [ ] If not, existing service workers are unregistered and caches cleared
- [ ] Tested with a build that had the module and one that does not

##### References

- Specification: section 13.8

#### Secure the local network: HTTPS options guide

Labels: `docs` (documentation), `security` (security)

##### Summary

Explain, with working examples, how to serve MCRS over HTTPS on a local network: no HTTPS, mkcert or Caddy with a local CA, and a real domain with a certificate.

##### Acceptance criteria

- [ ] docs/https.md compares the options and recommends one
- [ ] Step-by-step setup for at least two options, tested on a phone
- [ ] Documents the Secure cookie setting for each case

##### References

- Specification: sections 12.1 and 13.8

#### Take everything apart: removal tests for every optional module

Labels: `test` (tests), `scope` (group: skeleton), `tooling` (build, CI and scripts)

##### Summary

Prove the core promise of the architecture, that each optional module can be removed without breaking anything else.

##### Acceptance criteria

- [ ] A script boots the system once per removed optional module
- [ ] Smoke tests: login, open the catalog, send an order where applicable
- [ ] Required modules produce the expected clear startup error when removed
- [ ] Runs in CI

##### References

- Specification: section 17

#### Ship it: packaging, start scripts and deployment guide

Labels: `chore` (maintenance and setup), `docs` (documentation), `scope` (group: skeleton), `tooling` (build, CI and scripts)

##### Summary

Make installation on a laptop or Raspberry Pi straightforward.

##### Acceptance criteria

- [ ] npm run build and npm start produce and run the production setup
- [ ] docs/deployment.md covers finding the IP address, the firewall, wifi client isolation, backups and updates
- [ ] A tagged release with release notes

##### References

- Specification: sections 3 and 4

#### Teach others to build: the module author's handbook

Labels: `docs` (documentation)

##### Summary

Document everything a stranger needs to write, test and publish a module.

##### Acceptance criteria

- [ ] Walkthrough: create a small module from scratch (manifest, server part, client part, translations, styles)
- [ ] Explains contracts, events, hooks, slots and the conformance suites
- [ ] Explains the folder, npm package and registry options for sharing modules, plus the trust warning for server modules

##### References

- Specification: sections 5 to 11
