// /local/rain.js – Cinematic Rain (Tiefe+Böen+Splashes+Ripples) mit robustem Live-Switch
(() => {
  // ========= Konfiguration ===================================================
  const ENTITY_IDS = [
    'input_boolean.regen',        // <- dein Regenschalter
    // 'input_boolean.schneefall', // <- optional: gilt auch, wenn dieser an ist
  ];
  const FALLBACK_DEFAULT_ON = true; // wenn keine der Entities existiert: true = Regen an

  const INTENSITY   = 1.1;   // 0.5 Niesel ... 2.0 Starkregen
  const WIND_MEAN   = 0.7;   // Grundwind (px/Frame nach rechts; negativ = links)
  const GUSTS       = true;  // Böen an/aus
  const GUST_RANGE  = 1.0;   // Böen-Stärke
  const GUST_CHANGE = 1500;  // ms bis neues Böen-Ziel
  const SPLASHES    = true;
  const RIPPLES     = true;
  const FOG         = true;

  // Sichtbarere Tropfenfarbe als reines Weiß (auf hellen Themes besser)
  function dropColor(a){ return `rgba(185,205,255,${a})`; }

  // ========= State ===========================================================
  let running=false, raf=0, c, ctx, w=0, h=0, DPR=1, resizeFn;
  let drops=[], splashes=[], ripples=[];
  let wind=WIND_MEAN, windTarget=WIND_MEAN, lastGust=0;

  if (window.__rainOverlay) return; // Doppelladen verhindern
  window.__rainOverlay = true;
  console.log('[rain] init');

  // ========= Canvas ==========================================================
  function setupCanvas(){
    if (!c){
      c = document.createElement('canvas');
      c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:100000';
      document.documentElement.appendChild(c);
      ctx = c.getContext('2d',{alpha:true});
      ctx.lineCap='round';
    }
    DPR = Math.min(window.devicePixelRatio||1, 2);
    w = innerWidth; h = innerHeight;
    c.width  = Math.round(w*DPR);
    c.height = Math.round(h*DPR);
    c.style.width  = w+'px';
    c.style.height = h+'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }

  // ========= Tropfen =========================================================
  function initDrops(){
    const lowPower = matchMedia('(prefers-reduced-motion: reduce)').matches ||
                     (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
    const base = lowPower ? 300 : 600;
    const scale = Math.min((w*h)/(1920*1080), 2);
    const N = Math.max(150, Math.round(base*scale*INTENSITY));
    const rnd=(a,b)=>a+Math.random()*(b-a);

    drops = Array.from({length:N}, () => {
      const z = rnd(0.55, 1.25); // Tiefe
      return {
        x: Math.random()*w,
        y: Math.random()*h - h,
        z,
        speed: rnd(7, 16)*z,
        jx: rnd(-0.15, 0.15),
        thick: rnd(0.6, 1.6)*z,
        alpha: rnd(0.32, 0.7),
        lenF: rnd(12, 26)*(0.9+0.4*z)
      };
    });
    splashes.length = 0;
    ripples.length  = 0;
  }
  function respawn(d){
    d.x = Math.random()*w;
    d.y = -Math.random()*h*0.6 - 20;
    d.alpha = Math.min(0.9, Math.max(0.2, d.alpha + (Math.random()-0.5)*0.2));
  }

  // ========= Effekte =========================================================
  function addSplash(x, y, power){
    if (!SPLASHES) return;
    const n = 3 + (power>1.4 ? 3 : 1) + (Math.random()*2|0);
    for (let i=0;i<n;i++){
      const ang = (-Math.PI/2) + (Math.random()-0.5)*0.9;
      const spd = power*(0.6+Math.random()*0.7);
      splashes.push({ x, y, vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd*0.6, life: 14+Math.random()*10 });
    }
    if (RIPPLES){
      ripples.push({ x, y: h-1, r: 0, maxR: 10 + Math.random()*22, alpha: 0.35 });
    }
  }
  function updateWind(now){
    if (!GUSTS) return;
    if (now - lastGust > GUST_CHANGE){
      lastGust = now;
      windTarget = WIND_MEAN + (Math.random()*2 - 1) * GUST_RANGE;
    }
    wind += (windTarget - wind) * 0.02;
  }
  function drawFog(){
    if (!FOG) return;
    const fogH = Math.min(140, h*0.18);
    const g = ctx.createLinearGradient(0, h-fogH, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.00)');
    g.addColorStop(1, 'rgba(255,255,255,0.07)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h-fogH, w, fogH);
  }

  // ========= Loop ============================================================
  function frame(ts){
    if (!running) return;
    updateWind(ts);
    ctx.clearRect(0,0,w,h);
    drawFog();

    for (const d of drops){
      const vx = (wind * (0.6 + 0.6*d.z)) + d.jx;
      const vy = d.speed;
      const L  = d.lenF;
      const inv = 1 / Math.hypot(vx, vy);
      const x2 = d.x - vx * inv * L;
      const y2 = d.y - vy * inv * L;

      ctx.strokeStyle = dropColor(d.alpha);
      ctx.lineWidth = d.thick;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();

      d.x += vx; d.y += vy;
      if (d.y > h){ addSplash(d.x, h-1, Math.min(2.4, vy/8)); respawn(d); }
      if (d.x > w+24) d.x = -24; else if (d.x < -24) d.x = w+24;
    }

    if (SPLASHES && splashes.length){
      ctx.fillStyle = 'rgba(200,220,255,0.9)';
      for (let i=splashes.length-1;i>=0;i--){
        const s = splashes[i];
        s.x += s.vx; s.y += s.vy; s.vy += 0.45; s.life -= 1;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.9, 0, Math.PI*2); ctx.fill();
        if (s.y > h || s.life<=0) splashes.splice(i,1);
      }
    }
    if (RIPPLES && ripples.length){
      for (let i=ripples.length-1;i>=0;i--){
        const r = ripples[i];
        r.r += 0.9; r.alpha *= 0.94;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.scale(1, 0.32);
        ctx.strokeStyle = `rgba(200,220,255,${r.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0,0,r.r,0,Math.PI*2); ctx.stroke();
        ctx.restore();
        if (r.r > r.maxR || r.alpha < 0.03) ripples.splice(i,1);
      }
    }

    raf = requestAnimationFrame(frame);
  }

  // ========= Start/Stop ======================================================
  function start(){
    if (running) return;
    running = true;
    setupCanvas();
    initDrops();
    lastGust = performance.now();
    resizeFn = () => { setupCanvas(); initDrops(); };
    addEventListener('resize', resizeFn, { passive:true });
    raf = requestAnimationFrame(frame);
    console.log('[rain] started');
  }
  function stop(){
    if (!running) return;
    running=false;
    cancelAnimationFrame(raf);
    removeEventListener('resize', resizeFn);
    c?.remove(); c=null; ctx=null;
    drops.length=0; splashes.length=0; ripples.length=0;
    console.log('[rain] stopped');
  }
  window.__startRain = start;
  window.__stopRain  = stop;

  function apply(on){ if (on && !running) start(); if (!on && running) stop(); }

  // ========= HA-Switch beobachten ===========================================
  const getHass = () => document.querySelector('home-assistant')?.hass;
  async function waitForHass(maxMs=10000){
    const t0=Date.now();
    while (Date.now()-t0<maxMs){
      const h=getHass();
      if (h && h.states) return h;
      await new Promise(r=>setTimeout(r,100));
    }
    return null;
  }

  (async () => {
    const hass = await waitForHass();

    function anyOn(h) {
      let anyFound = false;
      for (const id of ENTITY_IDS) {
        if (h?.states?.[id] !== undefined) {
          anyFound = true;
          if (h.states[id].state === 'on') return {found:true, on:true};
        }
      }
      return {found:anyFound, on:false};
    }

    // Initial
    let status = anyOn(hass);
    if (!status.found && FALLBACK_DEFAULT_ON) status = {found:false, on:true};
    apply(status.on);
    console.log('[rain] entities found:', status.found, 'on:', status.on);

    // Polling
    setInterval(() => {
      const h = getHass();
      let st = anyOn(h);
      if (!st.found && FALLBACK_DEFAULT_ON) st = {found:false, on:true};
      const shouldRun = st.on;
      if (shouldRun && !running) start();
      if (!shouldRun && running) stop();
    }, 300);
  })();
})();
