// Construction de « ERP Uniform Studio » pour Windows x64, sans Wine :
// 1) Electron officiel win32-x64 (empreinte SHA-256 contrôlée)  2) app.asar  3) icône + infos de version (resedit)
// 4) installateur NSIS (makensis). Usage : node construire.mjs
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { execFileSync } from 'node:child_process';
import * as ResEdit from 'resedit';
import * as asar from '@electron/asar';

const ICI = path.dirname(new URL(import.meta.url).pathname);
const PKG = JSON.parse(fs.readFileSync(path.join(ICI, 'app/package.json'), 'utf8'));
const V = PKG.version, ELECTRON = '44.9.3';
const ZIP = path.join(ICI, 'cache', `electron-v${ELECTRON}-win32-x64.zip`);
const SHA_ZIP = '41a1ffa0541cb0f2c9b9fe920dd2cef1793ad0ea2ada1a9582958880f4d1b23c'; // SHASUMS256.txt officiel v44.9.3
const OUT = path.join(ICI, 'dist', 'win-unpacked');
const EXE = 'ERP Uniform Studio.exe';

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if (sha(ZIP) !== SHA_ZIP) throw new Error('Electron : empreinte du zip incorrecte');
fs.rmSync(path.join(ICI, 'dist'), { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
execFileSync('unzip', ['-q', ZIP, '-d', OUT]);
fs.renameSync(path.join(OUT, 'electron.exe'), path.join(OUT, EXE));
fs.rmSync(path.join(OUT, 'resources', 'default_app.asar'), { force: true });
// langues : français + anglais (repli) seulement
for (const f of fs.readdirSync(path.join(OUT, 'locales'))) if (!/^(fr|en-US)\.pak$/.test(f)) fs.rmSync(path.join(OUT, 'locales', f));

// application → resources/app.asar
const SRC = path.join(ICI, 'app');
const TMP = path.join(ICI, 'dist', 'app-src'); fs.mkdirSync(TMP, { recursive: true });
for (const f of ['package.json', 'main.js', 'preload.js', 'config.js', 'mise-a-jour.js', 'hors-ligne.html', 'icon.png']) fs.copyFileSync(path.join(SRC, f), path.join(TMP, f));
await asar.createPackage(TMP, path.join(OUT, 'resources', 'app.asar'));
fs.rmSync(TMP, { recursive: true });

// icône et informations de version de l'exe
const exeF = path.join(OUT, EXE);
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exeF));
const res = ResEdit.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(ICI, 'icon.ico')));
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, ico.icons.map((i) => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
const [a, b, c] = V.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  FileDescription: 'ERP UNIFORM STUDIO (pour DIGITAL-TEX S.A.)', ProductName: 'ERP Uniform Studio', CompanyName: 'DIGITAL-TEX S.A.',
  LegalCopyright: '© DIGITAL-TEX S.A.', OriginalFilename: EXE, InternalName: 'ERP Uniform Studio', FileVersion: V, ProductVersion: V,
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exeF, Buffer.from(exe.generate()));
console.log('exe prêt :', exeF, sha(exeF));

// installateur
execFileSync('makensis', ['-V2', `-DVERSION=${V}`, path.join(ICI, 'nsis', 'installer.nsi')], { stdio: 'inherit' });
const inst = path.join(ICI, 'dist', `ERP-Uniform-Studio-Setup-${V}.exe`);
const st = fs.statSync(inst);
const manifeste = { version: V, fichier: path.basename(inst), sha256: sha(inst), taille: st.size, notes: 'ERP UNIFORM STUDIO V1.0 — première version Windows.', date: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(path.join(ICI, 'dist', 'latest.json'), JSON.stringify(manifeste, null, 2));
console.log('INSTALLATEUR', JSON.stringify(manifeste));
