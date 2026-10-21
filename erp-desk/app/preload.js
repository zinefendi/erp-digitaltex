'use strict';
// Pont minimal : la page de l'ERP sait qu'elle tourne dans l'application Windows (et laquelle).
// Aucun accès au disque ni à Node n'est exposé.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('erpPoste', {
  application: 'ERP Uniform Studio',
  version: ipcRenderer.sendSync('erp:version'),
  plateforme: process.platform,
  reessayer: () => ipcRenderer.send('erp:reessayer'),
  verifierMiseAJour: () => ipcRenderer.send('erp:maj-verifier'),
});
