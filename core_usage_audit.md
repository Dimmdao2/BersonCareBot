# Core Content Presence

Files present in `src/content/core`:

- `src/content/core/routes-example.json`
- `src/content/core/routes.json`
- `src/content/core/scripts-example.json`
- `src/content/core/scripts.json`
- `src/content/core/templates-example.json`
- `src/content/core/templates.json`

Working content files:

- `src/content/core/scripts.json` defines one script: `core:event.log`
- `src/content/core/routes.json` defines one route targeting `core:event.log`
- `src/content/core/templates.json` is empty

# Code References

Direct references found:

- `src/content/core/routes.json` references `core:event.log`
- `src/content/core/routes-example.json` references `core:event.log`

No runtime TypeScript references were found for:

- `getScript('core:...')`
- `getTemplate('core:...')`
- `getRoutes('core')`
- `source: 'core'`
- `getContentBundle(registry, 'core')`

Relevant loader files that can include `core` indirectly by directory scan:

- `src/kernel/contentRegistry/index.ts`
- `src/infra/adapters/contentPort.ts`

# Loader Behavior

Yes. The content loader automatically loads all subfolders under `src/content`.

`src/kernel/contentRegistry/index.ts` uses `readdir(rootDir, { withFileTypes: true })` and iterates every directory under `src/content`. For each directory, it attempts to load:

- `scripts.json`
- `templates.json`
- `routes.json`

That means `src/content/core` is automatically loaded as a content bundle as long as the folder exists.

`src/infra/adapters/contentPort.ts` then exposes any loaded bundle by scope name, including `core`, through the generic content port.

# Test Dependencies

Explicit test references to `core` scripts were not found.

Observed test dependency status:

- `src/kernel/contentRegistry/index.test.ts` tests generic directory loading behavior, but only explicitly asserts presence of `rubitime` and `telegram`
- no tests were found that explicitly reference `core:event.log`
- no tests were found that explicitly request the `core` bundle

# Safe To Remove?

YES

Explanation:

- `src/content/core` is auto-loaded only because the loader scans all `src/content/*` folders.
- No runtime code reference to `core` was found.
- No test explicitly depends on `core` content.
- `templates.json` in `core` is empty.
- The only concrete `core` references are internal to the `src/content/core` folder itself.

So removal of `src/content/core` does not appear to break runtime or tests, based on current code references.

# Files That Would Need Change If Core Removed

None found in runtime or tests.

At most, these files would disappear together with the folder itself:

- `src/content/core/routes.json`
- `src/content/core/scripts.json`
- `src/content/core/templates.json`
- `src/content/core/routes-example.json`
- `src/content/core/scripts-example.json`
- `src/content/core/templates-example.json`
