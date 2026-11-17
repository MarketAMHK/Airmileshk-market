(async function () {
  var ctx = await App.start({ page: 'account', auth: 'required' });
  var me = ctx.user.id, prof = ctx.profile || {};
  if (prof.display_name) U.$('#hello').innerHTML = 'Hello, <em>' + U.esc(prof.display_name) + '</em>';

  function tab(t) {
    U.$$('#tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
    U.$$('[data-pane]').forEach(function (p) { p.classList.toggle('hide', p.dataset.pane !== t); });
    history.replaceState(null, '', '#' + t);
  }
  U.$$('#tabs button').forEach(function (b) { b.onclick = function () { tab(b.dataset.tab); }; });
  var start = location.hash.replace('#', ''); if (['received', 'sent', 'listings', 'profile'].indexOf(start) >= 0) tab(start);

  function offerRow(o, asSeller) {
    var l = o.listing || {}, other = asSeller ? o.buyer : o.seller;
    var yourTurn = o.status === 'open' && o.awaiting === me;
    var what = o.kind === 'booking' ? 'Booking request' : o.kind === 'whole_account' ? 'Whole account · ' + U.num(o.quantity) : U.num(o.quantity) + (l.programme_type === 'hotel' ? ' points' : ' miles');
    return '<a class="row" href="deal.html?id=' + encodeURIComponent(o.id) + '"><div class="main">' +
      '<div class="t">' + U.esc(l.programme || 'Listing') + ' — ' + U.esc(what) + '</div>' +
      '<div class="s">' + (asSeller ? 'From ' : 'To ') + U.esc(other ? other.display_name : 'member') + ' · ' + U.usd(o.total_usd) + (o.price_cpp ? ' (' + U.cpp(o.price_cpp) + '/mile)' : '') + ' · updated ' + U.ago(o.updated_at) + '</div></div>' +
      '<div class="r">' + (yourTurn ? '<span class="chip gold">Your move</span>' : o.status === 'open' ? '<span class="chip grey">Waiting for them</span>' : '') + U.statusChip(o.status) + '</div></a>';
  }
  function empty(title, text, cta) { return '<div class="empty"><h3>' + title + '</h3><p>' + text + '</p>' + (cta || '') + '</div>'; }

  try {
    var res = await Promise.all([API.myOffers(), API.myListings()]);
    var offers = res[0], listings = res[1];
    var rec = offers.filter(function (o) { return o.seller_id === me; }), sent = offers.filter(function (o) { return o.buyer_id === me; });
    var recTurn = rec.filter(function (o) { return o.status === 'open' && o.awaiting === me; }).length;
    var sentTurn = sent.filter(function (o) { return o.status === 'open' && o.awaiting === me; }).length;
    U.$('#c-received').textContent = recTurn || rec.length; U.$('#c-received').classList.toggle('hot', !!recTurn);
    U.$('#c-sent').textContent = sentTurn || sent.length; U.$('#c-sent').classList.toggle('hot', !!sentTurn);
    U.$('#c-listings').textContent = listings.length;
    U.$('#received').innerHTML = rec.length ? rec.map(function (o) { return offerRow(o, true); }).join('') :
      empty('No offers yet', 'When buyers bid on your listings, they will show up here.', '<a class="btn" href="sell.html">List your miles</a>');
    U.$('#sent').innerHTML = sent.length ? sent.map(function (o) { return offerRow(o, false); }).join('') :
      empty('You have not made any offers', 'Browse listings and send a bid or a booking request.', '<a class="btn" href="index.html">Browse listings</a>');
    U.$('#listings').innerHTML = listings.length ? listings.map(function (l) {
      var p = U.priceLine(l);
      return '<a class="row" href="listing.html?id=' + encodeURIComponent(l.id) + '"><div class="main"><div class="t">' + U.esc(l.programme) + ' — ' + U.num(l.balance) + '</div>' +
        '<div class="s">' + U.esc(p.v) + ' · listed ' + U.date(l.created_at) + '</div></div><div class="r">' + U.statusChip(l.status) + '</div></a>';
    }).join('') : empty('No listings yet', 'List your miles or points. It takes about two minutes.', '');
    if (!location.hash && !rec.length && sent.length) tab('sent');
  } catch (e) {
    U.$('#received').innerHTML = '<div class="note red">Could not load your deals: ' + U.esc(e.message) + '</div>';
  }

  U.$('#p-name').value = prof.full_name || ''; U.$('#p-dn').value = prof.display_name || '';
  U.$('#p-wa').value = prof.whatsapp || ''; U.$('#p-country').value = prof.country || '';
  U.$('#p-role').value = prof.role || 'both'; U.$('#p-email').textContent = prof.email || ctx.user.email || '';
  U.$('#pf').onsubmit = async function (e) {
    e.preventDefault(); var btn = this.querySelector('[type=submit]'); U.btnBusy(btn, true);
    try {
      await API.updateProfile({ full_name: U.$('#p-name').value.trim(), display_name: U.$('#p-dn').value.trim(),
        whatsapp: U.$('#p-wa').value.trim(), country: U.$('#p-country').value.trim(), role: U.$('#p-role').value });
      U.toast('Details saved');
    } catch (err) { U.toast(err.message, true); }
    U.btnBusy(btn, false);
  };
})();
