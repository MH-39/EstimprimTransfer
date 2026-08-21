(() => {
  'use strict';

  const C = window.ESTIM_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const token = params.get('id');
  let transfer = null;

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
    notifyDownload(file.id || file.name);
    const a = document.createElement('a');
    a.href = file.downloadUrl || `https://drive.google.com/uc?export=download&id=${encodeURIComponent(file.id)}`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
  }

  async function downloadAll() {
    $('downloadAllBtn').disabled = true;
    $('downloadAllBtn').textContent = 'OUVERTURE DES TÉLÉCHARGEMENTS…';
    // Plusieurs téléchargements peuvent être soumis aux règles du navigateur.
    // Chaque fichier est ouvert à partir du clic de l'utilisateur, avec un court décalage.
    for (const file of transfer.files) {
      downloadFile(file);
      await sleep(450);
    }
    setTimeout(() => {
      $('downloadAllBtn').disabled = false;
      $('downloadAllBtn').textContent = 'TÉLÉCHARGER LES FICHIERS';
    }, 1000);
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
