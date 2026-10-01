(function(){
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Reveal on scroll ----
  // **最初に登録する。** 以前はティッカーとキャンバスの後ろに置いていたため、
  // その途中で例外が出るとここに到達せず、.reveal を持つ13箇所
  //（問題提起・全機能・数値バンド・料金・FAQ・最終CTA）が opacity:0 のまま残り、
  // ページ本文が丸ごと消えた。壊れやすいものは後ろに置く。
  var counters = document.querySelectorAll('.num[data-count]');
  var countersDone = false;
  function animateCounters(){
    if(countersDone) return;
    countersDone = true;
    counters.forEach(function(el){
      var target = parseInt(el.dataset.count,10);
      var suffix = el.dataset.suffix || '';
      if(reduced){ el.textContent = target + suffix; return; }
      var dur = 1100;
      var t0 = performance.now();
      function step(t){
        var p = Math.min(1, (t-t0)/dur);
        var eased = 1 - Math.pow(1-p, 3);
        el.textContent = Math.round(target*eased) + suffix;
        if(p<1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }
  document.querySelectorAll('.num[data-static]').forEach(function(el){
    el.textContent = el.dataset.static;
  });

  var revealEls = document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in');
          if(entry.target.classList.contains('stat-band-grid')) animateCounters();
          io.unobserve(entry.target);
        }
      });
    }, {threshold:0.2});
    revealEls.forEach(function(el){ io.observe(el); });
  } else {
    // 対応していない環境では隠したままにしない
    revealEls.forEach(function(el){ el.classList.add('in'); });
    animateCounters();
  }
  if(reduced){ animateCounters(); }

  // ---- 色トークンの読み取り ----
  // getComputedStyle は同期の強制スタイル再計算を起こす。以前はローソク足の
  // 描画ループの中で 1フレームあたり68回（34本 × stroke/fill）呼んでおり、
  // それをキャンバス2枚ぶん 60fps で回していた。1回だけ読んでキャッシュし、
  // テーマが変わったときにだけ捨てる。
  var colorCache = {};
  function getVar(name){
    if(!(name in colorCache)){
      colorCache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
    }
    return colorCache[name];
  }
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  var onThemeChange = function(){ colorCache = {}; };
  if(darkQuery.addEventListener) darkQuery.addEventListener('change', onThemeChange);
  else if(darkQuery.addListener) darkQuery.addListener(onThemeChange);

  function mulberry32(a){
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---- Ticker tape ----
  var pairs = [
    {p:'USD/JPY',d:'up'},{p:'EUR/JPY',d:'down'},{p:'GBP/JPY',d:'up'},
    {p:'EUR/USD',d:'up'},{p:'AUD/JPY',d:'down'},{p:'USD/CHF',d:'up'},
    {p:'NZD/USD',d:'down'},{p:'GBP/USD',d:'up'}
  ];
  function drawSparkline(cv){
    var ctx = cv.getContext('2d');
    if(!ctx) return;
    var w = cv.width, h = cv.height;
    var dir = cv.dataset.dir;
    var rnd = mulberry32(parseInt(cv.dataset.seed,10) || 1);
    var pts = [];
    var y = h*0.5;
    for(var i=0;i<10;i++){
      y += (rnd()-0.5)*6 + (dir==='up' ? -0.9 : 0.9);
      y = Math.max(2, Math.min(h-2, y));
      pts.push(y);
    }
    ctx.clearRect(0,0,w,h);
    ctx.beginPath();
    ctx.moveTo(0, pts[0]);
    for(var j=1;j<pts.length;j++) ctx.lineTo((j/(pts.length-1))*w, pts[j]);
    ctx.strokeStyle = dir==='up' ? getVar('--profit-large') : getVar('--loss-large');
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  function buildTicker(){
    var track = document.getElementById('tickerTrack');
    if(!track) return;
    var html = '';
    for(var rep=0; rep<2; rep++){
      pairs.forEach(function(item, idx){
        html += '<span class="ticker-item"><b>'+item.p+'</b><canvas width="44" height="18" data-dir="'+item.d+'" data-seed="'+(idx+rep*97)+'"></canvas><span class="'+(item.d==='up'?'up':'down')+'">'+(item.d==='up'?'▲':'▼')+'</span></span>';
      });
    }
    track.innerHTML = html;
    track.querySelectorAll('canvas').forEach(drawSparkline);
  }

  // ---- Candlestick ambient charts ----
  function drawCandles(canvas, opts){
    if(!canvas || !canvas.parentElement) return;
    var ctx = canvas.getContext('2d');
    if(!ctx) return;
    opts = opts || {};
    var visibleOnScreen = true;

    function resize(){
      var rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = rect.width+'px';
      canvas.style.height = rect.height+'px';
      ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
    }
    resize();
    if(window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
    else window.addEventListener('resize', resize);

    var rnd = mulberry32(opts.seed || 7);
    var n = 34;
    var candles = [];
    var price = 60;
    for(var i=0;i<n;i++){
      var open = price;
      var close = open + (rnd()-0.5)*10 - 0.35;
      candles.push({open:open, close:close,
                    high:Math.max(open,close)+rnd()*4, low:Math.min(open,close)-rnd()*4});
      price = close;
    }

    // ループは常に1本だけ。以前は「1周ぶん描く → setTimeout(2600) → 再開」と
    // IntersectionObserver の再表示の両方が requestAnimationFrame を呼んでおり、
    // その2.6秒の間に画面外へスクロールして戻すと**ループが1周ごとに倍増**した。
    // 同じキャンバスを毎フレーム何重にも描き直し、電池とINPを食う。
    var rafId = null, timerId = null, frame = 0;
    function schedule(delay){
      if(rafId !== null || timerId !== null) return;
      if(delay){ timerId = setTimeout(function(){ timerId = null; schedule(0); }, delay); }
      else { rafId = requestAnimationFrame(tick); }
    }
    function tick(){
      rafId = null;
      if(visibleOnScreen) render();
    }
    function render(){
      var w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight;
      ctx.clearRect(0,0,w,h);
      var vals = candles.flatMap(function(c){return [c.high,c.low];});
      var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      var pad = (max-min)*0.15 || 1;
      min -= pad; max += pad;
      var cw = w / n;
      var up0 = getVar('--profit-large'), down0 = getVar('--loss-large');
      var visible = reduced ? n : Math.min(n, Math.floor(frame/3));
      function y(v){ return h - ((v-min)/(max-min))*h; }
      for(var i=0;i<visible;i++){
        var c = candles[i];
        var x = i*cw + cw*0.2;
        var bw = cw*0.6;
        var color = c.close >= c.open ? up0 : down0;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(x+bw/2, y(c.high));
        ctx.lineTo(x+bw/2, y(c.low));
        ctx.lineWidth = 1;
        ctx.stroke();
        var top = y(Math.max(c.open,c.close));
        var bot = y(Math.min(c.open,c.close));
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x, top, bw, Math.max(2, bot-top));
      }
      ctx.globalAlpha = 1;
      if(reduced) return;
      if(frame < n*3+20){ frame++; schedule(0); }
      else { frame = 0; schedule(2600); }
    }

    if('IntersectionObserver' in window){
      new IntersectionObserver(function(entries){
        var wasHidden = !visibleOnScreen;
        visibleOnScreen = entries[0].isIntersecting;
        if(visibleOnScreen && wasHidden) schedule(0);
      }, {threshold:0.05}).observe(canvas);
    }
    render();
  }

  // 装飾は落ちても本文に影響させない。
  try { buildTicker(); } catch(e) {}
  try { drawCandles(document.getElementById('heroChart'), {seed:11}); } catch(e) {}
  try { drawCandles(document.getElementById('ctaChart'), {seed:42}); } catch(e) {}
})();
