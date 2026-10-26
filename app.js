(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  document.documentElement.classList.add('js');

  const card = $('#demo-card');
  const stage = $('#stage');
  const hudStats = $('#hud-stats'), hudOmega = $('#hud-omega'), hudState = $('#hud-state');
  const pauseLabel = $('#btn-pause span');

  const PRESETS = {
    default: { spin: 0.8, grav: 1, e: 0.85, mu: 0.3, count: 24 },
    float: { spin: 0.35, grav: 0, e: 0.95, mu: 0, count: 32 },
    spin: { spin: 2.6, grav: 0.8, e: 0.7, mu: 0.6, count: 40 },
    bouncy: { spin: 0.5, grav: 1.4, e: 0.97, mu: 0.05, count: 12 },
    crowd: { spin: 1.2, grav: 1, e: 0.55, mu: 0.45, count: 80 },
  };
  const FORMAT = {
    spin: v => (v > 0 ? '+' : '') + v.toFixed(2),
    grav: v => v.toFixed(2),
    e: v => v.toFixed(2),
    mu: v => v.toFixed(2),
    count: v => String(v),
  };
  const sliders = {};

  const sim = HexSim.create($('#sim'), {
    theme: card.dataset.theme,
    params: PRESETS.default,
    onStats: s => { hudStats.textContent = `${s.balls} BALLS · ${s.fps} FPS`; },
    onCount: n => { sliders.count.set(n, false); clearPreset(); },
    onPause: p => {
      card.classList.toggle('is-paused', p);
      hudState.textContent = p ? 'PAUSED' : 'LIVE';
      pauseLabel.textContent = p ? '继续' : '暂停';
    },
  });

  // Sliders: fill from 0 for bipolar ranges, from min otherwise.
  for (const input of $$('input[data-key]')) {
    const key = input.dataset.key;
    const out = $(`output[for="${input.id}"]`);
    const min = +input.min, max = +input.max;
    const pct = x => ((x - min) / (max - min)) * 100;
    const paint = v => {
      const from = min < 0 ? pct(0) : 0, to = pct(v);
      input.style.setProperty('--a', Math.min(from, to) + '%');
      input.style.setProperty('--b', Math.max(from, to) + '%');
      out.textContent = FORMAT[key](v);
      if (key === 'spin') hudOmega.textContent = `ω ${FORMAT.spin(v)} rad/s`;
    };
    const set = (v, push = true) => {
      input.value = v;
      const val = +input.value;
      paint(val);
      if (push) sim.set(key, val);
    };
    input.addEventListener('input', () => { set(+input.value); clearPreset(); });
    sliders[key] = { set };
    set(sim.params[key], false);
  }

  function clearPreset() { $$('.chip').forEach(c => c.classList.remove('is-active')); }

  for (const chip of $$('[data-preset]')) {
    chip.addEventListener('click', () => {
      const p = PRESETS[chip.dataset.preset];
      sim.apply(p);
      for (const k in p) sliders[k].set(p[k], false);
      clearPreset();
      chip.classList.add('is-active');
    });
  }

  function setTheme(name) {
    card.dataset.theme = name;
    sim.setTheme(name);
    $$('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === name)));
  }
  $$('[data-theme-set]').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));

  $('#btn-pause').addEventListener('click', () => sim.togglePause());
  $('#btn-reverse').addEventListener('click', () => sliders.spin.set(-sim.params.spin));
  $('#btn-reset').addEventListener('click', () => sim.reset());

  stage.addEventListener('pointerdown', () => stage.focus({ preventScroll: true }));
  stage.addEventListener('keydown', ev => {
    const k = ev.key.toLowerCase();
    if (ev.code === 'Space') { ev.preventDefault(); sim.togglePause(); }
    else if (k === 'r') sim.reset();
    else if (k === 't') setTheme(card.dataset.theme === 'slate' ? 'ivory' : 'slate');
  });

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) sim.setPaused(true);

  // Minimal syntax highlighting for the code card.
  const code = $('#code-snippet');
  if (code) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const re = /(\/\/[^\n]*)|\b(const|let|for|if|continue|return)\b|\b(\d+(?:\.\d+)?)\b|\b(Math)\.(\w+)/g;
    code.innerHTML = code.textContent.split('\n').map(line => {
      let html = '', i = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(line))) {
        html += esc(line.slice(i, m.index));
        if (m[1]) html += `<span class="tk-c">${esc(m[1])}</span>`;
        else if (m[2]) html += `<span class="tk-k">${m[2]}</span>`;
        else if (m[3]) html += `<span class="tk-n">${m[3]}</span>`;
        else html += `<span class="tk-b">Math</span>.<span class="tk-f">${m[5]}</span>`;
        i = m.index + m[0].length;
      }
      return `<span class="ln">${html + esc(line.slice(i)) || ' '}</span>`;
    }).join('');
  }

  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const siblings = $$('.reveal', en.target.parentElement);
        en.target.style.transitionDelay = `${Math.max(0, siblings.indexOf(en.target)) * 70}ms`;
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('in'));
  }
})();
