/**
 * EstimTransfert V1 — Backend Google Apps Script
 *
 * Rôle :
 * - registre des transferts dans Google Sheets ;
 * - endpoint JSONP public pour la page client GitHub Pages ;
 * - e-mail optionnel au destinataire ;
 * - notification de téléchargement ;
 * - suppression automatique des dossiers expirés.
 *
 * IMPORTANT : les gros fichiers ne transitent PAS par Apps Script.
 * L'envoi se fait directement du navigateur de l'administrateur vers Google Drive API.
 */

const SETTINGS = {
  SHEET_NAME: 'Transferts',
  EVENTS_SHEET_NAME: 'Événements',
  // Adresse qui reçoit les notifications de téléchargement.
  ADMIN_EMAIL: 'votre-adresse@gmail.com',
  // Facultatif. Laissez vide pour ne pas recevoir de notification d'ouverture.
  NOTIFY_ON_OPEN: false,
  // Notification de téléchargement.
  NOTIFY_ON_DOWNLOAD: true
};

function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  const callback = safeCallback_(p.callback || 'callback');
  let result;

  try {
    switch (String(p.action || '')) {
      case 'get':
        result = getTransfer_(String(p.token || ''));
        break;
      case 'event':
        result = recordEvent_(String(p.token || ''), String(p.type || ''), String(p.file || ''));
        break;
      case 'ping':
        result = { ok: true, service: 'EstimTransfert', time: new Date().toISOString() };
        break;
      default:
        result = { ok: false, message: 'Action inconnue.' };
    }
  } catch (err) {
    result = { ok: false, message: err.message || 'Erreur serveur.' };
  }

  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(result) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  try {
    const raw = e && e.parameter ? e.parameter.payload : '';
    if (!raw) throw new Error('Payload manquant.');
    const payload = JSON.parse(raw);
    if (payload.action !== 'create') throw new Error('Action non autorisée.');
    createTransfer_(payload);
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>OK</p>');
  } catch (err) {
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>ERREUR</p>');
  }
}

function createTransfer_(t) {
  validateTransfer_(t);
  const ss = getStore_();
  const sheet = getOrCreateSheet_(ss, SETTINGS.SHEET_NAME, [
    'Token', 'Créé le', 'Expire le', 'Destinataire', 'Email', 'Message',
    'URL transfert', 'Folder ID', 'Folder URL', 'Fichiers JSON', 'Statut'
  ]);

  // Évite les doublons si le navigateur renvoie le POST.
  if (findTransferRow_(sheet, t.token)) return;

  sheet.appendRow([
    t.token,
    new Date(t.createdAt),
    new Date(t.expiresAt),
    String(t.recipientName || ''),
    String(t.recipientEmail || ''),
    String(t.message || ''),
    String(t.transferUrl || ''),
    String(t.folderId || ''),
    String(t.folderUrl || ''),
    JSON.stringify(t.files || []),
    'ACTIF'
  ]);

  if (t.emailClient && t.recipientEmail) {
    sendClientEmail_(t);
  }
}

function getTransfer_(token) {
  if (!isToken_(token)) return { ok: false, message: 'Lien invalide.' };
  const ss = getStore_();
  const sheet = ss.getSheetByName(SETTINGS.SHEET_NAME);
  if (!sheet) return { ok: false, message: 'Transfert introuvable.' };
  const row = findTransferRow_(sheet, token);
  if (!row) return { ok: false, message: 'Transfert introuvable.' };

  const createdAt = new Date(row[1]);
  const expiresAt = new Date(row[2]);
  const status = String(row[10] || 'ACTIF');
  if (status !== 'ACTIF' || expiresAt.getTime() <= Date.now()) {
    return { ok: false, message: 'Ce transfert a expiré.' };
  }

  let files = [];
  try { files = JSON.parse(String(row[9] || '[]')); } catch (_) {}

  return {
    ok: true,
    transfer: {
      token: String(row[0]),
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      recipientName: String(row[3] || ''),
      message: String(row[5] || ''),
      files: files.map(f => ({
        id: String(f.id || ''),
        name: String(f.name || ''),
        size: Number(f.size || 0),
        mimeType: String(f.mimeType || ''),
        downloadUrl: String(f.downloadUrl || '')
      }))
    }
  };
}

function recordEvent_(token, type, fileKey) {
  if (!isToken_(token)) return { ok: false };
  if (['open', 'download'].indexOf(type) === -1) return { ok: false };

  const result = getTransfer_(token);
  if (!result.ok) return result;

  const ss = getStore_();
  const events = getOrCreateSheet_(ss, SETTINGS.EVENTS_SHEET_NAME, [
    'Date', 'Token', 'Type', 'Fichier'
  ]);
  events.appendRow([new Date(), token, type, fileKey || '']);

  if (type === 'download' && SETTINGS.NOTIFY_ON_DOWNLOAD && SETTINGS.ADMIN_EMAIL) {
    MailApp.sendEmail({
      to: SETTINGS.ADMIN_EMAIL,
      subject: 'EstimTransfert — Fichier téléchargé',
      htmlBody: '<p>Un fichier de votre transfert a été téléchargé.</p>' +
        '<p><strong>Transfert :</strong> ' + escapeHtml_(token) + '<br>' +
        '<strong>Fichier :</strong> ' + escapeHtml_(fileKey || 'non précisé') + '</p>'
    });
  }

  if (type === 'open' && SETTINGS.NOTIFY_ON_OPEN && SETTINGS.ADMIN_EMAIL) {
    MailApp.sendEmail({
      to: SETTINGS.ADMIN_EMAIL,
      subject: 'EstimTransfert — Transfert consulté',
      htmlBody: '<p>La page du transfert <strong>' + escapeHtml_(token) + '</strong> a été consultée.</p>'
    });
  }

  return { ok: true };
}

function sendClientEmail_(t) {
  const name = String(t.recipientName || '').trim();
  const intro = name ? 'Bonjour ' + escapeHtml_(name) + ',' : 'Bonjour,';
  const message = String(t.message || '').trim();
  const url = String(t.transferUrl || '');
  const expiry = Utilities.formatDate(new Date(t.expiresAt), Session.getScriptTimeZone(), 'dd/MM/yyyy');

  MailApp.sendEmail({
    to: String(t.recipientEmail),
    subject: 'Estimprim vous a envoyé des fichiers',
    htmlBody:
      '<p>' + intro + '</p>' +
      (message ? '<p>' + escapeHtml_(message).replace(/\n/g, '<br>') + '</p>' : '') +
      '<p><a href="' + escapeHtml_(url) + '" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:bold">Télécharger les fichiers</a></p>' +
      '<p>Ce transfert est disponible jusqu\'au ' + expiry + '.</p>' +
      '<p>Estimprim</p>'
  });
}

/**
 * À exécuter une seule fois depuis l'éditeur Apps Script.
 * Crée le Google Sheet de stockage et mémorise son ID.
 */
function setupEstimTransfert() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('ESTIMTRANSFERT_SHEET_ID');
  let ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('EstimTransfert - Registre');
    props.setProperty('ESTIMTRANSFERT_SHEET_ID', ss.getId());
  }
  getOrCreateSheet_(ss, SETTINGS.SHEET_NAME, [
    'Token', 'Créé le', 'Expire le', 'Destinataire', 'Email', 'Message',
    'URL transfert', 'Folder ID', 'Folder URL', 'Fichiers JSON', 'Statut'
  ]);
  getOrCreateSheet_(ss, SETTINGS.EVENTS_SHEET_NAME, ['Date', 'Token', 'Type', 'Fichier']);
  Logger.log('Registre : ' + ss.getUrl());
}

/**
 * À planifier avec un déclencheur quotidien Apps Script.
 * Met à la corbeille les dossiers Drive expirés et marque le transfert EXPIRÉ.
 */
function cleanupExpiredTransfers() {
  const ss = getStore_();
  const sheet = ss.getSheetByName(SETTINGS.SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  const now = Date.now();

  values.forEach((row, idx) => {
    const expires = new Date(row[2]).getTime();
    const folderId = String(row[7] || '');
    const status = String(row[10] || 'ACTIF');
    if (status === 'ACTIF' && expires <= now) {
      if (folderId) {
        try { DriveApp.getFolderById(folderId).setTrashed(true); } catch (_) {}
      }
      sheet.getRange(idx + 2, 11).setValue('EXPIRÉ');
    }
  });
}

function getStore_() {
  const id = PropertiesService.getScriptProperties().getProperty('ESTIMTRANSFERT_SHEET_ID');
  if (!id) throw new Error('Exécutez setupEstimTransfert() une première fois.');
  return SpreadsheetApp.openById(id);
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findTransferRow_(sheet, token) {
  if (sheet.getLastRow() < 2) return null;
  const finder = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(token)
    .matchEntireCell(true)
    .findNext();
  if (!finder) return null;
  return sheet.getRange(finder.getRow(), 1, 1, 11).getValues()[0];
}

function validateTransfer_(t) {
  if (!t || !isToken_(String(t.token || ''))) throw new Error('Token invalide.');
  if (!t.expiresAt || isNaN(new Date(t.expiresAt).getTime())) throw new Error('Expiration invalide.');
  if (!Array.isArray(t.files) || !t.files.length) throw new Error('Aucun fichier.');
  if (!String(t.folderId || '')) throw new Error('Dossier manquant.');
}

function isToken_(token) {
  return /^[a-f0-9]{36}$/.test(String(token || ''));
}

function safeCallback_(name) {
  return /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(name) ? name : 'callback';
}

function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
