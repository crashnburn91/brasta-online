/* Profile equipment. Signed-in Season Pass selections are server-owned; the
   browser fallback keeps the design preview usable before authentication. */
(function () {
  'use strict';
  if (window.BrastaCosmetics) return;
  var KEY = 'brasta-beta-cosmetics-v1';
  var AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  var catalog = window.BRASTA_SEASON_CATALOG;
  if (!catalog) return;
  var slots = { cardBack: 'Card back', tableFelt: 'Table felt', profileTitle: 'Profile title', avatarFrame: 'Avatar frame' };
  var serverSlots = { cardBack: 'card_back', tableFelt: 'table_felt', profileTitle: 'profile_title', avatarFrame: 'avatar_frame' };
  var account = { status: 'unknown', token: '', state: null, request: 0, busy: false };
  var overviewSelector = '.account-experience-card,.account-status-card,.account-connections-card,.account-secondary,.account-delete-panel,.account-message,.account-policy-links';
  function accountStatus() { return !token() ? 'signed-out' : account.token === token() ? account.status : 'loading'; }
  function note() {
    if (accountStatus() === 'signed-out') return 'Guest design preview. Sign in to use your account collection. Golden Spade is on the free track; other sets require Premium.';
    if (accountStatus() === 'unavailable') return 'Your collection could not be loaded. Reopen your profile to retry.';
    if (accountStatus() !== 'ready') return 'Loading your account collection…';
    if (account.state.testingAccess) return 'Beta testing access. All sets are available. Test equipment is saved separately from Season XP and purchases.';
    if (account.state.season.status === 'draft') return 'Season 1 is coming soon. Classic and previously unlocked rewards are available now. Golden Spade unlocks on the free track; other sets require Premium.';
    return 'Equip rewards you own. Earn Golden Spade on the free track; other sets require Premium. Season 1 progress is saved to your account.';
  }
  function hasRewardAccess(id) {
    return account.state.ownedRewardIds.includes(id) || (account.state.testingAccess === true && (account.state.testRewardIds || []).includes(id));
  }
  function canEquip(id) {
    return !account.busy && (accountStatus() === 'signed-out' || (accountStatus() === 'ready' && (!id || hasRewardAccess(id))));
  }
  function choiceState(item, selected) {
    var status = accountStatus();
    var loaded = status === 'signed-out' || status === 'ready';
    var owned = loaded && (status === 'signed-out' || !item || hasRewardAccess(item.id));
    return {
      disabled: !owned || account.busy,
      access: !item ? 'Included' : status === 'ready' && account.state.testingAccess && hasRewardAccess(item.id) ? 'Beta test' : item.premium ? 'Premium' : 'Free track',
      label: account.busy ? 'Saving…' : !loaded ? (status === 'unavailable' ? 'Unavailable' : 'Loading…')
        : owned ? (selected ? 'Equipped' : 'Equip') : 'Tier ' + item.tier,
    };
  }
  var esc = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]; }); };
  function items(slot) { return catalog.rewards.filter(function (reward) { return reward.kind === slots[slot]; }); }
  function reward(id) { return catalog.rewards.find(function (item) { return item.id === id; }); }
  function url(id) { return '/cosmetics/season-1/' + id + '.svg?v=3'; }
  function token() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch (_) { return ''; }
  }
  function readLocal() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { saved = {}; }
    var value = {};
    Object.keys(slots).forEach(function (slot) {
      value[slot] = Object.prototype.hasOwnProperty.call(saved, slot) ? saved[slot] : items(slot).find(function (item) { return item.setId === 'gilded_court'; }).id;
      if (!items(slot).some(function (item) { return item.id === value[slot]; })) value[slot] = null;
    });
    // Preserve legacy selections, including the choice to show an earned title.
    value.titleSource = value.profileTitle ? 'season' : saved.titleSource === 'none' ? 'none' : 'earned';
    return value;
  }
  function read() {
    if (!token()) return readLocal();
    var value = { cardBack: null, tableFelt: null, profileTitle: null, avatarFrame: null, titleSource: 'earned' };
    if (account.token === token() && account.state?.equipment) {
      Object.keys(slots).forEach(function (slot) {
        value[slot] = account.state.equipment[serverSlots[slot]] || null;
      });
      value.titleSource = account.state.titleSource || (value.profileTitle ? 'season' : 'earned');
    }
    return value;
  }
  function write(value) {
    localStorage.setItem(KEY, JSON.stringify(value));
    publish();
  }
  function publish() {
    var value = read();
    apply(value);
    updateChoices();
    document.dispatchEvent(new CustomEvent('brasta-cosmetics-changed', { detail: value }));
  }
  async function seasonPassApi(body, accessToken) {
    var response = await fetch('/api/season-pass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || !data.state) throw new Error(data.error || 'Could not save this selection.');
    return data.state;
  }
  async function equip(slot, id, titleSource) {
    if (!slots[slot] || (id && !items(slot).some(function (item) { return item.id === id; }))) return;
    if (token()) {
      if (accountStatus() !== 'ready') throw new Error('Your collection is unavailable. Reopen your profile to retry.');
      if (account.busy) throw new Error('Your previous selection is still saving.');
      if (!canEquip(id)) throw new Error('You have not unlocked that Season Pass reward yet.');
      var accessToken = account.token;
      var playerId = account.state.playerId;
      var request = ++account.request;
      account.busy = true;
      publish();
      try {
        var body = { action: 'equip', slot: serverSlots[slot], rewardId: id || null };
        if (titleSource) body.titleSource = titleSource;
        var state = await seasonPassApi(body, accessToken);
        if (request !== account.request || token() !== accessToken || state.playerId !== playerId) return;
        account.state = state;
        return read();
      } finally {
        if (request === account.request) { account.busy = false; publish(); }
      }
    }
    var next = read();
    next[slot] = id || null;
    if (slot === 'profileTitle') next.titleSource = id ? 'season' : 'none';
    write(next);
    return Promise.resolve(next);
  }
  function useEarnedTitle(removed) {
    // The earned badge RPC already changed both title records atomically.
    if (token() && accountStatus() === 'ready' && account.state.testingAccess) return equip('profileTitle', null, removed ? 'none' : 'earned');
    if (token()) return syncAccount();
    var next = readLocal(); next.profileTitle = null; next.titleSource = removed ? 'none' : 'earned'; write(next);
    return Promise.resolve(next);
  }
  function isOwnProfile(username) {
    function clean(value) { return String(value || '').trim().replace(/^@/, '').toLowerCase(); }
    var name = clean(username);
    var accountName = clean(document.querySelector('.account-dock[data-brasta-username]')?.dataset.brastaUsername);
    var playerName = clean(document.querySelector('.player-chip.player-card[data-you="1"] .player-name')?.textContent);
    return Boolean(name && (name === accountName || name === playerName));
  }
  function titleItems() {
    return items('profileTitle').map(function (item) {
      var unlocked = accountStatus() === 'signed-out' || (accountStatus() === 'ready' && hasRewardAccess(item.id));
      return { key: item.id, name: item.name, description: item.description, artUrl: url(item.id), tier: 'standard', awardType: 'season_preview', unlocked: unlocked, premium: item.premium, setName: catalog.sets[item.setId].name, unlockTier: item.tier, testing: accountStatus() === 'ready' && account.state.testingAccess === true, preview: accountStatus() === 'signed-out', busy: account.busy };
    });
  }
  function effectiveTitle(earned) {
    var value = read();
    if (value.titleSource === 'none') return null;
    return value.titleSource === 'season' ? titleItems().find(function (item) { return item.key === value.profileTitle; }) || null : earned;
  }
  window.BrastaCosmetics = { read: read, equip: equip, useEarnedTitle: useEarnedTitle, isOwnProfile: isOwnProfile, titleItems: titleItems, effectiveTitle: effectiveTitle, note: note, status: accountStatus, refresh: syncAccount };

  function apply(value) {
    var root = document.documentElement;
    Object.keys(slots).forEach(function (slot) {
      var attribute = 'data-brasta-' + slot.replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase(); });
      if (value[slot]) root.setAttribute(attribute, value[slot]); else root.removeAttribute(attribute);
    });
    root.dataset.brastaTitleSource = value.titleSource;
    ['cardBack', 'tableFelt', 'avatarFrame'].forEach(function (slot) {
      root.style.setProperty('--brasta-' + slot.replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase(); }) + '-art', value[slot] ? 'url("' + url(value[slot]) + '")' : 'none');
    });
    document.querySelectorAll('.player-chip.player-card').forEach(function (card) {
      var identity = card.querySelector('.player-card-identity');
      if (identity) applyTitle(identity, card.dataset.you === '1' ? value.profileTitle : null, true);
    });
    document.querySelectorAll('.account-profile-head, .player-profile-head').forEach(function (head) {
      var h2 = head.querySelector('h2');
      if (!h2) return;
      var self = head.classList.contains('account-profile-head') || isOwnProfile(h2.textContent);
      head.toggleAttribute('data-beta-cosmetic-self', self);
      applyTitle(h2.parentElement, self ? value.profileTitle : null, false, h2);
    });
  }
  function applyTitle(container, rewardId, compact, heading) {
    var old = container.querySelector('[data-beta-cosmetic-title]');
    if (!rewardId) { if (old) old.remove(); return; }
    if (old?.dataset.betaCosmeticTitle === rewardId) return;
    if (old) old.remove();
    var title = document.createElement('span');
    title.dataset.betaCosmeticTitle = rewardId;
    title.className = 'beta-cosmetic-title';
    var badge = document.createElement('span');
    if (compact) badge.className = 'player-card-profile-badge';
    var artwork = document.createElement('img');
    artwork.className = 'beta-cosmetic-badge-art';
    artwork.src = url(rewardId);
    artwork.alt = '';
    artwork.setAttribute('aria-hidden', 'true');
    artwork.draggable = false;
    badge.appendChild(artwork);
    var name = document.createElement('span');
    name.className = 'beta-cosmetic-title-copy';
    name.textContent = reward(rewardId).name;
    title.append(badge, name);
    // Profile lookups depend on a bare username in the heading.
    if (heading) heading.insertAdjacentElement('afterend', title); else container.appendChild(title);
  }
  function choices(slot) {
    return '<div class="cosmetic-choice-grid">' + [null].concat(items(slot)).map(function (item) {
      var name = item ? item.name : slot === 'avatarFrame' ? 'No frame' : 'Classic';
      var art = item ? '<img class="cosmetic-choice-art" src="' + url(item.id) + '" alt="" draggable="false">' : '<span class="cosmetic-classic-art" aria-hidden="true">' + (slot === 'tableFelt' ? '' : 'B') + '</span>';
      if (slot === 'avatarFrame') art = '<span class="cosmetic-frame-preview' + (item ? ' has-frame' : '') + '"><span class="cosmetic-preview-portrait" data-frame-portrait>B</span>' + (item ? art : '') + '</span>';
      var state = choiceState(item, false);
      return '<button type="button" class="cosmetic-choice ' + slot + '" data-cosmetics-equip="' + esc(item?.id || '') + '" data-cosmetics-kind="' + slot + '" aria-pressed="false"' + (state.disabled ? ' disabled' : '') + '><span class="cosmetic-choice-preview">' + art + '</span><strong>' + esc(name) + '</strong><small>' + esc(item ? catalog.sets[item.setId].name : 'Brasta original') + '</small><span class="cosmetic-access' + (item?.premium ? ' premium' : '') + '">' + state.access + '</span><span class="cosmetic-choice-state">' + state.label + '</span></button>';
    }).join('') + '</div>';
  }
  function wireChoices(container) {
    container.addEventListener('click', function (event) {
      var button = event.target.closest('[data-cosmetics-equip]');
      if (!button) return;
      var status = container.querySelector('[data-cosmetics-status]');
      Promise.resolve(equip(button.dataset.cosmeticsKind, button.dataset.cosmeticsEquip || null)).then(function () {
        if (status) status.textContent = slots[button.dataset.cosmeticsKind] + ' updated.';
      }).catch(function (error) {
        if (status) status.textContent = error?.message || 'Could not save your selection.';
      });
    });
  }
  function updateChoices() {
    var value = read();
    document.querySelectorAll('.cosmetic-beta-note').forEach(function (node) { if (node.textContent !== note()) node.textContent = note(); });
    document.querySelectorAll('[data-cosmetics-equip]').forEach(function (button) {
      var selected = (value[button.dataset.cosmeticsKind] || '') === button.dataset.cosmeticsEquip;
      button.setAttribute('aria-pressed', String(selected));
      var item = button.dataset.cosmeticsEquip ? reward(button.dataset.cosmeticsEquip) : null;
      var choice = choiceState(item, selected);
      button.disabled = choice.disabled;
      var access = button.querySelector('.cosmetic-access');
      if (access && access.textContent !== choice.access) access.textContent = choice.access;
      var state = button.querySelector('.cosmetic-choice-state');
      if (state.textContent !== choice.label) state.textContent = choice.label;
    });
  }
  async function syncAccount() {
    var accessToken = token();
    if (account.busy && account.token === accessToken) return;
    var request = ++account.request;
    if (account.token !== accessToken) account.state = null;
    account.token = accessToken;
    account.busy = false;
    if (!accessToken) {
      account.status = 'signed-out';
      account.state = null;
      publish();
      return;
    }
    account.status = 'loading';
    publish();
    try {
      var response = await fetch('/api/season-pass', {
        headers: { Authorization: 'Bearer ' + accessToken },
        cache: 'no-store',
      });
      var data = await response.json().catch(function () { return {}; });
      if (request !== account.request || token() !== accessToken) return;
      if (!response.ok || !data.state) throw new Error(data.error || 'Season Pass state is unavailable.');
      account.status = 'ready';
      account.state = data.state;
      publish();
    } catch (_) {
      if (request !== account.request || token() !== accessToken) return;
      account.status = 'unavailable';
      publish();
    }
  }
  var frameDialog;
  function openFrames(trigger) {
    if (!frameDialog) {
      frameDialog = document.createElement('dialog');
      frameDialog.className = 'cosmetic-frame-dialog';
      frameDialog.setAttribute('aria-labelledby', 'cosmetic-frame-heading');
      frameDialog.innerHTML = '<div class="cosmetic-section-heading"><h2 id="cosmetic-frame-heading">Avatar frames</h2><button type="button" data-frame-close aria-label="Close avatar frames">×</button></div><p class="cosmetic-beta-note">' + note() + '</p>' + choices('avatarFrame') + '<p class="cosmetic-status" data-cosmetics-status role="status"></p><button type="button" class="cosmetic-done" data-frame-close>Done</button>';
      document.body.appendChild(frameDialog);
      wireChoices(frameDialog);
      // Let the native dialog handle Escape without closing the profile beneath it.
      frameDialog.addEventListener('keydown', function (event) { if (event.key === 'Escape') event.stopPropagation(); });
      frameDialog.querySelectorAll('[data-frame-close]').forEach(function (button) { button.addEventListener('click', function () { frameDialog.close(); }); });
    }
    var photo = document.querySelector('.account-profile-head img.brasta-avatar-portrait, .account-dock img.brasta-avatar-portrait, .player-card[data-you="1"] .player-card-avatar img');
    var initial = (document.querySelector('.account-profile-head h2, .player-card[data-you="1"] .player-name')?.textContent || 'B').trim().charAt(0).toUpperCase();
    frameDialog.querySelectorAll('[data-frame-portrait]').forEach(function (node) {
      node.replaceChildren();
      if (photo) {
        var image = document.createElement('img'); image.src = photo.src; image.alt = ''; image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', function () { node.textContent = initial; }, { once: true });
        node.appendChild(image);
      } else node.textContent = initial;
    });
    updateChoices();
    frameDialog.querySelector('[data-cosmetics-status]').textContent = '';
    frameDialog.showModal();
    frameDialog.querySelector('[aria-pressed="true"]')?.focus();
    frameDialog.addEventListener('close', function () { if (trigger?.isConnected) trigger.focus(); }, { once: true });
  }
  function enhanceModal(modal) {
    var head = modal.querySelector('.account-profile-head, .player-profile-head');
    if (!head) return;
    var own = head.classList.contains('account-profile-head') || isOwnProfile(head.querySelector('h2')?.textContent);
    if (!own) return;
    if (head.classList.contains('player-profile-head') && !head.querySelector('[data-cosmetics-frame-open]')) {
      var frameButton = document.createElement('button'); frameButton.type = 'button'; frameButton.textContent = 'Change frame'; frameButton.dataset.cosmeticsFrameOpen = ''; frameButton.setAttribute('aria-haspopup', 'dialog');
      head.appendChild(frameButton);
    }
    var tabs = modal.querySelector('.ppg-tabs');
    var guest = modal.querySelector('.player-profile-guest');
    if (!tabs && guest) {
      tabs = document.createElement('div'); tabs.className = 'ppg-tabs'; tabs.dataset.cosmeticsGuestTabs = ''; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Player profile sections');
      var overview = document.createElement('button'); overview.type = 'button'; overview.textContent = 'Overview'; overview.setAttribute('role', 'tab'); overview.setAttribute('aria-selected', 'true');
      tabs.appendChild(overview); head.insertAdjacentElement('afterend', tabs);
      guest.dataset.ppgPanel = 'overview';
      overview.addEventListener('click', function () {
        tabs.querySelectorAll('button').forEach(function (candidate) { candidate.setAttribute('aria-selected', String(candidate === overview)); });
        guest.hidden = false;
      });
    }
    if (!tabs || tabs.querySelector('[data-cosmetics-table-tab]')) return;
    var button = document.createElement('button'); button.type = 'button'; button.textContent = 'Table'; button.dataset.cosmeticsTableTab = ''; button.setAttribute('aria-selected', 'false'); button.setAttribute('role', 'tab');
    tabs.appendChild(button); tabs.dataset.cosmeticsTabs = 'true';
    var panel = document.createElement('div'); panel.className = 'ppg-panel cosmetic-table-panel'; panel.dataset.cosmeticsTablePanel = ''; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-label', 'Table'); panel.hidden = true;
    panel.innerHTML = '<p class="cosmetic-beta-note">' + note() + '</p><section aria-label="Card backs"><h3>Card backs</h3><p>Style your hand and deck.</p>' + choices('cardBack') + '</section><section aria-label="Table felts"><h3>Table felts</h3><p>A playing surface that fits your table.</p>' + choices('tableFelt') + '</section><p class="cosmetic-status" data-cosmetics-status role="status"></p>';
    (modal.querySelector('[data-profile-badges-panel]') || tabs).insertAdjacentElement('afterend', panel);
    wireChoices(panel);
    button.addEventListener('click', function () {
      tabs.querySelectorAll('button').forEach(function (candidate) { candidate.setAttribute('aria-selected', String(candidate === button)); });
      modal.querySelectorAll('[data-account-ppg-panel], [data-ppg-panel], [data-profile-badges-panel]').forEach(function (node) { node.hidden = true; });
      if (modal.classList.contains('account-modal')) {
        modal.querySelectorAll(overviewSelector).forEach(function (node) { node.hidden = true; });
        modal.dataset.ppgAccountActive = 'table';
      }
      panel.hidden = false;
    });
    tabs.addEventListener('click', function (event) {
      var clicked = event.target.closest('button');
      if (clicked && clicked !== button) { panel.hidden = true; button.setAttribute('aria-selected', 'false'); }
    });
    updateChoices();
  }
  function scan() {
    apply(read());
    document.querySelectorAll('.account-modal, .player-profile-modal').forEach(enhanceModal);
  }
  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; scan(); });
  }
  function start() {
    try { localStorage.setItem(KEY, JSON.stringify(readLocal())); } catch (_) {}
    scan();
    void syncAccount();
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-cosmetics-frame-open]');
      if (trigger) openFrames(trigger);
      if (event.target.closest('.account-dock') && accountStatus() === 'ready') void syncAccount();
      if (event.target.closest('.account-dock, [data-cosmetics-table-tab], [data-profile-badges-tab], [data-cosmetics-frame-open]') && accountStatus() === 'unavailable') void syncAccount();
    });
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-you', 'data-brasta-username'] });
    window.addEventListener('storage', function (event) { if (event.key === AUTH_TOKEN_KEY || event.key === null) void syncAccount(); else if (event.key === KEY) publish(); });
    window.addEventListener('brasta-auth-changed', function () { schedule(); void syncAccount(); });
    window.addEventListener('brasta-season-pass-equipment-changed', function (event) {
      if (event.detail?.playerId !== account.state?.playerId || accountStatus() !== 'ready' || account.busy) return;
      void syncAccount();
    });
    window.addEventListener('focus', function () { if (token()) void syncAccount(); });
    window.addEventListener('brasta-competitive-updated', function () { if (token()) void syncAccount(); });
    document.dispatchEvent(new CustomEvent('brasta-cosmetics-ready'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
