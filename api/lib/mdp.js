'use strict';
// Mots de passe : scrypt (intégré à Node), sel aléatoire, paramètres stockés avec l'empreinte
// pour pouvoir les durcir plus tard sans casser les comptes existants.
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const N = 2 ** 17, R = 8, P = 1, LONG = 64; // recommandation OWASP pour scrypt
const MAXMEM = 256 * 1024 * 1024;

async function hacher(mdp) {
  const sel = crypto.randomBytes(16);
  const h = await scrypt(String(mdp).normalize('NFC'), sel, LONG, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${sel.toString('base64')}$${h.toString('base64')}`;
}

async function verifier(mdp, stocke) {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(stocke || '');
  if (!m) return false;
  const [, n, r, p, sel, attendu] = m;
  const att = Buffer.from(attendu, 'base64');
  const h = await scrypt(String(mdp).normalize('NFC'), Buffer.from(sel, 'base64'), att.length,
    { N: +n, r: +r, p: +p, maxmem: MAXMEM });
  return crypto.timingSafeEqual(h, att);
}

/** Retourne null si le mot de passe est acceptable, sinon le motif du refus (en français). */
function motifRefus(mdp, identifiant = '') {
  const s = String(mdp || '');
  if (s.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères.';
  if (s.length > 200) return 'Le mot de passe est trop long (200 caractères maximum).';
  if (identifiant && s.toLowerCase().includes(String(identifiant).toLowerCase())) return 'Le mot de passe ne doit pas contenir l’identifiant.';
  const familles = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(s)).length;
  if (familles < 3 && s.length < 16) return 'Mélangez au moins 3 types parmi : minuscules, majuscules, chiffres, symboles (ou utilisez 16 caractères ou plus).';
  if (/^(.)\1+$/.test(s)) return 'Le mot de passe ne doit pas répéter un seul caractère.';
  return null;
}

/** Mot de passe provisoire lisible (sans caractères ambigus), ~70 bits d'entropie. */
function provisoire() {
  const a = 'abcdefghjkmnpqrstuvwxyz', A = 'ABCDEFGHJKMNPQRSTUVWXYZ', d = '23456789';
  const tout = a + A + d;
  const pick = (s) => s[crypto.randomInt(s.length)];
  const blocs = [];
  for (let b = 0; b < 3; b++) { let x = ''; for (let i = 0; i < 4; i++) x += pick(tout); blocs.push(x); }
  // garantit minuscule, majuscule, chiffre
  return `${blocs.join('-')}-${pick(A)}${pick(a)}${pick(d)}`;
}

module.exports = { hacher, verifier, motifRefus, provisoire };
