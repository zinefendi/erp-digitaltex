'use strict';
// ERP UNIFORM STUDIO (pour DIGITAL-TEX S.A.) V1.0 — application Windows de l'ERP.
// Ouvre l'ERP https://app.vethypro.com dans une fenêtre sécurisée : aucune donnée métier n'est stockée
// sur le poste (tout reste sur le serveur), seule la session de connexion est conservée (cookie du serveur).
const { app, BrowserWindow, Menu, shell, ipcMain, session, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const C = require('./config');
const MAJ = require('./mise-a-jour');

// Adresse du serveur : fixe dans l'application installée ; modifiable seulement en développement (tests).
const SERVEUR = (!app.isPackaged && process.env.ERP_SERVEUR) || C.SERVEUR;
const ORIGINE = new URL(SERVEUR).origin;
const POSTE = String(os.hostname() || '').replace(/[^\w.-]/g, '').slice(0, 60) || 'poste';

app.setName(C.NOM);
app.setAppUserModelId('com.digitaltex.erpuniformstudio');
app.commandLine.appendSwitch('lang', 'fr-FR');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null;
const fenetre = () => win;
const majs = MAJ.creer({ serveur: ORIGINE, chemin: C.MAJ, fenetre, intervalle: C.MAJ_INTERVALLE_MS });

const estErp = (url) => { try { return new URL(url).origin === ORIGINE; } catch (_) { return false; } };
const externe = (url) => { try { const u = new URL(url); if (u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:') shell.openExternal(u.href); } catch (_) { /* ignoré */ } };
const pageHorsLigne = (detail) => win && !win.isDestroyed() && win.loadFile(path.join(__dirname, 'hors-ligne.html'), { query: { erreur: String(detail || '').slice(0, 200) } });
const ouvrirErp = () => win && !win.isDestroyed() && win.loadURL(ORIGINE + '/').catch(() => { /* géré par did-fail-load */ });

const PREFS = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
  allowRunningInsecureContent: false, spellcheck: true, devTools: !app.isPackaged,
};

function dossierDocuments() {
  const d = path.join(app.getPath('documents'), C.DOSSIER_DOCUMENTS);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function securiserSession(s) {
  // le serveur reconnaît le poste dans le journal d'audit (champ « poste »)
  s.webRequest.onBeforeSendHeaders({ urls: [ORIGINE + '/*'] }, (d, cb) => { d.requestHeaders['X-ERP-Poste'] = POSTE; cb({ requestHeaders: d.requestHeaders }); });
  // seules les permissions utiles sont accordées, et seulement au serveur de l'ERP
  const OK = new Set(['clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'pointerLock']);
  s.setPermissionRequestHandler((wc, perm, cb, det) => cb(OK.has(perm) && estErp(det.requestingUrl || wc.getURL())));
  s.setPermissionCheckHandler((wc, perm, origine) => OK.has(perm) && estErp(origine || ''));
  // téléchargements : Documents\ERP Uniform Studio, sans écraser un fichier existant
  s.on('will-download', (e, item) => {
    const base = path.basename(item.getFilename() || 'document').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'document';
    const dir = dossierDocuments(); const ext = path.extname(base); const nom = path.basename(base, ext);
    let f = path.join(dir, base); for (let i = 2; fs.existsSync(f); i++) f = path.join(dir, `${nom} (${i})${ext}`);
    item.setSavePath(f);
    item.once('done', (_, etat) => {
      if (etat === 'completed') { if (win && !win.isDestroyed()) win.webContents.send?.('erp:telecharge', f); shell.showItemInFolder(f); }
      else if (etat !== 'cancelled') dialog.showMessageBox(win, { type: 'warning', title: 'Téléchargement', message: 'Le téléchargement n’a pas abouti.', detail: base });
    });
  });
}

function brancher(wc, principale) {
  wc.setWindowOpenHandler(({ url }) => {
    // PDF générés par l'ERP (blob:) : fenêtre de lecture intégrée, avec impression
    if (url.startsWith('blob:' + ORIGINE) || url === 'about:blank') {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 900, autoHideMenuBar: true, title: C.TITRE, icon: path.join(__dirname, 'icon.png'),
        webPreferences: { ...PREFS, preload: undefined, plugins: true } } };
    }
    if (estErp(url)) { wc.loadURL(url); return { action: 'deny' }; }
    externe(url); return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (estErp(url) || url.startsWith('file:')) return;
    e.preventDefault(); externe(url);
  });
  wc.on('will-redirect', (e, url) => { if (!estErp(url)) { e.preventDefault(); externe(url); } });
  wc.on('did-create-window', (w) => { w.setMenuBarVisibility(false); brancher(w.webContents, false); });
  if (principale) {
    wc.on('did-fail-load', (e, code, desc, url, principal) => { if (principal && code !== -3 && estErp(url)) pageHorsLigne(`${desc} (${code})`); });
    wc.on('render-process-gone', (e, d) => { if (d.reason !== 'clean-exit') pageHorsLigne('affichage interrompu : ' + d.reason); });
  }
}

function menu() {
  const t = [
    { label: 'Fichier', submenu: [
      { label: 'Accueil de l’ERP', accelerator: 'Alt+Home', click: ouvrirErp },
      { label: 'Ouvrir le dossier des documents', click: () => shell.openPath(dossierDocuments()) },
      { type: 'separator' },
      { label: 'Imprimer…', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.print() },
      { type: 'separator' },
      { label: 'Quitter', role: 'quit' },
    ] },
    { label: 'Édition', submenu: [
      { label: 'Annuler', role: 'undo' }, { label: 'Rétablir', role: 'redo' }, { type: 'separator' },
      { label: 'Couper', role: 'cut' }, { label: 'Copier', role: 'copy' }, { label: 'Coller', role: 'paste' }, { label: 'Tout sélectionner', role: 'selectAll' },
    ] },
    { label: 'Affichage', submenu: [
      { label: 'Actualiser', accelerator: 'F5', click: () => win && win.webContents.reload() },
      { label: 'Zoom avant', role: 'zoomIn' }, { label: 'Zoom arrière', role: 'zoomOut' }, { label: 'Taille normale', role: 'resetZoom' },
      { type: 'separator' }, { label: 'Plein écran', role: 'togglefullscreen' },
      ...(app.isPackaged ? [] : [{ label: 'Outils de développement', role: 'toggleDevTools' }]),
    ] },
    { label: 'Aide', submenu: [
      { label: 'Rechercher une mise à jour…', click: () => majs.verifier() },
      { label: 'Ouvrir l’ERP dans le navigateur', click: () => externe(ORIGINE + '/') },
      { type: 'separator' },
      { label: 'À propos', click: () => dialog.showMessageBox(win, { type: 'info', title: 'À propos', message: C.TITRE,
        detail: `ERP UNIFORM STUDIO (pour DIGITAL-TEX S.A.)\nVersion ${app.getVersion()}\nServeur : ${ORIGINE}\nPoste : ${POSTE}\n\nLes données restent sur le serveur de l’ERP ; ce poste ne conserve que la session de connexion.` }) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

function creer() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640, show: false, title: C.TITRE,
    backgroundColor: '#1f4f7d', icon: path.join(__dirname, 'icon.png'), webPreferences: PREFS,
  });
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle(C.TITRE); });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('closed', () => { win = null; });
  brancher(win.webContents, true);
  ouvrirErp();
}

ipcMain.on('erp:version', (e) => { e.returnValue = app.getVersion(); });
ipcMain.on('erp:reessayer', () => ouvrirErp());
ipcMain.on('erp:maj-verifier', () => majs.verifier());

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('web-contents-created', (_, wc) => {
  wc.on('will-attach-webview', (e) => e.preventDefault());
});
// certificat invalide : jamais accepté (l'ERP est en HTTPS Let's Encrypt)
app.on('certificate-error', (e, wc, url, err, cert, cb) => cb(false));

app.whenReady().then(() => {
  securiserSession(session.defaultSession);
  menu();
  creer();
  if (app.isPackaged || process.env.ERP_TEST_MAJ) majs.demarrer();
});
app.on('window-all-closed', () => app.quit());
