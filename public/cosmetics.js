/* Profile equipment. Premium styles remain available locally while the season is in beta. */
(function () {
  'use strict';
  if (window.BrastaCosmetics) return;
  var KEY = 'brasta-beta-cosmetics-v1';
  var catalog = window.BRASTA_SEASON_CATALOG;
  if (!catalog) return;
  var slots = { cardBack: 'Card back', tableFelt: 'Table felt', profileTitle: 'Profile title', avatarFrame: 'Avatar frame' };
  var overviewSelector = '.account-experience-card,.account-status-card,.account-connections-card,.account-secondary,.account-delete-panel,.account-message,.account-policy-links';
  var note = 'Golden Spade is free. Premium styles are available during beta. Selections are saved in this browser.';
  var esc = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]; }); };
  function items(slot) { return catalog.rewards.filter(function (reward) { return reward.kind === slots[slot]; }); }
  function reward(id) { return catalog.rewards.find(function (item) { return item.id === id; }); }
  function url(id) { return '/cosmetics/season-1/' + id + '.svg?v=3'; }
  function read() {
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
  function write(value) {
    localStorage.setItem(KEY, JSON.stringify(value));
    apply(value);
    updateChoices();
    document.dispatchEvent(new CustomEvent('brasta-cosmetics-changed', { detail: value }));
  }
  function equip(slot, id) {
    if (!slots[slot] || (id && !items(slot).some(function (item) { return item.id === id; }))) return;
    var next = read();
    next[slot] = id || null;
    if (slot === 'profileTitle') next.titleSource = id ? 'season' : 'none';
    write(next);
  }
  function useEarnedTitle() {
    var next = read(); next.profileTitle = null; next.titleSource = 'earned'; write(next);
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
      return { key: item.id, name: item.name, description: item.description, artUrl: url(item.id), tier: 'standard', awardType: 'season_preview', unlocked: true, premium: item.premium, setName: catalog.sets[item.setId].name };
    });
  }
  function effectiveTitle(earned) {
    var value = read();
    if (value.titleSource === 'none') return null;
    return value.titleSource === 'season' ? titleItems().find(function (item) { return item.key === value.profileTitle; }) || null : earned;
  }
  window.BrastaCosmetics = { read: read, equip: equip, useEarnedTitle: useEarnedTitle, isOwnProfile: isOwnProfile, titleItems: titleItems, effectiveTitle: effectiveTitle };

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
      var art = item ? '<img class="cosmetic-choice-art" src="' + url(item.id) + '" alt="" draggable="false">' : '<span class="cosmetic-classic-art" aria-hidden="true">' + (slot === 'avatarFrame' ? 'B' : '♠') + '</span>';
      if (slot === 'avatarFrame') art = '<span class="cosmetic-frame-preview' + (item ? ' has-frame' : '') + '"><span class="cosmetic-preview-portrait" data-frame-portrait>B</span>' + (item ? art : '') + '</span>';
      return '<button type="button" class="cosmetic-choice ' + slot + '" data-cosmetics-equip="' + esc(item?.id || '') + '" data-cosmetics-kind="' + slot + '" aria-pressed="false"><span class="cosmetic-choice-preview">' + art + '</span><strong>' + esc(name) + '</strong><small>' + esc(item ? catalog.sets[item.setId].name : 'Brasta original') + '</small><span class="cosmetic-access' + (item?.premium ? ' premium' : '') + '">' + (item?.premium ? 'Premium' : 'Free') + '</span><span class="cosmetic-choice-state">Equip</span></button>';
    }).join('') + '</div>';
  }
  function wireChoices(container) {
    container.addEventListener('click', function (event) {
      var button = event.target.closest('[data-cosmetics-equip]');
      if (!button) return;
      var status = container.querySelector('[data-cosmetics-status]');
      try {
        equip(button.dataset.cosmeticsKind, button.dataset.cosmeticsEquip || null);
        if (status) status.textContent = slots[button.dataset.cosmeticsKind] + ' updated.';
      } catch (_) {
        if (status) status.textContent = 'Could not save your selection. Please allow browser storage and try again.';
      }
    });
  }
  function updateChoices() {
    var value = read();
    document.querySelectorAll('[data-cosmetics-equip]').forEach(function (button) {
      var selected = (value[button.dataset.cosmeticsKind] || '') === button.dataset.cosmeticsEquip;
      button.setAttribute('aria-pressed', String(selected));
      var state = button.querySelector('.cosmetic-choice-state');
      var text = selected ? 'Equipped' : 'Equip';
      if (state.textContent !== text) state.textContent = text;
    });
  }
  var frameDialog;
  function openFrames(trigger) {
    if (!frameDialog) {
      frameDialog = document.createElement('dialog');
      frameDialog.className = 'cosmetic-frame-dialog';
      frameDialog.setAttribute('aria-labelledby', 'cosmetic-frame-heading');
      frameDialog.innerHTML = '<div class="cosmetic-section-heading"><h2 id="cosmetic-frame-heading">Avatar frames</h2><button type="button" data-frame-close aria-label="Close avatar frames">×</button></div><p class="cosmetic-beta-note">' + note + '</p>' + choices('avatarFrame') + '<p class="cosmetic-status" data-cosmetics-status role="status"></p><button type="button" class="cosmetic-done" data-frame-close>Done</button>';
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
    panel.innerHTML = '<p class="cosmetic-beta-note">' + note + '</p><section aria-label="Card backs"><h3>Card backs</h3><p>Style your hand and deck.</p>' + choices('cardBack') + '</section><section aria-label="Table felts"><h3>Table felts</h3><p>A playing surface that fits your table.</p>' + choices('tableFelt') + '</section><p class="cosmetic-status" data-cosmetics-status role="status"></p>';
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
    try { localStorage.setItem(KEY, JSON.stringify(read())); } catch (_) {}
    scan();
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-cosmetics-frame-open]');
      if (trigger) openFrames(trigger);
    });
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-you', 'data-brasta-username'] });
    window.addEventListener('storage', function (event) { if (event.key === KEY || event.key === null) { scan(); updateChoices(); document.dispatchEvent(new CustomEvent('brasta-cosmetics-changed', { detail: read() })); } });
    window.addEventListener('brasta-auth-changed', schedule);
    document.dispatchEvent(new CustomEvent('brasta-cosmetics-ready'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
