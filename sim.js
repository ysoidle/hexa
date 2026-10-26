/* Hexa — balls bouncing inside a rotating hexagon. Zero dependencies. */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2, SIDE = Math.PI / 3, APO = Math.cos(Math.PI / 6);
  const SUBSTEPS = 8, TRAIL_LEN = 12, GRAVITY = 2.4, MAX_BALLS = 80;
  const WEIGHTS = [3, 2, 2, 2, 2, 2];
  const WSUM = WEIGHTS.reduce((a, b) => a + b, 0);

  // Claude brand palette: Slate / Ivory grounds, Clay as the single accent.
  const THEMES = {
    slate: {
      bg: ['#2A2927', '#1A1918'],
      hexFill: 'rgba(240,238,230,0.03)',
      ring: [240, 238, 230],
      edge: [232, 230, 220],
      vertex: '#F0EEE6',
      shadow: 'rgba(0,0,0,0.32)',
      balls: ['#D97757', '#CC785C', '#D4A27F', '#EBDBBC', '#F0EEE6', '#A8A69E'],
    },
    ivory: {
      bg: ['#FBFAF7', '#ECEAE2'],
      hexFill: 'rgba(31,30,29,0.025)',
      ring: [31, 30, 29],
      edge: [38, 38, 36],
      vertex: '#1F1E1D',
      shadow: 'rgba(31,30,29,0.16)',
      balls: ['#D97757', '#CC785C', '#D4A27F', '#30302E', '#87867F', '#E3DACC'],
    },
  };
  const ACCENT = [217, 119, 87];

  const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  for (const t of Object.values(THEMES)) {
    t.inks = t.balls.map(h => {
      const c = hexToRgb(h), lum = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
      return {
        c,
        hi: rgba(mix(c, [255, 255, 255], 0.38)),
        base: rgba(c),
        rim: rgba(mix(c, [0, 0, 0], 0.22)),
        seam: lum > 0.6 ? 'rgba(31,30,29,0.30)' : 'rgba(250,249,245,0.55)',
      };
    });
  }

  function pickInk() {
    let r = Math.random() * WSUM;
    for (let i = 0; i < WEIGHTS.length; i++) if ((r -= WEIGHTS[i]) < 0) return i;
    return 0;
  }

  function create(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    // Physics runs in "hexagon units": center at origin, circumradius = 1.
    const P = Object.assign({ spin: 0.8, grav: 1, e: 0.85, mu: 0.3, count: 24 }, opts.params);
    let theme = THEMES[opts.theme] || THEMES.slate;
    const balls = [], sparks = [];
    const flash = new Float32Array(6), NX = new Float64Array(6), NY = new Float64Array(6);
    let theta = 0, W = 1, H = 1, DPR = 1, cx = 0, cy = 0, R = 1, bg = null;
    let paused = false, visible = true, last = performance.now(), fpsT = 0, fpsN = 0;

    function makeBg() {
      bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.6);
      bg.addColorStop(0, theme.bg[0]);
      bg.addColorStop(1, theme.bg[1]);
    }

    function layout() {
      W = Math.max(1, canvas.clientWidth);
      H = Math.max(1, canvas.clientHeight);
      DPR = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      cx = W / 2; cy = H / 2;
      R = Math.min(W, H) * 0.42;
      makeBg();
      if (paused) draw();
    }

    function makeBall(x, y, vx, vy) {
      const r = 0.028 + Math.random() * 0.032;
      return { x, y, vx, vy, r, m: r * r, ink: pickInk(), rot: Math.random() * TAU, w: 0, trail: [] };
    }

    function clampInside(b) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < 6; i++) {
          const a = theta + (i + 0.5) * SIDE, nx = Math.cos(a), ny = Math.sin(a);
          const d = b.x * nx + b.y * ny, lim = APO - b.r;
          if (d > lim) { b.x -= nx * (d - lim); b.y -= ny * (d - lim); }
        }
      }
    }

    function addRandomBall() {
      const b = makeBall(0, 0, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
      for (let k = 0; k < 40; k++) {
        const rr = (APO - b.r - 0.02) * Math.sqrt(Math.random()), t = Math.random() * TAU;
        b.x = rr * Math.cos(t); b.y = rr * Math.sin(t);
        if (balls.every(o => (o.x - b.x) ** 2 + (o.y - b.y) ** 2 > (o.r + b.r + 0.005) ** 2)) break;
      }
      balls.push(b);
    }

    function syncCount() {
      while (balls.length < P.count) addRandomBall();
      while (balls.length > P.count) balls.shift();
    }

    function burst(x, y, dx, dy, power, ink, count, spread) {
      const base = Math.atan2(dy, dx);
      for (let k = 0; k < count; k++) {
        const a = base + (Math.random() - 0.5) * spread, s = power * (0.35 + Math.random() * 0.65);
        sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 2 + Math.random() * 1.5, ink });
      }
      if (sparks.length > 300) sparks.splice(0, sparks.length - 300);
    }

    function step(dt) {
      theta += P.spin * dt;
      const g = GRAVITY * P.grav, om = P.spin, e = P.e, mu = P.mu;
      for (let i = 0; i < 6; i++) {
        const a = theta + (i + 0.5) * SIDE;
        NX[i] = Math.cos(a); NY[i] = Math.sin(a);
      }

      for (const b of balls) {
        b.vy += g * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.rot += b.w * dt;
      }

      // Ball-ball collisions; mass ∝ area.
      const n = balls.length;
      for (let i = 0; i < n; i++) {
        const a = balls[i];
        for (let j = i + 1; j < n; j++) {
          const b = balls[j];
          const dx = b.x - a.x, dy = b.y - a.y, md = a.r + b.r, d2 = dx * dx + dy * dy;
          if (d2 >= md * md || d2 < 1e-12) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          const ia = 1 / a.m, ib = 1 / b.m, it = ia + ib;
          const corr = (md - d) / it;
          a.x -= nx * corr * ia; a.y -= ny * corr * ia;
          b.x += nx * corr * ib; b.y += ny * corr * ib;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const jn = -(1 + (-rv > 0.1 ? e : 0)) * rv / it;
            a.vx -= jn * ia * nx; a.vy -= jn * ia * ny;
            b.vx += jn * ib * nx; b.vy += jn * ib * ny;
          }
        }
      }

      for (const b of balls) {
        for (let i = 0; i < 6; i++) {
          const nx = NX[i], ny = NY[i];
          const d = b.x * nx + b.y * ny, lim = APO - b.r;
          if (d <= lim) continue;
          b.x -= nx * (d - lim); b.y -= ny * (d - lim);

          // 换到墙的参考系：接触点速度 v_w = ω × r
          const qx = b.x + nx * b.r, qy = b.y + ny * b.r;
          const wx = -om * qy, wy = om * qx;
          const rx = b.vx - wx, ry = b.vy - wy;
          const vn = rx * nx + ry * ny;
          if (vn <= 0) continue;

          // 法向反弹 + 库仑摩擦
          const vt = -rx * ny + ry * nx;
          const newVn = vn > 0.08 ? -e * vn : 0;
          const jn = vn - newVn;
          const newVt = Math.sign(vt) * Math.max(0, Math.abs(vt) - mu * jn);

          b.vx = wx + newVn * nx - newVt * ny;
          b.vy = wy + newVn * ny + newVt * nx;
          b.w += (-newVt / b.r - b.w) * 0.25;
          if (vn > 1.3) {
            flash[i] = Math.max(flash[i], Math.min(1, vn / 3.2));
            burst(qx, qy, -nx, -ny, vn * 0.4, b.ink, Math.min(6, (vn * 1.6) | 0), 1.6);
          }
        }
      }
    }

    function update(dt) {
      const h = dt / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) step(h);
      const g = GRAVITY * P.grav;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.vy += g * 0.3 * dt;
        p.vx *= 0.98; p.vy *= 0.98;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= p.decay * dt;
        if (p.life <= 0) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); }
      }
      for (let i = 0; i < 6; i++) flash[i] *= Math.exp(-dt * 5);
      for (const b of balls) {
        b.trail.push(b.x, b.y);
        if (b.trail.length > TRAIL_LEN * 2) b.trail.splice(0, 2);
      }
    }

    function vertex(i, s) { const a = theta + i * SIDE; return [Math.cos(a) * s, Math.sin(a) * s]; }
    function hexPath(s) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const [x, y] = vertex(i, s); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath();
    }

    function draw() {
      const T = theme;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.setTransform(DPR * R, 0, 0, DPR * R, DPR * cx, DPR * cy);
      const px = 1 / R;

      hexPath(1);
      ctx.fillStyle = T.hexFill;
      ctx.fill();

      ctx.lineWidth = px;
      for (const s of [0.25, 0.5, 0.75]) {
        hexPath(s);
        ctx.strokeStyle = rgba(T.ring, 0.04 + s * 0.06);
        ctx.stroke();
      }
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const [x, y] = vertex(i, 1); ctx.moveTo(x, y); ctx.lineTo(-x, -y); }
      ctx.strokeStyle = rgba(T.ring, 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8 * px, 0); ctx.lineTo(8 * px, 0); ctx.moveTo(0, -8 * px); ctx.lineTo(0, 8 * px);
      ctx.strokeStyle = rgba(T.ring, 0.25);
      ctx.stroke();

      // Trails and contact shadows stay inside the hexagon.
      ctx.save();
      hexPath(1);
      ctx.clip();
      ctx.lineCap = 'round';
      for (const b of balls) {
        const t = b.trail, n = t.length / 2, c = T.inks[b.ink].c;
        for (let k = 1; k < n; k++) {
          const a = k / n;
          ctx.beginPath(); ctx.moveTo(t[2 * k - 2], t[2 * k - 1]); ctx.lineTo(t[2 * k], t[2 * k + 1]);
          ctx.strokeStyle = rgba(c, a * 0.22);
          ctx.lineWidth = b.r * 1.2 * a;
          ctx.stroke();
        }
      }
      ctx.fillStyle = T.shadow;
      for (const b of balls) {
        ctx.beginPath(); ctx.arc(b.x + b.r * 0.08, b.y + b.r * 0.22, b.r * 0.98, 0, TAU); ctx.fill();
      }
      ctx.restore();

      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const [x1, y1] = vertex(i, 1), [x2, y2] = vertex(i + 1, 1), f = flash[i];
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.lineWidth = (2 + f * 2) * px;
        ctx.strokeStyle = rgba(mix(T.edge, ACCENT, Math.min(1, f * 1.4)), 0.9);
        if (f > 0.02) { ctx.shadowColor = rgba(ACCENT, f * 0.6); ctx.shadowBlur = f * 18 * DPR; }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = T.vertex;
      for (let i = 0; i < 6; i++) {
        const [x, y] = vertex(i, 1);
        ctx.beginPath(); ctx.arc(x, y, 3 * px, 0, TAU); ctx.fill();
      }

      for (const b of balls) {
        const k = T.inks[b.ink];
        const gr = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.05, b.x, b.y, b.r);
        gr.addColorStop(0, k.hi);
        gr.addColorStop(0.55, k.base);
        gr.addColorStop(1, k.rim);
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, b.rot, b.rot + 1.3);
        ctx.strokeStyle = k.seam;
        ctx.lineWidth = b.r * 0.12;
        ctx.stroke();
      }

      ctx.lineWidth = 1.5 * px;
      for (const p of sparks) {
        ctx.strokeStyle = rgba(T.inks[p.ink].c, p.life * 0.8);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); ctx.stroke();
      }
    }

    function reset() {
      balls.length = 0; sparks.length = 0; theta = 0; flash.fill(0);
      syncCount();
      if (paused) draw();
    }

    function setPaused(v) {
      paused = !!v;
      if (opts.onPause) opts.onPause(paused);
    }

    canvas.addEventListener('pointerdown', ev => {
      const rect = canvas.getBoundingClientRect();
      const a = Math.random() * TAU, s = 1.5 + Math.random() * 1.5;
      const b = makeBall((ev.clientX - rect.left - cx) / R, (ev.clientY - rect.top - cy) / R, Math.cos(a) * s, Math.sin(a) * s - 1);
      clampInside(b);
      balls.push(b);
      if (balls.length > MAX_BALLS) balls.shift();
      P.count = balls.length;
      burst(b.x, b.y, 0, 0, 1.4, b.ink, 10, TAU);
      if (opts.onCount) opts.onCount(P.count);
      if (paused) draw();
    });

    function frame(now) {
      requestAnimationFrame(frame);
      const raw = Math.min((now - last) / 1000, 0.25);
      last = now;
      if (!visible) return;
      if (!paused) update(Math.min(raw, 1 / 30));
      draw();
      fpsT += raw; fpsN++;
      if (fpsT >= 0.5) {
        if (opts.onStats) opts.onStats({ balls: balls.length, fps: Math.round(fpsN / fpsT) });
        fpsT = 0; fpsN = 0;
      }
    }

    if (global.ResizeObserver) new ResizeObserver(layout).observe(canvas);
    else global.addEventListener('resize', layout);
    if (global.IntersectionObserver) {
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(canvas);
    }

    layout();
    syncCount();
    requestAnimationFrame(frame);

    return {
      params: P,
      maxBalls: MAX_BALLS,
      set(key, v) { P[key] = v; if (key === 'count') syncCount(); if (paused) draw(); },
      apply(preset) { Object.assign(P, preset); reset(); },
      reset,
      setPaused,
      togglePause() { setPaused(!paused); },
      get paused() { return paused; },
      setTheme(name) { theme = THEMES[name] || theme; makeBg(); if (paused) draw(); },
    };
  }

  global.HexSim = { create, THEMES };
})(window);
