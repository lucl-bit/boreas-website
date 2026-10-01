/* TEMPORARY palette tool.
   Try colour compositions on the live page without touching the rest of the site:
   it only sets html[data-hero | data-blocks | data-base], which assets/dev/palette.css turns into colours.
   The choice is remembered in this browser (localStorage). To ship without it, delete assets/dev/
   and the <link> + <script> pair in index.html. */
(function () {
  var KEY = 'boreas-palette-v1', root = document.documentElement;
  var ORIGINAL = { hero: 'original', blocks: 'blocks', base: 'white' };
  var FLAT = { hero: 'blue', blocks: 'uniform', base: 'white' };
  var state = {};

  function sanitize(s) {
    s = s || {};
    return {
      hero: ['original', 'blue', 'white'].indexOf(s.hero) < 0 ? FLAT.hero : s.hero,
      blocks: ['blocks', 'uniform'].indexOf(s.blocks) < 0 ? FLAT.blocks : s.blocks,
      base: ['white', 'paper', 'beige'].indexOf(s.base) < 0 ? FLAT.base : s.base
    };
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  var ui = null;
  function apply() {
    root.setAttribute('data-hero', state.hero);
    root.setAttribute('data-blocks', state.blocks);
    root.setAttribute('data-base', state.base);
    try { if (window.__boreasInk) window.__boreasInk(); } catch (e) {} // 3D drawing ink follows the hero
    if (ui) sync();
  }
  function set(patch) { for (var k in patch) state[k] = patch[k]; state = sanitize(state); save(); apply(); }

  state = sanitize(load() || FLAT); // default: flat blue top, white rest
  apply();

  /* ---------- UI (built once the header exists) ---------- */
  var HERO = [['original', 'Light & shadow'], ['blue', 'Flat blue'], ['white', 'White']];
  var BLOCKS = [['blocks', 'Colour blocks'], ['uniform', 'One background']];
  var BASE = [['white', 'White', '#ffffff'], ['paper', 'Paper', '#f8f7f3'], ['beige', 'Beige', '#f2ede3']];
  var ICON = '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 1a5 5 0 0 1 0 10z" fill="currentColor"/></svg>';

  function seg(name, opts, cls) {
    return '<div class="dev-seg ' + (cls || '') + '" data-key="' + name + '">' + opts.map(function (o) {
      return '<button type="button" data-val="' + o[0] + '" aria-pressed="false">' + (o[2] ? '<i style="background:' + o[2] + '"></i>' : '') + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function build() {
    var head = document.getElementById('site-header');
    if (!head || ui) return;
    head.classList.add('has-dev');

    var panel = document.createElement('div');
    panel.className = 'dev-panel'; panel.id = 'dev-panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Palette tool');
    panel.innerHTML =
      '<div class="dev-head"><div><b>Palette</b><small>Dev tool · temporary</small></div><button class="dev-close" type="button">Back to site</button></div>' +
      '<div class="dev-body">' +
        '<div class="dev-presets"><button type="button" data-preset="original">Original</button><button type="button" data-preset="flat">Flat blue + white</button></div>' +
        '<fieldset class="dev-group"><legend>Top (header + hero)</legend>' + seg('hero', HERO) + '</fieldset>' +
        '<fieldset class="dev-group"><legend>Sections</legend>' + seg('blocks', BLOCKS) + '</fieldset>' +
        '<fieldset class="dev-group" id="dev-base"><legend>Background of "One background"</legend>' + seg('base', BASE, 'swatches') + '<span class="dev-hint">Also used for the footer.</span></fieldset>' +
      '</div>' +
      '<div class="dev-note">Changes only colours and are kept in this browser. Close the panel to see the page as it is.</div>';
    document.body.appendChild(panel);

    function mkToggle(extra) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'dev-toggle ' + (extra || ''); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'dev-panel');
      b.innerHTML = ICON + '<span>Palette</span>';
      b.addEventListener('click', function () { toggle(); });
      return b;
    }
    var right = head.querySelector('.nav-right'), menu = document.getElementById('menu-toggle');
    var toggles = [];
    if (right) { var d = mkToggle(); right.appendChild(d); toggles.push(d); }
    var m = mkToggle('dev-mobile'); head.insertBefore(m, menu || null); toggles.push(m);

    ui = { head: head, panel: panel, toggles: toggles, groups: panel.querySelectorAll('.dev-seg'), base: panel.querySelector('#dev-base') };

    panel.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('dev-close')) return toggle(false);
      if (b.dataset.preset) return set(b.dataset.preset === 'original' ? ORIGINAL : FLAT);
      var g = b.closest('.dev-seg'); if (g && b.dataset.val) { var p = {}; p[g.dataset.key] = b.dataset.val; set(p); }
    });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) toggle(false); });
    addEventListener('scroll', place, { passive: true });
    addEventListener('resize', place);
    sync();
  }

  function sync() {
    [].forEach.call(ui.groups, function (g) {
      [].forEach.call(g.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', state[g.dataset.key] === b.dataset.val ? 'true' : 'false'); });
    });
    if (state.blocks === 'uniform') ui.base.removeAttribute('data-off'); else ui.base.setAttribute('data-off', '');
  }

  function place() { // hang the panel just below the (sticky, height-changing) header
    if (!ui || ui.panel.hidden) return;
    ui.panel.style.top = Math.round(ui.head.getBoundingClientRect().bottom + 8) + 'px';
    ui.panel.style.maxHeight = Math.max(160, innerHeight - ui.head.getBoundingClientRect().bottom - 24) + 'px';
  }
  function toggle(open) {
    if (open === undefined) open = ui.panel.hidden;
    ui.panel.hidden = !open;
    ui.toggles.forEach(function (t) { t.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    if (open) { place(); var cur = ui.panel.querySelector('button[aria-pressed="true"]'); if (cur) cur.focus({ preventScroll: true }); }
    else { var t = ui.toggles.filter(function (x) { return x.offsetParent; })[0]; if (t && ui.panel.contains(document.activeElement)) t.focus({ preventScroll: true }); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
