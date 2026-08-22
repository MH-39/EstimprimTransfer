(() => {
  'use strict';

  const C = window.ESTIM_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const state = {
    token: null,
    tokenExpiresAt: 0,
    tokenClient: null,
    tokenRequest: null,
    refreshTimer: null,
    files: [],
    rootFolderId: localStorage.getItem('estimtransfertRootFolderId') || null,
    currentTransferFolderId: null
  };

  const SESSION_KEY = 'estimtransfertGoogleSession';
  const REFRESH_MARGIN_MS = 5 * 60 * 1000;

  const authBox = $('authBox');
  const senderApp = $('senderApp');
  const authAlert = $('authAlert');
  const senderAlert = $('senderAlert');
  const signInBtn = $('signInBtn');
  const signOutBtn = $('signOutBtn');
  const dropzone = $('dropzone');
  const fileInput = $('fileInput');
  const fileList = $('fileList');
  const createBtn = $('createBtn');
  const statusBox = $('statusBox');
  const statusTitle = $('statusTitle');
  const statusDetail = $('statusDetail');
  const progressFill = $('progressFill');
  const backendForm = $('backendForm');
  const backendPayload = $('backendPayload');
  const resultBox = $('resultBox');
  const formArea = $('formArea');
  const generatedLink = $('generatedLink');
  const copyBtn = $('copyBtn');
  const copyMsg = $('copyMsg');
  const newTransferBtn = $('newTransferBtn');
  const openLinkBtn = $('openLinkBtn');

  init();

  function init() {
    validateConfig();
    $('expiryDays').value = String(C.DEFAULT_EXPIRY_DAYS || 7);
    bindEvents();
    waitForGoogleIdentity();
  }

  function validateConfig() {
    const issues = [];
    if (!C.ADMIN_EMAIL || C.ADMIN_EMAIL.includes('votre-adresse')) issues.push('ADMIN_EMAIL');
    if (!C.GOOGLE_CLIENT_ID || C.GOOGLE_CLIENT_ID.includes('VOTRE_CLIENT')) issues.push('GOOGLE_CLIENT_ID');
    if (!C.APPS_SCRIPT_URL || C.APPS_SCRIPT_URL.includes('VOTRE_DEPLOIEMENT')) issues.push('APPS_SCRIPT_URL');
    if (!C.PUBLIC_BASE_URL || C.PUBLIC_BASE_URL.includes('votrecompte')) issues.push('PUBLIC_BASE_URL');

    if (issues.length) {
      showAlert(
        authAlert,
        'warn',
        'Configuration à compléter dans assets/js/config.js : ' +
        issues.join(', ') +
        '.'
      );
    }
  }

  function bindEvents() {
    signInBtn.addEventListener('click', signIn);
    signOutBtn.addEventListener('click', signOut);

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      addFiles([...fileInput.files]);
    });

    ['dragenter', 'dragover'].forEach(type =>
      dropzone.addEventListener(type, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      })
    );

    ['dragleave', 'drop'].forEach(type =>
      dropzone.addEventListener(type, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      })
    );

    dropzone.addEventListener('drop', (e) => {
      addFiles([...e.dataTransfer.files]);
    });

    createBtn.addEventListener('click', createTransfer);
    copyBtn.addEventListener('click', copyGeneratedLink);
    newTransferBtn.addEventListener('click', resetTransfer);

    openLinkBtn.addEventListener('click', () => {
      if (generatedLink.value) {
        window.open(generatedLink.value, '_blank', 'noopener');
      }
    });
  }

  function waitForGoogleIdentity() {
    let attempts = 0;

    const timer = setInterval(() => {
      attempts++;

      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);

        state.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: C.GOOGLE_CLIENT_ID,
          scope:
            'https://www.googleapis.com/auth/drive.file ' +
            'https://www.googleapis.com/auth/userinfo.email',
          callback: handleTokenResponse
        });

        if (localStorage.getItem(SESSION_KEY) === '1') {
          requestGoogleToken('').catch(() => {});
        }
      }

      if (attempts > 100) clearInterval(timer);
    }, 100);
  }

  function signIn() {
    clearAlert(authAlert);

    if (!state.tokenClient) {
      showAlert(
        authAlert,
        'error',
        'Le service Google n’est pas encore chargé. Réessayez dans quelques secondes.'
      );
      return;
    }

    requestGoogleToken('consent').catch((err) => {
      showAlert(
        authAlert,
        'error',
        err.message || 'Connexion Google impossible.'
      );
    });
  }

  function requestGoogleToken(prompt = '') {
    if (state.tokenRequest) return state.tokenRequest;

    if (!state.tokenClient) {
      return Promise.reject(
        new Error('Le service Google n’est pas encore chargé.')
      );
    }

    state.tokenRequest = new Promise((resolve, reject) => {
      state._tokenResolve = resolve;
      state._tokenReject = reject;

      try {
        state.tokenClient.requestAccessToken({ prompt });
      } catch (err) {
        state.tokenRequest = null;
        state._tokenResolve = null;
        state._tokenReject = null;
        reject(err);
      }
    });

    return state.tokenRequest;
  }

  async function handleTokenResponse(resp) {
    const resolve = state._tokenResolve;
    const reject = state._tokenReject;

    state._tokenResolve = null;
    state._tokenReject = null;
    state.tokenRequest = null;

    if (resp.error) {
      const err = new Error(
        'Connexion Google refusée : ' + resp.error
      );

      reject?.(err);

      if (!state.token) {
        showAlert(authAlert, 'error', err.message);
      }

      return;
    }

    state.token = resp.access_token;

    const expiresIn = Math.max(
      60,
      Number(resp.expires_in || 3600)
    );

    state.tokenExpiresAt =
      Date.now() + expiresIn * 1000;

    try {
      const info = await rawApiFetch(
        'https://www.googleapis.com/oauth2/v3/userinfo'
      );

      const allowed = String(C.ADMIN_EMAIL || '')
        .trim()
        .toLowerCase();

      const current = String(info.email || '')
        .trim()
        .toLowerCase();

      if (!current || current !== allowed) {
        await revokeToken();

        throw new Error(
          'Ce compte Google n’est pas autorisé à utiliser l’espace d’envoi.'
        );
      }

      localStorage.setItem(SESSION_KEY, '1');

      scheduleTokenRefresh();

      await ensureRootFolder();

      authBox.hidden = true;
      senderApp.hidden = false;
      signOutBtn.hidden = false;

      clearAlert(authAlert);

      resolve?.(state.token);

    } catch (err) {
      reject?.(err);

      showAlert(
        authAlert,
        'error',
        err.message ||
        'Impossible de vérifier votre compte Google.'
      );
    }
  }

  function scheduleTokenRefresh() {
    if (state.refreshTimer) {
      clearTimeout(state.refreshTimer);
    }

    const delay = Math.max(
      60 * 1000,
      state.tokenExpiresAt -
      Date.now() -
      REFRESH_MARGIN_MS
    );

    state.refreshTimer = setTimeout(async () => {
      try {
        await requestGoogleToken('');
      } catch (_) {}
    }, delay);
  }

  async function ensureFreshToken(force = false) {
    const stillValid =
      state.token &&
      Date.now() <
      (state.tokenExpiresAt - 60 * 1000);

    if (!force && stillValid) {
      return state.token;
    }

    try {
      return await requestGoogleToken('');
    } catch (err) {
      throw new Error(
        'Votre session Google doit être renouvelée. ' +
        'Cliquez sur « Connexion Google » puis reprenez le transfert.'
      );
    }
  }

  async function signOut() {
    localStorage.removeItem(SESSION_KEY);

    if (state.refreshTimer) {
      clearTimeout(state.refreshTimer);
    }

    state.refreshTimer = null;

    await revokeToken();

    senderApp.hidden = true;
    authBox.hidden = false;
    signOutBtn.hidden = true;

    resetTransfer();
  }

  function revokeToken() {
    return new Promise((resolve) => {
      if (state.refreshTimer) {
        clearTimeout(state.refreshTimer);
      }

      state.refreshTimer = null;
      state.tokenExpiresAt = 0;

      if (
        !state.token ||
        !window.google?.accounts?.oauth2
      ) {
        state.token = null;
        resolve();
        return;
      }

      google.accounts.oauth2.revoke(
        state.token,
        () => {
          state.token = null;
          resolve();
        }
      );
    });
  }

  function addFiles(newFiles) {
    clearAlert(senderAlert);

    const maxBytes =
      Number(C.MAX_FILE_SIZE_GB || 20) *
      1024 *
      1024 *
      1024;

    const accepted = [];

    for (const file of newFiles) {
      if (file.size > maxBytes) {
        showAlert(
          senderAlert,
          'error',
          `${file.name} dépasse la limite configurée de ${C.MAX_FILE_SIZE_GB} Go.`
        );
        continue;
      }

      const key =
        `${file.name}:${file.size}:${file.lastModified}`;

      const exists = state.files.some(
        f =>
          `${f.name}:${f.size}:${f.lastModified}` === key
      );

      if (!exists) {
        accepted.push(file);
      }
    }

    state.files.push(...accepted);

    fileInput.value = '';

    renderFiles();
  }

  function renderFiles() {
    fileList.innerHTML = '';

    if (!state.files.length) {
      fileList.hidden = true;
      createBtn.disabled = true;
      return;
    }

    fileList.hidden = false;

    state.files.forEach((file, index) => {
      const row = document.createElement('div');

      row.className = 'file-row';

      row.innerHTML = `
        <div class="file-icon">${fileBadge(file.name)}</div>
        <div class="file-meta">
          <div class="file-name"></div>
          <div class="file-size">${formatBytes(file.size)}</div>
        </div>
        <button
          class="remove-btn"
          type="button"
          aria-label="Retirer le fichier"
        >×</button>
      `;

      row.querySelector(
        '.file-name'
      ).textContent = file.name;

      row.querySelector(
        '.remove-btn'
      ).addEventListener(
        'click',
        () => {
          state.files.splice(index, 1);
          renderFiles();
        }
      );

      fileList.appendChild(row);
    });

    createBtn.disabled = false;
  }

  async function ensureRootFolder() {
    if (state.rootFolderId) {
      try {
        await driveGet(
          `files/${encodeURIComponent(
            state.rootFolderId
          )}?fields=id,name,trashed`
        );

        return state.rootFolderId;

      } catch (_) {
        localStorage.removeItem(
          'estimtransfertRootFolderId'
        );

        state.rootFolderId = null;
      }
    }

    const rootName =
      C.DRIVE_ROOT_FOLDER_NAME ||
      'ESTIMTRANSFERT';

    try {
      const q = encodeURIComponent(
        `name='${rootName.replace(/'/g, "\\'")}' ` +
        `and mimeType='application/vnd.google-apps.folder' ` +
        `and trashed=false`
      );

      const found = await driveGet(
        `files?q=${q}` +
        `&spaces=drive` +
        `&fields=files(id,name)` +
        `&pageSize=10`
      );

      if (
        found.files &&
        found.files.length
      ) {
        state.rootFolderId =
          found.files[0].id;

        localStorage.setItem(
          'estimtransfertRootFolderId',
          state.rootFolderId
        );

        return state.rootFolderId;
      }

    } catch (_) {}

    const folder = await drivePost(
      'files?fields=id,name',
      {
        name: rootName,
        mimeType:
          'application/vnd.google-apps.folder'
      }
    );

    state.rootFolderId = folder.id;

    localStorage.setItem(
      'estimtransfertRootFolderId',
      folder.id
    );

    return folder.id;
  }

  async function createTransfer() {
    clearAlert(senderAlert);

    try {
      await ensureFreshToken();

    } catch (err) {
      senderApp.hidden = true;
      authBox.hidden = false;
      signOutBtn.hidden = true;

      showAlert(
        authAlert,
        'warn',
        err.message
      );

      return;
    }

    if (!state.files.length) {
      showAlert(
        senderAlert,
        'error',
        'Ajoutez au moins un fichier.'
      );

      return;
    }

    const recipientName =
      $('recipientName').value.trim();

    const recipientEmail =
      $('recipientEmail').value.trim();

    const message =
      $('message').value.trim();

    const expiryDays =
      Number(
        $('expiryDays').value || 7
      );

    const emailClient =
      $('emailClient').checked;

    if (
      recipientEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        recipientEmail
      )
    ) {
      showAlert(
        senderAlert,
        'error',
        'L’adresse e-mail du destinataire n’est pas valide.'
      );

      return;
    }

    if (
      emailClient &&
      !recipientEmail
    ) {
      showAlert(
        senderAlert,
        'error',
        'Indiquez l’e-mail du destinataire ou décochez l’envoi par e-mail.'
      );

      return;
    }

    createBtn.disabled = true;

    statusBox.style.display = 'block';

    setProgress(
      2,
      'Création du transfert…',
      'Préparation du dossier Google Drive.'
    );

    try {
      await ensureRootFolder();

      const token = secureToken();

      const now = new Date();

      const expiresAt = new Date(
        now.getTime() +
        expiryDays * 86400000
      );

      const folderName =
        getTransferFolderName(
          state.files
        );

      const transferFolder =
        await drivePost(
          'files?fields=id,name,webViewLink',
          {
            name: folderName,
            mimeType:
              'application/vnd.google-apps.folder',
            parents: [
              state.rootFolderId
            ]
          }
        );

      state.currentTransferFolderId =
        transferFolder.id;

      await drivePost(
        `files/${encodeURIComponent(
          transferFolder.id
        )}/permissions?fields=id`,
        {
          role: 'reader',
          type: 'anyone'
        }
      );

      const uploaded = [];

      let bytesDone = 0;

      const totalBytes =
        state.files.reduce(
          (s, f) =>
            s + f.size,
          0
        );

      for (
        let i = 0;
        i < state.files.length;
        i++
      ) {
        const file =
          state.files[i];

        const baseDone =
          bytesDone;

        const result =
          await uploadResumable(
            file,
            transferFolder.id,
            (sent) => {
              const overall =
                (
                  (
                    baseDone +
                    sent
                  ) /
                  totalBytes
                ) *
                88 +
                5;

              setProgress(
                Math.min(
                  93,
                  overall
                ),
                `Envoi ${i + 1}/${state.files.length}`,
                `${file.name} · ${formatBytes(sent)} / ${formatBytes(file.size)}`
              );
            }
          );

        bytesDone += file.size;

        uploaded.push({
          id: result.id,
          name:
            result.name ||
            file.name,
          size:
            Number(
              result.size ||
              file.size
            ),
          mimeType:
            result.mimeType ||
            file.type ||
            'application/octet-stream',
          downloadUrl:
            `https://drive.google.com/uc?export=download&id=${encodeURIComponent(result.id)}`
        });
      }

      setProgress(
        95,
        'Finalisation…',
        'Enregistrement du lien de transfert.'
      );

      const base =
        String(
          C.PUBLIC_BASE_URL ||
          ''
        ).replace(/\/$/, '');

      const transferUrl =
        `${base}/transfer/?id=${encodeURIComponent(token)}`;

      const payload = {
        action: 'create',
        token,
        createdAt:
          now.toISOString(),
        expiresAt:
          expiresAt.toISOString(),
        recipientName,
        recipientEmail,
        message,
        emailClient,
        transferUrl,
        folderId:
          transferFolder.id,
        folderUrl:
          `https://drive.google.com/drive/folders/${encodeURIComponent(transferFolder.id)}`,
        files: uploaded
      };

      await sendMetadata(payload);

      setProgress(
        100,
        'Terminé',
        'Le lien est prêt.'
      );

      generatedLink.value =
        transferUrl;

      formArea.style.display =
        'none';

      resultBox.style.display =
        'block';

      setTimeout(
        copyGeneratedLink,
        250
      );

    } catch (err) {
      console.error(err);

      showAlert(
        senderAlert,
        'error',
        err.message ||
        'Le transfert n’a pas pu être créé.'
      );

      createBtn.disabled = false;
    }
  }

  async function sendMetadata(payload) {
    backendForm.action =
      C.APPS_SCRIPT_URL;

    backendPayload.value =
      JSON.stringify(payload);

    backendForm.submit();

    for (
      let attempt = 0;
      attempt < 8;
      attempt++
    ) {
      await sleep(
        700 +
        attempt * 250
      );

      try {
        const found =
          await jsonp(
            C.APPS_SCRIPT_URL,
            {
              action: 'get',
              token:
                payload.token
            }
          );

        if (
          found &&
          found.ok
        ) {
          return found;
        }

      } catch (_) {}
    }

    throw new Error(
      'Les fichiers sont dans Google Drive, mais le registre du transfert n’a pas répondu. Vérifiez le déploiement Apps Script.'
    );
  }

  async function uploadResumable(
    file,
    parentId,
    onProgress
  ) {
    await ensureFreshToken();

    const initUpload = () =>
      fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType',
        {
          method: 'POST',
          headers: {
            Authorization:
              `Bearer ${state.token}`,
            'Content-Type':
              'application/json; charset=UTF-8',
            'X-Upload-Content-Type':
              file.type ||
              'application/octet-stream',
            'X-Upload-Content-Length':
              String(file.size)
          },
          body: JSON.stringify({
            name: file.name,
            parents: [
              parentId
            ]
          })
        }
      );

    let initResp =
      await initUpload();

    if (
      initResp.status === 401
    ) {
      await ensureFreshToken(true);

      initResp =
        await initUpload();
    }

    if (!initResp.ok) {
      throw await googleError(
        initResp,
        'Impossible de préparer l’envoi vers Google Drive.'
      );
    }

    const location =
      initResp.headers.get(
        'Location'
      );

    if (!location) {
      throw new Error(
        'Google Drive n’a pas renvoyé d’URL d’envoi résumable.'
      );
    }

    const chunkSize =
      8 *
      1024 *
      1024;

    let offset = 0;
    let lastJson = null;

    while (
      offset <
      file.size
    ) {
      const end =
        Math.min(
          offset +
          chunkSize,
          file.size
        );

      const chunk =
        file.slice(
          offset,
          end
        );

      const resp =
        await fetch(
          location,
          {
            method: 'PUT',
            headers: {
              'Content-Range':
                `bytes ${offset}-${end - 1}/${file.size}`
            },
            body: chunk
          }
        );

      if (
        resp.status === 308
      ) {
        offset = end;

        onProgress?.(
          offset
        );

        continue;
      }

      if (!resp.ok) {
        throw await googleError(
          resp,
          `Échec de l’envoi de ${file.name}.`
        );
      }

      lastJson =
        await resp.json();

      offset =
        file.size;

      onProgress?.(
        offset
      );
    }

    return lastJson;
  }

  async function rawApiFetch(
    url,
    options = {}
  ) {
    const resp =
      await fetch(
        url,
        {
          ...options,
          headers: {
            ...(options.headers || {}),
            Authorization:
              `Bearer ${state.token}`
          }
        }
      );

    if (!resp.ok) {
      throw await googleError(
        resp,
        'Erreur Google.'
      );
    }

    return resp.json();
  }

  async function apiFetch(
    url,
    options = {}
  ) {
    await ensureFreshToken();

    let resp =
      await fetch(
        url,
        {
          ...options,
          headers: {
            ...(options.headers || {}),
            Authorization:
              `Bearer ${state.token}`
          }
        }
      );

    if (
      resp.status === 401
    ) {
      await ensureFreshToken(true);

      resp =
        await fetch(
          url,
          {
            ...options,
            headers: {
              ...(options.headers || {}),
              Authorization:
                `Bearer ${state.token}`
            }
          }
        );
    }

    if (!resp.ok) {
      throw await googleError(
        resp,
        'Erreur Google.'
      );
    }

    return resp.json();
  }

  function driveGet(path) {
    return apiFetch(
      `https://www.googleapis.com/drive/v3/${path}`
    );
  }

  function drivePost(
    path,
    body
  ) {
    return apiFetch(
      `https://www.googleapis.com/drive/v3/${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body:
          JSON.stringify(body)
      }
    );
  }

  async function googleError(
    resp,
    fallback
  ) {
    let msg =
      fallback;

    try {
      const data =
        await resp.json();

      msg =
        data?.error?.message ||
        msg;

      if (
        resp.status === 401
      ) {
        msg +=
          ' Reconnectez-vous à Google.';
      }

    } catch (_) {}

    return new Error(msg);
  }

  function setProgress(
    percent,
    title,
    detail
  ) {
    statusBox.style.display =
      'block';

    progressFill.style.width =
      `${Math.max(
        0,
        Math.min(
          100,
          percent
        )
      )}%`;

    statusTitle.textContent =
      title || '';

    statusDetail.textContent =
      detail || '';
  }

  async function copyGeneratedLink() {
    const text =
      generatedLink.value;

    if (!text) return;

    try {
      await navigator.clipboard.writeText(
        text
      );

    } catch (_) {
      generatedLink.focus();
      generatedLink.select();
      document.execCommand(
        'copy'
      );
    }

    copyMsg.textContent =
      '✓ Lien copié !';

    copyBtn.textContent =
      'COPIÉ';

    setTimeout(
      () => {
        copyBtn.textContent =
          'COPIER';

        copyMsg.textContent =
          '';
      },
      2200
    );
  }

  function resetTransfer() {
    state.files = [];

    state.currentTransferFolderId =
      null;

    fileInput.value = '';

    $('recipientName').value =
      '';

    $('recipientEmail').value =
      '';

    $('message').value =
      '';

    $('expiryDays').value =
      String(
        C.DEFAULT_EXPIRY_DAYS ||
        7
      );

    $('emailClient').checked =
      false;

    resultBox.style.display =
      'none';

    formArea.style.display =
      'block';

    statusBox.style.display =
      'none';

    progressFill.style.width =
      '0%';

    generatedLink.value =
      '';

    copyMsg.textContent =
      '';

    clearAlert(
      senderAlert
    );

    renderFiles();
  }

  function secureToken() {
    const bytes =
      new Uint8Array(18);

    crypto.getRandomValues(
      bytes
    );

    return [...bytes]
      .map(
        b =>
          b
            .toString(16)
            .padStart(2, '0')
      )
      .join('');
  }

  function getTransferFolderName(files) {
    const list =
      Array.from(
        files || []
      );

    if (!list.length) {
      return 'Transfert';
    }

    const relativeRoots =
      list
        .map(
          f =>
            String(
              f.webkitRelativePath ||
              ''
            )
              .split('/')[0]
        )
        .filter(Boolean);

    if (
      relativeRoots.length &&
      relativeRoots.every(
        v =>
          v ===
          relativeRoots[0]
      )
    ) {
      return safeDriveFolderName(
        relativeRoots[0]
      );
    }

    const firstName =
      String(
        list[0].name ||
        'Transfert'
      );

    const dot =
      firstName.lastIndexOf('.');

    const base =
      dot > 0
        ? firstName.slice(
            0,
            dot
          )
        : firstName;

    return safeDriveFolderName(
      base ||
      firstName
    );
  }

  function safeDriveFolderName(value) {
    return String(
      value ||
      'Transfert'
    )
      .replace(/[\/]+/g, '-')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 180) ||
      'Transfert';
  }

  function safeName(value) {
    return String(value)
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .replace(
        /[^a-zA-Z0-9_-]+/g,
        '-'
      )
      .replace(
        /^-+|-+$/g,
        ''
      )
      .slice(
        0,
        50
      );
  }

  function fileBadge(name) {
    const ext =
      String(name)
        .split('.')
        .pop()
        ?.toUpperCase() ||
      'F';

    return ext.slice(
      0,
      4
    );
  }

  function formatBytes(bytes) {
    const n =
      Number(
        bytes ||
        0
      );

    if (!n) {
      return '0 octet';
    }

    const units = [
      'octets',
      'Ko',
      'Mo',
      'Go',
      'To'
    ];

    let value = n;
    let i = 0;

    while (
      value >= 1024 &&
      i <
      units.length - 1
    ) {
      value /= 1024;
      i++;
    }

    return `${value.toFixed(
      i === 0
        ? 0
        : value >= 10
          ? 1
          : 2
    )} ${units[i]}`;
  }

  function showAlert(
    el,
    type,
    msg
  ) {
    el.className =
      `alert ${type}`;

    el.textContent =
      msg;
  }

  function clearAlert(el) {
    el.className =
      'alert';

    el.textContent =
      '';
  }

  function sleep(ms) {
    return new Promise(
      r =>
        setTimeout(
          r,
          ms
        )
    );
  }

  function jsonp(
    url,
    params = {}
  ) {
    return new Promise(
      (
        resolve,
        reject
      ) => {
        const cb =
          '__estim_cb_' +
          Math
            .random()
            .toString(36)
            .slice(2);

        const script =
          document.createElement(
            'script'
          );

        const timer =
          setTimeout(
            () =>
              cleanup(
                new Error(
                  'Délai dépassé.'
                )
              ),
            10000
          );

        const query =
          new URLSearchParams({
            ...params,
            callback: cb
          });

        window[cb] =
          (data) =>
            cleanup(
              null,
              data
            );

        script.onerror =
          () =>
            cleanup(
              new Error(
                'Impossible de joindre le service de transfert.'
              )
            );

        script.src =
          `${url}${url.includes('?') ? '&' : '?'}${query.toString()}`;

        document.body.appendChild(
          script
        );

        function cleanup(
          err,
          data
        ) {
          clearTimeout(
            timer
          );

          delete window[cb];

          script.remove();

          err
            ? reject(err)
            : resolve(data);
        }
      }
    );
  }

})();
