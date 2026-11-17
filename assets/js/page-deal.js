(async function () {
  var ctx = await App.start({ page: 'account', auth: 'required' });
  var CFG = window.MARKET_CONFIG || {};
  var id = U.param('id'), me = ctx.user.id, isAdmin = ctx.profile && ctx.profile.is_admin;
  var msg = U.$('#msg'), o;

  async function load() {
    try { o = await API.getOffer(id); } catch (e) { o = null; }
    if (!o) {
      U.$('#d-title').textContent = 'Deal not found';
      msg.innerHTML = '<div class="empty"><h3>We could not find that deal</h3><p>It may belong to another account.</p><a class="btn" href="account.html">My deals</a></div>';
      U.$('#wrap').classList.add('hide'); return;
    }
    render();
  }

  function render() {
    var l = o.listing || {}, unit = l.programme_type === 'hotel' ? 'points' : 'miles';
    var role = me === o.seller_id ? 'seller' : me === o.buyer_id ? 'buyer' : 'admin';
    var other = role === 'seller' ? o.buyer : o.seller;
    var nm = function (uid) { return uid === me ? 'You' : (o.names[uid] ? o.names[uid].display_name : 'AirMilesHK'); };
    var ref = 'AMHK-' + o.id.slice(0, 8).toUpperCase();

    U.$('#d-ey').textContent = (U.kindLabel[o.kind] || 'Deal') + ' · ' + ref;
    U.$('#d-title').innerHTML = U.esc(l.programme || 'Deal');
    U.$('#d-sub').textContent = role === 'admin' ? (o.buyer ? o.buyer.display_name : '?') + ' → ' + (o.seller ? o.seller.display_name : '?')
      : (role === 'seller' ? 'Offer from ' : 'Your offer to ') + (other ? other.display_name : 'a member') + ' · started ' + U.date(o.created_at);
    U.$('#d-status').innerHTML = U.statusChip(o.status);

    var terms = [];
    if (o.kind !== 'booking' || o.quantity) terms.push([o.kind === 'booking' ? 'Est. ' + unit + ' needed' : 'Quantity', U.num(o.quantity) + ' ' + unit]);
    if (o.price_cpp) terms.push(['Price per ' + unit.replace(/s$/, ''), U.cpp(o.price_cpp)]);
    terms.push([o.kind === 'booking' ? 'Budget' : 'Total', U.usd(o.total_usd)]);
    terms.push(['Listing', '<a class="lnk" href="' + U.listingUrl(o.listing_id) + '">' + U.esc(l.programme || 'View') + ' — ' + U.num(l.balance) + '</a>']);
    U.$('#d-terms').innerHTML = terms.map(function (r) { return '<dt>' + U.esc(r[0]) + '</dt><dd>' + (r[0] === 'Listing' ? r[1] : U.esc(r[1])) + '</dd>'; }).join('');
    U.$('#d-booking').classList.toggle('hide', !o.booking_details);
    U.$('#d-booking-text').textContent = o.booking_details || '';

    var verbs = { offer: 'made an offer', counter: 'countered', accept: 'accepted', decline: 'declined', withdraw: 'withdrew the offer', complete: 'marked the deal completed', cancel: 'cancelled the deal', reopen: 'set the deal back to agreed' };
    U.$('#d-timeline').innerHTML = o.events.slice().reverse().map(function (e) {
      var terms = e.total_usd ? ' — ' + (e.quantity ? U.num(e.quantity) + ' at ' : '') + (e.price_cpp ? U.cpp(e.price_cpp) + ' / ' : '') + U.usd(e.total_usd) : '';
      return '<li><span class="who">' + U.esc(nm(e.actor_id)) + '</span><span class="when">' + U.ago(e.created_at) + '</span>' +
        '<div class="what">' + U.esc(verbs[e.action] || e.action) + U.esc(terms) + '</div>' +
        (e.message ? '<div class="msg">' + U.esc(e.message) + '</div>' : '') + '</li>';
    }).join('');

    /* action box */
    var box = U.$('#act-box'), myTurn = o.status === 'open' && o.awaiting === me;
    var waText = encodeURIComponent('Hello AirMilesHK, about Marketplace deal ' + ref + ' (' + (l.programme || '') + ').');
    var waBtn = '<a class="btn dk block mt" target="_blank" rel="noopener" href="https://wa.me/' + (CFG.WHATSAPP || '85294400450') + '?text=' + waText + '">WhatsApp AirMilesHK about ' + ref + '</a>';
    if (role === 'admin') { box.innerHTML = '<h3>Viewing as admin</h3><p style="font-size:.88rem;margin:0">Status: ' + U.esc(o.status) + (o.awaiting ? ' — waiting for ' + U.esc(nm(o.awaiting)) : '') + '</p>'; }
    else if (o.status === 'accepted') {
      box.innerHTML = '<h3>Deal agreed 🎉</h3><p style="font-size:.9rem">AirMilesHK will contact you both on WhatsApp to arrange the next step.</p>' +
        '<div class="note gold">' + (role === 'buyer' ? '<strong>Buyer:</strong> pay AirMilesHK only — never send money to the seller directly. We hold it until delivery is confirmed.'
          : '<strong>Seller:</strong> do not transfer or book anything until AirMilesHK confirms we have received the buyer\'s payment.') + '</div>' + waBtn;
    } else if (o.status === 'completed') {
      box.innerHTML = '<h3>Completed</h3><p style="font-size:.9rem;margin:0">This deal is complete. Thank you for trading on the AirMilesHK Marketplace.</p>';
    } else if (o.status !== 'open') {
      box.innerHTML = '<h3>Deal closed</h3><p style="font-size:.9rem">This deal was ' + U.esc(o.status) + '.</p>' + (role === 'buyer' ? '<a class="btn ol block" href="' + U.listingUrl(o.listing_id) + '">Back to the listing</a>' : '');
    } else if (myTurn) {
      var canQty = o.kind === 'purchase';
      box.innerHTML = '<h3>Your move</h3><p style="font-size:.88rem">' + (role === 'seller' ? 'The buyer is waiting for your answer.' : 'The seller sent a counter-offer.') + ' Accept, counter or decline.</p>' +
        '<div class="f-field"><label class="f-label" for="r-msg">Message (optional)</label><textarea class="f-text" id="r-msg" maxlength="2000" style="min-height:64px"></textarea></div>' +
        '<div class="actions"><button class="btn" data-act="accept">Accept ' + U.usd(o.total_usd) + '</button><button class="btn ol" id="show-counter">Counter</button><button class="btn danger" data-act="decline">Decline</button></div>' +
        '<form id="cf" class="hide mt" novalidate><div class="f-row">' +
          (canQty ? '<div class="f-field"><label class="f-label" for="c-qty">Quantity</label><input class="f-input" id="c-qty" inputmode="numeric" value="' + U.num(o.quantity) + '"></div>' : '') +
          (o.kind !== 'booking' ? '<div class="f-field"><label class="f-label" for="c-cpp">US¢ per mile</label><input class="f-input" id="c-cpp" inputmode="decimal" value="' + (o.price_cpp || '') + '"></div>' : '') +
          '<div class="f-field"><label class="f-label" for="c-total">Total (US$)</label><input class="f-input" id="c-total" inputmode="decimal" value="' + (o.total_usd || '') + '"></div>' +
        '</div><button class="btn dk block" type="submit">Send counter-offer</button></form>' +
        (role === 'buyer' ? '<p class="mt" style="font-size:.82rem;text-align:center;margin-bottom:0"><a href="#" class="lnk" data-act="withdraw">Withdraw my offer</a></p>' : '');
      wireCounter();
    } else {
      box.innerHTML = '<h3>Waiting for ' + U.esc(other ? other.display_name : 'the other side') + '</h3><p style="font-size:.88rem">You will see their answer here. Check back in My Deals.</p>' +
        (role === 'buyer' ? '<button class="btn ol block" data-act="withdraw">Withdraw my offer</button>' : '');
    }
    U.$$('#act-box [data-act]').forEach(function (b) {
      b.onclick = function (e) { e.preventDefault(); act(b.dataset.act, b); };
    });
  }

  function wireCounter() {
    var qty = U.$('#c-qty'), cpp = U.$('#c-cpp'), tot = U.$('#c-total');
    U.$('#show-counter').onclick = function () { U.$('#cf').classList.toggle('hide'); };
    function n() { return qty ? U.parseNum(qty.value) : o.quantity; }
    if (cpp) cpp.oninput = function () { var c = U.parseDec(cpp.value); if (c && n()) tot.value = (Math.round(n() * c) / 100).toFixed(2); };
    if (qty) qty.oninput = function () { var c = cpp && U.parseDec(cpp.value); if (c && n()) tot.value = (Math.round(n() * c) / 100).toFixed(2); };
    tot.oninput = function () { var t = U.parseDec(tot.value); if (cpp && t && n()) cpp.value = (t / n() * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, ''); };
    U.$('#cf').onsubmit = function (e) {
      e.preventDefault();
      act('counter', this.querySelector('[type=submit]'), { quantity: n(), price_cpp: cpp ? U.parseDec(cpp.value) : null, total_usd: U.parseDec(tot.value) });
    };
  }

  async function act(action, btn, extra) {
    var labels = { accept: 'Accept this deal? AirMilesHK will then contact you both.', decline: 'Decline this offer?', withdraw: 'Withdraw your offer?' };
    if (labels[action] && !confirm(labels[action])) return;
    var p = Object.assign({ offer_id: o.id, action: action, quantity: null, price_cpp: null, total_usd: null, message: (U.$('#r-msg') || {}).value || '' }, extra || {});
    U.btnBusy(btn, true);
    try { await API.respondOffer(p); U.toast({ accept: 'Deal agreed', decline: 'Offer declined', withdraw: 'Offer withdrawn', counter: 'Counter-offer sent' }[action]); await load(); }
    catch (e) { U.toast(e.message, true); U.btnBusy(btn, false); }
  }

  await load();
  if (!o) return;
  U.$('#wrap').classList.remove('hide');
  if (U.param('sent')) msg.innerHTML = '<div class="note green mb"><strong>Sent.</strong> The seller will accept, counter or decline. Their answer will appear here and in My Deals.</div>';

  if (isAdmin) {
    U.$('#admin-box').classList.remove('hide');
    try {
      var d = await API.adminData();
      var who = function (uid) { var p = d.profiles.find(function (x) { return x.id === uid; }); return p ? U.esc(p.full_name || p.display_name) + ' · ' + U.esc(p.email || '') + (p.whatsapp ? ' · <a class="lnk" target="_blank" rel="noopener" href="https://wa.me/' + p.whatsapp.replace(/\D/g, '') + '">' + U.esc(p.whatsapp) + '</a>' : '') : '?'; };
      U.$('#a-buyer').innerHTML = who(o.buyer_id); U.$('#a-seller').innerHTML = who(o.seller_id);
    } catch (e) { /* ignore */ }
    U.$$('[data-admin]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('Set this deal to "' + b.dataset.admin + '"?')) return;
        U.btnBusy(b, true);
        try { await API.adminUpdateOffer(o.id, b.dataset.admin, U.$('#a-note').value.trim()); U.$('#a-note').value = ''; U.toast('Deal updated'); await load(); }
        catch (e) { U.toast(e.message, true); }
        U.btnBusy(b, false);
      };
    });
  }
})();
