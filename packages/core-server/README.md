# @mcrs/core-server

The skeleton of the MCRS server. Everything that is not a module lives here.

```
src/
  index.ts          the public API of the package (re-exports the folders below)
  common/           small helpers used everywhere: logger, problem messages
  blueprint/        reads and checks mcrs.config.json and every module.json
  plan/             capabilities, dependency checks and the start order
  registry/         the frozen list of modules and the fingerprints
  module-api/       what a module sees: ModuleContext, ServerModule, ...
  events/           the event bus: modules tell each other what happened
  hooks/            guards and filters: modules take part in what others do
  handshake/        compares the modules of a client with the server's
  http/             the Express app: route registry with access rules, error format, security
  host/             brings modules to life: load, register, migrate, start, stop
  shutdown/         graceful shutdown on SIGINT and SIGTERM
```

Rules of thumb:

- Every folder has an `index.ts` that lists what other folders may use. Import from the folder
  (`'../common'`), not from a file inside it.
- Tests sit next to the code they test (`host.ts` and `host.test.ts`).
- A new topic gets its own folder, for example `events/` or `routes/`.
