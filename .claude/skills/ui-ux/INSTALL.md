# Installing the Kinet UI/UX Skill

The `kinet-ui-ux/` directory is a self-contained Agent Skill. It has no runtime
dependencies and no references outside itself, so it can be copied anywhere.

## Option 1 — Project skill (recommended)

Copy the whole directory into the target repository:

```bash
# from the directory containing kinet-ui-ux/
cp -r kinet-ui-ux <target-repo>/.github/skills/kinet-ui-ux
```

GitHub Copilot (and other agents that read `.github/skills/`) will discover
`SKILL.md` and load it when a UI task is active. The skill's `name` field
(`kinet-ui-ux`) must match the folder name.

## Option 2 — User / global skill

Copy the directory into the user-level skills location so it applies to every
repository:

- **GitHub Copilot CLI / VS Code:** the user skills directory (e.g.
  `~/.copilot/skills/kinet-ui-ux` on Linux/macOS,
  `%USERPROFILE%\.copilot\skills\kinet-ui-ux` on Windows).
- **Other agents:** the equivalent global skills folder (e.g.
  `~/.claude/skills/kinet-ui-ux`).

## Option 3 — Standalone transfer

The directory is transferable as-is (e.g. via archive). Nothing inside it
references absolute paths. After copying, verify:

```bash
node kinet-ui-ux/scripts/validate-design.mjs <path-to-frontend-src>
```

## Using the skill in a new Kinet application

1. Copy `examples/base.css` into the new app's `src/` as the stylesheet
   foundation (it includes the token layer, reset, app shell, and all
   component classes).
2. Add the IBM Plex Sans/Mono fonts (e.g. `@fontsource/ibm-plex-sans`,
   `@fontsource/ibm-plex-mono`) and import the weights 400/500/600/700 (Sans)
   and 400/500/600 (Mono).
3. Use the component examples in `examples/components/` as reference
   implementations (Dialog, Feedback, ResourceState, DataTable, PageHeader).
4. Use `assets/tokens.json` as the single source of truth for values.
5. Run `scripts/validate-design.mjs` in CI as a design gate.

## What is NOT included

- No application code from the source repository (only extracted, generalized
  design foundations).
- No credentials, production data, or customer information.
- No visual baselines (the source application was not started; see
  `references/validation.md` §3 for the screenshot procedure to run once a
  safe local instance is available).
