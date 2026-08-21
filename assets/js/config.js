// ============================================================
// ESTIMTRANSFERT — CONFIGURATION À PERSONNALISER
// ============================================================
window.ESTIM_CONFIG = {
  // E-mail Google autorisé à utiliser la page d'envoi.
  // IMPORTANT : remplacez cette valeur par votre adresse Google.
  ADMIN_EMAIL: 'votre-adresse@gmail.com',

  // Client OAuth 2.0 "Application Web" créé dans Google Cloud Console.
  // Exemple : 123456789-xxxx.apps.googleusercontent.com
  GOOGLE_CLIENT_ID: 'VOTRE_CLIENT_ID_GOOGLE.apps.googleusercontent.com',

  // URL de votre application Web Google Apps Script déployée.
  // Exemple : https://script.google.com/macros/s/AKfycb.../exec
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/VOTRE_DEPLOIEMENT/exec',

  // Adresse publique de votre site GitHub Pages / domaine personnalisé.
  // PAS de slash final.
  // Exemple GitHub : https://votrecompte.github.io/estimtransfert
  // Exemple domaine : https://transfert.estimprim.fr
  PUBLIC_BASE_URL: 'https://votrecompte.github.io/estimtransfert',

  // Nom du dossier racine créé automatiquement dans votre Google Drive.
  DRIVE_ROOT_FOLDER_NAME: 'ESTIMTRANSFERT',

  // Durée par défaut proposée dans l'interface.
  DEFAULT_EXPIRY_DAYS: 7,

  // Taille maximale purement UI. Google Drive peut accepter bien plus.
  // La V1 envoie directement vers Drive via upload résumable.
  MAX_FILE_SIZE_GB: 20
};
