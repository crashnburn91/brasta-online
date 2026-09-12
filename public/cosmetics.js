/* Beta-only cosmetic equipment. This deliberately stays client-side until season ownership is live. */
(function () {
  'use strict';
  var KEY = 'brasta-beta-cosmetics-v1';
  var ART = '/cosmetics/season-1/';
  var slots = {
    cardBack: { label: 'Card back', items: [
      ['gilded_suits', 'Gilded Court'], ['velvet_club', 'Velvet Conservatory'], ['ruby_diamond', 'Garnet Mosaic'], ['golden_wagon', 'Romani Heritage'], ['midnight', 'Astrology']
    ] },
    tableFelt: { label: 'Table felt', items: [
      ['gilded_felt', 'Gilded Court Felt'], ['woven_green', 'Velvet Conservatory Felt'], ['garnet_felt', 'Garnet Mosaic Felt'], ['golden_hour', 'Romani Heritage Felt'], ['midnight_felt', 'Astrology Felt']
    ] },
    profileTitle: { label: 'Profile title + badge', items: [
      ['first_seat', 'First Seat'], ['golden_guest', 'Golden Guest'], ['season_regular', 'Season Regular'], ['four_suits', 'Fourfold Crest'], ['golden_brasta', 'Golden Brasta'], ['season_keepsake', 'Season Keepsake'], ['astrology_title', 'Astrology']
    ] },
    avatarFrame: { label: 'Avatar frame', items: [
      ['laurel', 'Gold Coin Bezel'], ['ruby_frame', 'Garnet Halo'], ['astrology_frame', 'Orbital Halo']
    ] }
  };
  var defaults = { cardBack: 'midnight', tableFelt: 'midnight_felt', profileTitle: 'astrology_title', avatarFrame: 'astrology_frame' };
  function read() { try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { return Object.assign({}, defaults); } }
  function write(value) { localStorage.setItem(KEY, JSON.stringify(value)); apply(value); document.dispatchEvent(new CustomEvent('brasta-cosmetics-changed', { detail: value })); }
  function url(id) { return ART + id + '.svg'; }
  function apply(value) {
    var root = document.documentElement;
    root.dataset.brastaCardBack = value.cardBack || '';
    root.dataset.brastaTableFelt = value.tableFelt || '';
    root.dataset.brastaProfileTitle = value.profileTitle || '';
    root.dataset.brastaAvatarFrame = value.avatarFrame || '';
    root.style.setProperty('--brasta-card-back-art', 'url("' + url(value.cardBack) + '")');
    root.style.setProperty('--brasta-table-felt-art', 'url("' + url(value.tableFelt) + '")');
    root.style.setProperty('--brasta-avatar-frame-art', 'url("' + url(value.avatarFrame) + '")');
    document.querySelectorAll('.player-chip.player-card[data-you="1"] .player-name-line').forEach(function (line) {
      var old = line.querySelector('[data-beta-cosmetic-title]');
      if (!value.profileTitle) { if (old) old.remove(); return; }
      var text = ' · ' + titleName(value.profileTitle);
      if (old && old.textContent === text) return;
      if (old) old.remove();
      var title = document.createElement('span'); title.dataset.betaCosmeticTitle = '1'; title.className = 'beta-cosmetic-title'; title.textContent = text; line.appendChild(title);
    });
    document.querySelectorAll('.account-dock,.account-profile-head').forEach(function (node) {
      var old = node.querySelector('[data-beta-cosmetic-title]'); var h = node.querySelector('h2');
      if (!h || !value.profileTitle) { if (old) old.remove(); return; }
      var text = titleName(value.profileTitle);
      if (old && old.textContent === text) return;
      if (old) old.remove();
      var title = document.createElement('span'); title.dataset.betaCosmeticTitle = '1'; title.className = 'beta-cosmetic-title'; title.textContent = text; h.appendChild(title);
    });
  }
  function titleName(id) { var found = slots.profileTitle.items.find(function (x) { return x[0] === id; }); return found ? found[1] : id; }
  function optionMarkup(slot, selected) { return slots[slot].items.map(function (item) { return '<option value="' + item[0] + '"' + (item[0] === selected ? ' selected' : '') + '>' + item[1] + '</option>'; }).join(''); }
  function createPanel() {
    if (document.querySelector('.brasta-cosmetics-modal')) return;
    var modal = document.createElement('div'); modal.className = 'brasta-cosmetics-modal'; modal.hidden = true;
    modal.innerHTML = '<section class="brasta-cosmetics-panel" role="dialog" aria-modal="true" aria-labelledby="brasta-cosmetics-heading"><div class="brasta-cosmetics-head"><div><h2 id="brasta-cosmetics-heading">Beta cosmetics</h2><p>Equip the season assets locally and test them in a match. These selections are saved only in this browser.</p></div><button class="brasta-cosmetics-close" type="button" aria-label="Close cosmetics">×</button></div><div class="brasta-cosmetics-grid"></div><div class="brasta-cosmetics-actions"><button type="button" data-cosmetics-equip-set>Equip Astrology set</button><button type="button" class="secondary" data-cosmetics-clear>Clear test cosmetics</button></div><div class="brasta-cosmetics-status" aria-live="polite"></div></section>';
    document.body.appendChild(modal);
    modal.querySelector('.brasta-cosmetics-close').addEventListener('click', function () { modal.hidden = true; });
    modal.addEventListener('click', function (event) { if (event.target === modal) modal.hidden = true; });
    modal.querySelector('[data-cosmetics-equip-set]').addEventListener('click', function () { write(defaults); renderPanel(); status('Astrology set equipped for this browser.'); });
    modal.querySelector('[data-cosmetics-clear]').addEventListener('click', function () { write({}); renderPanel(); status('Test cosmetics cleared.'); });
    Object.keys(slots).forEach(function (slot) {
      var wrapper = document.createElement('label'); wrapper.className = 'brasta-cosmetics-slot'; wrapper.innerHTML = '<h3>' + slots[slot].label + '</h3><select class="brasta-cosmetics-select" data-cosmetics-slot="' + slot + '">' + optionMarkup(slot, read()[slot]) + '</select>';
      wrapper.querySelector('select').addEventListener('change', function (event) { var next = read(); next[slot] = event.target.value; write(next); status(slots[slot].label + ' updated.'); });
      modal.querySelector('.brasta-cosmetics-grid').appendChild(wrapper);
    });
  }
  function status(message) { var node = document.querySelector('.brasta-cosmetics-status'); if (node) node.textContent = message; }
  function renderPanel() { var value = read(); document.querySelectorAll('[data-cosmetics-slot]').forEach(function (select) { select.value = value[select.dataset.cosmeticsSlot] || ''; }); apply(value); }
  function openPanel() { createPanel(); renderPanel(); var modal = document.querySelector('.brasta-cosmetics-modal'); modal.hidden = false; modal.querySelector('select')?.focus(); }
  function launcher() {
    if (document.querySelector('.brasta-cosmetics-launcher')) return;
    var button = document.createElement('button'); button.className = 'brasta-cosmetics-launcher'; button.type = 'button'; button.textContent = '✦ Cosmetics'; button.addEventListener('click', openPanel); document.body.appendChild(button);
  }
  function start() { apply(read()); launcher(); createPanel(); var observer = new MutationObserver(function () { apply(read()); }); observer.observe(document.body, { childList: true, subtree: true }); document.addEventListener('brasta-cosmetics-open', openPanel); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
