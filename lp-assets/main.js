(function(){
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Ticker tape ----
  var pairs = [
    {p:'USD/JPY',d:'up'},{p:'EUR/JPY',d:'down'},{p:'GBP/JPY',d:'up'},
    {p:'EUR/USD',d:'up'},{p:'AUD/JPY',d:'down'},{p:'USD/CHF',d:'up'},
    {p:'NZD/USD',d:'down'},{p:'GBP/USD',d:'up'}
  ];
  var track = document.getElementById('tickerTrack');
  function buildTicker(){
    var html = '';
    for(var rep=0; rep<2; rep++){
      pairs.forEach(function(item, idx){
        html += '<span class="ticker-item"><b>'+item.p+'</b><canvas width="44" height="18" data-dir="'+item.d+'" data-seed="'+(idx+rep*97)+'"></canvas><span class="'+(item.d==='up'?'up':'down')+'">'+(item.d==='up'?'▲':'▼')+'</span></span>';
      });
    }
    track.innerHTML = html;
    track.querySelectorAll('canvas').forEach(drawSparkline);
  }
  function drawSparkline(cv){
    var ctx = cv.getContext('2d');
    var w = cv.width, h = cv.height;
    var dir = cv.dataset.dir;
    var seed = parseInt(cv.dataset.seed,10) || 1;
    var rnd = mulberry32(seed);
    var pts = [];
    var y = h*0.5;
    for(var i=0;i<10;i++){
      var bias = dir==='up' ? -0.9 : 0.9;
      y += (rnd()-0.5)*6 + bias;
      y = Math.max(2, Math.min(h-2, y));
      pts.push(y);
    }
    ctx.clearRect(0,0,w,h);
    ctx.beginPath();
    ctx.moveTo(0, pts[0]);
    for(var i=1;i<pts.length;i++){
      var x = (i/(pts.length-1))*w;
      ctx.lineTo(x, pts[i]);
    }
    ctx.strokeStyle = dir==='up' ? getVar('--profit') : getVar('--loss');
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  function mulberry32(a){
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function getVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }
  buildTicker();

  // ---- Candlestick ambient charts ----
  function drawCandles(canvas, opts){
    opts = opts || {};
    var ctx = canvas.getContext('2d');
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
    if(window.ResizeObserver){
      new ResizeObserver(resize).observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', resize);
    }
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(entries){
        var wasHidden = !visibleOnScreen;
        visibleOnScreen = entries[0].isIntersecting;
        if(visibleOnScreen && wasHidden) requestAnimationFrame(tick);
      }, {threshold:0.05}).observe(canvas);
    }

    var rnd = mulberry32(opts.seed || 7);
    var n = 34;
    var candles = [];
    var price = 60;
    for(var i=0;i<n;i++){
      var trendBias = -0.35;
      var open = price;
      var close = open + (rnd()-0.5)*10 + trendBias;
      var high = Math.max(open,close) + rnd()*4;
      var low = Math.min(open,close) - rnd()*4;
      candles.push({open:open, close:close, high:high, low:low});
      price = close;
    }

    var frame = 0;
    function render(){
      var w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight;
      ctx.clearRect(0,0,w,h);
      var vals = candles.flatMap(function(c){return [c.high,c.low];});
      var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      var pad = (max-min)*0.15 || 1;
      min -= pad; max += pad;
      var cw = w / n;
      var visible = reduced ? n : Math.min(n, Math.floor(frame/3));
      for(var i=0;i<visible;i++){
        var c = candles[i];
        var x = i*cw + cw*0.2;
        var bw = cw*0.6;
        function y(v){ return h - ((v-min)/(max-min))*h; }
        var up = c.close >= c.open;
        ctx.strokeStyle = up ? getVar('--profit') : getVar('--loss');
        ctx.fillStyle = up ? getVar('--profit') : getVar('--loss');
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
      if(!reduced && frame < n*3+20){
        frame++;
        requestAnimationFrame(tick);
      } else if(!reduced){
        frame = 0;
        setTimeout(function(){ requestAnimationFrame(tick); }, 2600);
      }
    }
    function tick(){
      if(visibleOnScreen) render();
    }
    render();
  }
  drawCandles(document.getElementById('heroChart'), {seed:11});
  drawCandles(document.getElementById('ctaChart'), {seed:42});

  // ---- Counters ----
  var counters = document.querySelectorAll('.num[data-count]');
  var countersDone = false;
  function animateCounters(){
    if(countersDone) return;
    countersDone = true;
    counters.forEach(function(el){
      var target = parseInt(el.dataset.count,10);
      var suffix = el.dataset.suffix || '';
      if(reduced){ el.textContent = target + suffix; return; }
      var start = 0;
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

  // ---- Reveal on scroll ----
  var revealEls = document.querySelectorAll('.reveal');
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
  if(reduced){ animateCounters(); }
})();
