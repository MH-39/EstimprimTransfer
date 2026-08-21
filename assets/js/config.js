// ============================================================
// ESTIMTRANSFERT — CONFIGURATION À PERSONNALISER
// ============================================================
window.ESTIM_CONFIG = {
  // E-mail Google autorisé à utiliser la page d'envoi.
  // IMPORTANT : remplacez cette valeur par votre adresse Google.
  ADMIN_EMAIL: 'mickael.houriez@estimprim.fr',

  // Client OAuth 2.0 "Application Web" créé dans Google Cloud Console.
  // Exemple : 123456789-xxxx.apps.googleusercontent.com
  GOOGLE_CLIENT_ID: '526246755192-sqo5uqfclqsjr3ei4teptklo3116vhj4.apps.googleusercontent.com',

  // URL de votre application Web Google Apps Script déployée.
  // Exemple : https://script.google.com/macros/s/AKfycb.../exec
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzlt61PcxT9yE61CW0z7lFVHiu7gF0tbQwygKkUNULD9kGy4GfQ6UumZohhPVuvFfaS/exec',

  // Adresse publique de votre site GitHub Pages / domaine personnalisé.
  // PAS de slash final.
  // Exemple GitHub : https://votrecompte.github.io/estimtransfert
  // Exemple domaine : https://transfert.estimprim.fr
  PUBLIC_BASE_URL: 'https://github.com/MH-39/transfert-estimprim.git',

  // Nom du dossier racine créé automatiquement dans votre Google Drive.
  DRIVE_ROOT_FOLDER_NAME: 'ESTIMPRIM TRANSFERT',

  // Durée par défaut proposée dans l'interface.
  DEFAULT_EXPIRY_DAYS: 7,

  // Taille maximale purement UI. Google Drive peut accepter bien plus.
  // La V1 envoie directement vers Drive via upload résumable.
  MAX_FILE_SIZE_GB: 20
};
