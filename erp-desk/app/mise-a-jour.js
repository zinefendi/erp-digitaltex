'use strict';
// Mises à jour de l'application : le serveur publie /telechargements/latest.json
//   { "version": "1.0.1", "fichier": "ERP-Uniform-Studio-Setup-1.0.1.exe", "sha256": "…", "taille": 123, "notes": "…" }
// Contrôle au démarrage puis toutes les 4 h ; rien ne s'installe sans l'accord de l'utilisateur ;
// l'installateur téléchargé n'est lancé que si son empreinte SHA-256 correspond exactement.
const { app, dialog, net, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const spawn = (...a) => cp.spawn(...a);

const plusRecente = (a, b) => {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0), pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
};

async function lireJson(url) {
  const r = await net.fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function valide(m) {
  return m && typeof m.version === 'string' && /^\d+\.\d+\.\d+$/.test(m.version)
    && typeof m.fichier === 'string' && /^[A-Za-z0-9._-]+\.exe$/.test(m.fichier)
    && typeof m.sha256 === 'string' && /^[a-f0-9]{64}$/.test(m.sha256)
    && Number.isInteger(m.taille) && m.taille > 1e6 && m.taille < 600e6;
}

async function telecharger(url, dest, attendu, taille, progres) {
  const r = await net.fetch(url, { cache: 'no-store' });
  if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
  const h = crypto.createHash('sha256'); const out = fs.createWriteStream(dest);
  let n = 0;
  const lecteur = r.body.getReader();
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      n += value.length; if (n > taille) throw new Error('Fichier plus gros qu’annoncé');
      h.update(value); if (!out.write(value)) await new Promise((ok) => out.once('drain', ok));
      progres && progres(n / taille);
    }
  } finally { await new Promise((ok) => out.end(ok)); }
  const refus = (m) => { try { fs.unlinkSync(dest); } catch (_) { /* */ } throw new Error(m); };
  if (n !== taille) refus('Taille inattendue : fichier refusé');
  if (h.digest('hex') !== attendu) refus('Empreinte SHA-256 incorrecte : fichier refusé');
}

function creer({ serveur, chemin, fenetre, intervalle }) {
  let enCours = false, refusee = null;
  async function verifier(manuel) {
    if (enCours) return; enCours = true;
    const w = fenetre();
    try {
      const m = await lireJson(serveur + chemin);
      if (!valide(m)) throw new Error('Fichier de mise à jour invalide');
      if (!plusRecente(m.version, app.getVersion())) {
        if (manuel) await dialog.showMessageBox(w, { type: 'info', title: 'Mise à jour', message: `ERP Uniform Studio est à jour (version ${app.getVersion()}).` });
        return;
      }
      if (!manuel && refusee === m.version) return;
      const rep = await dialog.showMessageBox(w, {
        type: 'question', title: 'Mise à jour disponible', buttons: ['Installer maintenant', 'Plus tard'], defaultId: 0, cancelId: 1,
        message: `La version ${m.version} d’ERP Uniform Studio est disponible (vous avez la ${app.getVersion()}).`,
        detail: (m.notes ? String(m.notes).slice(0, 600) + '\n\n' : '') + 'L’application se fermera le temps de l’installation (moins d’une minute), puis se rouvrira.\nPensez à enregistrer votre travail en cours.',
      });
      if (rep.response !== 0) { refusee = m.version; return; }
      const dest = path.join(app.getPath('temp'), m.fichier);
      if (w && !w.isDestroyed()) w.setProgressBar(0.01);
      await telecharger(serveur + path.posix.join(path.posix.dirname(chemin), encodeURIComponent(m.fichier)), dest, m.sha256, m.taille, (p) => { if (w && !w.isDestroyed()) w.setProgressBar(p); });
      if (w && !w.isDestroyed()) w.setProgressBar(-1);
      // installateur NSIS silencieux, puis relance de l'application (géré par l'installateur : /RELANCER)
      await new Promise((ok, ko) => {
        const p = spawn(dest, ['/S', '/RELANCER'], { detached: true, stdio: 'ignore' });
        p.once('error', ko); p.once('spawn', () => { p.unref(); ok(); });
      });
      app.quit();
    } catch (e) {
      const w2 = fenetre(); if (w2 && !w2.isDestroyed()) w2.setProgressBar(-1);
      if (manuel) {
        const r = await dialog.showMessageBox(w2, { type: 'warning', title: 'Mise à jour', buttons: ['Fermer', 'Télécharger depuis le site'], defaultId: 0, cancelId: 0,
          message: 'La mise à jour n’a pas pu être vérifiée ou installée.', detail: String(e.message || e) });
        if (r.response === 1) shell.openExternal(serveur + path.posix.dirname(chemin) + '/');
      }
    } finally { enCours = false; }
  }
  return {
    demarrer() { setTimeout(() => verifier(false), 20000); setInterval(() => verifier(false), intervalle).unref?.(); },
    verifier: () => verifier(true),
  };
}

module.exports = { creer, plusRecente, valide };
