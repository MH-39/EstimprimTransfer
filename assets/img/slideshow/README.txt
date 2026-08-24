ESTIMTRANSFERT — PHOTOS DU DIAPORAMA

1. Déposez vos photos JPG / JPEG / PNG / WEBP dans ce dossier.
2. Ouvrez assets/js/transfer.js.
3. Dans la constante SLIDESHOW_PHOTOS, ajoutez les noms des fichiers, par exemple :

const SLIDESHOW_PHOTOS = [
  'atelier-01.jpg',
  'presse-offset.jpg',
  'faconage.jpg'
];

Les photos sont mélangées aléatoirement à chaque chargement de la page client,
puis changent automatiquement toutes les 5,2 secondes.
