# Contributing to MCRS

Thank you for helping! This guide explains how work is organised in this repository.

## Quick checklist

Before you open a pull request or merge into `main`, run this from the repository root:

```
npm run lint
npm run format:check
npm run build
npm test
```

All four must pass. They are exactly the steps of the CI workflow.

## Workflow

1. Pick an issue from the current milestone (in order, unless it says otherwise).
2. Create a branch from an up-to-date `main`.
3. Work in small steps and commit often.
4. Open a pull request (or merge locally if you work alone) and link the issue.
5. Keep `main` green: never merge while CI is red.

### Branch names

```
<type>/<issue-number>-<short-name>
```

Examples: `feat/2-server-heartbeat`, `chore/5-ci`, `docs/6-plan-on-paper`.

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org) style:

```
<type>: <short summary in the imperative> (#<issue>)
```

Examples:

```
feat: minimal Express server with health endpoint (#2)
chore: regenerate package-lock.json with binaries for all platforms (#5)
```

- Use the same types as for branches, plus `style` for pure formatting.
- Put `Closes #<issue>` in the body of the **last** commit of an issue. GitHub then closes the
  issue when the commit reaches `main`.
- Do not mix formatting changes and real changes in one commit.

### Pull requests

- Keep them small and focused on one issue.
- Say what changed and why, and how you tested it.
- Write `Closes #<issue>` in the description.

## Milestones and issues

The roadmap has eleven milestones. Each milestone has a goal, a scope, deliverables and a
definition of done in its description.

| Milestone | Topic                                                      |
| --------- | ---------------------------------------------------------- |
| M0        | Foundation: workspace and dev setup                        |
| M1        | The engine room: core server                               |
| M2        | A place to keep things: storage contract and SQLite        |
| M3        | Who goes there: authentication and the client shell        |
| M4        | The control panel: settings and dialogs                    |
| M5        | Building the menu: catalog and tables                      |
| M6        | From tap to table: ordering                                |
| M7        | Always up to date: stock and live updates                  |
| M8        | Make it yours: comfort modules                             |
| M9        | Power tools: import/export, output, reports, cancellations |
| M10       | Ready for the real world: PWA, HTTPS and release           |

Every issue has a **Summary**, **Acceptance criteria** (a checklist) and **References** to the
specification. An issue is done when every box is ticked, the checks pass and the change is on
`main`. A milestone is closed when all its issues are closed and its definition of done is met.

## Labels

Every issue gets at least one **type label**. Issues that touch a part of the skeleton or a module
also get a **group label** (`scope` or `module`) together with the **specific label**.

| Kind   | Labels                                            | Meaning                                                        |
| ------ | ------------------------------------------------- | -------------------------------------------------------------- |
| Type   | `feature`, `chore`, `test`, `docs`                | What kind of work it is                                        |
| Extra  | `security`, `ui`                                  | Added when the issue touches security or what users see        |
| Group  | `scope`, `module`                                 | Says whether the issue is about the skeleton or about a module |
| Scope  | `core-server`, `core-client`, `shared`, `tooling` | Which part of the skeleton (use with `scope`)                  |
| Module | `auth`, `catalog`, `orders`, ...                  | Which module under `modules/` (use with `module`)              |

Examples: password hashing is `feature`, `security`, `module`, `auth`. The CI workflow is `chore`,
`scope`, `tooling`.

The full list with descriptions and search tips is in [docs/labels.md](docs/labels.md). A new module
gets a label named after its id, combined with `module`.

## Code style

- Formatting is done by **Prettier**, linting by **ESLint**, basic editor settings by
  **EditorConfig**. Run `npm run format` before you commit.
- Files use **LF** line endings (enforced through `.gitattributes`, `.editorconfig` and Prettier).
- Do not commit generated files (`dist`, `.angular`), secrets or the `data/` folder.
- Commit `package-lock.json`. CI installs with `npm ci`, which needs it to be in sync.
- Add dependencies to the workspace that needs them: `npm install <pkg> -w @mcrs/<workspace>`.

## Rules for modules

The details are in the [specification](docs/specification.md). The short version:

- A module has a `module.json` manifest that declares what it provides and requires.
- Modules depend on **capabilities**, never on other modules by name.
- Routes live under `/api/<moduleId>/`, collections are prefixed `<moduleId>_`.
- A module never reads or writes another module's collections. Use contracts, events and hooks.
- Every user-visible text goes through a translation key, with English strings in `i18n/en.json`.
- The system must still start and work with any optional module removed.

## Security

Please do not open a public issue for a vulnerability. Use the **Security** tab of the repository
(private vulnerability reporting) or contact the maintainer directly.

## License

By contributing you agree that your contribution is licensed under the GPL-2.0, like the rest of
the project.
