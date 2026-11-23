(function () {
  var DEFAULT_M3U = '#EXTM3U\n#EXTINF:-1 group-title="Anime",Toonami Aftermath (EST)\nhttps://n8.toonamiaftermath.com/livehttporigin/est/8LRgwF-mFxJvE-playlist.m3u8\n#EXTINF:-1 group-title="Anime",Toonami Aftermath (EST vertraagd)\nhttps://api.toonamiaftermath.com/est-vertraagd\n#EXTINF:-1 group-title="Anime",Toonami Aftermath (West)\nhttps://api.toonamiaftermath.com/pst\n#EXTINF:-1 group-title="Anime",Toonami Aftermath (Movies)\nhttps://api.toonamiaftermath.com/movies\n#EXTINF:-1 group-title="Anime",Snick (EST)\nhttps://api.toonamiaftermath.com/snick\n#EXTINF:-1 group-title="Anime",Snick (West)\nhttps://api.toonamiaftermath.com/snick-west\n#EXTINF:-1 group-title="Nieuws",NHK World-Japan\nhttps://masterpl.hls.nhkworld.jp/hls/w/live/master.m3u8\n#EXTINF:-1 group-title="Retro",RetroBlast\nhttps://retroblast.tv/hls/stream.m3u8\n';
  var $ = function (s) { return document.querySelector(s); };
  var video = $('#video'), panel = $('#panel'), listEl = $('#list'), groupsEl = $('#groups');
  var setup = $('#setup'), urlInput = $('#url'), msg = $('#msg'), osd = $('#osd'), search = $('#search'), qInput = $('#q');
  var ROWS = 11;
  var EXTRA = [
    { url: 'https://iptv-org.github.io/iptv/countries/nl.m3u', group: 'Nederland' },
    { url: 'https://iptv-org.github.io/iptv/languages/jpn.m3u', group: 'Japan' },
    { url: 'https://iptv-org.github.io/iptv/languages/eng.m3u', group: 'Engels' },
    { url: 'https://iptv-org.github.io/iptv/languages/zho.m3u', group: 'Chinees' },
    { url: 'https://iptv-org.github.io/iptv/languages/rus.m3u', group: 'Russisch' }
  ];
  var OWNG = 'Eigen lijst';
  var ownUrl = '';
  try { ownUrl = localStorage.getItem('ownUrl') || ''; } catch (err) { ownUrl = ''; }
  if (ownUrl) EXTRA.unshift({ url: ownUrl, group: OWNG });
  var extraLoaded = {}, extraLoading = {};
  function isExtra(name) {
    for (var i = 0; i < EXTRA.length; i++) { if (EXTRA[i].group === name) return true; }
    return false;
  }

  // ---------- Favorieten ----------
  var ovr = {};
  try { ovr = JSON.parse(localStorage.getItem('ovr') || '{}') || {}; } catch (err) { ovr = {}; }
  var editTarget = null;
  var FAV = '\u25C6 Favorieten', SEARCH = 'Zoeken', searchQuery = '';
  var favs = {};
  try { favs = JSON.parse(localStorage.getItem('favs') || '{}') || {}; } catch (err) { favs = {}; }
  function isFav(c) { return !!favs[c.url]; }
  function saveFavs() { try { localStorage.setItem('favs', JSON.stringify(favs)); } catch (err) {} }
  function toggleFav(c) {
    if (!c) return;
    if (favs[c.url]) { delete favs[c.url]; showOsd('Uit favorieten: ' + c.name); }
    else { favs[c.url] = true; showOsd('\u25C6 Favoriet: ' + c.name); }
    saveFavs();
    if (groups[gi] === FAV) {
      filtered = channels.filter(isFav);
      if (sel > filtered.length) sel = filtered.length;
    }
    renderList();
  }

  var channels = [], groups = ['Alle'], gi = 0, filtered = [], sel = 0, top = 0;
  var playingUrl = null, playingIdx = -1, hls = null, osdTimer, triedHls = false, isHlsNow = false, streamUrl = null;

  // ---------- M3U ----------
  function parseM3U(text) {
    var out = [], lines = text.split(/\r?\n/), meta = null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (!l) continue;
      if (l.indexOf('#EXTINF') === 0) {
        var name = l.substring(l.lastIndexOf(',') + 1).trim();
        var g = /group-title="([^"]*)"/.exec(l);
        var logo = /tvg-logo="([^"]*)"/.exec(l);
        meta = { name: name || 'Kanaal', group: g && g[1] ? g[1] : 'Overig', logo: logo ? logo[1] : '' };
      } else if (l[0] !== '#' && meta) {
        meta.url = l; meta.ord = out.length; out.push(meta); meta = null;
      }
    }
    return out;
  }

  function load(url, cb, tmo) {
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.timeout = tmo || 30000;
    x.onload = function () {
      if (x.status >= 200 && x.status < 300) cb(null, x.responseText);
      else cb('HTTP ' + x.status);
    };
    x.onerror = function () { cb('Netwerkfout of CORS-blokkade'); };
    x.ontimeout = function () { cb('Timeout'); };
    x.send();
  }

  var OWN = ['Anime', 'Nieuws', 'Retro'];
  function sortChannels(list) {
    return list.slice().sort(function (a, b) {
      var ia = OWN.indexOf(a.group), ib = OWN.indexOf(b.group);
      if (ia < 0) ia = 99;
      if (ib < 0) ib = 99;
      if (ia !== ib) return ia - ib;
      var ga = a.group.toLowerCase(), gb = b.group.toLowerCase();
      if (ga !== gb) return ga < gb ? -1 : 1;
      if (a.group === OWNG) return (a.ord || 0) - (b.ord || 0);
      var na = a.name.toLowerCase(), nb = b.name.toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
  }

  function setChannels(list, keepGroup) {
    list.forEach(function (c) { if (ovr[c.name]) c.url = ovr[c.name]; });
    channels = sortChannels(list);
    var seen = {};
    groups = ['Alle', FAV, SEARCH];
    channels.forEach(function (c) {
      if (!seen[c.group] && !isExtra(c.group)) { seen[c.group] = 1; groups.push(c.group); }
    });
    EXTRA.forEach(function (e) { groups.push(e.group); });
    gi = keepGroup ? Math.max(0, groups.indexOf(keepGroup)) : 0;
    applyGroup();
  }

  function applyGroup() {
    filtered = gi === 0 ? channels : groups[gi] === FAV ? channels.filter(isFav) : groups[gi] === SEARCH ? channels.filter(function (c) { return searchQuery && c.name.toLowerCase().indexOf(searchQuery) >= 0; }) : channels.filter(function (c) { return c.group === groups[gi]; });
    // rij 0 = instellingen
    sel = filtered.length ? 1 : 0; top = 0; renderList();
  }

  // ---------- UI ----------
  function renderList() {
    var gname = groups[gi] === SEARCH ? (searchQuery ? 'Zoeken: ' + searchQuery : 'Zoeken (GROEN)') : groups[gi];
    var cnt = (isExtra(groups[gi]) && !extraLoaded[groups[gi]]) ? 'laden…' : filtered.length;
    groupsEl.textContent = '◄ ' + gname + ' (' + cnt + ') ►';
    var total = filtered.length + 1;
    if (sel < top) top = sel;
    if (sel >= top + ROWS) top = sel - ROWS + 1;
    var html = '';
    for (var i = top; i < Math.min(top + ROWS, total); i++) {
      var label, cls = 'row';
      if (i === 0) label = 'Eigen lijst instellen';
      else {
        var c = filtered[i - 1];
        label = (isFav(c) ? '\u25C6 ' : '') + c.name;
        if (c.url === playingUrl) cls += ' live';
      }
      if (i === sel) cls += ' sel';
      html += '<div class="' + cls + '">' + esc(label) + '</div>';
    }
    listEl.innerHTML = html;
  }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function showOsd(t) {
    osd.textContent = t; osd.classList.add('show');
    clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { osd.classList.remove('show'); }, 3000);
  }

  // Kanalen waarvan het actuele stream-adres bij elk afspelen wordt opgehaald
  var RESOLVE = {
    'Toonami Aftermath (EST)': 'https://api.toonamiaftermath.com/streamUrl?channelName=est&timezoneOffset=-1&useHttps=true',
    'Toonami Aftermath (EST vertraagd)': 'https://api.toonamiaftermath.com/streamUrl?channelName=est&timezoneOffset=-1&useHttps=true&streamDelay=180',
    'Toonami Aftermath (Movies)': 'https://api.toonamiaftermath.com/streamUrl?channelName=movies&timezoneOffset=-1&useHttps=true',
    'Toonami Aftermath (West)': 'https://api.toonamiaftermath.com/streamUrl?channelName=est&timezoneOffset=-1&useHttps=true&streamDelay=180',
    'Snick (EST)': 'https://api.toonamiaftermath.com/streamUrl?channelName=snick-est&timezoneOffset=-1&useHttps=true',
    'Snick (West)': 'https://api.toonamiaftermath.com/streamUrl?channelName=snick-est&timezoneOffset=-1&useHttps=true&streamDelay=180'
  };
  var FITS = [['contain', 'Aspect: passend (origineel)'], ['fill', 'Aspect: uitrekken (volledig scherm)'], ['cover', 'Aspect: vullen (bijsnijden)']];
  var fitIdx = 0;
  try { fitIdx = parseInt(localStorage.getItem('fit') || '0', 10) || 0; } catch (err) { fitIdx = 0; }
  if (fitIdx < 0 || fitIdx >= FITS.length) fitIdx = 0;
  function applyFit() {
    video.style.objectFit = FITS[fitIdx][0];
  }
  function cycleFit() {
    fitIdx = (fitIdx + 1) % FITS.length;
    applyFit();
    try { localStorage.setItem('fit', String(fitIdx)); } catch (err) {}
    showOsd(FITS[fitIdx][1]);
  }
  applyFit();
  var playToken = 0;
  function startStream(u) {
    streamUrl = u;
    if (hls) { hls.destroy(); hls = null; }
    triedHls = false;
    isHlsNow = /\.m3u8(\?|$)/i.test(u);
    video.src = u; video.play();
  }
  function play(c) {
    playingUrl = c.url;
    playingIdx = channels.indexOf(c);
    try { localStorage.setItem('last', c.url); } catch (err) {}
    var my = ++playToken;
    if (isOwn(c.url)) { ownErrors = 0; ownSelect(c.url); ownStart(); return; }
    showOsd((playingIdx + 1) + '  ' + c.name);
    var api = RESOLVE[c.name];
    if (!api) { startStream(c.url); return; }
    var list = (api instanceof Array) ? api : [api], li = 0;
    (function tryNext() {
      load(list[li], function (err, t) {
        if (my !== playToken) return;
        t = (t || '').trim();
        if (!err && /^https?:\/\/\S+$/.test(t)) { startStream(t); return; }
        if (++li < list.length) { tryNext(); return; }
        startStream(c.url);
      }, 8000);
    })();
  }

  function zap(d) {
    if (isOwn(playingUrl)) { ownNext(d); return; }
    if (!channels.length) return;
    var i = playingIdx < 0 ? 0 : (playingIdx + d + channels.length) % channels.length;
    play(channels[i]);
  }

  function openSetup(m, target) {
    editTarget = target || null;
    panel.classList.add('hidden'); setup.classList.remove('hidden');
    $('#setup h1').textContent = editTarget ? 'URL wijzigen' : 'Eigen lijst instellen';
    $('#setup p').textContent = editTarget ? editTarget.name + ' - plak de nieuwe stream-URL:' : 'Voer de M3U-URL van je pc in, bijv. http://192.168.1.50:8000/shuffle.m3u';
    urlInput.value = editTarget ? editTarget.url : (ownUrl || 'http://');
    msg.textContent = m || '';
    urlInput.focus();
  }
  function closeSetup() {
    setup.classList.add('hidden'); panel.classList.remove('hidden');
    if (document.activeElement) document.activeElement.blur();
  }

  function loadPlaylist(url) {
    msg.textContent = 'Laden...';
    load(url, function (err, text) {
      if (err) { msg.textContent = 'Fout: ' + err + ' - draait de server op je pc?'; return; }
      var list = parseM3U(text);
      if (!list.length) { msg.textContent = 'Geen kanalen gevonden in deze lijst.'; return; }
      try { localStorage.setItem('ownUrl', url); } catch (err2) {}
      var e = null;
      for (var i = 0; i < EXTRA.length; i++) { if (EXTRA[i].group === OWNG) e = EXTRA[i]; }
      if (e) e.url = url; else EXTRA.unshift({ url: url, group: OWNG });
      extraLoaded[OWNG] = false; extraLoading[OWNG] = false;
      closeSetup();
      setChannels(channels.filter(function (c) { return c.group !== OWNG; }), OWNG);
      ensureLoaded(OWNG);
    }, 60000);
  }

  $('#save').onclick = function () {
    var u = urlInput.value.trim();
    if (!u) return;
    if (editTarget) {
      ovr[editTarget.name] = u;
      try { localStorage.setItem('ovr', JSON.stringify(ovr)); } catch (err) {}
      editTarget.url = u;
      var t = editTarget; editTarget = null;
      closeSetup(); renderList(); play(t);
      return;
    }
    loadPlaylist(u);
  };
  $('#cancel').onclick = function () {
    if (channels.length) closeSetup();
  };

  // ---------- Afstandsbediening ----------
  // ---------- Zoeken en letter-sprong ----------
  function openSearch() {
    panel.classList.add('hidden'); search.classList.remove('hidden');
    qInput.value = searchQuery; qInput.focus();
  }
  function closeSearch() {
    search.classList.add('hidden'); panel.classList.remove('hidden');
    if (document.activeElement) document.activeElement.blur();
  }
  function runSearch() {
    var q = qInput.value.trim().toLowerCase();
    if (!q) { closeSearch(); return; }
    searchQuery = q;
    gi = groups.indexOf(SEARCH);
    applyGroup();
    closeSearch();
  }
  $('#qgo').onclick = runSearch;
  $('#qcancel').onclick = closeSearch;
  var LET = { 1: '0123456789', 2: 'abc', 3: 'def', 4: 'ghi', 5: 'jkl', 6: 'mno', 7: 'pqrs', 8: 'tuv', 9: 'wxyz' };
  function jumpTo(d) {
    if (d === 0) { sel = filtered.length ? 1 : 0; top = 0; renderList(); return; }
    var set = LET[d];
    for (var i = 0; i < filtered.length; i++) {
      var ch = filtered[i].name.charAt(0).toLowerCase();
      if (set.indexOf(ch) >= 0) { sel = i + 1; top = sel; renderList(); return; }
    }
    showOsd('Geen kanaal met ' + set.toUpperCase().split('').join('/'));
  }

  // ---------- Back-toets: sluit eerst het menu, pas daarna de app ----------
  var backHandledAt = 0, lastKept = true;
  function backPressed() {
    backHandledAt = Date.now();
    if (!search.classList.contains('hidden')) { closeSearch(); lastKept = true; return true; }
    if (!setup.classList.contains('hidden')) {
      if (channels.length) closeSetup();
      lastKept = true; return true;
    }
    if (!panel.classList.contains('hidden') && playingUrl) {
      panel.classList.add('hidden');
      lastKept = true; return true;
    }
    lastKept = false;
    try { window.close(); } catch (err) {}
    return false;
  }
  try { history.pushState({ iptv: 1 }, ''); } catch (err) {}
  window.addEventListener('popstate', function () {
    var kept = (Date.now() - backHandledAt < 600) ? lastKept : backPressed();
    if (kept) { try { history.pushState({ iptv: 1 }, ''); } catch (err) {} }
  });
  document.addEventListener('keyup', function (e) {
    if (e.keyCode === 461 || e.keyCode === 27) e.preventDefault();
  });

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === 461 || k === 27) { e.preventDefault(); backPressed(); return; }
    if (!search.classList.contains('hidden')) {
      if (k === 13 && document.activeElement === qInput) { runSearch(); e.preventDefault(); }
      else if (k === 40 || k === 38) {
        var sels = [qInput, $('#qgo'), $('#qcancel')];
        var si = sels.indexOf(document.activeElement);
        si = k === 40 ? Math.min(si + 1, 2) : Math.max(si - 1, 0);
        sels[si].focus(); e.preventDefault();
      }
      return;
    }
    var inSetup = !setup.classList.contains('hidden');

    if (inSetup) {
      if (k === 461 || k === 27) { if (channels.length) closeSetup(); e.preventDefault(); }
      else if (k === 40 || k === 38) {
        var els = [urlInput, $('#save'), $('#cancel')];
        var i = els.indexOf(document.activeElement);
        i = k === 40 ? Math.min(i + 1, 2) : Math.max(i - 1, 0);
        els[i].focus(); e.preventDefault();
      }
      return;
    }

    var panelOpen = !panel.classList.contains('hidden');
    if (k === 404) { openSearch(); e.preventDefault(); return; }
    if (k === 406) {
      var et = (panelOpen && sel >= 1) ? filtered[sel - 1] : channels[playingIdx];
      if (et) openSetup('', et);
      e.preventDefault(); return;
    }
    if (panelOpen && k >= 48 && k <= 57) { jumpTo(k - 48); e.preventDefault(); return; }
    if (k === 405) { cycleFit(); e.preventDefault(); return; }
    if (k === 403) {
      var fc = (panelOpen && sel >= 1) ? filtered[sel - 1] : channels[playingIdx];
      toggleFav(fc); e.preventDefault(); return;
    }
    if (k === 19 || k === 415 || k === 179 || k === 413) {
      userPause = true;
      if (k === 19 || (k === 413)) video.pause();
      else if (k === 415) video.play();
      else { if (video.paused) video.play(); else video.pause(); }
      showOsd(video.paused ? '\u23F8 Pauze' : '\u25B6 Afspelen'); e.preventDefault(); return;
    }
    if (k === 32 || k === 406 && false) { if (video.paused) video.play(); else video.pause(); return; }
    function fmt(t) { t = Math.max(0, Math.floor(t)); var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }
    function seek(d) {
      if (!isFinite(video.duration) || !video.duration) return false;
      video.currentTime = Math.min(Math.max(0, video.currentTime + d), video.duration - 1);
      showOsd((d > 0 ? '\u23E9 ' : '\u23EA ') + fmt(video.currentTime) + ' / ' + fmt(video.duration));
      return true;
    }
    if (k === 417 || k === 412) { if (seek(k === 417 ? 30 : -30)) e.preventDefault(); return; }
    if (!panelOpen && (k === 39 || k === 37) && seek(k === 39 ? 10 : -10)) { e.preventDefault(); return; }
    if (k === 427 || k === 33) { zap(1); return; }
    if (k === 428 || k === 34) { zap(-1); return; }

    if (!panelOpen) {
      if (k === 13 || k === 461 || k === 27 || k === 38 || k === 40 || k === 37 || k === 39) {
        panel.classList.remove('hidden'); e.preventDefault();
      }
      return;
    }

    if (k === 40) { sel = Math.min(sel + 1, filtered.length); renderList(); }
    else if (k === 38) { sel = Math.max(sel - 1, 0); renderList(); }
    else if (k === 39) { gi = (gi + 1) % groups.length; applyGroup(); ensureLoaded(groups[gi]); }
    else if (k === 37) { gi = (gi - 1 + groups.length) % groups.length; applyGroup(); ensureLoaded(groups[gi]); }
    else if (k === 13) {
      if (sel === 0) openSetup();
      else { play(filtered[sel - 1]); panel.classList.add('hidden'); }
    } else if (k === 461 || k === 27) {
      if (playingUrl) panel.classList.add('hidden');
      else if (window.webOS && webOS.platformBack) webOS.platformBack();
    } else return;
    e.preventDefault();
  });

  video.addEventListener('error', function () {
    if (isHlsNow && !triedHls && window.Hls && Hls.isSupported() && streamUrl) {
      triedHls = true;
      try { video.removeAttribute('src'); video.load(); } catch (e) {}
      hls = new Hls(); hls.loadSource(streamUrl); hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, function () { video.play(); });
      hls.on(Hls.Events.ERROR, function (ev, d) { if (d && d.fatal) showOsd('Kan stream niet afspelen - BLAUW = URL wijzigen'); });
    } else { showOsd('Kan stream niet afspelen - BLAUW = URL wijzigen'); }
  });

  // Automatisch hervatten als de TV de video zelf laat stilvallen
  var userPause = false, resumeTimer = null;
  video.addEventListener('play', function () { userPause = false; });
  function autoResume() {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () {
      if (!userPause && video.paused && !video.ended && playingUrl && video.readyState > 0) { try { video.play(); } catch (err) {} }
    }, 2500);
  }
  video.addEventListener('pause', autoResume);
  video.addEventListener('stalled', function () { showOsd('Buffert…'); });
  video.addEventListener('waiting', function () { autoResume(); });

  // ---------- Eigen lijst: een kanaal dat willekeurig doorspeelt ----------
  var ownQueue = [], ownPos = 0, ownErrors = 0, ownLists = {}, ownKey = '', ownRandom = true;
  function isOwn(u) { return !!u && u.indexOf('own://') === 0; }
  function ownSelect(u) {
    var o = ownLists[u]; if (!o) return;
    ownKey = u; ownQueue = o.items; ownRandom = o.random; ownPos = 0;
  }
  function ownShuffle() {
    var map = {}, keys = [], i, j, t;
    for (i = 0; i < ownQueue.length; i++) {
      var m = /^(\d{3})[a-c]\s/.exec(ownQueue[i].name), k = m ? m[1] : 'x' + i;
      if (!map[k]) { map[k] = []; keys.push(k); }
      map[k].push(ownQueue[i]);
    }
    for (i = keys.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = keys[i]; keys[i] = keys[j]; keys[j] = t; }
    ownQueue = [];
    keys.forEach(function (k) {
      map[k].sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      ownQueue = ownQueue.concat(map[k]);
    });
    if (ownLists[ownKey]) ownLists[ownKey].items = ownQueue;
  }
  function ownStart() {
    if (!ownQueue.length) { showOsd('Eigen lijst is leeg'); return; }
    var it = ownQueue[ownPos];
    startStream(it.url);
    showOsd(it.name + '  (' + (ownPos + 1) + '/' + ownQueue.length + ')');
  }
  function ownNext(d) {
    if (!ownQueue.length) return;
    ownPos += d;
    if (ownPos >= ownQueue.length) { if (ownRandom) ownShuffle(); ownPos = 0; }
    else if (ownPos < 0) ownPos = ownQueue.length - 1;
    ownStart();
  }
  video.addEventListener('ended', function () { if (isOwn(playingUrl)) { ownErrors = 0; ownNext(1); } });
  video.addEventListener('playing', function () { ownErrors = 0; });
  video.addEventListener('error', function () {
    if (isOwn(playingUrl) && ownErrors < 5) { ownErrors++; setTimeout(function () { ownNext(1); }, 2000); }
  });

  // ---------- Start ----------
  var saved = localStorage.getItem('playlist'), cache = localStorage.getItem('cache') || DEFAULT_M3U;
  if (cache) {
    var base = parseM3U(cache), have = {};
    base.forEach(function (x) { have[x.name] = 1; });
    parseM3U(DEFAULT_M3U).forEach(function (x) { if (!have[x.name] && RESOLVE[x.name]) base.splice(1, 0, x); });
    setChannels(base);
    var last = localStorage.getItem('last') || (channels[0] && channels[0].url);
    if (last) {
      var c = channels.filter(function (x) { return x.url === last; })[0];
      if (c) { play(c); panel.classList.add('hidden'); }
    }
    if (saved) load(saved, function (e, t) {
      if (!e) { var l = parseM3U(t); if (l.length) { localStorage.setItem('cache', t); var u = playingUrl; setChannels(l); playingUrl = u; renderList(); } }
    });
  } else {
    openSetup();
  }
  // ---------- Online lijsten: pas laden als je de groep opent ----------
  function ensureLoaded(name, done) {
    done = done || function () {};
    var e = null;
    for (var i = 0; i < EXTRA.length; i++) { if (EXTRA[i].group === name) e = EXTRA[i]; }
    if (!e || extraLoaded[name] || extraLoading[name]) { done(); return; }
    extraLoading[name] = true;
    showOsd('Laden: ' + name + '…');
    load(e.url, function (err, t) {
      extraLoading[name] = false;
      if (err) { showOsd('Laden mislukt: ' + name + ' (' + err + ')'); renderList(); done(); return; }
      var l = parseM3U(t).map(function (c) { c.sub = c.group; c.group = name; return c; });
      if (!l.length) { showOsd('Lijst leeg: ' + name); done(); return; }
      var count = l.length;
      if (name === OWNG) {
        var subs = {}, order = [];
        l.forEach(function (c) { var k = c.sub || 'Eigen'; if (!subs[k]) { subs[k] = []; order.push(k); } subs[k].push(c); });
        ownLists = {};
        var films = subs['Films'] || [];
        order = order.filter(function (k) { return k !== 'Films'; });
        l = order.map(function (k, n) {
          var seq = (k === 'Sailor Moon' || k === 'ANIMANIACS' || k === 'Het Blafpoeder'), u = 'own://' + k;
          ownLists[u] = { items: subs[k].slice(), random: !seq };
          if (!seq) { ownKey = u; ownQueue = ownLists[u].items; ownShuffle(); }
          return { name: k + (seq ? ' (in volgorde)' : ' (willekeurig)'), group: OWNG, url: u, ord: n };
        });
        films.forEach(function (f, n) { f.group = OWNG; f.ord = 100 + n; l.push(f); });
      }
      extraLoaded[name] = true;
      var u = playingUrl;
      var keep = channels.filter(function (c) { return c.group !== name; });
      var cur = groups[gi];
      setChannels(keep.concat(l), cur);
      playingUrl = u; playingIdx = -1;
      for (var j = 0; j < channels.length; j++) { if (channels[j].url === u) { playingIdx = j; break; } }
      renderList();
      showOsd(name + ': ' + count + (name === OWNG ? ' afleveringen' : ' kanalen'));
      done();
    }, (name === OWNG ? 8000 : 120000));
  }
  // Alle lijsten na elkaar laden bij het starten (niet tegelijk, om de tv te sparen)
  function loadAllSeq(i, order) {
    if (!order) {
      order = [];
      EXTRA.forEach(function (e) { if (e.group !== OWNG) order.push(e.group); });
      EXTRA.forEach(function (e) { if (e.group === OWNG) order.push(e.group); });
    }
    if (i >= order.length) return;
    ensureLoaded(order[i], function () { setTimeout(function () { loadAllSeq(i + 1, order); }, 1500); });
  }
  if (channels.length) loadAllSeq(0);
})();
