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
  // Remplacez cette valeur par votre adresse réelle.
  ADMIN_EMAIL: 'votre-adresse@gmail.com',

  // Notification lors de l'ouverture de la page client.
  NOTIFY_ON_OPEN: false,

  // Notification lorsqu'un fichier est téléchargé.
  NOTIFY_ON_DOWNLOAD: true
};

/**
 * Endpoint public JSONP.
 */
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
        result = recordEvent_(
          String(p.token || ''),
          String(p.type || ''),
          String(p.file || '')
        );
        break;

      case 'ping':
        result = {
          ok: true,
          service: 'EstimTransfert',
          time: new Date().toISOString()
        };
        break;

      default:
        result = {
          ok: false,
          message: 'Action inconnue.'
        };
    }
  } catch (err) {
    console.error(err);

    result = {
      ok: false,
      message: err && err.message
        ? err.message
        : 'Erreur serveur.'
    };
  }

  return ContentService
    .createTextOutput(
      callback + '(' + JSON.stringify(result) + ');'
    )
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}


/**
 * Création d'un transfert.
 */
function doPost(e) {
  try {
    const raw =
      e && e.parameter
        ? e.parameter.payload
        : '';

    if (!raw) {
      throw new Error('Payload manquant.');
    }

    const payload = JSON.parse(raw);

    if (payload.action !== 'create') {
      throw new Error('Action non autorisée.');
    }

    createTransfer_(payload);

    return HtmlService.createHtmlOutput(
      '<!doctype html><meta charset="utf-8"><p>OK</p>'
    );

  } catch (err) {
    console.error(err);

    return HtmlService.createHtmlOutput(
      '<!doctype html><meta charset="utf-8"><p>ERREUR : ' +
      escapeHtml_(
        err && err.message
          ? err.message
          : 'Erreur serveur.'
      ) +
      '</p>'
    );
  }
}


/**
 * Enregistre le transfert dans Google Sheets.
 */
function createTransfer_(t) {
  validateTransfer_(t);

  const ss = getStore_();

  const sheet = getOrCreateSheet_(
    ss,
    SETTINGS.SHEET_NAME,
    [
      'Token',
      'Créé le',
      'Expire le',
      'Destinataire',
      'Email',
      'Message',
      'URL transfert',
      'Folder ID',
      'Folder URL',
      'Fichiers JSON',
      'Statut'
    ]
  );

  // Évite les doublons.
  if (findTransferRow_(sheet, t.token)) {
    return;
  }

  sheet.appendRow([
    String(t.token),
    new Date(t.createdAt),
    new Date(t.expiresAt),
    String(t.recipientName || ''),
    String(t.recipientEmail || ''),
    String(t.message || ''),
    String(t.transferUrl || ''),
    String(t.folderId || ''),
    String(t.folderUrl || ''),
    JSON.stringify(
      normalizeFiles_(t.files)
    ),
    'ACTIF'
  ]);

  // Force l'écriture immédiate.
  SpreadsheetApp.flush();

  if (
    t.emailClient &&
    t.recipientEmail
  ) {
    sendClientEmail_(t);
  }
}


/**
 * Retourne les données publiques d'un transfert.
 */
function getTransfer_(token) {

  if (!isToken_(token)) {
    return {
      ok: false,
      message: 'Lien invalide.'
    };
  }

  const ss = getStore_();

  const sheet =
    ss.getSheetByName(
      SETTINGS.SHEET_NAME
    );

  if (!sheet) {
    return {
      ok: false,
      message: 'Transfert introuvable.'
    };
  }

  const row =
    findTransferRow_(
      sheet,
      token
    );

  if (!row) {
    return {
      ok: false,
      message: 'Transfert introuvable.'
    };
  }

  const createdAt =
    new Date(row[1]);

  const expiresAt =
    new Date(row[2]);

  const status =
    String(
      row[10] || 'ACTIF'
    )
      .trim()
      .toUpperCase();

  if (
    isNaN(createdAt.getTime()) ||
    isNaN(expiresAt.getTime())
  ) {
    return {
      ok: false,
      message:
        'Dates du transfert invalides.'
    };
  }

  if (
    status !== 'ACTIF' ||
    expiresAt.getTime() <= Date.now()
  ) {
    return {
      ok: false,
      message:
        'Ce transfert a expiré.'
    };
  }

  let files;

  try {
    files =
      parseFilesCell_(
        row[9]
      );

  } catch (err) {

    console.error(
      'Erreur lecture Fichiers JSON pour le transfert ' +
      token,
      err
    );

    return {
      ok: false,
      message:
        'Les fichiers du transfert sont présents dans le registre mais leur format est invalide.'
    };
  }

  return {
    ok: true,

    transfer: {
      token:
        String(row[0] || ''),

      createdAt:
        createdAt.toISOString(),

      expiresAt:
        expiresAt.toISOString(),

      recipientName:
        String(row[3] || ''),

      recipientEmail:
        String(row[4] || ''),

      message:
        String(row[5] || ''),

      transferUrl:
        String(row[6] || ''),

      folderId:
        String(row[7] || ''),

      folderUrl:
        String(row[8] || ''),

      files: files
    }
  };
}


/**
 * Enregistre une ouverture ou un téléchargement.
 */
function recordEvent_(
  token,
  type,
  fileKey
) {

  if (!isToken_(token)) {
    return {
      ok: false,
      message:
        'Token invalide.'
    };
  }

  if (
    ['open', 'download']
      .indexOf(type) === -1
  ) {
    return {
      ok: false,
      message:
        'Type d’événement invalide.'
    };
  }

  const result =
    getTransfer_(token);

  if (!result.ok) {
    return result;
  }

  const transfer =
    result.transfer;

  const downloadedFile =
    resolveDownloadedFile_(
      transfer.files,
      fileKey
    );

  const fileName =
    downloadedFile
      ? downloadedFile.name
      : (
          fileKey ||
          'Fichier non précisé'
        );

  const ss = getStore_();

  const events =
    getOrCreateSheet_(
      ss,
      SETTINGS.EVENTS_SHEET_NAME,
      [
        'Date',
        'Token',
        'Type',
        'Fichier'
      ]
    );

  events.appendRow([
    new Date(),
    token,
    type,
    fileName
  ]);

  SpreadsheetApp.flush();

  if (
    type === 'download' &&
    SETTINGS.NOTIFY_ON_DOWNLOAD &&
    SETTINGS.ADMIN_EMAIL
  ) {
    sendDownloadNotification_(
      transfer,
      fileName
    );
  }

  if (
    type === 'open' &&
    SETTINGS.NOTIFY_ON_OPEN &&
    SETTINGS.ADMIN_EMAIL
  ) {

    MailApp.sendEmail({
      to:
        SETTINGS.ADMIN_EMAIL,

      subject:
        'EstimTransfert — Transfert consulté',

      htmlBody:
        '<p>La page d’un transfert a été consultée.</p>' +

        '<p><strong>Transfert à :</strong> "' +

        escapeHtml_(
          transfer.recipientEmail ||
          'adresse non renseignée'
        ) +

        '"</p>'
    });
  }

  return {
    ok: true,
    fileName: fileName
  };
}


/**
 * Notification téléchargement.
 */
function sendDownloadNotification_(
  transfer,
  fileName
) {

  const recipientEmail =
    String(
      transfer &&
      transfer.recipientEmail
        ? transfer.recipientEmail
        : ''
    ).trim();

  const cleanFileName =
    String(
      fileName ||
      'Fichier'
    ).trim();

  MailApp.sendEmail({

    to:
      SETTINGS.ADMIN_EMAIL,

    subject:
      'Transfert "' +
      cleanFileName +
      '"',

    htmlBody:

      '<p>Un fichier de votre transfert a été téléchargé.</p>' +

      '<p>' +

      '<strong>Transfert à :</strong> "' +

      escapeHtml_(
        recipientEmail ||
        'adresse non renseignée'
      ) +

      '"<br>' +

      '<strong>Fichier :</strong> "' +

      escapeHtml_(
        cleanFileName
      ) +

      '"' +

      '</p>'
  });
}


/**
 * Envoi de l'e-mail au destinataire.
 */
function sendClientEmail_(t) {

  const name =
    String(
      t.recipientName || ''
    ).trim();

  const intro =
    name
      ? 'Bonjour ' +
        escapeHtml_(name) +
        ','
      : 'Bonjour,';

  const message =
    String(
      t.message || ''
    ).trim();

  const url =
    String(
      t.transferUrl || ''
    ).trim();

  const expiry =
    Utilities.formatDate(
      new Date(t.expiresAt),
      Session.getScriptTimeZone(),
      'dd/MM/yyyy'
    );

  MailApp.sendEmail({

    to:
      String(
        t.recipientEmail
      ),

    subject:
      buildClientEmailSubject_(
        t.files
      ),

    htmlBody:

      '<p>' +
      intro +
      '</p>' +

      (
        message
          ? '<p>' +
            escapeHtml_(message)
              .replace(
                /\n/g,
                '<br>'
              ) +
            '</p>'
          : ''
      ) +

      '<p>' +

      '<a href="' +
      escapeHtml_(url) +
      '" ' +

      'style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:bold">' +

      'Télécharger les fichiers' +

      '</a>' +

      '</p>' +

      '<p>Ce transfert est disponible jusqu\'au ' +
      expiry +
      '.</p>' +

      '<p>Estimprim</p>'
  });
}


/**
 * Objet de l'e-mail client.
 */
function buildClientEmailSubject_(files) {

  const list =
    Array.isArray(files)
      ? files
      : [];

  if (list.length === 1) {

    const fileName =
      String(
        list[0] &&
        list[0].name
          ? list[0].name
          : 'fichier'
      ).trim();

    return (
      'Estimprim vous a envoyé le fichier "' +
      fileName +
      '"'
    );
  }

  if (list.length > 1) {

    return (
      'Estimprim vous a envoyé ' +
      list.length +
      ' fichiers'
    );
  }

  return (
    'Estimprim vous a envoyé un fichier'
  );
}


/**
 * Lecture de la cellule Fichiers JSON.
 */
function parseFilesCell_(value) {

  let rawFiles = value;

  if (
    rawFiles === null ||
    rawFiles === undefined ||
    rawFiles === ''
  ) {
    return [];
  }

  if (
    typeof rawFiles === 'string'
  ) {

    const text =
      rawFiles.trim();

    if (!text) {
      return [];
    }

    rawFiles =
      JSON.parse(text);
  }

  if (
    !Array.isArray(rawFiles)
  ) {
    rawFiles = [rawFiles];
  }

  return normalizeFiles_(
    rawFiles
  );
}


/**
 * Normalise les fichiers.
 */
function normalizeFiles_(files) {

  const list =
    Array.isArray(files)
      ? files
      : [];

  return list

    .filter(function (f) {
      return (
        f &&
        typeof f === 'object'
      );
    })

    .map(function (f) {

      const id =
        String(
          f.id || ''
        ).trim();

      const name =
        String(
          f.name || ''
        ).trim() ||
        'Fichier';

      const size =
        Number(
          f.size || 0
        );

      const mimeType =
        String(
          f.mimeType ||
          'application/octet-stream'
        ).trim();

      let downloadUrl =
        String(
          f.downloadUrl || ''
        ).trim();

      if (
        !downloadUrl &&
        id
      ) {

        downloadUrl =
          'https://drive.google.com/uc?export=download&id=' +
          encodeURIComponent(id);
      }

      return {
        id: id,
        name: name,

        size:
          isFinite(size)
            ? size
            : 0,

        mimeType:
          mimeType,

        downloadUrl:
          downloadUrl
      };
    });
}


/**
 * Retrouve le fichier téléchargé.
 */
function resolveDownloadedFile_(
  files,
  fileKey
) {

  const list =
    Array.isArray(files)
      ? files
      : [];

  const key =
    String(
      fileKey || ''
    ).trim();

  if (!key) {
    return (
      list.length === 1
        ? list[0]
        : null
    );
  }

  for (
    let i = 0;
    i < list.length;
    i++
  ) {

    const f =
      list[i];

    if (
      String(f.id || '') === key ||
      String(f.name || '') === key ||
      String(f.downloadUrl || '') === key
    ) {
      return f;
    }
  }

  // Cas où l'ID Drive est contenu dans une URL.
  for (
    let i = 0;
    i < list.length;
    i++
  ) {

    const id =
      String(
        list[i].id || ''
      );

    if (
      id &&
      key.indexOf(id) !== -1
    ) {
      return list[i];
    }
  }

  return null;
}


/**
 * À exécuter une seule fois.
 */
function setupEstimTransfert() {

  const props =
    PropertiesService
      .getScriptProperties();

  let id =
    props.getProperty(
      'ESTIMTRANSFERT_SHEET_ID'
    );

  let ss;

  if (id) {

    ss =
      SpreadsheetApp.openById(
        id
      );

  } else {

    ss =
      SpreadsheetApp.create(
        'EstimTransfert - Registre'
      );

    props.setProperty(
      'ESTIMTRANSFERT_SHEET_ID',
      ss.getId()
    );
  }

  getOrCreateSheet_(
    ss,
    SETTINGS.SHEET_NAME,
    [
      'Token',
      'Créé le',
      'Expire le',
      'Destinataire',
      'Email',
      'Message',
      'URL transfert',
      'Folder ID',
      'Folder URL',
      'Fichiers JSON',
      'Statut'
    ]
  );

  getOrCreateSheet_(
    ss,
    SETTINGS.EVENTS_SHEET_NAME,
    [
      'Date',
      'Token',
      'Type',
      'Fichier'
    ]
  );

  SpreadsheetApp.flush();

  Logger.log(
    'Registre : ' +
    ss.getUrl()
  );
}


/**
 * Nettoyage automatique des transferts expirés.
 */
function cleanupExpiredTransfers() {

  const ss =
    getStore_();

  const sheet =
    ss.getSheetByName(
      SETTINGS.SHEET_NAME
    );

  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {
    return;
  }

  const values =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        11
      )
      .getValues();

  const now =
    Date.now();

  values.forEach(
    function (row, idx) {

      const expires =
        new Date(
          row[2]
        ).getTime();

      const folderId =
        String(
          row[7] || ''
        );

      const status =
        String(
          row[10] || 'ACTIF'
        )
          .trim()
          .toUpperCase();

      if (
        status === 'ACTIF' &&
        expires <= now
      ) {

        if (folderId) {

          try {

            DriveApp
              .getFolderById(
                folderId
              )
              .setTrashed(true);

          } catch (err) {

            console.error(
              'Impossible de supprimer le dossier ' +
              folderId,
              err
            );
          }
        }

        sheet
          .getRange(
            idx + 2,
            11
          )
          .setValue(
            'EXPIRÉ'
          );
      }
    }
  );

  SpreadsheetApp.flush();
}


/**
 * Récupère le classeur.
 */
function getStore_() {

  const id =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'ESTIMTRANSFERT_SHEET_ID'
      );

  if (!id) {

    throw new Error(
      'Exécutez setupEstimTransfert() une première fois.'
    );
  }

  return (
    SpreadsheetApp.openById(
      id
    )
  );
}


/**
 * Crée une feuille si nécessaire.
 */
function getOrCreateSheet_(
  ss,
  name,
  headers
) {

  let sheet =
    ss.getSheetByName(
      name
    );

  if (!sheet) {
    sheet =
      ss.insertSheet(name);
  }

  if (
    sheet.getLastRow() === 0
  ) {

    sheet.appendRow(
      headers
    );

    sheet.setFrozenRows(
      1
    );
  }

  return sheet;
}


/**
 * Recherche d'un transfert.
 */
function findTransferRow_(
  sheet,
  token
) {

  if (
    sheet.getLastRow() < 2
  ) {
    return null;
  }

  const finder =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        1
      )
      .createTextFinder(
        String(token)
      )
      .matchEntireCell(true)
      .findNext();

  if (!finder) {
    return null;
  }

  return (
    sheet
      .getRange(
        finder.getRow(),
        1,
        1,
        11
      )
      .getValues()[0]
  );
}


/**
 * Validation du transfert.
 */
function validateTransfer_(t) {

  if (
    !t ||
    !isToken_(
      String(t.token || '')
    )
  ) {
    throw new Error(
      'Token invalide.'
    );
  }

  if (
    !t.createdAt ||
    isNaN(
      new Date(
        t.createdAt
      ).getTime()
    )
  ) {
    throw new Error(
      'Date de création invalide.'
    );
  }

  if (
    !t.expiresAt ||
    isNaN(
      new Date(
        t.expiresAt
      ).getTime()
    )
  ) {
    throw new Error(
      'Expiration invalide.'
    );
  }

  if (
    !Array.isArray(
      t.files
    ) ||
    !t.files.length
  ) {
    throw new Error(
      'Aucun fichier.'
    );
  }

  if (
    !String(
      t.folderId || ''
    ).trim()
  ) {
    throw new Error(
      'Dossier manquant.'
    );
  }
}


/**
 * Validation du token.
 */
function isToken_(token) {

  return (
    /^[a-f0-9]{36}$/i
      .test(
        String(
          token || ''
        )
      )
  );
}


/**
 * Sécurise le callback JSONP.
 */
function safeCallback_(name) {

  return (
    /^[A-Za-z_$][0-9A-Za-z_$\.]*$/
      .test(
        String(
          name || ''
        )
      )
      ? String(name)
      : 'callback'
  );
}


/**
 * Échappement HTML.
 */
function escapeHtml_(s) {

  return String(
    s || ''
  )
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );
}
