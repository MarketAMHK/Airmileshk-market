(async function () {
  var ctx = await App.start({ page: 'browse' });
  var id = U.param('id'), msg = U.$('#msg'), l;
  try { l = id ? await API.getListing(id) : null; } catch (e) { l = null; }
  if (!l) {
    U.$('#l-title').textContent = 'Listing not found';
    msg.innerHTML = '<div class="empty"><h3>This listing is no longer available</h3><p>It may have been sold, paused or removed.</p><a class="btn" href="index.html">Browse listings</a></div>';
    return;
  }
  var unit = l.programme_type === 'hotel' ? 'points' : 'miles';
  var mine = ctx.user && ctx.user.id === l.seller_id;
  document.title = l.programme + ' — ' + U.short(l.balance) + ' ' + unit + ' | AirMilesHK Marketplace';
  U.$('#l-type').textContent = U.typeLabel[l.programme_type] || 'Listing';
  U.$('#l-title').innerHTML = U.esc(l.programme);
  U.$('#l-sub').textContent = 'Listed by ' + (l.seller ? l.seller.display_name : 'a member') + ' · ' + U.ago(l.created_at) + (l.status !== 'active' ? ' · ' + l.status.toUpperCase() : '');
  U.$('#l-bal').innerHTML = U.num(l.balance) + '<small>' + unit + '</small>';
  var p = U.priceLine(l); U.$('#l-price').textContent = p.v; U.$('#l-price-k').textContent = p.k;
  U.$('#l-chips').innerHTML = U.optionChips(l);
  var kv = [
    ['Sells part of balance', l.sell_partial ? 'Yes' + (l.min_per_deal ? ' — min ' + U.num(l.min_per_deal) + ' per deal' : '') : 'No'],
    ['Sells whole account', l.sell_whole ? 'Yes' + (l.whole_price_usd ? ' — ' + U.usd(l.whole_price_usd) : '') : 'No'],
    [l.programme_type === 'hotel' ? 'Books stays for you' : 'Issues tickets for you', l.offers_booking ? 'Yes' : 'No'],
    ['Asking price', l.price_mode === 'fixed' && l.price_cpp ? U.cpp(l.price_cpp) + ' per ' + unit.replace(/s$/, '') + ' (' + U.usd(l.price_cpp * 10) + ' / 1,000)' : 'Open to offers']
  ];
  if (l.elite_status) kv.push(['Elite status', l.elite_status]);
  if (l.seller) kv.push(['Member since', U.date(l.seller.created_at)]);
  U.$('#l-kv').innerHTML = kv.map(function (r) { return '<dt>' + U.esc(r[0]) + '</dt><dd>' + U.esc(r[1]) + '</dd>'; }).join('');
  if (l.notes) U.$('#l-notes').textContent = l.notes; else U.$('#notes-card').style.display = 'none';
  U.$('#wrap').classList.remove('hide');
  if (U.param('saved')) msg.innerHTML = '<div class="note green mb">Your listing is saved' + (l.status === 'active' ? ' and live.' : '.') + '</div>';

  /* ── owner view ── */
  if (mine) {
    U.$('#offer-box').style.display = 'none';
    U.$('#owner-card').style.display = '';
    var acts = '<a class="btn dk sm" href="sell.html?id=' + encodeURIComponent(l.id) + '">Edit</a>' +
      (l.status === 'active' ? '<button class="btn ol sm" data-st="paused">Pause</button>' : '<button class="btn sm" data-st="active">Make active</button>') +
      '<button class="btn danger sm" data-st="removed">Remove</button>';
    U.$('#owner-actions').innerHTML = acts;
    U.$$('#owner-actions [data-st]').forEach(function (b) {
      b.onclick = async function () {
        var st = b.dataset.st;
        if (st === 'removed' && !confirm('Remove this listing? Buyers will no longer see it.')) return;
        try { await API.setListingStatus(l.id, st); location.href = st === 'removed' ? 'account.html' : location.pathname + '?id=' + encodeURIComponent(l.id); }
        catch (e) { U.toast(e.message, true); }
      };
    });
    return;
  }

  /* ── buyer view ── */
  if (!ctx.user) {
    var nxt = encodeURIComponent('listing.html?id=' + l.id);
    U.$('#ob-join').href = 'login.html?mode=signup&next=' + nxt; U.$('#ob-signin').href = 'login.html?next=' + nxt;
    U.$('#ob-guest').classList.remove('hide');
    return;
  }
  if (l.status !== 'active') { U.$('#offer-box').innerHTML = '<p class="muted">This listing is not taking offers right now.</p>'; return; }

  var kinds = [];
  if (l.sell_partial) kinds.push(['purchase', 'Buy ' + unit]);
  if (l.sell_whole) kinds.push(['whole_account', 'Whole account']);
  if (l.offers_booking) kinds.push(['booking', l.programme_type === 'hotel' ? 'Book a stay' : l.programme_type === 'airline' ? 'Book a ticket' : 'Book for me']);
  U.$('#kinds').innerHTML = '<div class="seg">' + kinds.map(function (k, i) {
    return '<label><input type="radio" name="kind" value="' + k[0] + '"' + (i === 0 ? ' checked' : '') + '><span>' + k[1] + '</span></label>';
  }).join('') + '</div>';
  if (kinds.length === 1) U.$('#kind-field').classList.add('hide');
  U.$('#bdet').placeholder = l.programme_type === 'hotel'
    ? 'Hotel or city, check-in and check-out dates, rooms and guests…'
    : 'Route, dates (and flexibility), cabin, number of passengers…';
  U.$('#qty-hint').textContent = 'Available: ' + U.num(l.balance) + (l.min_per_deal ? ' · minimum ' + U.num(l.min_per_deal) : '');
  U.$('#of').classList.remove('hide');

  var qty = U.$('#qty'), ocpp = U.$('#ocpp'), ototal = U.$('#ototal'), lastEdited = 'cpp';
  if (l.price_cpp) ocpp.value = l.price_cpp;
  function kind() { return U.$('input[name=kind]:checked').value; }
  function q() { return kind() === 'whole_account' ? l.balance : U.parseNum(qty.value); }
  function recalc() {
    var n = q(), c = U.parseDec(ocpp.value), t = U.parseDec(ototal.value);
    if (lastEdited === 'cpp' && n && c) ototal.value = (Math.round(n * c) / 100).toFixed(2);
    if (lastEdited === 'total' && n && t) ocpp.value = (t / n * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }
  function syncKind() {
    var k = kind();
    U.$$('[data-k]').forEach(function (el) { el.classList.toggle('hide', el.dataset.k.split(' ').indexOf(k) < 0); });
    U.$('#ob-title').textContent = k === 'booking' ? (l.programme_type === 'hotel' ? 'Request a stay' : 'Request a ticket') : 'Make an offer';
    U.$('#of-send').textContent = k === 'booking' ? 'Send request →' : 'Send offer →';
    if (k === 'whole_account' && l.whole_price_usd && !ototal.value) { ototal.value = l.whole_price_usd; lastEdited = 'total'; }
    recalc();
  }
  U.$$('input[name=kind]').forEach(function (r) { r.onchange = syncKind; });
  qty.oninput = recalc;
  ocpp.oninput = function () { lastEdited = 'cpp'; recalc(); };
  ototal.oninput = function () { lastEdited = 'total'; recalc(); };
  syncKind();

  U.$('#of').onsubmit = async function (e) {
    e.preventDefault();
    var k = kind(), err = U.$('#of-msg'), p = { listing_id: l.id, kind: k, message: U.$('#omsg').value.trim() };
    if (k === 'booking') {
      p.booking_details = U.$('#bdet').value.trim(); p.quantity = U.parseNum(U.$('#bmiles').value); p.total_usd = U.parseDec(U.$('#btotal').value); p.price_cpp = null;
      if (!p.booking_details) { err.innerHTML = '<div class="note red mb">Describe what you need booked.</div>'; return; }
      if (!p.total_usd) { err.innerHTML = '<div class="note red mb">Enter your budget in US$.</div>'; return; }
    } else {
      p.quantity = q(); p.price_cpp = U.parseDec(ocpp.value); p.total_usd = U.parseDec(ototal.value);
      if (!p.quantity) { err.innerHTML = '<div class="note red mb">Enter how many ' + unit + ' you want.</div>'; return; }
      if (!p.total_usd && !p.price_cpp) { err.innerHTML = '<div class="note red mb">Enter your price.</div>'; return; }
    }
    var btn = U.$('#of-send'); U.btnBusy(btn, true, 'Sending…');
    try { var oid = await API.createOffer(p); location.href = 'deal.html?id=' + encodeURIComponent(oid) + '&sent=1'; }
    catch (ex) { err.innerHTML = '<div class="note red mb">' + U.esc(ex.message) + '</div>'; U.btnBusy(btn, false); }
  };
})();
