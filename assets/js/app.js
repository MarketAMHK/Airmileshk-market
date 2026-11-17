/* ══════════════════════════════════════════════════════════════
   AirMilesHK Marketplace — shared header, footer and helpers
   Header/footer markup mirrors airmileshk.com ("hk-header"/"hk-footer").
   ══════════════════════════════════════════════════════════════ */
(function () {
  var CFG = window.MARKET_CONFIG || {};
  var M = (CFG.MAIN_SITE || 'https://airmileshk.com').replace(/\/$/, '');
  var WA = CFG.WHATSAPP || '85294400450';

  /* ── helpers ── */
  var U = {
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
    num: function (n) { return n == null || n === '' ? '—' : Number(n).toLocaleString('en-US'); },
    usd: function (n) { return n == null || n === '' ? '—' : 'US$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); },
    cpp: function (n) { return n == null || n === '' ? '—' : Number(n).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '¢'; },
    short: function (n) { n = Number(n); if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 2 : 0).replace(/\.?0+$/, '') + 'M'; if (n >= 1e3) return Math.round(n / 1e3) + 'K'; return String(n); },
    date: function (s) { return s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; },
    ago: function (s) {
      var d = (Date.now() - new Date(s).getTime()) / 1000;
      if (d < 60) return 'just now'; if (d < 3600) return Math.floor(d / 60) + ' min ago';
      if (d < 86400) return Math.floor(d / 3600) + ' h ago'; if (d < 86400 * 30) return Math.floor(d / 86400) + ' d ago';
      return U.date(s);
    },
    param: function (k) { return new URLSearchParams(location.search).get(k); },
    $: function (sel, root) { return (root || document).querySelector(sel); },
    $$: function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); },
    toast: function (msg, isErr) {
      var t = document.createElement('div'); t.className = 'toast' + (isErr ? ' err' : ''); t.textContent = msg;
      t.setAttribute('role', 'status'); document.body.appendChild(t);
      setTimeout(function () { t.remove(); }, isErr ? 6000 : 3200);
    },
    // Parse "100,000" / "100k" / "1.2m" into a whole number.
    parseNum: function (v) {
      v = String(v || '').trim().toLowerCase().replace(/[, _]/g, ''); if (!v) return null;
      var mult = /m$/.test(v) ? 1e6 : /k$/.test(v) ? 1e3 : 1; v = v.replace(/[km]$/, '');
      var n = parseFloat(v); return isNaN(n) ? null : Math.round(n * mult);
    },
    parseDec: function (v) { v = String(v || '').trim().replace(/[, $¢]/g, ''); if (!v) return null; var n = parseFloat(v); return isNaN(n) ? null : n; },
    typeLabel: { airline: 'Airline miles', hotel: 'Hotel points', bank: 'Card points', other: 'Other' },
    kindLabel: { purchase: 'Buy miles/points', whole_account: 'Whole account', booking: 'Ticket / stay request' },
    statusChip: function (s) {
      var m = { open: ['navy', 'Negotiating'], accepted: ['gold', 'Agreed'], declined: ['red', 'Declined'], withdrawn: ['grey', 'Withdrawn'], completed: ['green', 'Completed'], cancelled: ['grey', 'Cancelled'],
                active: ['green', 'Active'], paused: ['grey', 'Paused'], removed: ['red', 'Removed'] };
      var x = m[s] || ['grey', s]; return '<span class="chip ' + x[0] + '">' + U.esc(x[1]) + '</span>';
    },
    optionChips: function (l) {
      var c = [];
      if (l.sell_whole) c.push('<span class="chip navy">Whole account</span>');
      if (l.sell_partial) c.push('<span class="chip navy">Partial' + (l.min_per_deal ? ' · min ' + U.short(l.min_per_deal) : '') + '</span>');
      if (l.offers_booking) c.push('<span class="chip gold">' + (l.programme_type === 'hotel' ? 'Books stays' : l.programme_type === 'airline' ? 'Issues tickets' : 'Books for you') + '</span>');
      if (l.elite_status) c.push('<span class="chip">' + U.esc(l.elite_status) + '</span>');
      return '<div class="chips">' + c.join('') + '</div>';
    },
    priceLine: function (l) {
      if (l.price_mode === 'fixed') {
        if (l.price_cpp) return { v: U.cpp(l.price_cpp), k: 'per mile/pt' };
        if (l.whole_price_usd) return { v: U.usd(l.whole_price_usd), k: 'whole account' };
      }
      return { v: 'Open to offers', k: 'make a bid' };
    },
    programmeOptions: function (selected) {
      var P = CFG.PROGRAMMES || {}, html = '<option value="">Choose a programme…</option>';
      [['airline', 'Airlines'], ['hotel', 'Hotels'], ['bank', 'Credit card points']].forEach(function (g) {
        html += '<optgroup label="' + g[1] + '">' + (P[g[0]] || []).map(function (p) {
          return '<option data-type="' + g[0] + '"' + (p === selected ? ' selected' : '') + '>' + U.esc(p) + '</option>';
        }).join('') + '</optgroup>';
      });
      return html + '<option value="__other" data-type="other">Other (type it in)</option>';
    },
    programmeType: function (name) {
      var P = CFG.PROGRAMMES || {};
      for (var t in P) if (P[t].indexOf(name) >= 0) return t;
      return null;
    },
    btnBusy: function (btn, busy, label) {
      if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Please wait…'; btn.disabled = true; }
      else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
    }
  };

  /* ── header (same structure & classes as airmileshk.com) ── */
  function header(page) {
    function cur(p) { return page === p ? ' aria-current="page"' : ''; }
    var mainLinks = [
      [M + '/', 'AirMilesHK.com home'], [M + '/airlines', 'Buy Miles'], [M + '/business-class-flights', 'Flights'],
      [M + '/hotel-status', 'Hotels &amp; Status'], [M + '/sell-miles', 'Sell Miles to AirMilesHK'], [M + '/blog', 'Blog'],
      [M + '/faq', 'FAQ'], [M + '/', 'Back to AirMilesHK.com →']
    ];
    return '' +
      '<header class="hk-header">' +
      '<div class="hk-nav-inner">' +
        '<a href="index.html" class="hk-logo" aria-label="AirMilesHK Marketplace — Home">' +
          '<img src="assets/logo.png" alt="AirMilesHK" width="132" height="50">' +
          '<span class="mk-market-tag">Marketplace</span>' +
        '</a>' +
        '<nav aria-label="Main navigation"><ul class="hk-nav-links">' +
          '<li><a href="index.html"' + cur('browse') + '>Browse</a></li>' +
          '<li><a href="sell.html"' + cur('sell') + '>List Your Miles</a></li>' +
          '<li><a href="account.html"' + cur('account') + '>My Deals</a></li>' +
          '<li><a href="index.html#how">How It Works</a></li>' +
          '<li class="hk-dd"><a href="' + M + '/">AirMilesHK.com <span class="hk-caret">▾</span></a><div class="hk-dd-menu">' +
            mainLinks.map(function (l) { return '<a href="' + l[0] + '">' + l[1] + '</a>'; }).join('') +
          '</div></li>' +
          '<li class="nav-admin hide"><a href="admin.html"' + cur('admin') + '>Admin</a></li>' +
        '</ul></nav>' +
        '<div class="hk-nav-user">' +
          '<span class="nav-out"><a href="login.html" class="hk-nav-signin" style="font-size:.85rem;font-weight:500;color:#4A5E78;text-decoration:none;padding:8px 10px">Sign in</a></span>' +
          '<span class="nav-in hide"><span class="who"></span> <button type="button" class="btn sm ol nav-signout">Sign out</button></span>' +
          '<a href="login.html?mode=signup" class="hk-cta nav-cta">Join Free →</a>' +
        '</div>' +
        '<button class="hk-burger" aria-label="Open menu" aria-expanded="false" aria-controls="hk-mobile-menu"><span></span><span></span><span></span></button>' +
      '</div>' +
      '<div class="hk-mobile" id="hk-mobile-menu">' +
        '<a href="index.html">Browse listings</a>' +
        '<a href="sell.html">List your miles</a>' +
        '<a href="account.html">My deals &amp; account</a>' +
        '<a href="index.html#how">How it works</a>' +
        '<a href="admin.html" class="nav-admin hide">Admin</a>' +
        '<button class="hk-m-acc" type="button" aria-expanded="false">AirMilesHK.com <span class="hk-m-car">▾</span></button>' +
        '<div class="hk-m-sub">' + mainLinks.map(function (l, i) { return '<a href="' + l[0] + '"' + (i === mainLinks.length - 1 ? ' class="hk-m-all"' : '') + '>' + l[1] + '</a>'; }).join('') + '</div>' +
        '<a href="login.html" class="nav-out">Sign in</a>' +
        '<a href="#" class="nav-in nav-signout hide">Sign out</a>' +
        '<a href="login.html?mode=signup" class="hk-m-cta nav-cta">Join Free →</a>' +
      '</div>' +
      '</header><div class="hk-header-ph"></div>';
  }

  function footer() {
    return '' +
      '<footer class="hk-footer"><div class="hk-foot-inner"><div class="hk-foot-top">' +
        '<div class="hk-foot-brand"><img src="assets/logo-white.png" alt="AirMilesHK logo" width="800" height="304" loading="lazy">' +
          '<p>The AirMilesHK members marketplace — miles and hotel points, bought and sold with AirMilesHK in the middle. Independent miles broker since 2010, registered in Hong Kong and the United States.</p></div>' +
        '<div><h4>Marketplace</h4><ul>' +
          '<li><a href="index.html">Browse listings</a></li><li><a href="sell.html">List your miles</a></li>' +
          '<li><a href="account.html">My deals</a></li><li><a href="index.html#how">How it works</a></li>' +
          '<li><a href="terms.html">Marketplace rules</a></li></ul></div>' +
        '<div><h4>Airlines</h4><ul>' +
          '<li><a href="' + M + '/cathay-pacific-asia-miles">Cathay Pacific Asia Miles</a></li>' +
          '<li><a href="' + M + '/emirates-skywards-miles">Emirates Skywards</a></li>' +
          '<li><a href="' + M + '/united-mileageplus">United MileagePlus</a></li>' +
          '<li><a href="' + M + '/air-france-klm-flying-blue">Flying Blue (AF/KLM)</a></li>' +
          '<li><a href="' + M + '/airlines">All airlines →</a></li></ul></div>' +
        '<div><h4>Hotels &amp; Status</h4><ul>' +
          '<li><a href="' + M + '/marriott-bonvoy-status">Marriott Bonvoy Status</a></li>' +
          '<li><a href="' + M + '/hilton-honors-status">Hilton Diamond Status</a></li>' +
          '<li><a href="' + M + '/star-alliance-gold">Star Alliance Gold</a></li>' +
          '<li><a href="' + M + '/hotel-status">All Hotel Services →</a></li></ul></div>' +
        '<div><h4>Company</h4><ul>' +
          '<li><a href="' + M + '/about">About Us</a></li>' +
          '<li><a href="' + M + '/faq">Full FAQ</a></li>' +
          '<li><a href="' + M + '/terms">Terms &amp; Conditions</a></li>' +
          '<li><a href="' + M + '/privacy">Privacy Policy</a></li>' +
          '<li><a href="https://www.trustpilot.com/review/airmiles.hk" target="_blank" rel="noopener">Trustpilot Reviews ↗</a></li></ul></div>' +
      '</div><div class="hk-foot-bottom">' +
        '<span class="hk-foot-copy">© ' + new Date().getFullYear() + ' AirMilesHK.com · All rights reserved · Hong Kong &amp; United States</span>' +
        '<p class="hk-foot-disc">Disclaimer: AirMilesHK.com and its operating companies are an independent service with no affiliation to any airline, hotel group or loyalty programme. Buying, selling or transferring miles, points or accounts may breach the terms and conditions of the programme concerned and can lead to forfeiture of the balance or closure of the account. Members list and trade at their own discretion and risk, and must read the <a href="terms.html" style="color:#8A9BB5">marketplace rules</a> before making or accepting an offer.</p>' +
      '</div></div></footer>';
  }

  var WA_SVG = '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16.04 3C9.4 3 4 8.36 4 14.96c0 2.64.87 5.09 2.34 7.07L4.5 28.5l6.65-1.78a12.1 12.1 0 0 0 4.89 1.03c6.63 0 12.03-5.36 12.03-11.96C28.07 8.36 22.67 3 16.04 3zm0 21.84c-1.6 0-3.16-.42-4.52-1.21l-.32-.19-3.95 1.06 1.07-3.83-.21-.34a9.86 9.86 0 0 1-1.52-5.27c0-5.46 4.47-9.9 9.97-9.9 5.49 0 9.96 4.44 9.96 9.9 0 5.46-4.47 9.9-9.96 9.9zm5.47-7.41c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.11 3.22 5.1 4.51.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg>';

  function wireChrome() {
    var b = document.querySelector('.hk-burger'), m = document.getElementById('hk-mobile-menu');
    function close() { b.setAttribute('aria-expanded', 'false'); m.classList.remove('open'); document.body.classList.remove('hk-menu-open'); }
    b.addEventListener('click', function () {
      var open = b.getAttribute('aria-expanded') === 'true';
      if (open) close(); else { b.setAttribute('aria-expanded', 'true'); m.classList.add('open'); document.body.classList.add('hk-menu-open'); }
    });
    m.addEventListener('click', function (e) { if (e.target.tagName === 'A') close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    U.$$('.hk-m-acc').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true'; btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        var sub = btn.nextElementSibling; if (sub && sub.classList.contains('hk-m-sub')) sub.classList.toggle('open', !open);
      });
    });
    U.$$('.nav-signout').forEach(function (el) {
      el.addEventListener('click', async function (e) { e.preventDefault(); await API.signOut(); location.href = 'index.html'; });
    });
  }

  function setUser(user, profile) {
    U.$$('.nav-out').forEach(function (el) { el.classList.toggle('hide', !!user); });
    U.$$('.nav-in').forEach(function (el) { el.classList.toggle('hide', !user); });
    U.$$('.nav-admin').forEach(function (el) { el.classList.toggle('hide', !(profile && profile.is_admin)); });
    U.$$('.nav-cta').forEach(function (el) {
      el.textContent = user ? 'List Your Miles →' : 'Join Free →';
      el.href = user ? 'sell.html' : 'login.html?mode=signup';
    });
    var who = U.$('.hk-nav-user .who'); if (who) who.textContent = profile ? profile.display_name : '';
  }

  /* ── page start ── options: { page, auth: 'required' | 'admin' } ── */
  async function start(opts) {
    opts = opts || {};
    var h = document.getElementById('hk-header'), f = document.getElementById('hk-footer');
    if (h) h.outerHTML = header(opts.page);
    if (f) f.outerHTML = footer();
    var wa = document.createElement('a');
    wa.className = 'hk-wa-float'; wa.target = '_blank'; wa.rel = 'noopener'; wa.setAttribute('aria-label', 'Chat with us on WhatsApp');
    wa.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hello AirMilesHK! I have a question about the Marketplace.');
    wa.innerHTML = '<span class="hk-wa-tip">Chat with us — instant reply</span>' + WA_SVG;
    document.body.appendChild(wa);
    if (API.demo) {
      var bar = document.createElement('div'); bar.className = 'demo-bar';
      bar.innerHTML = 'DEMO MODE · data stays in this browser only · <a href="#" id="demo-reset">Reset</a>';
      document.body.appendChild(bar); document.body.style.paddingBottom = '34px';
      document.getElementById('demo-reset').onclick = function (e) { e.preventDefault(); API.resetDemo(); location.href = 'index.html'; };
      U.$('.hk-wa-float').style.bottom = '52px';
    }
    wireChrome();

    var user = null, profile = null;
    try { user = await API.session(); profile = user ? await API.profile() : null; }
    catch (e) { console.error(e); }
    setUser(user, profile);

    if ((opts.auth === 'required' || opts.auth === 'admin') && !user) {
      location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
      return new Promise(function () {});
    }
    if (opts.auth === 'admin' && !(profile && profile.is_admin)) {
      var main = document.querySelector('main');
      if (main) main.innerHTML = '<section class="sec"><div class="W"><div class="empty"><h3>Admins only</h3><p>This page is only for the AirMilesHK team.</p><a class="btn" href="index.html">Back to marketplace</a></div></div></section>';
      return new Promise(function () {});
    }
    if (profile && profile.is_suspended) {
      var n = document.createElement('div'); n.className = 'W'; n.innerHTML = '<div class="note red mt">Your account is on hold. Please contact AirMilesHK on WhatsApp.</div>';
      var mm = document.querySelector('main'); if (mm) mm.prepend(n);
    }
    return { user: user, profile: profile };
  }

  window.U = U;
  window.App = { start: start };
})();
