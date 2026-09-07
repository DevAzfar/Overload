# Overload

<p align="center">
  <img src="public/brand/overload-logo.png" width="180" height="180" alt="Overload fist gripping a purple dumbbell logo">
</p>

Overload is a mobile-first workout tracking and progress analytics prototype built with React, TypeScript and Vite. It supports reusable templates, custom exercises, workout history, estimated one-rep-max calculations, personal records, CSV backup and local-first data storage.

> Portfolio prototype · Web application · Local-first · Not an App Store release

**Live demo:** Deployment pending. The repository is prepared for static hosting, but no site has been published yet.

## Screenshots

Portfolio screenshots are intentionally pending until the final application can be captured in a real rendered browser. The required views and filenames are documented in [`docs/screenshots/README.md`](docs/screenshots/README.md); there are no fabricated or broken screenshot links here.

## Features

- Live workout logging with a running timer, set completion and canonical kilogram storage
- Built-in and locally saved custom exercises with independent search and filtering
- Reusable built-in and custom workout templates
- Persistent workout History with expanded set details, editing and deletion
- Dashboard statistics for the current local Monday-to-Sunday week
- Exercise-level volume and estimated-one-rep-max charts
- Epley estimated 1RM analysis for eligible sets of 1–30 repetitions
- Personal-record detection for weight, repetitions and estimated 1RM
- Kilogram and pound input/presentation without changing stored canonical values
- Version-1 CSV workout-history export, import, merge and replacement
- Three fictional demo athletes processed through the normal CSV pipeline
- Defensive validation, partial-data recovery, cross-tab conflict detection and rollback
- Keyboard focus management, reduced-motion support and mobile layouts

## Fictional demo athletes

Progress includes three selectable synthetic profiles:

- **Beginner Progression:** 24 workouts across 12 weeks with broadly rising volume, bench estimated strength and repeated records.
- **Plateau and Breakthrough:** 24 workouts across 12 weeks with an extended bench plateau followed by a later breakthrough.
- **Inconsistent Training:** 21 workouts across 14 weeks with missed periods, uneven frequency and variable performance.

The profiles begin as readable bundled CSV records. On activation, Overload parses them with the ordinary schema-v1 importer, applies one deterministic timestamp offset so the newest session finishes five minutes before activation, serialises the shifted records, and parses them again. Durations and gaps remain unchanged, future sessions are avoided, and summaries are recalculated from completed sets.

Demo records use canonical kilograms. Volume, estimated 1RM and personal records are derived at runtime; no demo statistic is hard-coded into the interface. Loading a demo replaces workout History, so exporting existing History first is recommended. No automatic pre-demo backup is retained.

## Data-processing pipeline

```text
Synthetic CSV or user-entered sets
        ↓
strict validation and canonical kilogram storage
        ↓
completed-set workout summaries and volume
        ↓
Epley estimated one-rep-max analysis
        ↓
personal-record events and progress visualisation
```

Incomplete sets remain in History but do not contribute to completed-set volume, E1RM trends or personal records. Zero-weight bodyweight sets are valid, but their zero external-load volume and E1RM do not represent the athlete's complete performance.

## Architecture

- `src/App.tsx` owns screen navigation, persistent state and coordinated mutations.
- `src/workoutHistory.ts` validates stored workout records and recalculates summaries.
- `src/workoutCsv.ts` provides reversible schema-v1 CSV serialisation and parsing.
- `src/workoutDataControls.ts` coordinates snapshots, expected-value checks and rollback.
- `src/progressAnalytics.ts` calculates exercise sessions, volume, E1RM and records.
- `src/demoProfiles.ts` imports bundled CSV text and performs revalidated date alignment.
- `src/demoMetadata.ts` validates the active-demo marker independently of History.

The interface is a small state-driven single-page application without a URL router or backend.

## Local-first storage and privacy

Workout History, previous sets, templates, custom exercises and preferences are stored in the browser's `localStorage`. There is no account, authentication, cloud database or synchronisation.

Browser storage is origin-specific. Data entered on localhost or another domain will not automatically appear on a deployed site. Clearing site/browser storage can permanently remove local data. Overload does not transmit workout records to a server.

Legacy `lift-off-*` storage keys remain intentionally unchanged so existing browser data continues to load after the product rename.

## CSV backup scope

CSV export covers **workout History only**, including workout/exercise snapshots and complete or incomplete sets. It does not include templates, custom exercises, display-name settings, unit preferences or demo metadata. CSV weights always use canonical `weight_kg`, regardless of the current display unit.

Exporting creates a local file but cannot guarantee that the browser or operating system retained it. Confirm the downloaded file exists before treating it as a backup.

## Technology

- React 19
- TypeScript 5
- Vite 8
- Native CSS, SVG and browser storage APIs
- No charting, state-management, backend or test-framework dependency

## Local development

Requirements: a current Node.js release and npm.

```bash
git clone https://github.com/Azucci3rd/Lift_Off.git
cd Lift_Off
npm ci
npm run dev
```

Vite prints the local development address. The folder and remote still use the legacy repository name; only the application and private package are named Overload.

## npm commands

```bash
npm run dev      # start the Vite development server
npm run build    # strict TypeScript check, then production build
npm run preview  # preview the production build locally
```

No package scripts or dependencies were added for release verification. The dependency-free checks can be run directly:

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run build
npx vite build --config scripts/vite.release.config.ts
node .release-tmp/reliability.mjs
node .release-tmp/workoutCsv.mjs
node .release-tmp/demoData.mjs
node scripts/verify-release.mjs
git diff --check
```

The demo CSV assets are reproducible with `node scripts/generate-demo-data.mjs`.

## Static deployment preparation

Vite uses a relative production base so application and image assets work under a repository subpath. The project builds to `dist/` and has no route-refresh requirement because it does not use URL-based routing.

No deployment workflow is included and GitHub Pages is not enabled. A later approved deployment can either upload `dist/` to any static host or add a GitHub Pages workflow that runs `npm ci` and `npm run build` before uploading `dist/`.

## Known limitations

- Data is limited to one browser origin and device unless workout History is moved manually by CSV.
- CSV does not back up templates, custom exercises or Settings.
- There is no authentication, cloud synchronisation or collaborative use.
- Estimated 1RM uses a general formula and is unavailable above 30 repetitions.
- External-load volume is incomplete for bodyweight movements entered with zero weight.
- Historical-only exercises can be analysed but cannot automatically be added to a new workout library.
- An activation during the first minutes after local Monday midnight may place the latest demo start in the preceding week because the full preserved workout must finish before activation.
- This is a portfolio prototype, not production-grade health software.

## Future improvements

- Optional user-controlled backup for templates, exercises and preferences
- Broader measurement types such as duration and distance
- More detailed chart axes and time-range filtering
- Opt-in account-based synchronisation after an appropriate privacy/security design
- Automated rendered-browser accessibility and visual-regression testing

## Disclaimer

Overload is a portfolio web prototype and is not medical advice, professional coaching or a substitute for qualified health guidance. Estimated strength values are mathematical estimates, not tested maximums or exercise recommendations.

## Author and portfolio use

Built by [DevAzfar](https://github.com/DevAzfar) as a React and TypeScript portfolio project focused on data validation, local-first reliability, accessible interaction and honest workout analytics.
