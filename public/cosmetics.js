/* Beta-only cosmetic equipment. This deliberately stays client-side until season ownership is live. */
(function () {
  'use strict';
  var KEY = 'brasta-beta-cosmetics-v1';
  var ART = '/cosmetics/season-1/';
  var slots = {
    cardBack: { label: 'Card back', items: [
      ['gilded_suits', 'Gilded Court'], ['velvet_club', 'Royal Crown'], ['ruby_diamond', 'Garnet Mosaic'], ['golden_wagon', 'Romani Heritage'], ['midnight', 'Astrology']
    ] },
    tableFelt: { label: 'Table felt', items: [
      ['gilded_felt', 'Gilded Court Felt'], ['woven_green', 'Royal Crown Felt'], ['garnet_felt', 'Garnet Mosaic Felt'], ['golden_hour', 'Romani Heritage Felt'], ['midnight_felt', 'Astrology Felt']
    ] },
    profileTitle: { label: 'Profile title + badge', items: [
      ['first_seat', 'Gilded Court'], ['royal_title', 'Royal Crown'], ['garnet_title', 'Garnet Mosaic'], ['golden_brasta', 'Romani Heritage'], ['astrology_title', 'Astrology']
    ] },
    avatarFrame: { label: 'Avatar frame', items: [
      ['gilded_frame', 'Gilded Bezel'], ['royal_frame', 'Royal Diadem'], ['ruby_frame', 'Garnet Halo'], ['laurel', 'Gold Coin Bezel'], ['astrology_frame', 'Orbital Halo']
    ] }
  };
  var sets = {
    gilded_court: { name: 'Gilded Court', equipment: { cardBack: 'gilded_suits', tableFelt: 'gilded_felt', profileTitle: 'first_seat', avatarFrame: 'gilded_frame' } },
    royal_crown: { name: 'Royal Crown', equipment: { cardBack: 'velvet_club', tableFelt: 'woven_green', profileTitle: 'royal_title', avatarFrame: 'royal_frame' } },
    garnet_mosaic: { name: 'Garnet Mosaic', equipment: { cardBack: 'ruby_diamond', tableFelt: 'garnet_felt', profileTitle: 'garnet_title', avatarFrame: 'ruby_frame' } },
    romani_heritage: { name: 'Romani Heritage', equipment: { cardBack: 'golden_wagon', tableFelt: 'golden_hour', profileTitle: 'golden_brasta', avatarFrame: 'laurel' } },
    astrology: { name: 'Astrology', equipment: { cardBack: 'midnight', tableFelt: 'midnight_felt', profileTitle: 'astrology_title', avatarFrame: 'astrology_frame' } }
  };
  var defaults = sets.astrology.equipment;
  function read() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { saved = {}; }
    var value = {};
    Object.keys(slots).forEach(function (slot) {
      value[slot] = Object.prototype.hasOwnProperty.call(saved, slot) ? saved[slot] : defaults[slot];
      if (!slots[slot].items.some(function (item) { return item[0] === value[slot]; })) value[slot] = null;
    });
    return value;
  }
  function write(value) { localStorage.setItem(KEY, JSON.stringify(value)); apply(value); document.dispatchEvent(new CustomEvent('brasta-cosmetics-changed', { detail: value })); }
  function url(id) { return ART + id + '.svg?v=2'; }
  function apply(value) {
    var root = document.documentElement;
    if (value.cardBack) root.dataset.brastaCardBack = value.cardBack; else delete root.dataset.brastaCardBack;
    if (value.tableFelt) root.dataset.brastaTableFelt = value.tableFelt; else delete root.dataset.brastaTableFelt;
    if (value.profileTitle) root.dataset.brastaProfileTitle = value.profileTitle; else delete root.dataset.brastaProfileTitle;
    if (value.avatarFrame) root.dataset.brastaAvatarFrame = value.avatarFrame; else delete root.dataset.brastaAvatarFrame;
    root.style.setProperty('--brasta-card-back-art', 'url("' + url(value.cardBack) + '")');
    root.style.setProperty('--brasta-table-felt-art', 'url("' + url(value.tableFelt) + '")');
    root.style.setProperty('--brasta-avatar-frame-art', 'url("' + url(value.avatarFrame) + '")');
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
  function isOwnProfile(username) {
    function clean(value) { return String(value || '').trim().replace(/^@/, '').toLowerCase(); }
    var name = clean(username);
    var accountName = clean(document.querySelector('.account-dock[data-brasta-username]')?.dataset.brastaUsername);
    var playerName = clean(document.querySelector('.player-chip.player-card[data-you="1"] .player-name')?.textContent);
    return Boolean(name && (name === accountName || name === playerName));
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
    name.textContent = titleName(rewardId);
    title.append(badge, name);
    // Keep usernames untouched: profile lookups read the heading's text.
    if (heading) heading.insertAdjacentElement('afterend', title); else container.appendChild(title);
  }
  function titleName(id) { var found = slots.profileTitle.items.find(function (x) { return x[0] === id; }); return found ? found[1] : id; }
  function optionMarkup(slot, selected) { return '<option value="">None</option>' + slots[slot].items.map(function (item) { return '<option value="' + item[0] + '"' + (item[0] === selected ? ' selected' : '') + '>' + item[1] + '</option>'; }).join(''); }
  function createPanel() {
    if (document.querySelector('.brasta-cosmetics-modal')) return;
    var modal = document.createElement('div'); modal.className = 'brasta-cosmetics-modal'; modal.hidden = true;
    modal.innerHTML = '<section class="brasta-cosmetics-panel" role="dialog" aria-modal="true" aria-labelledby="brasta-cosmetics-heading"><div class="brasta-cosmetics-head"><div><h2 id="brasta-cosmetics-heading">Beta cosmetics</h2><p>Choose a complete set or mix individual pieces. Your selections are saved in this browser for testing.</p></div><button class="brasta-cosmetics-close" type="button" aria-label="Close cosmetics">×</button></div><div class="brasta-cosmetics-set brasta-cosmetics-actions"><label class="brasta-cosmetics-slot"><h3>Matching set</h3><select class="brasta-cosmetics-select" data-cosmetics-set><option value="">Choose a set</option>' + Object.keys(sets).map(function (id) { return '<option value="' + id + '">' + sets[id].name + '</option>'; }).join('') + '</select></label><button type="button" data-cosmetics-equip-set>Equip set</button></div><div class="brasta-cosmetics-grid"></div><div class="brasta-cosmetics-actions"><button type="button" class="secondary" data-cosmetics-clear>Clear test cosmetics</button></div><div class="brasta-cosmetics-status" aria-live="polite"></div></section>';
    document.body.appendChild(modal);
    modal.querySelector('.brasta-cosmetics-close').addEventListener('click', function () { modal.hidden = true; });
    modal.addEventListener('click', function (event) { if (event.target === modal) modal.hidden = true; });
    modal.querySelector('[data-cosmetics-set]').addEventListener('change', function (event) { modal.querySelector('[data-cosmetics-equip-set]').disabled = !event.target.value; });
    modal.querySelector('[data-cosmetics-equip-set]').addEventListener('click', function () {
      var set = sets[modal.querySelector('[data-cosmetics-set]').value];
      if (!set) return;
      write(set.equipment); renderPanel(); status(set.name + ' set equipped for this browser.');
    });
    modal.querySelector('[data-cosmetics-clear]').addEventListener('click', function () { write({ cardBack: null, tableFelt: null, profileTitle: null, avatarFrame: null }); renderPanel(); status('Test cosmetics cleared.'); });
    Object.keys(slots).forEach(function (slot) {
      var wrapper = document.createElement('label'); wrapper.className = 'brasta-cosmetics-slot'; wrapper.innerHTML = '<h3>' + slots[slot].label + '</h3><select class="brasta-cosmetics-select" data-cosmetics-slot="' + slot + '">' + optionMarkup(slot, read()[slot]) + '</select>';
      wrapper.querySelector('select').addEventListener('change', function (event) { var next = read(); next[slot] = event.target.value || null; write(next); renderPanel(); status(slots[slot].label + ' updated.'); });
      modal.querySelector('.brasta-cosmetics-grid').appendChild(wrapper);
    });
  }
  function status(message) { var node = document.querySelector('.brasta-cosmetics-status'); if (node) node.textContent = message; }
  function renderPanel() {
    var value = read();
    document.querySelectorAll('[data-cosmetics-slot]').forEach(function (select) { select.value = value[select.dataset.cosmeticsSlot] || ''; });
    var setSelect = document.querySelector('[data-cosmetics-set]');
    if (setSelect) {
      setSelect.value = Object.keys(sets).find(function (id) { return Object.keys(slots).every(function (slot) { return sets[id].equipment[slot] === value[slot]; }); }) || '';
      document.querySelector('[data-cosmetics-equip-set]').disabled = !setSelect.value;
    }
    apply(value);
  }
  function openPanel() { createPanel(); renderPanel(); var modal = document.querySelector('.brasta-cosmetics-modal'); modal.hidden = false; modal.querySelector('select')?.focus(); }
  function launcher() {
    if (document.querySelector('.brasta-cosmetics-launcher')) return;
    var button = document.createElement('button'); button.className = 'brasta-cosmetics-launcher'; button.type = 'button'; button.textContent = '✦ Cosmetics'; button.addEventListener('click', openPanel); document.body.appendChild(button);
  }
  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; apply(read()); });
  }
  function start() {
    var value = read();
    // Persist only valid current slots; retired rewards cannot linger in saved equipment.
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (_) {}
    apply(value); launcher(); createPanel(); renderPanel();
    var observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-you', 'data-brasta-username'] });
    document.addEventListener('brasta-cosmetics-open', openPanel);
    window.addEventListener('storage', function (event) { if (event.key === KEY) renderPanel(); });
    window.addEventListener('brasta-auth-changed', schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
