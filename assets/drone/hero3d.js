/* Boreas hero intro — the interceptor as a 3D blueprint wireframe, built from the STEP model
   ("Mohammed_0.1 Full Shell"): CAD edges + station / meridian / radial section lines per part.
   Hidden lines are kept faint (depth-only meshes occlude the wireframe).

   One continuous motion: the assembled drone rolls about its own long axis (nose -> exhaust)
   and unscrews while it shrinks from a large, centred view into the drawing position.
   Every part follows a helical path (relative roll coupled to axial travel); wings and
   nacelles swing out radially. As the roll comes to rest, organic leader lines draw out
   to the components, then the requirement panel builds up. */
import * as THREE from 'three';

const svg = document.getElementById('dg'), hero = svg && svg.closest('.hero'), wm = document.getElementById('wm');
const NS = 'http://www.w3.org/2000/svg', D2R = Math.PI / 180;
const BASE = new URL('.', import.meta.url);
const intro = svg && svg.getAttribute('data-intro') === 'on' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
function el(name, attrs, parent) { const n = document.createElementNS(NS, name); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; }

/* ---------- easing ---------- */
function bezier(x1, y1, x2, y2) { // CSS cubic-bezier
  return function (x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const cx = 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3 - x;
      const dx = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
      if (Math.abs(cx) < 1e-5 || !dx) break; t -= cx / dx; t = Math.min(1, Math.max(0, t));
    }
    return 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  };
}
const seg = (t, a, d) => { const v = (t - a) / d; return v < 0 ? 0 : v > 1 ? 1 : v; };
const lerp = (a, b, k) => a + (b - a) * k;
const eOut = t => 1 - Math.pow(1 - t, 3);
const eIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eRoll = bezier(.42, 0, .16, 1);    // master roll: soft start, long decaying finish
const eCam = bezier(.5, 0, .18, 1);      // camera travel big -> drawing position
const eSep = bezier(.45, 0, .2, 1);      // part separation
const eTwist = bezier(.3, 0, .25, 1);    // relative unscrew roll (leads the separation a little)

/* ---------- choreography (ms, mm, degrees) ---------- */
const END = 6600;
const ROLL = { t0: 0, dur: 5000, turns: 1.25 };   // master roll about the long axis
const CAM = { t0: 450, dur: 4300 };
// pose: c = centre in SVG units, k = SVG units per mm, tilt = screen angle of the axis,
// yaw = axis turned towards/away from the viewer, pitch = view from above
const POSE0 = { c: [1010, 735], k: 3.2, tilt: 5, yaw: -10, pitch: 14, roll: -38 };
const POSE1 = { c: [1380, 705], k: 1.6, tilt: 16, yaw: -16, pitch: 20, roll: 0 };
// per part: axial travel dz, radial travel dr, relative roll phi (+ transient swing), start, duration
const MOVES = {
  nose:     { dz: 100, dr: 0,  phi: -270, swing: 0,  t0: 650,  dur: 3300 },
  sensor:   { dz: 26,  dr: 0,  phi: -180, swing: 0,  t0: 1150, dur: 3100 },
  fuselage: { dz: 0,   dr: 0,  phi: 0,    swing: 0,  t0: 0,    dur: 1 },
  tail:     { dz: -85,  dr: 0, phi: 180,  swing: 0,  t0: 850,  dur: 3300 },
  wing:     { dz: 6,   dr: 22, phi: 0,    swing: 16, t0: 1350, dur: 3000 },
  nacelle:  { dz: 10,  dr: 46, phi: 0,    swing: 24, t0: 1550, dur: 3000 }
};
const LINE = { edge: .92, grid: .34, edgeHidden: .1, gridHidden: .035 };

/* patent-style reference numerals: anchor in part-local mm, label offset in SVG units */
const CALLOUTS = [
  { part: 'nose',     at: [0, 0, 140],     dx: 10,   dy: -105, n: '10', text: 'NOSE CONE' },
  { part: 'sensor',   at: [0, 14, 152],    dx: 60,   dy: 175,  n: '12', text: 'SEEKER · SENSOR' },
  { part: 'nacelle1', at: 'c',             dx: 75,   dy: -150, n: '14', text: 'NACELLE · MOTOR' },
  { part: 'fuselage', at: [0, -34, 30],    dx: 20,   dy: 160,  n: '16', text: 'FUSELAGE · AVIONICS' },
  { part: 'wing3',    at: 'c',             dx: -90,  dy: 120,  n: '18', text: 'WING' },
  { part: 'tail',     at: [0, 70, -60],    dx: -70,  dy: 90,   n: '20', text: 'TAIL · STABILISERS' }
];

if (svg) boot().catch(err => { console.warn('[boreas] 3D intro unavailable:', err); fallback(); });

function fallback() { // static drawing from the old PNG if WebGL / assets are unavailable
  const g = document.getElementById('drone');
  if (g && !g.childNodes.length) el('image', { href: 'assets/drone-bp.png', x: 960, y: 520, width: 860, height: 500, opacity: .9 }, g);
}

async function boot() {
  /* ---------- assets ---------- */
  const [man, buf] = await Promise.all([
    fetch(new URL('drone.json', BASE)).then(r => r.json()),
    fetch(new URL('drone.bin', BASE)).then(r => r.arrayBuffer())
  ]);
  const canvas = document.createElement('canvas');
  canvas.className = 'drone3d'; canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  hero.prepend(canvas);
  window.__boreas3d = true;
  const fb = document.getElementById('drone'); if (fb) fb.textContent = ''; // drop the PNG fallback if it was shown

  const S = 1 / man.scale, BEIGE = 0xf2ede3;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(18, 1, 10, 20000);
  const root = new THREE.Group(); scene.add(root);     // pose (tilt / pitch / yaw)
  const spin = new THREE.Group(); root.add(spin);      // master roll about the long axis
  const qBase = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); // drone z (nose) -> screen right

  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  const lineMat = (o, hidden) => new THREE.LineBasicMaterial({ color: BEIGE, transparent: true, opacity: o, depthWrite: false, depthFunc: hidden ? THREE.GreaterDepth : THREE.LessEqualDepth });
  const mats = { e: lineMat(LINE.edge), g: lineMat(LINE.grid), eh: lineMat(LINE.edgeHidden, true), gh: lineMat(LINE.gridHidden, true) };

  function polyGeo(d) {
    const p = new Int16Array(buf, d.p, d.np * 3), lens = new Uint16Array(buf, d.l, d.nl);
    let segs = 0; for (const n of lens) segs += n - 1;
    const pos = new Float32Array(segs * 6); let k = 0, w = 0;
    for (const n of lens) {
      for (let i = 0; i < n - 1; i++) { const a = (k + i) * 3; for (let j = 0; j < 6; j++) pos[w++] = p[a + j] * S; }
      k += n;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return g;
  }

  const parts = {};
  for (const p of man.parts) {
    const twist = new THREE.Group(), shift = new THREE.Group(); twist.add(shift); spin.add(twist);
    const m = p.mesh, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(new Int16Array(buf, m.v, m.nv * 3), x => x * S), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, m.i, m.ni), 1));
    const occluder = new THREE.Mesh(g, depthMat); occluder.renderOrder = 0; shift.add(occluder);
    const eg = polyGeo(p.edges), gg = polyGeo(p.grid);
    [[eg, mats.e, 1], [gg, mats.g, 1], [eg, mats.eh, 2], [gg, mats.gh, 2]].forEach(([geo, mat, o]) => {
      const ls = new THREE.LineSegments(geo, mat); ls.renderOrder = o; ls.frustumCulled = false; shift.add(ls);
    });
    const kind = p.name.replace(/\d+$/, ''), a = Math.atan2(p.c[1], p.c[0]);
    parts[p.name] = { twist, shift, p, mv: MOVES[kind], dir: [Math.cos(a), Math.sin(a)], swingSign: (+p.name.slice(-1) % 2 ? 1 : -1) };
  }

  /* centre line: the roll axis, dash-dot, nose -> exhaust */
  const clGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -360), new THREE.Vector3(0, 0, 400)]);
  const clMat = new THREE.LineDashedMaterial({ color: BEIGE, transparent: true, opacity: 0, dashSize: 16, gapSize: 7, depthWrite: false });
  const cl = new THREE.Line(clGeo, clMat); cl.computeLineDistances(); cl.renderOrder = 3; root.add(cl);

  /* ---------- SVG overlay: callouts ---------- */
  const callG = document.getElementById('callouts');
  CALLOUTS.forEach((c, i) => {
    const part = parts[c.part];
    c.local = new THREE.Vector3(...(c.at === 'c' ? part.p.c : c.at));
    c.dir = c.dx < 0 ? -1 : 1;
    c.g = el('g', {}, callG);
    c.ring = el('circle', { r: 4, 'stroke-width': 1, opacity: 0 }, c.g);
    c.line = el('path', { 'stroke-width': 1.3, opacity: .85, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, c.g);
    c.dot = el('circle', { r: 3.5, fill: 'currentColor', stroke: 'none', opacity: 0 }, c.g);
    c.num = el('text', { 'font-size': 20, 'font-style': 'italic', 'text-anchor': 'middle', stroke: 'none', opacity: 0 }, c.g);
    c.num.textContent = c.n;
    c.label = el('text', { 'font-size': 13, 'letter-spacing': 3, 'text-anchor': c.dir < 0 ? 'end' : 'start', stroke: 'none', opacity: .6 }, c.g);
    c.bend = (i % 2 ? 1 : -1) * .16;
  });
  const fig = el('text', { x: 980, y: 505, 'font-size': 24, 'font-style': 'italic', 'letter-spacing': 4, stroke: 'none', opacity: 0 }, callG);
  fig.textContent = 'Fig. 1';

  /* ---------- input panel ---------- */
  const sliders = [...svg.querySelectorAll('.slider')].map(s => ({ x: +s.dataset.x, via: +(s.dataset.via || 0), label: s.querySelector('text'), bg: s.querySelector('.bg'),
    ticks: s.querySelector('.ticks'), fill: s.querySelector('.fill'), knob: s.querySelector('.knob'), ghost: s.querySelector('.ghost'), arrow: s.querySelector('.arrow') }));
  const types = [...svg.querySelectorAll('.type')].map(t => ({ el: t, full: t.textContent }));
  const wireOut = svg.querySelector('.wire-out'), wireClip = svg.querySelector('.wire-clip'), node = svg.querySelector('.node'), orbit = svg.querySelector('.node-orbit');
  const letters = wm ? [...wm.querySelectorAll('path')] : [];
  const typeAt = (o, p) => { o.el.textContent = o.full.slice(0, Math.round(o.full.length * p)); };
  const draw = (n, k) => n.setAttribute('stroke-dashoffset', (1 - k).toFixed(3));

  /* ---------- geometry helpers: SVG units <-> canvas pixels ---------- */
  let W = 1, H = 1, m = null, heroRect = null;
  let layoutKey = '';
  function measure() { // cheap; re-run every frame so late layout shifts (web fonts, resize) never misplace the drone
    const w = Math.max(1, hero.clientWidth), h = Math.max(1, hero.clientHeight), dpr = Math.min(devicePixelRatio || 1, 2);
    if (w !== W || h !== H || dpr !== renderer.getPixelRatio()) { W = w; H = h; renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); }
    m = svg.getScreenCTM(); heroRect = hero.getBoundingClientRect();
    const key = [W, H, m.a, (m.e - heroRect.left).toFixed(1), (m.f - heroRect.top).toFixed(1)].join();
    if (key !== layoutKey) { layoutKey = key; return true; }
    return false;
  }
  const svgToPx = (x, y) => [m.a * x + m.e - heroRect.left - hero.clientLeft, m.d * y + m.f - heroRect.top - hero.clientTop];
  const pxToSvg = (x, y) => [(x + heroRect.left + hero.clientLeft - m.e) / m.a, (y + heroRect.top + hero.clientTop - m.f) / m.d];
  const v3 = new THREE.Vector3();
  function project(obj, local) { // part-local mm -> SVG units
    v3.copy(local); obj.localToWorld(v3); v3.project(camera);
    return pxToSvg((v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H);
  }

  /* ---------- pose at time t ---------- */
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  function pose(t) {
    const kc = eCam(seg(t, CAM.t0, CAM.dur));
    const c = [lerp(POSE0.c[0], POSE1.c[0], kc), lerp(POSE0.c[1], POSE1.c[1], kc)];
    const k = POSE0.k * Math.pow(POSE1.k / POSE0.k, kc);            // log-lerp: zoom feels even
    const tilt = lerp(POSE0.tilt, POSE1.tilt, kc), yaw = lerp(POSE0.yaw, POSE1.yaw, kc), pitch = lerp(POSE0.pitch, POSE1.pitch, kc);
    // camera: fixed fov, distance from the requested scale, lens shift puts the origin on the target point
    const pxPerMm = k * m.a, fov = camera.fov * D2R;
    const D = H / (2 * Math.tan(fov / 2) * pxPerMm);
    camera.position.set(0, 0, D); camera.near = Math.max(10, D - 1500); camera.far = D + 1500;
    camera.aspect = W / H;
    const [px, py] = svgToPx(c[0], c[1]);
    camera.setViewOffset(W, H, W / 2 - px, H / 2 - py, W, H);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    root.quaternion.setFromAxisAngle(Z, tilt * D2R)
      .multiply(qa.setFromAxisAngle(X, pitch * D2R))
      .multiply(qb.setFromAxisAngle(Y, yaw * D2R))
      .multiply(qBase);
    // master roll about the long axis (drone z), settling into POSE1.roll
    const kr = eRoll(seg(t, ROLL.t0, ROLL.dur));
    const roll = lerp(POSE0.roll - 360 * ROLL.turns, POSE1.roll, kr);
    spin.quaternion.setFromAxisAngle(Z, roll * D2R);
    // parts: helical unscrew (relative roll leads, axial / radial travel follows)
    for (const name in parts) {
      const P = parts[name], mv = P.mv, u = seg(t, mv.t0, mv.dur);
      const ks = eSep(seg(t, mv.t0 + mv.dur * .08, mv.dur * .92)), kt = eTwist(u);
      const phi = mv.phi * kt + P.swingSign * mv.swing * Math.sin(Math.PI * eIO(u));
      P.twist.quaternion.setFromAxisAngle(Z, phi * D2R);
      P.shift.position.set(P.dir[0] * mv.dr * ks, P.dir[1] * mv.dr * ks, mv.dz * ks);
    }
    scene.updateMatrixWorld(true);
  }

  /* ---------- frame ---------- */
  let finalAnchors = null;
  function computeFinal() { // label end points come from the settled drawing
    pose(END);
    finalAnchors = CALLOUTS.map(c => project(parts[c.part].shift, c.local));
    tailTip = project(parts.tail.shift, new THREE.Vector3(0, 0, parts.tail.p.zmin));
  }
  let tailTip = [0, 0];

  function render(t) {
    letters.forEach((p, i) => { const k = eOut(seg(t, 80 + i * 90, 650)); p.setAttribute('transform', 'translate(0 ' + (60 * (1 - k)).toFixed(2) + ')'); });

    if (measure()) computeFinal();
    pose(t);
    const fade = eOut(seg(t, 0, 700));
    canvas.style.opacity = fade.toFixed(3);
    clMat.opacity = .38 * eIO(seg(t, 2600, 1400));
    renderer.render(scene, camera);

    // reference numerals: anchors ride on the (still settling) parts, ends are fixed
    CALLOUTS.forEach((c, i) => {
      const p0 = 3900 + i * 170;
      const a = project(parts[c.part].shift, c.local), f = finalAnchors[i];
      const e = [f[0] + c.dx, f[1] + c.dy];
      const vx = e[0] - a[0], vy = e[1] - a[1];
      const c1 = [a[0] + vx * .3 - vy * c.bend, a[1] + vy * .3 + vx * c.bend];
      const c2 = [a[0] + vx * .72 - vy * c.bend * .4, a[1] + vy * .72 + vx * c.bend * .4];
      c.line.setAttribute('d', 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'C' + c1.map(v => v.toFixed(1)).join(' ') + ' ' + c2.map(v => v.toFixed(1)).join(' ') + ' ' + e[0].toFixed(1) + ' ' + e[1].toFixed(1));
      draw(c.line, eIO(seg(t, p0, 750)));
      const kd = seg(t, p0 - 80, 260);
      c.dot.setAttribute('cx', a[0].toFixed(1)); c.dot.setAttribute('cy', a[1].toFixed(1));
      c.dot.setAttribute('opacity', kd.toFixed(2));
      c.dot.setAttribute('r', (3.5 * (kd < 1 ? 1 + .6 * Math.sin(Math.PI * kd) : 1)).toFixed(2));
      const kr = seg(t, p0 - 40, 700);
      c.ring.setAttribute('cx', a[0].toFixed(1)); c.ring.setAttribute('cy', a[1].toFixed(1));
      c.ring.setAttribute('r', (4 + 16 * eOut(kr)).toFixed(1));
      c.ring.setAttribute('opacity', (kr > 0 && kr < 1 ? .6 * (1 - kr) : 0).toFixed(2));
      const ty = e[1] + (c.dy < 0 ? -10 : 22);
      c.num.setAttribute('x', e[0].toFixed(1)); c.num.setAttribute('y', ty.toFixed(1));
      c.num.setAttribute('opacity', eOut(seg(t, p0 + 560, 320)).toFixed(2));
      c.label.setAttribute('x', (e[0] + c.dir * 22).toFixed(1)); c.label.setAttribute('y', ty.toFixed(1));
      c.label.textContent = c.text.slice(0, Math.round(c.text.length * seg(t, p0 + 640, 520)));
    });
    fig.setAttribute('opacity', (.85 * seg(t, 3800, 600)).toFixed(2));

    // input panel and pipeline (builds while the callouts draw)
    const T = 3500;
    typeAt(types[0], seg(t, T, 600));
    sliders.forEach((sl, i) => {
      const d0 = T + 50 + i * 110, span = sl.x - 133;
      sl.label.setAttribute('opacity', seg(t, d0, 300).toFixed(2));
      sl.bg.setAttribute('x2', (133 + 472 * eIO(seg(t, d0, 500))).toFixed(1));
      if (sl.ticks) sl.ticks.setAttribute('opacity', (.35 * seg(t, d0 + 250, 300)).toFixed(2));
      const start = d0 + 400; let pos;
      if (sl.via) {
        const p1 = eIO(seg(t, start, 650)), p2 = eIO(seg(t, start + 850, 650));
        pos = 133 + (sl.via - 133) * p1 + (sl.x - sl.via) * p2;
        sl.ghost.setAttribute('opacity', (.5 * seg(t, start + 600, 200)).toFixed(2));
        const ka = eOut(seg(t, start + 700, 350));
        sl.arrow.setAttribute('opacity', (.6 * ka).toFixed(2));
        sl.arrow.setAttribute('transform', 'translate(' + (-24 * (1 - ka)).toFixed(1) + ' 0)');
      } else pos = 133 + span * eIO(seg(t, start, 900));
      sl.fill.setAttribute('x2', pos.toFixed(1));
      sl.knob.setAttribute('opacity', seg(t, start - 150, 150).toFixed(2));
      sl.knob.setAttribute('transform', 'translate(' + (pos - sl.x).toFixed(1) + ' 0)');
    });
    wireOut.setAttribute('d', 'M781 792 L' + (tailTip[0] - 16).toFixed(1) + ' ' + tailTip[1].toFixed(1));
    wireClip.setAttribute('width', Math.max(0, (tailTip[0] - 600) * eIO(seg(t, T + 1200, 700))).toFixed(1));
    const nk = eOut(seg(t, T + 1500, 350));
    node.setAttribute('opacity', nk.toFixed(2));
    node.setAttribute('transform', 'translate(765 792) scale(' + (.4 + .6 * nk).toFixed(3) + ') translate(-765 -792)');
    const ok = seg(t, T + 1550, 900);
    orbit.setAttribute('opacity', (ok > 0 && ok < 1 ? .7 * Math.sin(ok * Math.PI) : 0).toFixed(2));
    orbit.setAttribute('transform', 'rotate(' + (180 * eIO(ok)).toFixed(1) + ' 765 792)');
    typeAt(types[1], seg(t, T + 1650, 400));
    typeAt(types[2], seg(t, T + 1000, 300));
    typeAt(types[3], seg(t, T + 1200, 700));
  }

  /* ---------- playback ---------- */
  let raf = 0, iv = 0, t0 = 0, last = 0, running = false, started = false, tNow = intro ? 0 : END;
  const now = () => performance.now();
  function stop() { running = false; cancelAnimationFrame(raf); clearInterval(iv); }
  function step() { const t = now() - t0; last = now(); tNow = Math.min(t, END); render(tNow); if (t >= END) stop(); }
  function frame() { if (!running) return; step(); if (running) raf = requestAnimationFrame(frame); }
  function play() {
    stop(); started = running = true; t0 = last = now(); tNow = 0; render(0);
    raf = requestAnimationFrame(frame);
    iv = setInterval(() => { if (running && now() - last > 40) step(); }, 33);
  }
  function skip() { if (running) { stop(); tNow = END; render(END); } }
  window.__boreasRender = t => { stop(); tNow = t; render(t); };
  window.__boreasTune = { POSE0, POSE1, MOVES, CALLOUTS, refresh: () => { layoutKey = ''; render(tNow); } };

  measure(); computeFinal();
  let rz = 0;
  const relayout = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (!running) render(tNow); }); };
  new ResizeObserver(relayout).observe(hero);
  new ResizeObserver(relayout).observe(svg);
  if (document.fonts) document.fonts.ready.then(relayout);

  if (!intro) { render(END); return; }
  const replay = document.getElementById('replay');
  if (replay) { replay.hidden = false; replay.addEventListener('click', play); }
  ['wheel', 'touchmove', 'keydown'].forEach(e => addEventListener(e, ev => { if (ev.target !== replay) skip(); }, { passive: true }));
  render(0);
  function tryStart() {
    if (started || document.visibilityState !== 'visible') return;
    const r = svg.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) play();
  }
  document.addEventListener('visibilitychange', tryStart);
  addEventListener('scroll', tryStart, { passive: true });
  tryStart();
  setTimeout(() => { if (!started) { tNow = END; render(END); } }, 2500);
}
