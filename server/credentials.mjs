import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const scryptOptions = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
const keyLength = 64;
let activeChecks = 0;

export function isValidEmail(value) {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidNewPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 256;
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export async function hashPassword(password) {
  if (activeChecks >= 2) {
    const error = new Error('Sign-in is busy. Try again in a moment.');
    error.status = 503;
    throw error;
  }
  activeChecks++;
  try {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, keyLength, scryptOptions);
    return [salt.toString('base64url'), key.toString('base64url')].join('.');
  } finally {
    activeChecks--;
  }
}

export async function passwordMatches(password, stored) {
  if (activeChecks >= 2) {
    const error = new Error('Sign-in is busy. Try again in a moment.');
    error.status = 503;
    throw error;
  }
  activeChecks++;
  try {
    const [salt, encodedKey] = stored.split('.');
    const storedKey = Buffer.from(encodedKey, 'base64url');
    const suppliedKey = await deriveKey(password, Buffer.from(salt, 'base64url'), keyLength, scryptOptions);
    return timingSafeEqual(storedKey, suppliedKey);
  } finally {
    activeChecks--;
  }
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
