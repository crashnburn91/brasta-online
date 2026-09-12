(() => {
  'use strict';
  if (window.__BRASTA_AVATAR_EDITOR__) return;
  window.__BRASTA_AVATAR_EDITOR__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
  const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const CUSTOM_MARKER = '/storage/v1/object/public/avatars/';
  let activeAvatarUrl = null;
  let scheduled = false;

  function token() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
  }

  function isCustomAvatar(value) {
    return String(value || '').includes(CUSTOM_MARKER);
  }

  function currentAvatarUrl() {
    const image = document.querySelector('.account-profile-head img.brasta-avatar-portrait');
    if (image instanceof HTMLImageElement && image.src) return image.src;
    return activeAvatarUrl || '';
  }

  function refreshAuthToken() {
    return new Promise((resolve, reject) => {
      const requestId = `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;
      const cleanup = () => {
        window.removeEventListener('brasta-auth-token-refreshed', onResult);
        window.clearTimeout(timer);
      };
      const onResult = (event) => {
        if (event?.detail?.requestId !== requestId || settled) return;
        settled = true;
        cleanup();
        if (event.detail.ok && event.detail.accessToken) resolve(event.detail.accessToken);
        else reject(new Error(event.detail.message || 'Your Brasta session expired. Please sign in again.'));
      };
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Your Brasta session could not be refreshed. Please sign in again.'));
      }, 8000);
      window.addEventListener('brasta-auth-token-refreshed', onResult);
      window.dispatchEvent(new CustomEvent('brasta-refresh-auth-token', { detail: { requestId } }));
    });
  }

  async function avatarApi(options, retried = false) {
    const accessToken = token();
    if (!accessToken) throw new Error('Sign in to change your profile picture.');
    const response = await fetch('/api/account/avatar', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.json ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.json ? JSON.stringify(options.json) : options.form,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!retried && response.status === 401) {
      await refreshAuthToken();
      return avatarApi(options, true);
    }
    if (!response.ok || data.error) throw new Error(data.error || `Avatar service returned ${response.status}.`);
    return data;
  }

  function requestProfileRefresh() {
    const requestId = `avatar-refresh-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.dispatchEvent(new CustomEvent('brasta-refresh-auth-token', { detail: { requestId } }));
  }

  function applyVisibleAvatar(value) {
    activeAvatarUrl = value || null;
    if (value) {
      document.querySelectorAll('.account-profile-head img.brasta-avatar-portrait,.account-dock img.brasta-avatar-portrait').forEach((node) => {
        if (node instanceof HTMLImageElement) node.src = value;
      });
      document.querySelectorAll('.account-profile-avatar,.account-avatar-fallback').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.classList.add('has-avatar-override');
        node.style.backgroundImage = `url(${JSON.stringify(value).slice(1, -1)})`;
      });
    } else {
      document.querySelectorAll('.account-profile-avatar,.account-avatar-fallback').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.classList.remove('has-avatar-override');
        node.style.backgroundImage = '';
      });
    }
    window.dispatchEvent(new CustomEvent('brasta-profile-avatar-changed', { detail: { avatarUrl: value || null } }));
    window.dispatchEvent(new CustomEvent('brasta-friends-updated'));
    requestProfileRefresh();
  }

  function managerMessage(manager, text, error = false) {
    const message = manager?.querySelector?.('[data-avatar-message]');
    if (!message) return;
    message.textContent = text || '';
    message.classList.toggle('error', Boolean(error));
  }

  function setManagerBusy(manager, busy) {
    manager?.querySelectorAll?.('button').forEach((button) => { button.disabled = Boolean(busy); });
  }

  function updateRemoveVisibility(manager) {
    const remove = manager?.querySelector?.('[data-avatar-remove]');
    if (!(remove instanceof HTMLElement)) return;
    const url = activeAvatarUrl || currentAvatarUrl();
    remove.hidden = !isCustomAvatar(url);
  }

  function blobFromCanvas(canvas, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  }

  async function encodeAvatar(canvas) {
    for (const quality of [0.88, 0.8, 0.72]) {
      const blob = await blobFromCanvas(canvas, quality);
      if (blob && blob.type === 'image/webp' && blob.size <= 1024 * 1024) return blob;
    }
    throw new Error('This photo could not be compressed below 1 MB. Try a different image.');
  }

  function openCropEditor(file, manager) {
    if (!SUPPORTED_TYPES.has(file.type)) {
      managerMessage(manager, 'Choose a JPEG, PNG, or WebP image.', true);
      return;
    }
    if (!file.size || file.size > MAX_SOURCE_BYTES) {
      managerMessage(manager, 'Choose an image smaller than 5 MB.', true);
      return;
    }

    const sourceUrl = URL.createObjectURL(file);
    const source = new Image();
    source.onload = () => {
      if (!source.naturalWidth || !source.naturalHeight) {
        URL.revokeObjectURL(sourceUrl);
        managerMessage(manager, 'That image could not be opened.', true);
        return;
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'avatar-editor-backdrop';
      backdrop.innerHTML = `
        <section class="avatar-editor-modal" role="dialog" aria-modal="true" aria-label="Crop profile picture">
          <h3>Crop profile picture</h3>
          <p>Drag to reposition your photo, then use the slider to zoom.</p>
          <div class="avatar-editor-stage" data-avatar-stage>
            <img data-avatar-image alt="">
            <div class="avatar-editor-grid" aria-hidden="true"></div>
          </div>
          <label class="avatar-editor-zoom"><span>Zoom</span><input data-avatar-zoom type="range" min="1" max="3" step="0.01" value="1"></label>
          <div class="avatar-editor-actions">
            <button type="button" data-avatar-cancel>Cancel</button>
            <button type="button" class="primary" data-avatar-save>Use Photo</button>
          </div>
          <div class="avatar-editor-error" data-avatar-error aria-live="polite"></div>
        </section>`;
      document.body.appendChild(backdrop);

      const stage = backdrop.querySelector('[data-avatar-stage]');
      const image = backdrop.querySelector('[data-avatar-image]');
      const zoomInput = backdrop.querySelector('[data-avatar-zoom]');
      const save = backdrop.querySelector('[data-avatar-save]');
      const cancel = backdrop.querySelector('[data-avatar-cancel]');
      const error = backdrop.querySelector('[data-avatar-error]');
      if (!(stage instanceof HTMLElement) || !(image instanceof HTMLImageElement) || !(zoomInput instanceof HTMLInputElement) || !(save instanceof HTMLButtonElement) || !(cancel instanceof HTMLButtonElement)) {
        backdrop.remove();
        URL.revokeObjectURL(sourceUrl);
        managerMessage(manager, 'The photo editor could not be opened.', true);
        return;
      }

      image.src = sourceUrl;
      const state = { zoom: 1, x: 0, y: 0, drag: null };
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

      function geometry() {
        const size = Math.max(1, stage.clientWidth);
        const base = Math.max(size / source.naturalWidth, size / source.naturalHeight);
        const scale = base * state.zoom;
        const width = source.naturalWidth * scale;
        const height = source.naturalHeight * scale;
        const maxX = Math.max(0, (width - size) / 2);
        const maxY = Math.max(0, (height - size) / 2);
        state.x = clamp(state.x, -maxX, maxX);
        state.y = clamp(state.y, -maxY, maxY);
        return {
          size,
          width,
          height,
          left: (size - width) / 2 + state.x,
          top: (size - height) / 2 + state.y,
          maxX,
          maxY,
        };
      }

      function render() {
        const g = geometry();
        image.style.width = `${g.width}px`;
        image.style.height = `${g.height}px`;
        image.style.left = `${g.left}px`;
        image.style.top = `${g.top}px`;
      }

      function close() {
        backdrop.remove();
        URL.revokeObjectURL(sourceUrl);
      }

      zoomInput.addEventListener('input', () => {
        state.zoom = Math.max(1, Math.min(3, Number(zoomInput.value) || 1));
        render();
      });

      stage.addEventListener('pointerdown', (event) => {
        const g = geometry();
        state.drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: state.x, y: state.y, maxX: g.maxX, maxY: g.maxY };
        stage.classList.add('dragging');
        stage.setPointerCapture?.(event.pointerId);
      });
      stage.addEventListener('pointermove', (event) => {
        if (!state.drag || state.drag.pointerId !== event.pointerId) return;
        const g = geometry();
        state.x = clamp(state.drag.x + event.clientX - state.drag.clientX, -g.maxX, g.maxX);
        state.y = clamp(state.drag.y + event.clientY - state.drag.clientY, -g.maxY, g.maxY);
        render();
      });
      const endDrag = (event) => {
        if (!state.drag || state.drag.pointerId !== event.pointerId) return;
        state.drag = null;
        stage.classList.remove('dragging');
      };
      stage.addEventListener('pointerup', endDrag);
      stage.addEventListener('pointercancel', endDrag);

      cancel.addEventListener('click', close);
      backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) close(); });
      save.addEventListener('click', async () => {
        save.disabled = true;
        cancel.disabled = true;
        if (error) error.textContent = '';
        try {
          const g = geometry();
          const canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 512;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Your browser could not prepare this photo.');
          const ratio = 512 / g.size;
          context.clearRect(0, 0, 512, 512);
          context.drawImage(source, g.left * ratio, g.top * ratio, g.width * ratio, g.height * ratio);
          const blob = await encodeAvatar(canvas);
          const form = new FormData();
          form.append('avatar', blob, 'avatar.webp');
          const data = await avatarApi({ form });
          applyVisibleAvatar(data.avatarUrl || null);
          managerMessage(manager, 'Profile picture updated.');
          close();
          updateRemoveVisibility(manager);
        } catch (uploadError) {
          if (error) error.textContent = uploadError?.message || 'Could not update your profile picture.';
          save.disabled = false;
          cancel.disabled = false;
        }
      });

      requestAnimationFrame(render);
    };
    source.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      managerMessage(manager, 'That image could not be opened. Try a JPEG, PNG, or WebP file.', true);
    };
    source.src = sourceUrl;
  }

  function injectManager() {
    const head = document.querySelector('.account-profile-head');
    if (!(head instanceof HTMLElement)) return;
    if (document.querySelector('[data-brasta-avatar-manager]')) {
      updateRemoveVisibility(document.querySelector('[data-brasta-avatar-manager]'));
      return;
    }

    const manager = document.createElement('div');
    manager.className = 'account-avatar-manager';
    manager.dataset.brastaAvatarManager = 'true';
    manager.innerHTML = `
      <div class="account-avatar-manager-copy">
        <b>Profile picture</b>
        <small>Shown on your Brasta profile, friends list, and chat.</small>
      </div>
      <div class="account-avatar-manager-actions">
        <button type="button" class="primary" data-avatar-change>Change Photo</button>
        <button type="button" data-avatar-remove hidden>Remove</button>
      </div>
      <input type="file" data-avatar-input accept="image/jpeg,image/png,image/webp" hidden>
      <div class="account-avatar-manager-message" data-avatar-message aria-live="polite"></div>`;
    head.insertAdjacentElement('afterend', manager);

    activeAvatarUrl = currentAvatarUrl() || activeAvatarUrl;
    updateRemoveVisibility(manager);

    const input = manager.querySelector('[data-avatar-input]');
    const change = manager.querySelector('[data-avatar-change]');
    const remove = manager.querySelector('[data-avatar-remove]');
    if (change instanceof HTMLButtonElement && input instanceof HTMLInputElement) {
      change.addEventListener('click', () => {
        managerMessage(manager, '');
        input.click();
      });
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.value = '';
        if (file) openCropEditor(file, manager);
      });
    }
    if (remove instanceof HTMLButtonElement) {
      remove.addEventListener('click', async () => {
        if (!window.confirm('Remove your custom Brasta profile picture? Your sign-in provider picture will be restored when available.')) return;
        setManagerBusy(manager, true);
        managerMessage(manager, '');
        try {
          const data = await avatarApi({ json: { action: 'remove' } });
          applyVisibleAvatar(data.avatarUrl || null);
          managerMessage(manager, data.avatarUrl ? 'Profile picture restored from your sign-in account.' : 'Custom profile picture removed.');
          updateRemoveVisibility(manager);
        } catch (error) {
          managerMessage(manager, error?.message || 'Could not remove your profile picture.', true);
        } finally {
          setManagerBusy(manager, false);
          updateRemoveVisibility(manager);
        }
      });
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectManager();
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('brasta-auth-changed', () => {
    activeAvatarUrl = null;
    window.setTimeout(schedule, 50);
  });
  schedule();
})();
