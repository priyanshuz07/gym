# Ironclad Fitness

An owner-only gym workspace for member records, membership plans, expiry and renewals, notifications, and reports. The interface uses React, TypeScript, Tailwind CSS, Framer Motion, Lucide, and Recharts. Express serves the authenticated application and MongoDB stores records and sessions.

## Run the authenticated app

1. Install Node.js 22 or later and provision a MongoDB 6 or later database.
2. Run `npm ci` and `npm run build`.
3. Copy `server/.env.example` to `server/.env` and configure the database URL and first owner account.
4. Run `npm start`, open `http://localhost:3000`, and sign in with your owner credentials.

See [server setup](server/README.md) for HTTPS deployment, account initialization, and persistence details.

## Preview with sample data

Run `npm run dev` for the development demo. `npm run build:demo` builds the private Sites preview with fictional members and browser-local changes. Use the authenticated build for real member records.

Run `npm run check` for TypeScript verification.
