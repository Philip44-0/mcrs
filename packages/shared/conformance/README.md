# Storage conformance suite

A test suite that checks a storage module against the storage contract (`storage@1`, see
`../src/storage.ts` and section 7.1 of the specification). A module that passes is a valid drop-in
for the default SQLite storage, and the other modules of an installation cannot tell the difference.

## Using it

In the tests of your storage module (this needs `vitest`):

```ts
// my-storage.test.ts
import { runStorageConformance } from '@mcrs/shared/conformance';
import { createMyStorage } from './my-storage';

runStorageConformance(
  async () => {
    const storage = await createMyStorage({ file: ':memory:' }); // a fresh, empty storage
    return { storage, close: () => storage.close() };
  },
  { name: 'my-storage' },
);
```

- The **factory** is called once per test and has to return a fresh, empty storage. `close` is called
  after the test (close the database, delete the file).
- The suite defines its own collections (`conformance_items`, `conformance_pairs`,
  `conformance_others`) and calls `migrate()` itself, so the storage must be ready for
  `defineCollection()` and `migrate()` right after it was created.
- The names of the tests start with `storage conformance: <name>`.

## What it checks

| Group                  | Examples                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| collections            | defining twice, differing definitions, broken definitions, undefined collections, collections kept apart                                                             |
| insert                 | the base fields, ids (given, generated, duplicates, invalid), unknown and base fields, every kind of invalid value, json round trip, copies                          |
| get                    | missing and removed records, `includeDeleted`                                                                                                                        |
| list                   | order, equality on every kind of field, `null`, `in`, AND, sorting with empty values, `limit` and `offset`, `includeDeleted`, every kind of invalid query            |
| update                 | changed and unchanged fields, `rev` and `updatedAt`, `ifRev` and `conflict`, errors that change nothing                                                              |
| unique groups          | single and combined groups, empty values never conflict, removed records free their value, restore                                                                   |
| adjust                 | limits `min` and `max`, refusals change nothing, errors, **50 calls at the same moment never cross the minimum** (also inside transactions)                          |
| remove, restore, purge | soft delete, repeated calls, missing records                                                                                                                         |
| concurrency            | of several updates with the same `ifRev` exactly one wins; of several inserts with the same unique value exactly one wins                                            |
| transactions           | commit, read your own changes, rollback on error (the same error is thrown), failed operations inside, one after another, a call without the `tx` is not rolled back |

Not covered (yet): migrations between schema versions (they need a storage that can be opened again, and
come with the migration issue), persistence across restarts, and speed.

## The reference storage

`createMemoryStorage()` is a storage module that keeps everything in memory and passes this suite
(`memory-storage.test.ts`). It is the reference for how the contract is meant, and handy in the tests
of other modules: `const storage = createMemoryStorage()` gives them a working storage without a
database.

## When a test fails

The name of the test says what the contract promises, and the contract (`../src/storage.ts`) describes
the exact behaviour of every operation, including the error code to throw. If you think a test asks for
more than the contract says, open an issue: the contract and the suite change together.
