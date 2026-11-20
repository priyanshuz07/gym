# Ironclad Fitness

Ironclad Fitness is a frontend-only gym management demo built with React, TypeScript, Tailwind CSS, Framer Motion, Lucide, and Recharts. It opens directly into a sample dashboard and stores demo changes in the browser's local storage. It does not use a backend, API, database, or authentication service.

## Run locally

1. Install Node.js 22 or later.
2. Run `npm ci`.
3. Run `npm run dev` and open the local Vite URL.

Run `npm run check` for TypeScript verification and `npm run build` to create the static production site in `dist`.

## Deploy to Vercel

Use the repository root as the project root. Vercel builds with `npm run build` and serves the static output from `dist`; no environment variables, server functions, or database are required. The app uses hash-based navigation, so page navigation and refreshes stay on the static entry point.

Demo member records, plans, settings, and notifications are saved in the current browser. Different browsers have separate demo data.
