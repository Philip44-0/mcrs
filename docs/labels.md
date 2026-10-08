# Label guide

Labels make the issue list searchable. Every issue gets **at least one main type label** (`feature`, `chore`, `test` or `docs`). Issues that belong to a part of the skeleton or to a module also get a **group label** (`scope` or `module`) **plus the specific label** (for example `core-server` or `auth`). `security` and `ui` are optional extras.

## Type labels (what kind of work is it?)

| Label      | Meaning                                                                  | Use it when                                                                   |
| ---------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `feature`  | New functionality that users or module authors can see or use            | Something new that can be used or seen                                        |
| `chore`    | Setup, tooling, dependencies and maintenance without new features        | Work that keeps the project running but adds nothing visible                  |
| `test`     | Automated tests, conformance suites and test infrastructure              | The main result of the issue is tests                                         |
| `docs`     | Documentation: README, guides, specification and code comments           | The main result of the issue is text for humans                               |
| `security` | Authentication, authorization, hardening and anything that protects data | Added in addition to the type label whenever the issue touches security       |
| `ui`       | User interface, layout, mobile usability and accessibility               | Added in addition to the type label whenever the issue changes what users see |

Mixed work may carry two main labels, such as `feature` and `docs`.

## Group labels

| Label    | Meaning                                                                                 | Use it when                                            |
| -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `scope`  | Group: part of the skeleton; add one of core-server, core-client, shared or tooling     | The issue changes a part of the skeleton, not a module |
| `module` | Group: work on a module under modules/; add the module's own label (auth, catalog, ...) | The issue changes or creates a module under `modules/` |

A group label is always combined with at least one specific label from the tables below.

## Scope labels (which part of the skeleton?)

Use together with `scope`.

| Label         | Meaning                                                               | Use it when                                                       |
| ------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `core-server` | The server skeleton: loader, registry, events, hooks, routes, SSE     | Changes to packages/core-server or apps/server                    |
| `core-client` | The Angular skeleton: shell, slots, routing, handshake, design tokens | Changes to packages/core-client or the Angular shell              |
| `shared`      | Contracts, types and utilities shared by client and server            | Changes to packages/shared (contracts, types, conformance suites) |
| `tooling`     | Build scripts, generators, CI and developer experience                | Changes to scripts, generators, CI or repo structure              |

## Module labels (which module?)

Use together with `module`. One label per module under `modules/`. Green labels mark the **required** modules that cannot be removed.

| Label            | Meaning                                                                 | Use it when                                           |
| ---------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| `storage-sqlite` | Required (storage): default SQLite storage, implements storage@1        | The issue changes or creates `modules/storage-sqlite` |
| `auth`           | Required: login, sessions, users, roles, CSRF protection, rate limiting | The issue changes or creates `modules/auth`           |
| `settings`       | Required: settings cog, expandable sections, module overview            | The issue changes or creates `modules/settings`       |
| `dialogs`        | Dialog service and popups (dialog@1)                                    | The issue changes or creates `modules/dialogs`        |
| `catalog`        | Categories, sub-categories and items with prices and availability       | The issue changes or creates `modules/catalog`        |
| `tables`         | Table labels that the admin defines and waiters pick                    | The issue changes or creates `modules/tables`         |
| `orders`         | Waiter flow: draft bill, sending orders, notes and paying               | The issue changes or creates `modules/orders`         |
| `stock`          | Remaining quantities, sold-out handling, reservation on send            | The issue changes or creates `modules/stock`          |
| `back-button`    | Visible back button in the top bar                                      | The issue changes or creates `modules/back-button`    |
| `theme`          | Light, dark and system appearance                                       | The issue changes or creates `modules/theme`          |
| `i18n`           | Translations and language picker (Transloco, English default)           | The issue changes or creates `modules/i18n`           |
| `reorder`        | Moving list entries: up/down buttons and desktop drag and drop          | The issue changes or creates `modules/reorder`        |
| `import-export`  | JSON export and import with checksums and compatibility report          | The issue changes or creates `modules/import-export`  |
| `output`         | Tickets and receipts to printers and displays (output.target)           | The issue changes or creates `modules/output`         |
| `reports`        | Sales summaries and their export                                        | The issue changes or creates `modules/reports`        |
| `cancellations`  | Cancelling sent lines with reasons and an audit log                     | The issue changes or creates `modules/cancellations`  |
| `pwa`            | Installable app, service worker and offline order queue                 | The issue changes or creates `modules/pwa`            |

## Examples

- Password hashing: `feature`, `security`, `module`, `auth`
- Mismatch screen in Angular: `feature`, `ui`, `scope`, `core-client`
- Storage conformance suite: `test`, `scope`, `shared`
- HTTPS guide: `docs`, `security`
- CI workflow: `chore`, `scope`, `tooling`

## Finding issues

Because group and specific labels are separate, the GitHub search can combine them:

- All module issues: `is:issue label:module`
- Everything about the auth module: `is:issue label:module label:auth`
- Open work on the server skeleton: `is:issue is:open label:scope label:core-server`
- Security work anywhere: `is:issue label:security`

## New modules

A new module gets its own label named after its id (for example `printer`) and is combined with `module`. Add the label to `github-plan.json` or create it directly on GitHub.
