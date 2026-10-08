# MCRS – Modular Cash Register System

This build will contain the **default** configuration.
You can **use** it, **rewrite** the code or **add** other modules **within the license**.

## Development

Run both sides in two terminals from the repository root:

    npm run dev:server    # Express on http://localhost:3000
    npm run dev:client    # Angular on http://localhost:4200, /api is proxied to Express

Open http://localhost:4200. A request to /api/_core/health returns the server status.


# Specification

**Status:** Draft 0.1 · **Repository:** https://github.com/Philip44-0/mcrs · **License:** GPL-2.0

A modular cash register / order system for clubs, voluntary fire brigades and similar events.
Angular client, Express server, everything except a small skeleton is a replaceable module.

---

## 1. Goals and principles

1. **The skeleton is the only constant.** Everything else (catalog, stock, tables, orders, reports, language, theme, back button, dialogs, printing, …) is a module.
2. **Every module can be removed or rewritten** by someone else, as long as the contracts it provides or requires are respected.
3. **Modules never touch each other's data.** They talk through *contracts* (direct calls), *events* (notifications) and *hooks* (guards and filters).
4. **Each module owns its data model.** There is no global schema.
5. **No hot swapping.** The module list is read at startup and locked. Changing modules means stopping the system, editing the config, restarting (and rebuilding the client).
6. **Mobile first**, but fully usable on desktop.
7. **Secure by default:** every route needs an explicit access rule; unknown means denied.
8. **English is the default language;** all user-visible text goes through a translation key.

### Non-goals (v1)

- Split payments, partial payments, discounts, taxes.
- Fiscal certification. MCRS is **not** a certified fiscal cash register. Check your local regulations before using it for commercial sales.
- Runtime plugin loading on the client (modules are compiled in).

---

## 2. Terminology

| Term | Meaning |
|---|---|
| **Skeleton / core** | Module loader, registry, contracts, event bus, API router, SSE hub, client shell. Not a module. |
| **Module** | A folder with a `module.json` manifest and a server part, a client part, or both. |
| **Capability** | A named, versioned service a module provides, e.g. `storage@1`, `catalog@1`. |
| **Contract** | The TypeScript interface behind a capability, defined in `packages/shared`. |
| **Event** | Fire-and-forget notification: "something happened" (past tense). |
| **Hook** | A synchronous extension point. *Guard*: may reject an action. *Filter*: may transform a value. |
| **Slot** | A named place in the Angular UI where modules contribute components. |
| **Fingerprint** | SHA-256 over the sorted list of installed `id@version` entries. |
| **Required module** | Cannot be removed: `auth`, `settings`, one `storage` provider. |

---

## 3. Repository layout

npm workspaces monorepo.

```
mcrs/
├─ mcrs.config.json              # the single source of truth for installed modules
├─ package.json                  # workspaces
├─ apps/
│  ├─ server/                    # entry point: starts core-server with the config
│  └─ client/                    # Angular app (the current scaffold moves here)
├─ packages/
│  ├─ shared/                    # contracts, event/hook payload types, fingerprint util, conformance tests
│  ├─ core-server/               # loader, registry, router, event bus, hooks, SSE, handshake
│  └─ core-client/               # Angular library: shell, slots, tokens, translate abstraction
├─ modules/
│  ├─ storage-sqlite/
│  ├─ auth/
│  ├─ settings/
│  ├─ catalog/
│  ├─ tables/
│  ├─ orders/
│  ├─ stock/
│  └─ …                          # see section 13
├─ tools/
│  └─ gen-client-modules.mjs     # generates the client's module list from mcrs.config.json
└─ docs/
```

Layout of a single module:

```
modules/stock/
├─ module.json                   # manifest (section 5)
├─ server/index.ts               # optional server part
├─ client/index.ts               # optional Angular part (standalone components)
├─ i18n/en.json                  # English strings (other languages optional)
├─ styles/                       # module CSS using design tokens
└─ tests/
```

---

## 4. Configuration: `mcrs.config.json`

```json
{
  "port": 3000,
  "dataDir": "./data",
  "currency": "EUR",
  "mismatchPolicy": "block",
  "modules": [
    { "id": "storage-sqlite", "path": "modules/storage-sqlite", "config": { "file": "mcrs.db" } },
    { "id": "auth",          "path": "modules/auth", "config": { "secureCookie": "auto" } },
    { "id": "settings",      "path": "modules/settings" },
    { "id": "dialogs",       "path": "modules/dialogs" },
    { "id": "catalog",       "path": "modules/catalog" },
    { "id": "tables",        "path": "modules/tables" },
    { "id": "orders",        "path": "modules/orders" },
    { "id": "stock",         "path": "modules/stock" }
  ]
}
```

- The order in the list does not matter; the loader sorts by dependencies.
- The same file drives both the server and the generated client module list, so both sides always agree on what is installed.
- `config` is validated against the module's `configSchema` (section 5).
- `mismatchPolicy`: `"block"` (default, the client shows the mismatch screen and stops) or `"warn"` (the client shows it dismissably and continues).

---

## 5. Module manifest: `module.json`

```json
{
  "id": "stock",
  "name": "Stock",
  "version": "1.0.0",
  "mcrs": "^1.0.0",
  "parts": ["server", "client"],
  "provides": ["stock@1"],
  "requires": ["storage@1", "catalog@1", "orders@1"],
  "optional": ["live@1"],
  "schemaVersion": 1,
  "exportable": true,
  "configSchema": {
    "type": "object",
    "properties": { "restockOnCancel": { "type": "boolean", "default": true } }
  }
}
```

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique, lowercase, `[a-z0-9-]`. Used as route namespace and data prefix. |
| `name`, `version` | yes | Display name, semver. |
| `mcrs` | yes | Semver range of the skeleton API this module supports. |
| `parts` | yes | Any of `"server"`, `"client"`. A module without `server` is registered manifest-only on the server (so fingerprints still match). |
| `provides` | no | Capabilities as `name@major`. By default a capability has exactly one provider. Object form `{ "name": "output.target@1", "multi": true }` allows several. |
| `requires` | no | Capabilities that must be provided by some installed module. |
| `optional` | no | Capabilities used if present. |
| `schemaVersion` | no | Version of the module's own data format (used for migrations and import/export). |
| `exportable` | no | Module takes part in JSON import/export. |
| `configSchema` | no | JSON Schema for the module's `config` block. |

Rules:

- Dependencies are on **capabilities**, never on module ids. Any module providing `storage@1` satisfies a `storage@1` requirement.
- Contract major versions only change on breaking changes.
- A module may only register routes under `/api/<id>/…` and only create collections prefixed `<id>_`.

---

## 6. Loader and lifecycle

Startup sequence (server):

1. Read and validate `mcrs.config.json`.
2. Load every `module.json`; check unique ids, semver, `mcrs` range, `configSchema`.
3. Build the capability map. Check that all `requires` are satisfied and that no single-provider capability has two providers.
4. Detect dependency cycles; sort topologically.
5. Compute fingerprints (section 9).
6. **Freeze the registry.** From here on the module list cannot change.
7. For each module in order: `register(ctx)` (declare routes, hooks, event listeners, collections, client settings).
8. Run collection migrations through the storage provider.
9. For each module in order: `start(ctx)`.
10. Open the port; serve the API and the built client.

Shutdown: `stop(ctx)` in reverse order, then close the port.

All problems found in steps 1 to 4 are reported **together** in one readable message, then the process exits with code 1:

```
MCRS cannot start:
  ✖ module "stock" requires "catalog@1" but no installed module provides it
  ✖ module "orders" requires "dialog@1" but no installed module provides it
  ✖ capability "storage@1" is provided twice: storage-sqlite, storage-postgres
```

Server module shape:

```ts
export interface ServerModule {
  register(ctx: ModuleContext): void | Promise<void>;
  start?(ctx: ModuleContext): void | Promise<void>;
  stop?(ctx: ModuleContext): void | Promise<void>;
}

export interface ModuleContext {
  id: string;
  config: unknown;                          // validated config block
  log: Logger;
  routes: RouteRegistry;                    // routes.add({ method, path, access, handler })
  events: EventBus;
  hooks: HookRegistry;
  capabilities: {
    provide<T>(name: string, impl: T): void;
    get<T>(name: string): T;                // required capability, throws at startup if missing
    tryGet<T>(name: string): T | undefined; // optional capability
  };
}
```

---

## 7. Capabilities and contracts

Contracts live in `packages/shared/contracts`. A module provides a contract by calling `ctx.capabilities.provide(name, impl)`.

| Capability | Provided by (default) | Purpose |
|---|---|---|
| `storage@1` | `storage-sqlite` | Persistence for all modules (required, exactly one) |
| `auth@1` | `auth` | Current user, role checks (required) |
| `settings@1` | `settings` | Registry for settings sections (required) |
| `catalog@1` | `catalog` | Categories, items, orderable lookup |
| `tables@1` | `tables` | Which tables exist |
| `orders@1` | `orders` | Bills, orders, payment |
| `stock@1` | `stock` | Remaining quantities |
| `live@1` | core | Server-Sent Events publishing |
| `dialog@1` | `dialogs` | Dialog service on the client |
| `output.target@1` (multi) | output drivers | Printers, displays, … |

### 7.1 Storage contract

The storage contract is deliberately small so that other databases can implement it. It is a collection store, not SQL, so a module cannot depend on joins.

```ts
export interface StorageProvider {
  defineCollection(def: CollectionDef): Promise<void>;
  collection<T extends BaseRecord>(name: string): Collection<T>;
  transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
}

export interface CollectionDef {
  name: string;                                   // must start with "<moduleId>_"
  schemaVersion: number;
  fields: Record<string, FieldType>;              // string | number | boolean | json | datetime
  unique?: string[][];                            // uniqueness among non-deleted records
  indexes?: string[][];
  migrations?: Record<number, (tx: Tx) => Promise<void>>;
}

export interface BaseRecord {
  id: string;            // UUIDv7, may be generated by the client
  createdAt: string;     // ISO 8601 UTC
  updatedAt: string;
  deletedAt: string | null;   // soft delete
  rev: number;           // optimistic concurrency
}

export interface Collection<T extends BaseRecord> {
  get(id: string, tx?: Tx): Promise<T | null>;
  list(query?: Query, tx?: Tx): Promise<T[]>;
  insert(doc: Omit<T, keyof BaseRecord> & { id?: string }, tx?: Tx): Promise<T>;
  update(id: string, patch: Partial<T>, opts?: { ifRev?: number }, tx?: Tx): Promise<T>;
  /** Atomic numeric change. Fails (ok:false) instead of going below min / above max. */
  adjust(id: string, field: string, delta: number,
         opts?: { min?: number; max?: number }, tx?: Tx): Promise<{ ok: boolean; value: number }>;
  remove(id: string, tx?: Tx): Promise<void>;     // soft delete
  restore(id: string, tx?: Tx): Promise<void>;
  purge(id: string, tx?: Tx): Promise<void>;      // hard delete, explicit only
}

export interface Query {
  where?: Record<string, string | number | boolean | null | { in: unknown[] }>;
  orderBy?: Array<[field: string, dir: 'asc' | 'desc']>;
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;                       // default false
}
```

`adjust` exists so that "take 2 from stock, but never below 0" is one atomic operation and not a read-modify-write race between two waiters.

### 7.2 Auth contract

```ts
export interface AuthProvider {
  user(req: Request): AuthUser | null;
  hasRole(req: Request, ...roles: string[]): boolean;
}
export interface AuthUser { id: string; username: string; displayName: string; roles: string[]; }
```

Roles are an open set of strings. `admin` and `waiter` are defined by the default auth module; other modules may add their own (for example `display`).

### 7.3 Catalog and orders contracts (excerpt)

```ts
export interface Orderable {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
  unavailableReason?: 'inactive' | 'sold-out' | string;
  path: string[];                                // e.g. ["Drinks", "Soft drinks"]
}

export interface CatalogProvider {
  getOrderable(itemId: string, tx?: Tx): Promise<Orderable | null>;
  listOrderables(subCategoryId: string, req: Request): Promise<Orderable[]>; // passes through the filter hook
  reorder(parentId: string | null, orderedIds: string[]): Promise<void>;
}

export interface OrdersProvider {
  listPaidBills(range: { from: string; to: string }): Promise<PaidBillSummary[]>;
  getLine(lineId: string, tx?: Tx): Promise<OrderLine | null>;
}
```

Orders store a **snapshot** of item name and price on every line, taken through `getOrderable`. Replacing the catalog module therefore never corrupts order history.

---

## 8. Events and hooks

```ts
ctx.events.on('orders.order.sent', async (e) => { /* react */ });
ctx.events.emit('stock.changed', { itemId, quantity });

ctx.hooks.guard('orders.order.sending', async (payload, tx) => {
  // throw new Reject('stock.soldOut', { itemId }) to abort the whole action
}, { priority: 100 });

ctx.hooks.filter('catalog.items.list', (items, req) => items.map(markSoldOut));
```

### Naming

`<moduleId>.<noun>.<verb>`. Events use the past tense (`orders.order.sent`), guards the present participle (`orders.order.sending`), filters describe the data (`catalog.items.list`). Third-party modules may define their own hooks and events under their own id. Payload types are declared in `packages/shared/contracts/events.ts`.

### Semantics

| Kind | Delivery | Failure behaviour |
|---|---|---|
| **Event** | In-process, asynchronous, **after** the transaction commits | A failing listener is logged and never affects the emitter or other listeners |
| **Guard** | Awaited in priority order **inside** the transaction; receives `tx` | Any rejection aborts the action and rolls everything back; the client gets the rejection code |
| **Filter** | Synchronous chain in priority order | An exception is logged; the unfiltered value is passed on |

### Catalogue v1

| Name | Kind | Emitted/run by | Typical listeners |
|---|---|---|---|
| `auth.login.succeeded` / `auth.login.failed` | event | auth | audit, live |
| `catalog.item.created` / `updated` / `removed` | event | catalog | live |
| `catalog.items.list` | filter | catalog | stock (marks sold out) |
| `tables.table.changed` | event | tables | live |
| `orders.order.sending` | guard | orders | stock (reserve quantity) |
| `orders.order.sent` | event | orders | output, reports, live |
| `orders.order.cancelling` | guard | cancellations | approval rules |
| `orders.order.cancelled` | event | cancellations | stock (restock), reports, live |
| `orders.bill.paying` | guard | orders | – |
| `orders.bill.paid` | event | orders | output (receipt), reports |
| `stock.changed` | event | stock | live |

---

## 9. Fingerprints, handshake and mismatch screen

### Fingerprint

```
lines   = sorted( "<id>@<version>" for each module )      // by id
fp      = sha256( "mcrs-fp1\n" + lines.join("\n") )       // hex
display = first 12 hex characters
```

Two values are computed from the same config:

- `fingerprint`: all modules.
- `clientFingerprint`: only modules whose `parts` include `"client"`.

Both are shown in the settings module's module overview, and in every export file.

### Handshake

Before the login screen, the client calls the public endpoint:

```
POST /api/_core/handshake
{ "clientApi": "1", "modules": [ { "id": "catalog", "version": "1.0.0" }, … ] }
```

```json
{
  "compatible": false,
  "policy": "block",
  "server": { "clientFingerprint": "9f2c41aa07be", "fingerprint": "c01d8e5a3b92" },
  "client": { "clientFingerprint": "51ab99e0c4d7" },
  "diff": {
    "missingOnClient": ["stock@1.0.0"],
    "missingOnServer": [],
    "versionMismatch": [{ "id": "orders", "server": "1.1.0", "client": "1.0.0" }]
  }
}
```

On a mismatch:

- **Server** writes a WARN log: both fingerprints and the diff.
- **Client** shows the **mismatch screen** from the core (it must not depend on any module, so it uses no dialog service): both fingerprints, the three lists, and a hint (reload and clear the cache, or rebuild the client from the current config). With `"block"` the app stops there; with `"warn"` the screen can be dismissed.

---

## 10. Server skeleton

The skeleton does the heavy lifting so that modules only declare things:

- Create the Express app, open the port, graceful shutdown.
- `helmet`, JSON body size limit, cookie parsing, request ids, structured logging.
- Uniform error format: `{ "error": { "code": "stock.soldOut", "message": "…", "details": {…} } }`.
- Serve the built Angular client with SPA fallback.
- Handshake endpoint and health endpoint (`/api/_core/health`).
- Route registry with **mandatory access rules**:

```ts
ctx.routes.add({
  method: 'POST',
  path: '/items',                                  // becomes /api/catalog/items
  access: { roles: ['admin'] },                    // 'public' | 'authenticated' | { roles: [...] }
  handler: async (req, res) => { … }
});
```

A route without `access` is rejected at startup. Admin-only access is enforced here, on the server, regardless of what the Angular guards do.

### Realtime (SSE)

- `GET /api/_core/events`, authenticated through the session cookie.
- Modules publish with `live.publish(topic, payload, { roles? })`.
- Heartbeat comment every 25 s, `Last-Event-ID` resume from a small ring buffer, client auto-reconnect.
- Typical topics: `catalog.changed`, `stock.changed`, `tables.changed`, `orders.sent`.

---

## 11. Client skeleton (Angular)

Standalone components, Signals, lazy-loaded routes, mobile first.

### 11.1 Module registration

```ts
export interface ClientModule {
  id: string;
  routes?: Array<{ area: 'public' | 'admin' | 'waiter'; path: string;
                   loadComponent: () => Promise<unknown>; data?: Record<string, unknown> }>;
  slots?: SlotContribution[];
  providers?: Provider[];
  styles?: string[];
}
```

`tools/gen-client-modules.mjs` reads `mcrs.config.json` and generates `modules.generated.ts`, which imports only the installed modules' client parts. Removed modules are not in the bundle at all.

### 11.2 Shell and slots

The shell provides a top bar, a router outlet, the mismatch screen and the slot outlets. Slots are Angular injection tokens with multi providers.

| Slot | Typical contributors |
|---|---|
| `shell.topbar.left` | `back-button` |
| `shell.topbar.right` | `settings` (cog) |
| `settings.section` | `theme`, `i18n`, `settings` (module overview), `output`, `pwa` |
| `area.menu.admin` / `area.menu.waiter` | `catalog`, `tables`, `reports`, … |
| `list.row.controls` | `reorder` (up/down buttons, drag handle on desktop) |
| `catalog.item.form.field` | `stock` (quantity field) |
| `bill.line.actions` | `cancellations` |
| `bill.footer.actions` | `orders` (send, pay), `output` (reprint) |

### 11.3 Routes and back navigation

State is part of the URL, so the browser's own back button always works and a refresh keeps your place.

```
/login
/admin/<module>/…                       e.g. /admin/catalog, /admin/catalog/:categoryId, /admin/tables
/waiter/tables
/waiter/t/:tableId/c/:categoryId/s/:subId
/waiter/t/:tableId/bill
```

Bill → back returns to the previous history entry, which is the sub-category the waiter came from. The `back-button` module only adds the visible button (`Location.back()`, with a `data.parent` fallback when there is no history).

### 11.4 Theming

The core defines design tokens as CSS custom properties, with light and dark palettes selected through `prefers-color-scheme`:

```
--mcrs-color-bg  --mcrs-color-surface  --mcrs-color-text  --mcrs-color-muted
--mcrs-color-accent  --mcrs-color-danger  --mcrs-radius  --mcrs-space-1…4
--mcrs-font-size-base  --mcrs-tap-target (min 44px)
```

- The `theme` module adds a manual light/dark/system choice (`data-theme` attribute, stored per device).
- A module can override tokens inside its own scope by wrapping its root element with `data-mcrs-module="<id>"` and its own CSS.
- Minimum tap target 44 px, bill bar fixed at the bottom of the screen, safe-area insets respected.

### 11.5 Translation abstraction

The core exposes `TranslateService.t(key, params?)`. Every module ships `i18n/en.json` with keys prefixed `<moduleId>.`. Without the `i18n` module, English is used. The `i18n` module (Transloco) replaces the implementation, loads further languages (`i18n/de.json`, …), and adds a language picker to `settings.section`. Default language: English.

### 11.6 Dialogs

Modules that need popups declare `requires: ["dialog@1"]` and use `DialogService`. The core contains no dialog implementation. The `dialogs` module provides one; someone else may provide their own.

---

## 12. Required modules

### 12.1 `auth`

- **Single login screen** at `/login` for waiters and admins. After login: `admin` goes to `/admin`, `waiter` to `/waiter/tables`, a user with both roles gets a choice.
- **Users** (collection `auth_users`): `username` (unique, case-insensitive), `displayName`, `passwordHash`, `roles[]`, `active`, `tokenVersion`, `mustChangePassword`.
- **First run:** while no user exists, `POST /api/auth/setup` creates the first admin. It stops working as soon as one user exists.
- **Endpoints:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`, admin-only user management under `/api/auth/users`.
- **Passwords:** hashed with argon2id (see open decision 6), minimum length configurable (`minPasswordLength`, default 8).
- **Session:** JWT (HS256) in the cookie `mcrs_session`.
  - Claims: `sub`, `roles`, `tv` (tokenVersion), `iat`, `exp`.
  - Lifetime default 12 h with sliding refresh. Increasing a user's `tokenVersion` logs them out everywhere.
  - Signing key: 256-bit, generated on first start, stored in `dataDir/secrets/`.
  - Cookie flags: `HttpOnly`, `SameSite=Lax`, `Secure` according to config `secureCookie`: `"auto"` (secure when the request is HTTPS), `true`, or `false`. Plain HTTP on a local network needs `false` or `auto`.
- **CSRF:** double-submit token. The server sets a readable cookie `mcrs_csrf`; every `POST/PUT/PATCH/DELETE` must send the same value in the header `X-CSRF-Token` (Angular's `withXsrfConfiguration` does this automatically). Origin is also checked.
- **Rate limiting** on `/api/auth/login`: per IP and per username, default 5 failed attempts per user and 20 per IP in 15 minutes, then a lockout. The error message never reveals whether the username exists; unknown users still go through a dummy hash verification so timing does not leak it.
- **Admin hardening:** default-deny routing (section 10), role check on the server for every admin route, destructive actions (purge, user deletion) require re-entering the password.

### 12.2 `settings`

- Provides the cog in `shell.topbar.right` and the settings page.
- Contract: other modules register **sections**:

```ts
{ id, titleKey, scope: 'device' | 'global', roles: string[], component }
```

- `device` settings (theme, language) are stored on the phone/browser, so every waiter has their own.
- `global` settings (printer setup, stock rules, module config) are stored on the server through `storage`, admin only, validated against the module's `configSchema`.
- Built-in admin section **Modules**: read-only list of installed modules (id, version, parts, provides, requires), `fingerprint` and `clientFingerprint` with a copy button. Modules cannot be switched here (section 1, principle 5).
- Sections are expandable (accordion).

### 12.3 `storage-sqlite`

- Implements `storage@1` with SQLite (`better-sqlite3` or Node's built-in `node:sqlite`).
- One file in `dataDir`, WAL mode, foreign keys not used across modules.
- Table names equal collection names. Soft delete through `deletedAt`, `unique` constraints applied as partial indexes (`WHERE deletedAt IS NULL`).
- Must pass the **storage conformance suite** (section 17).

---

## 13. Optional modules

| Module | Parts | Provides | Requires (optional) | Notes |
|---|---|---|---|---|
| `catalog` | both | `catalog@1` | `storage`, `auth`, `dialog` (`live`) | Admin lists, waiter navigation |
| `tables` | both | `tables@1` | `storage`, `auth`, `dialog` (`live`) | Admin defines table labels |
| `orders` | both | `orders@1` | `storage`, `auth`, `catalog`, `tables` (`live`) | Bills, sending, paying |
| `stock` | both | `stock@1` | `storage`, `catalog`, `orders` (`live`) | Quantities and sold-out |
| `reorder` | client (+ server endpoint) | – | `catalog` | Up/down buttons, desktop drag and drop |
| `dialogs` | client | `dialog@1` | – | Dialog implementation |
| `back-button` | client | – | – | Visible back button |
| `theme` | client | – | `settings` | Light/dark/system |
| `i18n` | client | – | `settings` | Transloco, language picker |
| `output` | both | – | `orders`, `settings` (`output.target`) | Routes jobs to printers/displays |
| `reports` | both | – | `orders`, `catalog`, `settings` | Daily summaries |
| `cancellations` | both | – | `orders`, `auth` | Audit log, cancelling sent lines |
| `import-export` | both | – | `storage`, `settings` | JSON container (section 15) |
| `pwa` | client | – | – | Service worker, offline queue |

### 13.1 `catalog`

- **Admin screens** (nested): level 1 categories, level 2 sub-categories, level 3 items. Each list ends with a **"+" tile**; tapping it opens a dialog.
- **Item form:** name (required), price (required, two decimals, stored as integer cents). Other modules add fields through the slot `catalog.item.form.field` (for example stock's optional remaining quantity).
- **Every entry** has Edit and Delete (soft delete), a drag/up/down area through `list.row.controls`, and items and categories can be **deactivated**.
- **Deactivated or unavailable** entries are greyed out and show `(No longer available)` (key `catalog.item.unavailable`).
- The order set by the admin is the order shown to waiters (`sortOrder`).
- **Waiter screens:** tap a category, then a sub-category, then tap an item once to add one to the draft.

### 13.2 `tables`

- Collection `tables_tables`: `label` (free text such as `B1` or `7`, unique among non-deleted), `active`, `sortOrder`.
- Admin list with "+" tile. The waiter picks a table at `/waiter/tables`.

### 13.3 `orders`

Model:

- **Bill** (`orders_bills`): one open bill per table. `status`: `open` or `paid`.
- **Order** (`orders_orders`): one "round" sent to the kitchen/bar, belongs to a bill. Its `id` is created **by the client**.
- **Line** (`orders_lines`): `itemId`, snapshot `name` and `priceCents`, `qty`, optional `note`.

Flow:

1. The waiter picks a table. The **draft** (lines not yet sent) lives on the client and survives a page refresh.
2. Tapping an item adds one to the draft. The bill bar at the bottom of the screen is always reachable.
3. In the bill view, `+` and `-` change draft lines. At 0 the line is removed. Each line can have a note.
4. **Send:** `POST /api/orders/bills/:tableId/orders` with `{ id, lines }`.
   - Runs in one transaction: guards `orders.order.sending` (stock reserves quantities), insert, commit, then event `orders.order.sent`.
   - If any guard rejects, nothing is saved and the client gets the reason (for example `stock.soldOut` with the item id).
5. **Idempotent:** if the same order `id` arrives again with identical content the server returns the existing order; with different content it returns `409`. A dropped connection can be retried safely.
6. **Pay:** `POST /api/orders/bills/:id/pay` closes the bill (guard `orders.bill.paying`, event `orders.bill.paid`). A paid bill is read-only.
7. Sent lines are read-only. Without the `cancellations` module they cannot be changed afterwards.

### 13.4 `stock`

- Collection `stock_levels`: `itemId`, `quantity` (`null` = unlimited, which is also the default when the field is left blank).
- Guard on `orders.order.sending`: for every limited line `adjust(itemId, 'quantity', -qty, { min: 0 })` inside the transaction. Any failure rejects the whole order.
- Filter on `catalog.items.list`: `quantity === 0` becomes `available: false, unavailableReason: 'sold-out'`.
- Listens to `orders.order.cancelled` and restocks (config `restockOnCancel`, default `true`).
- Emits `stock.changed`; `live` pushes it so other phones update at once.

### 13.5 `output`

- Listens to `orders.order.sent` and `orders.bill.paid`, creates jobs (`order-ticket`, `receipt`).
- Targets implement the multi-provider capability `output.target@1`:

```ts
export interface OutputTarget {
  id: string;
  kind: 'printer' | 'display' | string;
  accepts: Array<'order-ticket' | 'receipt'>;
  send(job: OutputJob): Promise<void>;
}
```

- Routing rules (global setting): for example "category Drinks → bar printer", "everything → kitchen display".
- Drivers (ESC/POS printer, kitchen display page with its own `display` role) are separate modules.

### 13.6 `reports`

Uses only the `orders@1` contract (`listPaidBills`). Revenue per item, category, waiter, table and day; JSON and CSV export. Admin menu entry. Removing it affects nothing else.

### 13.7 `cancellations`

Adds a cancel action to sent lines through `bill.line.actions`, with a reason. Runs guard `orders.order.cancelling`, writes an audit record (`cancellations_log`: line, qty, reason, user, time), emits `orders.order.cancelled`. Removing it makes sent lines read-only.

### 13.8 `pwa`

- Client-only. Service worker for app files, plus an **offline queue** that retries idempotent `POST`s (order sending) when the connection returns.
- Requires HTTPS or `localhost`; on plain HTTP it reports "not available" in its settings section.
- **Kill switch:** when the handshake shows that no `pwa` module is installed, the core unregisters any service worker left on the phone by an earlier build. So removing the module really does give a plain, cache-free app on the next load.

### 13.9 `import-export`: see section 15.

---

## 14. Data conventions

- **IDs:** UUIDv7 strings, may be generated by clients.
- **Time:** ISO 8601 in UTC.
- **Money:** integer cents; currency code from `mcrs.config.json`.
- **Names:** collections and tables are prefixed `<moduleId>_`; routes live under `/api/<moduleId>/`.
- **Ownership:** a module only reads and writes its own collections. Other data is reached through contracts.
- **Deleting:** `remove` is a soft delete; lists hide deleted records; `purge` is explicit, admin only, and asks for the password again.
- **Uniqueness** (such as table labels) applies to non-deleted records only.

---

## 15. Import and export (JSON)

Container format:

```json
{
  "format": "mcrs-export",
  "version": 1,
  "created": "2026-10-06T12:00:00Z",
  "fingerprint": "c01d8e5a3b92",
  "modules": {
    "catalog": { "version": "1.0.0", "schema": 2, "checksum": "sha256:…", "data": { } },
    "stock":   { "version": "1.0.0", "schema": 1, "checksum": "sha256:…", "data": { } }
  }
}
```

- Each module with `exportable: true` implements `exportData()`, `importData(data, schema, mode)` and `migrate(data, fromSchema)`.
- `checksum` is SHA-256 over the canonical JSON (sorted keys) of `data`. It detects accidental damage, not deliberate edits. An HMAC signature can be added later as an optional feature.
- **Import runs in two steps:**
  1. **Dry run** produces a compatibility report per module: *compatible*, *needs migration*, *module not installed (skipped)*, *module missing in file (left unchanged)*, *checksum failed*.
  2. The admin confirms; the import then runs in one transaction. Mode: `replace` or `merge`.
- Sections for modules that are not installed are never imported, only reported.
- Admin only; the import module asks for the password again.

---

## 16. Security summary

| Topic | Decision |
|---|---|
| Passwords | argon2id, configurable minimum length |
| Session | JWT in `HttpOnly` cookie, 12 h sliding, revocable through `tokenVersion` |
| CSRF | Double-submit token header plus Origin check |
| Brute force | Rate limit per IP and per user, generic error messages |
| Authorization | Mandatory `access` on every route, enforced on the server |
| Transport | `Secure` cookie flag configurable for plain-HTTP local networks |
| Headers | `helmet`, CSP, body size limit |
| Data | Soft delete by default, purge needs password |
| Modules | Namespaced routes and collections, locked registry while running |

---

## 17. Testing

- **Vitest** for client and server (already configured by the Angular CLI scaffold).
- **Contract conformance suites** in `packages/shared/conformance`, for example `runStorageConformance(factory)`. Anyone writing a replacement for `storage@1` (or any other contract) runs the suite against their module. A module that passes is a valid drop-in.
- **Core tests:** loader errors (missing capability, duplicate provider, cycles), fingerprint stability, handshake diff, mandatory route access, guard rollback.
- **API tests** with `supertest`: login, rate limit, CSRF rejection, idempotent order sending, concurrent sends of the last item (exactly one succeeds).
- **Client tests:** slot rendering with and without contributing modules, URL-based back navigation from the bill to the sub-category.
- **Removal tests:** the system starts and works with each optional module removed individually.

---

## 18. Roadmap

| Milestone | Content |
|---|---|
| M0 | Restructure the repo into the workspace layout; Express skeleton with proxy for `ng serve` |
| M1 | `core-server`: config, loader, registry, fingerprints, router with access rules, events/hooks, error format |
| M2 | `storage@1` contract, conformance suite, `storage-sqlite` |
| M3 | `auth` with CSRF and rate limiting; `core-client` shell, slots, module generator, handshake and mismatch screen |
| M4 | `settings` (cog, module overview), `dialogs` |
| M5 | `catalog` and `tables` (admin side) |
| M6 | `orders` (waiter flow, sending, paying, idempotency) |
| M7 | `stock`, SSE/`live`, sold-out display |
| M8 | `back-button`, `theme`, `i18n`, `reorder` |
| M9 | `import-export`, `output`, `reports`, `cancellations` |
| M10 | `pwa` and the HTTPS options |

---

## 19. Open decisions

1. **Dialogs:** this draft makes `dialog@1` a hard requirement of the modules that use popups, with no fallback in the core. The alternative is a small native `<dialog>` fallback in the core.
2. **Mismatch policy default:** `block` (safer) or `warn`.
3. **Draft location:** the draft bill lives on the client. If two waiters regularly share one table at the same time, a server-side draft would be better.
4. **Restock on cancel:** default `true`; food that is already prepared may argue for `false`.
5. **Sent lines without `cancellations`:** currently read-only. Alternative: admin may edit.
6. **Password hashing library:** `argon2` needs a native build; bcrypt is the fallback if installation on the target device is a problem.
7. **Capability versioning:** strict major version matching (this draft) versus semver ranges.
8. **Fiscal rules:** none implemented (see non-goals).
