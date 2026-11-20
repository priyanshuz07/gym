import express from 'express';
import { MongoClient } from 'mongodb';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  digest,
  hashPassword,
  isValidEmail,
  isValidNewPassword,
  newSessionToken,
  normalizeEmail,
  passwordMatches,
} from './credentials.mjs';
import { validateState } from './validate-state.mjs';

const { NODE_ENV, MONGODB_URI, MONGODB_DB, OWNER_EMAIL, OWNER_PASSWORD, PUBLIC_ORIGIN } = process.env;
const production = NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
const ownerId = 'gym-owner';
const stateId = 'gym-state';
const sessionTtl = 12 * 60 * 60 * 1000;
const loginWindowMs = 15 * 60 * 1000;
const cookieName = production ? '__Host-ironclad_session' : 'ironclad_session';
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/' };
const clientRoot = fileURLToPath(new URL('../dist/', import.meta.url));

if (!MONGODB_URI) throw new Error('Set MONGODB_URI before starting Ironclad.');
if (production && (!PUBLIC_ORIGIN || new URL(PUBLIC_ORIGIN).protocol !== 'https:')) {
  throw new Error('Configure PUBLIC_ORIGIN with the public HTTPS URL in production.');
}
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(proxyHops) || proxyHops < 0) {
  throw new Error('Check the PORT and TRUST_PROXY_HOPS configuration.');
}

const publicOrigin = PUBLIC_ORIGIN ? new URL(PUBLIC_ORIGIN).origin : null;
const client = await MongoClient.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
const db = client.db(MONGODB_DB || 'ironclad');
const owners = db.collection('owners');
const sessions = db.collection('sessions');
const loginLimits = db.collection('loginLimits');
const gymState = db.collection('gymState');

try {
  await Promise.all([
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    loginLimits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  if (!await owners.findOne({ _id: ownerId }, { projection: { _id: 1 } })) {
    const email = normalizeEmail(OWNER_EMAIL);
    if (!isValidEmail(email) || !isValidNewPassword(OWNER_PASSWORD)) {
      throw new Error('Set OWNER_EMAIL and an OWNER_PASSWORD of at least 12 characters to initialize the owner account.');
    }
    const passwordHash = await hashPassword(OWNER_PASSWORD);
    await owners.updateOne(
      { _id: ownerId },
      { $setOnInsert: { email, passwordHash, sessionVersion: 0, createdAt: new Date() } },
      { upsert: true },
    );
  }
} catch (error) {
  await client.close();
  throw error;
}

const app = express();
app.disable('x-powered-by');
app.disable('etag');
if (proxyHops) app.set('trust proxy', proxyHops);

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    ].join('; '),
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  if (production) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('origin');
  const expectedOrigin = publicOrigin || req.protocol + '://' + req.get('host');
  if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expectedOrigin)) {
    return res.status(403).json({ error: 'This request must come from the gym application.' });
  }
  next();
});

async function findSession(req) {
  const cookie = (req.get('cookie') || '').split(';').map((value) => value.trim())
    .find((value) => value.startsWith(cookieName + '='));
  const token = cookie?.slice(cookieName.length + 1);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const id = digest(token);
  const session = await sessions.findOne({ _id: id, expiresAt: { $gt: new Date() } });
  if (!session) return null;

  const owner = await owners.findOne({ _id: ownerId });
  if (!owner || owner.sessionVersion !== session.sessionVersion) return null;
  return { id, owner };
}

async function requireOwner(req, res, next) {
  const owner = await owners.findOne({ _id: ownerId });
  if (!owner) return res.status(503).json({ error: 'The gym owner account could not be loaded.' });
  req.ownerSession = { owner };
  next();
}

async function issueSession(owner, res) {
  const token = newSessionToken();
  await sessions.insertOne({
    _id: digest(token),
    sessionVersion: owner.sessionVersion,
    expiresAt: new Date(Date.now() + sessionTtl),
  });
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionTtl });
}

async function checkLoginLimit(ip) {
  const now = Date.now();
  const bucket = Math.floor(now / loginWindowMs);
  const resetTime = (bucket + 1) * loginWindowMs;
  const record = await loginLimits.findOneAndUpdate(
    { _id: digest(ip) + ':' + bucket },
    { $inc: { attempts: 1 }, $setOnInsert: { expiresAt: new Date(resetTime) } },
    { upsert: true, returnDocument: 'after' },
  );
  return record.attempts > 10 ? Math.ceil((resetTime - now) / 1000) : 0;
}

const smallBody = express.json({ limit: '16kb' });

app.get('/api/session', async (req, res) => {
  const session = await findSession(req);
  if (!session) return res.json({ authenticated: false });
  res.json({ authenticated: true, email: session.owner.email });
});

app.post('/api/login', smallBody, async (req, res) => {
  const retryAfter = await checkLoginLimit(req.ip);
  if (retryAfter) {
    return res.set('Retry-After', String(retryAfter))
      .status(429).json({ error: 'Too many sign-in attempts. Try again in a few minutes.' });
  }

  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!isValidEmail(email) || typeof password !== 'string' || !password || password.length > 256) {
    return res.status(400).json({ error: 'Enter a valid email address and password.' });
  }

  const owner = await owners.findOne({ _id: ownerId });
  const passwordValid = await passwordMatches(password, owner.passwordHash);
  if (!passwordValid || email !== owner.email) {
    return res.status(401).json({ error: 'The email or password is incorrect.' });
  }

  const previousSession = await findSession(req);
  if (previousSession) await sessions.deleteOne({ _id: previousSession.id });
  await issueSession(owner, res);
  res.json({ authenticated: true, email: owner.email });
});

app.post('/api/logout', async (req, res) => {
  const session = await findSession(req);
  if (session) await sessions.deleteOne({ _id: session.id });
  res.clearCookie(cookieName, cookieOptions);
  res.json({ authenticated: false });
});

app.patch('/api/account', requireOwner, smallBody, async (req, res) => {
  const { currentPassword, password, email: suppliedEmail } = req.body || {};
  const { owner } = req.ownerSession;
  const email = suppliedEmail === undefined ? owner.email : normalizeEmail(suppliedEmail);

  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 256) {
    return res.status(400).json({ error: 'Enter your current password to update the account.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password !== undefined && !isValidNewPassword(password)) {
    return res.status(400).json({ error: 'The new password must contain 12–256 characters.' });
  }
  if (!await passwordMatches(currentPassword, owner.passwordHash)) {
    return res.status(401).json({ error: 'The current password is incorrect.' });
  }
  if (password === undefined && email === owner.email) return res.json({ authenticated: true, email });

  const passwordHash = password === undefined ? owner.passwordHash : await hashPassword(password);
  const updatedOwner = await owners.findOneAndUpdate(
    { _id: ownerId, sessionVersion: owner.sessionVersion },
    { $set: { email, passwordHash, updatedAt: new Date() }, $inc: { sessionVersion: 1 } },
    { returnDocument: 'after' },
  );
  if (!updatedOwner) {
    return res.status(409).json({ error: 'The account changed in another session. Sign in and try again.' });
  }
  await issueSession(updatedOwner, res);
  res.json({ authenticated: true, email });
});

function withRevision(res, revision) {
  return res.set('ETag', '"' + revision + '"');
}

function withOwnerEmail(state, email) {
  return { ...state, settings: { ...state.settings, ownerEmail: email } };
}

app.get('/api/state', requireOwner, async (req, res) => {
  const document = await gymState.findOne({ _id: stateId });
  if (!document) {
    return withRevision(res, 0).status(404).json({ error: 'No gym state has been saved.' });
  }
  withRevision(res, document.revision).json(withOwnerEmail(document.state, req.ownerSession.owner.email));
});

app.put('/api/state', requireOwner, express.json({ limit: '10mb' }), async (req, res) => {
  const revisionHeader = req.get('if-match') || '';
  const revisionMatch = revisionHeader.match(/^"(0|[1-9]\d*)"$/);
  const revision = revisionMatch ? Number(revisionMatch[1]) : NaN;
  if (!Number.isSafeInteger(revision)) {
    return res.status(428).json({ error: 'Refresh the gym records before saving.' });
  }

  const validationError = validateState(req.body);
  if (validationError) return res.status(422).json({ error: validationError });

  const state = withOwnerEmail(req.body, req.ownerSession.owner.email);
  const updatedAt = new Date();
  if (revision === 0) {
    try {
      await gymState.insertOne({ _id: stateId, state, revision: 1, updatedAt });
      return withRevision(res, 1).json(state);
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  } else {
    const updated = await gymState.updateOne(
      { _id: stateId, revision },
      { $set: { state, updatedAt }, $inc: { revision: 1 } },
    );
    if (updated.modifiedCount === 1) return withRevision(res, revision + 1).json(state);
  }

  return res.status(412).json({ error: 'Gym records changed in another session. Refresh and try again.' });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'This endpoint could not be found.' }));
app.use(express.static(clientRoot, {
  index: false,
  maxAge: 0,
  setHeaders(res, path) {
    if (/[/\\]assets[/\\][^/\\]+-[a-zA-Z0-9_-]{8}\.[^/\\]+$/.test(path)) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));
app.get('/{*path}', (req, res) => {
  res.set('Cache-Control', 'no-cache').sendFile(join(clientRoot, 'index.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  const messages = {
    400: 'The request contains invalid JSON.',
    413: 'The gym records are too large to save.',
    503: 'Sign-in is busy. Try again in a moment.',
  };
  if (status >= 500) console.error('Request failed', { status, name: error.name, code: error.code });
  res.status(status).json({ error: messages[status] || 'The request could not be completed.' });
});

const server = app.listen(port, () => console.log('Ironclad is listening on port ' + port));
server.on('error', async (error) => {
  console.error('The HTTP server could not start', { code: error.code });
  await client.close();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(async () => {
      await client.close();
      process.exitCode = 0;
    });
  });
}
