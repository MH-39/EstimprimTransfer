(() => {
  'use strict';

  const C = window.ESTIM_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const token = params.get('id');
  let transfer = null;

  /*
   * GALERIE PHOTOS
   * Ajoutez vos photos dans : assets/img/slideshow/
   * puis inscrivez simplement leurs noms ci-dessous.
   * Exemple : 'atelier-01.jpg', 'offset-xl.jpg', 'finition.jpg'
   */
  const SLIDESHOW_PHOTOS = [
    //'490284490_1210058121123539_7212564635273295740_n.jpg',
    //'487320947_1200779785384706_6430073320876924404_n.jpg',
    //'487827807_1198607225601962_7083852209065370242_n.jpg',
    //'486616311_1197701002359251_7907232365323934613_n.jpg',
    //'493153602_1227443599384991_3476029885905123400_n.jpg',
    //'482359928_1183613547101330_5835285409625085282_n.jpg',
    //'476886992_9818853528151798_7740103691228781286_n.jpg',
    //'486955637_1197117682417583_7578840066891000458_n.jpg',
    //'494183660_1228163219313029_7290334784527927853_n.jpg',
    //'495211068_1236273925168625_7401350350301709400_n.jpg',
    //'490346411_1212117794250905_3942573189948830419_n.jpg',
    //'473174644_1117451139759220_3743156846620643893_n.jpg',
    //'489817902_1209515494511135_6960883644503999787_n.jpg',
    //'1782642603850.jpeg',
    //'1756732476811.jpeg',
    //'1762945013750.jpeg'
  ];

  let slideshowTimer = null;
  let slideshowOrder = [];
  let slideshowIndex = 0;

  startSlideshow();

  if (!token) {
    showError('Le lien de transfert est incomplet.');
    return;
  }

  loadTransfer();

  async function loadTransfer() {
    try {
      const data = await jsonp(C.APPS_SCRIPT_URL, { action: 'get', token });
      if (!data || !data.ok) {
        showError(data?.message || 'Ce transfert est introuvable ou n’est plus disponible.');
        return;
      }
      transfer = data.transfer;
      if (!transfer || !Array.isArray(transfer.files)) {
        showError('Les informations du transfert sont incomplètes.');
        return;
      }
      if (new Date(transfer.expiresAt).getTime() <= Date.now()) {
        showError('Ce transfert a expiré.');
        return;
      }
      renderTransfer();
      notifyOpen();
    } catch (err) {
      console.error(err);
      showError('Impossible de charger ce transfert pour le moment.');
    }
  }

  function renderTransfer() {
    $('loading').hidden = true;
    $('transferContent').hidden = false;

    const name = String(transfer.recipientName || '').trim();
    $('senderText').textContent = name
      ? `${name}, Estimprim vous a envoyé des fichiers.`
      : 'Estimprim vous a envoyé des fichiers.';

    const total = transfer.files.reduce((sum, f) => sum + Number(f.size || 0), 0);
    $('summary').textContent = `${transfer.files.length} fichier${transfer.files.length > 1 ? 's' : ''} · ${formatBytes(total)}`;

    if (transfer.message) {
      $('messageBox').hidden = false;
      $('messageBox').textContent = transfer.message;
    }

    const list = $('clientFileList');
    list.innerHTML = '';
    transfer.files.forEach((file, index) => {
      const row = document.createElement('div');
      row.className = 'client-file-row';
      row.innerHTML = `
        <div class="file-icon">${fileBadge(file.name)}</div>
        <div class="file-meta">
          <div class="file-name"></div>
          <div class="file-size">${formatBytes(file.size)}</div>
        </div>
        <button type="button" class="download-one">Télécharger</button>`;
      row.querySelector('.file-name').textContent = file.name || `Fichier ${index + 1}`;
      row.querySelector('.download-one').addEventListener('click', () => downloadFile(file));
      list.appendChild(row);
    });

    $('downloadAllBtn').addEventListener('click', downloadAll);
    const expiry = new Date(transfer.expiresAt);
    $('expiryNote').innerHTML = `Disponible jusqu’au <strong>${formatDate(expiry)}</strong><br>Les fichiers seront supprimés automatiquement après cette date.`;
  }

  function downloadFile(file) {
    showDownloadProgress(12, `Ouverture de ${file.name || 'votre fichier'}…`);
    notifyDownload(file.id || file.name);

    const a = document.createElement('a');
    a.href = file.downloadUrl || `https://drive.google.com/uc?export=download&id=${encodeURIComponent(file.id)}`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();

    // Google Drive effectue le téléchargement hors de cette page :
    // la barre indique donc l'ouverture/lancement du téléchargement.
    setTimeout(() => showDownloadProgress(68, 'Téléchargement lancé…'), 180);
    setTimeout(() => showDownloadProgress(100, 'Téléchargement ouvert'), 520);
    setTimeout(hideDownloadProgress, 1900);
  }

  async function downloadAll() {
    const btn = $('downloadAllBtn');
    btn.disabled = true;
    btn.textContent = 'OUVERTURE DES TÉLÉCHARGEMENTS…';

    const totalFiles = Math.max(1, transfer.files.length);
    showDownloadProgress(4, 'Préparation des téléchargements…');

    for (let i = 0; i < transfer.files.length; i++) {
      const file = transfer.files[i];
      notifyDownload(file.id || file.name);

      const a = document.createElement('a');
      a.href = file.downloadUrl || `https://drive.google.com/uc?export=download&id=${encodeURIComponent(file.id)}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();

      const percent = Math.round(((i + 1) / totalFiles) * 100);
      showDownloadProgress(percent, `Ouverture ${i + 1}/${totalFiles} · ${file.name || 'fichier'}`);
      await sleep(450);
    }

    showDownloadProgress(100, 'Tous les téléchargements ont été lancés');

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'TÉLÉCHARGER LES FICHIERS';
      hideDownloadProgress();
    }, 1800);
  }

  function showDownloadProgress(percent, label) {
    const box = $('downloadProgress');
    const fill = $('downloadProgressFill');
    const pct = $('downloadProgressPercent');
    const text = $('downloadProgressLabel');
    const value = Math.max(0, Math.min(100, Number(percent || 0)));

    box.hidden = false;
    fill.style.width = `${value}%`;
    pct.textContent = `${Math.round(value)} %`;
    text.textContent = label || 'Téléchargement…';
  }

  function hideDownloadProgress() {
    const box = $('downloadProgress');
    if (!box) return;
    setTimeout(() => {
      box.hidden = true;
      $('downloadProgressFill').style.width = '0%';
      $('downloadProgressPercent').textContent = '0 %';
    }, 250);
  }

  function startSlideshow() {
    const image = $('slideshowImage');
    const placeholder = $('slideshowPlaceholder');
    if (!image || !placeholder || !SLIDESHOW_PHOTOS.length) return;

    slideshowOrder = shuffle([...SLIDESHOW_PHOTOS]);
    slideshowIndex = Math.floor(Math.random() * slideshowOrder.length);

    image.addEventListener('error', () => {
      image.hidden = true;
      placeholder.hidden = false;
    });

    showSlide(slideshowOrder[slideshowIndex], true);

    if (slideshowOrder.length > 1) {
      slideshowTimer = setInterval(() => {
        slideshowIndex = (slideshowIndex + 1) % slideshowOrder.length;
        showSlide(slideshowOrder[slideshowIndex], false);
      }, 5200);
    }
  }

  function showSlide(fileName, immediate) {
    const image = $('slideshowImage');
    const placeholder = $('slideshowPlaceholder');
    if (!image) return;

    const applyImage = () => {
      image.onload = () => {
        placeholder.hidden = true;
        image.hidden = false;
        requestAnimationFrame(() => {
          image.classList.remove('is-changing');
          image.classList.add('is-zooming');
        });
      };
      image.classList.remove('is-zooming');
      image.src = `../assets/img/slideshow/${encodeURIComponent(fileName)}`;
    };

    if (immediate || image.hidden) {
      applyImage();
    } else {
      image.classList.add('is-changing');
      setTimeout(applyImage, 420);
    }
  }

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function notifyOpen() {
    jsonp(C.APPS_SCRIPT_URL, { action: 'event', token, type: 'open' }).catch(() => {});
  }

  function notifyDownload(fileKey) {
    jsonp(C.APPS_SCRIPT_URL, { action: 'event', token, type: 'download', file: String(fileKey || '') }).catch(() => {});
  }

  function showError(message) {
    $('loading').hidden = true;
    $('transferContent').hidden = true;
    $('transferError').hidden = false;
    $('transferErrorText').textContent = message;
  }

  function fileBadge(name) {
    const ext = String(name || '').split('.').pop()?.toUpperCase() || 'F';
    return ext.slice(0, 4);
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (!n) return '0 octet';
    const units = ['octets', 'Ko', 'Mo', 'Go', 'To'];
    let value = n, i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return `${value.toFixed(i === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function jsonp(url, params = {}) {
    return new Promise((resolve, reject) => {
      const cb = '__estim_client_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const timer = setTimeout(() => cleanup(new Error('Délai dépassé.')), 10000);
      const query = new URLSearchParams({ ...params, callback: cb });
      window[cb] = (data) => cleanup(null, data);
      script.onerror = () => cleanup(new Error('Service indisponible.'));
      script.src = `${url}${url.includes('?') ? '&' : '?'}${query.toString()}`;
      document.body.appendChild(script);
      function cleanup(err, data) {
        clearTimeout(timer);
        delete window[cb];
        script.remove();
        err ? reject(err) : resolve(data);
      }
    });
  }
})();
