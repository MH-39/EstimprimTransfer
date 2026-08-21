# EstimTransfert V1

Mini plateforme personnelle de transfert de fichiers :

- **site** : GitHub Pages ;
- **espace d'envoi** : réservé à une seule adresse Google ;
- **stockage** : Google Drive ;
- **registre des transferts** : Google Sheets ;
- **petit backend** : Google Apps Script ;
- **réception client** : page web publique très simple ;
- **lien généré** : affiché après l'envoi avec bouton **COPIER**.

Le design est volontairement minimaliste et immersif, dans l'esprit des plateformes modernes de transfert, avec l'identité graphique Estimprim.

---

## 1. Ce que fait la V1

### Pour vous

1. Ouvrez la page d'envoi GitHub Pages.
2. Connectez-vous avec **votre compte Google autorisé**.
3. Glissez un ou plusieurs fichiers.
4. Indiquez éventuellement le nom et l'e-mail du destinataire.
5. Choisissez 1, 7, 15 ou 30 jours.
6. Cliquez sur **CRÉER LE TRANSFERT**.
7. Les fichiers partent **directement du navigateur vers Google Drive**, avec upload résumable par morceaux.
8. La plateforme génère une URL du type :
   `https://transfert.votredomaine.fr/transfer/?id=...`
9. Cliquez sur **COPIER** et collez le lien dans votre e-mail ou message.

### Pour le client

Le client ouvre uniquement la page de réception. Il voit :

- le logo Estimprim ;
- le message éventuel ;
- la liste des fichiers ;
- la taille totale ;
- la date d'expiration ;
- un bouton **TÉLÉCHARGER LES FICHIERS** ;
- un bouton individuel par fichier.

Aucun compte Google n'est demandé au client.

---

# 2. Structure du dossier GitHub

```text
estimtransfert-v1/
├── index.html                  # votre page d'envoi
├── transfer/
│   └── index.html              # page de téléchargement client
├── assets/
│   ├── css/
│   │   └── style.css
│   ├── img/
│   │   └── logo-estimprim.png
│   └── js/
│       ├── config.js           # À PERSONNALISER
│       ├── admin.js
│       └── transfer.js
├── apps-script/
│   ├── Code.gs                 # backend Google Apps Script
│   └── appsscript.json
├── .nojekyll
└── README.md
```

---

# 3. Étape A — Google Cloud / OAuth

Cette étape sert uniquement à autoriser **votre navigateur** à envoyer directement les fichiers dans **votre Google Drive**.

## 3.1 Créer ou sélectionner un projet Google Cloud

Ouvrez Google Cloud Console et créez un projet, par exemple :

`EstimTransfert`

## 3.2 Activer Google Drive API

Dans **APIs & Services > Library**, activez :

`Google Drive API`

## 3.3 Configurer l'écran de consentement OAuth

Créez l'écran de consentement OAuth.

Pour une utilisation personnelle, vous pouvez laisser l'application en **mode Test** et ajouter votre propre adresse Google dans les **utilisateurs de test**.

Scopes utilisés par la page d'envoi :

- `drive.file`
- `userinfo.email`

`drive.file` donne à l'application accès aux fichiers qu'elle crée elle-même ; elle n'obtient pas un accès général à tout votre Drive.

## 3.4 Créer un identifiant OAuth

Créez :

**OAuth client ID > Web application**

Ajoutez dans **Authorized JavaScript origins** :

### Si vous utilisez uniquement GitHub Pages

```text
https://VOTRE-COMPTE.github.io
```

### Si vous utilisez un sous-domaine personnalisé

```text
https://transfert.votredomaine.fr
```

Copiez le **Client ID** obtenu.

---

# 4. Étape B — Google Apps Script

## 4.1 Créer le projet

Allez sur Google Apps Script et créez un nouveau projet :

`EstimTransfert Backend`

Copiez le contenu de :

`apps-script/Code.gs`

à la place de `Code.gs`.

Si vous souhaitez utiliser le manifeste fourni, activez l'affichage du fichier manifeste et reprenez `apps-script/appsscript.json`.

## 4.2 Personnaliser l'adresse administrateur

Dans `Code.gs` :

```javascript
ADMIN_EMAIL: 'votre-adresse@gmail.com'
```

mettez votre adresse.

## 4.3 Initialiser le registre

Dans l'éditeur Apps Script, choisissez la fonction :

```javascript
setupEstimTransfert
```

puis cliquez sur **Exécuter**.

Google vous demandera les autorisations nécessaires.

La fonction crée automatiquement un Google Sheet :

`EstimTransfert - Registre`

avec deux onglets :

- `Transferts`
- `Événements`

## 4.4 Déployer en application Web

Dans Apps Script :

**Déployer > Nouveau déploiement > Application Web**

Réglages :

- **Exécuter en tant que** : Moi
- **Qui a accès** : Toute personne

Cette ouverture est nécessaire pour que la page de réception du client puisse interroger le registre sans compte Google.

Copiez l'URL terminant par `/exec`.

Exemple :

```text
https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxx/exec
```

---

# 5. Étape C — config.js

Ouvrez :

`assets/js/config.js`

et renseignez les 4 valeurs suivantes.

## ADMIN_EMAIL

```javascript
ADMIN_EMAIL: 'votre-adresse@gmail.com'
```

Cette adresse est comparée à l'adresse du compte connecté. Une autre adresse ne peut pas utiliser la page d'envoi.

## GOOGLE_CLIENT_ID

```javascript
GOOGLE_CLIENT_ID: '123456789-xxxx.apps.googleusercontent.com'
```

## APPS_SCRIPT_URL

```javascript
APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycb.../exec'
```

## PUBLIC_BASE_URL

### Avec GitHub Pages

```javascript
PUBLIC_BASE_URL: 'https://VOTRE-COMPTE.github.io/estimtransfert'
```

### Avec un domaine personnalisé

```javascript
PUBLIC_BASE_URL: 'https://transfert.votredomaine.fr'
```

Ne mettez **pas de slash à la fin**.

---

# 6. Étape D — Mettre le site sur GitHub Pages

Créez un dépôt GitHub, par exemple :

`estimtransfert`

Déposez **le contenu** de ce dossier à la racine du dépôt.

Dans GitHub :

**Settings > Pages**

Puis :

- Source : **Deploy from a branch**
- Branch : `main`
- Folder : `/ (root)`

Après publication, GitHub vous donnera l'adresse du site.

Mettez cette adresse dans `PUBLIC_BASE_URL` si ce n'est pas déjà fait.

---

# 7. Utiliser un sous-domaine personnalisé

Vous pourrez par exemple utiliser :

```text
transfert.votredomaine.fr
```

Dans GitHub Pages, utilisez **Custom domain**, puis créez le CNAME demandé chez votre gestionnaire DNS.

Une fois le domaine actif :

1. ajoutez aussi `https://transfert.votredomaine.fr` aux **Authorized JavaScript origins** du client OAuth Google ;
2. changez `PUBLIC_BASE_URL` dans `config.js` ;
3. republiez le fichier.

---

# 8. Google Drive

Lors de votre première connexion, EstimTransfert crée automatiquement dans votre Drive :

```text
ESTIMTRANSFERT/
├── 2026-08-21_ab12cd34_Client-A/
│   ├── Catalogue.pdf
│   └── Images.zip
└── ...
```

Chaque dossier de transfert est partagé en lecture avec **toute personne disposant du lien** pour permettre au client de télécharger les fichiers sans compte Google.

La page client n'affiche cependant pas le contenu de votre Drive : elle ne connaît que les fichiers correspondant à son token de transfert.

---

# 9. Expiration et suppression automatique

L'expiration est déjà vérifiée par la page client.

Pour supprimer physiquement les dossiers expirés :

1. Dans Apps Script, ouvrez **Déclencheurs**.
2. Ajoutez un déclencheur sur :

```javascript
cleanupExpiredTransfers
```

3. Type : **Déclenché par le temps**.
4. Choisissez **Une fois par jour**.

Les dossiers expirés seront alors mis à la corbeille de votre Google Drive.

---

# 10. Notification de téléchargement

Par défaut, `Code.gs` contient :

```javascript
NOTIFY_ON_DOWNLOAD: true
```

Vous recevez donc un e-mail lorsqu'un bouton de téléchargement est utilisé.

Pour désactiver :

```javascript
NOTIFY_ON_DOWNLOAD: false
```

La notification d'ouverture de la page est désactivée par défaut :

```javascript
NOTIFY_ON_OPEN: false
```

---

# 11. Gros fichiers

La V1 **n'envoie pas le fichier dans Google Apps Script**.

Elle utilise l'API Google Drive en **upload résumable par morceaux de 8 Mio** :

```text
Navigateur → Google Drive
```

et non :

```text
Navigateur → Apps Script → Google Drive
```

C'est important pour les fichiers d'impression volumineux.

La limite d'interface est actuellement configurée à :

```javascript
MAX_FILE_SIZE_GB: 20
```

Vous pouvez modifier cette valeur dans `config.js`. Les limites réelles restent celles de votre compte Google Drive, du navigateur et des quotas Google.

Si la connexion est coupée, l'upload Drive est techniquement résumable, mais la V1 ne mémorise pas encore une session interrompue après fermeture ou rechargement de la page. Cela pourra être ajouté dans une V2.

---

# 12. Important — sécurité

- La page GitHub est publique, mais **l'envoi vers Drive nécessite votre connexion Google**.
- `ADMIN_EMAIL` bloque les autres comptes Google dans l'interface.
- Le secret Google n'est jamais stocké dans GitHub : le `Client ID` OAuth est public par conception.
- Les tokens de transfert sont générés aléatoirement avec 144 bits d'entropie.
- Ne mettez **aucun mot de passe Google**, clé privée ou client secret OAuth dans GitHub.
- Les fichiers d'un transfert sont accessibles à toute personne qui obtient le lien de téléchargement correspondant jusqu'à suppression/expiration. Ne l'utilisez pas pour des données nécessitant un contrôle d'accès fort sans ajouter une protection supplémentaire.

---

# 13. Test rapide après installation

1. Ouvrez la page d'envoi.
2. Connectez-vous avec votre adresse Google autorisée.
3. Déposez un petit PDF de test.
4. Cliquez sur **CRÉER LE TRANSFERT**.
5. Vérifiez que le lien apparaît.
6. Cliquez sur **COPIER**.
7. Ouvrez une fenêtre privée de votre navigateur.
8. Collez le lien.
9. Vérifiez que la page client affiche le fichier et que le téléchargement fonctionne sans connexion Google.

---

## V1 livrée

Cette V1 comprend déjà :

- interface responsive Estimprim ;
- glisser-déposer multi-fichiers ;
- authentification Google de l'expéditeur ;
- contrôle d'adresse administrateur ;
- upload Drive résumable ;
- dossier Drive automatique par transfert ;
- expiration 1 / 7 / 15 / 30 jours ;
- registre Google Sheets ;
- page de téléchargement client ;
- téléchargement fichier par fichier ;
- bouton global ;
- lien généré ;
- bouton **COPIER** ;
- envoi facultatif du lien par e-mail ;
- notification de téléchargement ;
- nettoyage automatique des dossiers expirés.
