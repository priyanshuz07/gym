# Ironclad server

The Express service hosts the gym dashboard and stores its records, owner account, and sessions in MongoDB. It requires Node.js 22 or newer and MongoDB 6 or newer.

## Run locally

1. Start MongoDB and set aside a database for Ironclad.
2. From the project root, run `npm ci` and `npm run build`.
3. Copy `server/.env.example` to `server/.env`. Set `MONGODB_URI` and assign the first owner an email and a unique password of at least 12 characters.
4. Run `npm run server`. Open `http://localhost:3000` and sign in with the owner credentials.

On the first start, Ironclad hashes the configured password and creates the owner account. After that, sign in with the saved credentials and use Settings to change them. The dashboard starts with the default membership plans and an empty member directory.

## Deploy the authenticated system

Build the frontend and run the same Node.js service with `NODE_ENV=production`. Serve it over HTTPS and set `PUBLIC_ORIGIN` to its external origin, including the scheme. When a reverse proxy terminates HTTPS, set `TRUST_PROXY_HOPS` to its known hop count and restrict direct access to the Node.js service. Use a MongoDB connection with authentication and encryption and set database credentials through your deployment's environment. Persist the database across deployments.

Each saved gym state has a revision. If another browser saves first, the server rejects the older revision and the dashboard can reload the latest records before retrying. Sessions last 12 hours and changing the account credentials signs out other sessions.
