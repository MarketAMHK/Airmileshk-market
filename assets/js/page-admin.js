(async function () {
  var ctx = await App.start({ page: 'admin', auth: 'admin' });
  var d, tab = 'deals', rowsForCsv = [];
  var STATUS = {
    deals: [['', 'All deals'], ['accepted', 'Agreed — needs action'], ['open', 'Negotiating'], ['completed', 'Completed'], ['declined', 'Declined'], ['withdrawn', 'Withdrawn'], ['cancelled', 'Cancelled']],
    listings: [['', 'All listings'], ['active', 'Active'], ['paused', 'Paused'], ['removed', 'Removed']],
    members: [['', 'All members'], ['seller', 'Sellers'], ['buyer', 'Buyers'], ['suspended', 'Suspended'], ['admin', 'Admins']],
    activity: [['todo', 'WhatsApp not sent yet'], ['', 'All activity'], ['sent', 'WhatsApp sent']],
    quotes: [['', 'All requests'], ['new', 'New'], ['contacted', 'Contacted'], ['closed', 'Closed'], ['listed', 'Listed on marketplace'], ['unlisted', 'Not listed']]
  };
  var SITE = 'https://market.airmileshk.com';
  function waLink(phone, text) { var n = String(phone || '').replace(/\D/g, ''); return n.length >= 7 ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(text) : null; }
  function firstName(s) { s = String(s || '').trim(); return !s ? 'there' : s.length <= 20 ? s : s.split(/\s+/)[0]; }
  function money(n) { return 'US$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

  // Who to message for a deal step, and what to say (Eran checks the text and presses send in WhatsApp).
  function waTargets(ev) {
    var o = d.oById[ev.offer_id]; if (!o) return [];
    var l = d.lById[o.listing_id] || {}, prog = l.programme || 'your', amt = money(ev.total_usd || o.total_usd);
    var dealUrl = SITE + '/deal.html?id=' + o.id, listUrl = SITE + U.listingUrl(o.listing_id);
    var q = l.managed && l.quote_id ? d.qById[l.quote_id] : null;
    function person(role) {
      if (role === 'seller' && q) return { role: role, name: q.name, phone: q.phone, url: listUrl, managed: true };
      var p = d.pById[role === 'buyer' ? o.buyer_id : o.seller_id] || {};
      return { role: role, name: p.full_name || p.display_name, phone: p.whatsapp, url: dealUrl };
    }
    var other = ev.actor_id === o.buyer_id ? 'seller' : 'buyer', out = [];
    if (ev.action === 'offer') { var s = person('seller'); s.text = 'Hi ' + firstName(s.name) + ', you got a ' + (o.kind === 'booking' ? 'booking request (budget ' + amt + ')' : amt + ' bid') + ' on your ' + prog + ' listing on AirMilesHK Marketplace' + (s.managed ? '. Shall we go ahead? ' : ': ') + s.url; out.push(s); }
    else if (ev.action === 'counter') { var c = person(other); c.text = 'Hi ' + firstName(c.name) + ', you have a counter-offer of ' + amt + ' on ' + prog + ' on AirMilesHK Marketplace: ' + c.url; out.push(c); }
    else if (ev.action === 'accept') { ['buyer', 'seller'].forEach(function (r) { var x = person(r); x.text = 'Hi ' + firstName(x.name) + ', your ' + prog + ' deal for ' + amt + ' is agreed on AirMilesHK Marketplace. We will arrange payment and delivery with you here on WhatsApp. ' + x.url; out.push(x); }); }
    else if (ev.action === 'decline') { var b = person('buyer'); b.text = 'Hi ' + firstName(b.name) + ', the seller declined your offer on ' + prog + '. See other listings: ' + SITE + (U.programmeUrl(prog) || '/'); out.push(b); }
    return out;
  }
  function quoteRef(q) { return 'Q-' + String(q.id || '').replace(/-/g, '').slice(0, 6).toUpperCase(); }
  function waSent(ev, role) { return d.waLog.some(function (w) { return w.event_id === ev.id && w.recipient === role; }); }

  async function load() {
    try { d = await API.adminData(); }
    catch (e) { U.$('#tbl tbody').innerHTML = '<tr><td><div class="note red">' + U.esc(e.message) + '</div></td></tr>'; return; }
    d.pById = {}; d.profiles.forEach(function (p) { d.pById[p.id] = p; });
    d.lById = {}; d.listings.forEach(function (l) { d.lById[l.id] = l; });
    d.oById = {}; d.offers.forEach(function (o) { d.oById[o.id] = o; });
    d.quotes = d.quotes || []; d.events = d.events || []; d.waLog = d.waLog || [];
    d.qById = {}; d.quotes.forEach(function (q) { d.qById[q.id] = q; });
    d.waEvents = d.events.filter(function (e) { return ['offer', 'counter', 'accept', 'decline'].indexOf(e.action) >= 0; });
    var waTodo = d.waEvents.filter(function (e) { return waTargets(e).some(function (t) { return !waSent(e, t.role); }); }).length;
    var newQuotes = d.quotes.filter(function (q) { return q.status === 'new'; }).length;
    U.$('#c-activity').textContent = waTodo || d.waEvents.length; U.$('#c-activity').classList.toggle('hot', waTodo > 0);
    U.$('#c-quotes').textContent = newQuotes || d.quotes.length; U.$('#c-quotes').classList.toggle('hot', newQuotes > 0);
    var agreed = d.offers.filter(function (o) { return o.status === 'accepted'; }).length;
    var done = d.offers.filter(function (o) { return o.status === 'completed'; });
    U.$('#stats').innerHTML = [
      [d.profiles.length, 'Members'], [d.listings.filter(function (l) { return l.status === 'active'; }).length, 'Active listings'],
      [agreed, 'Agreed — need action'], [U.usd(done.reduce(function (s, o) { return s + Number(o.total_usd || 0); }, 0)), 'Completed volume']
    ].map(function (s) { return '<div class="stat"><div class="v">' + s[0] + '</div><div class="k">' + s[1] + '</div></div>'; }).join('');
    U.$('#c-deals').textContent = d.offers.length; U.$('#c-listings').textContent = d.listings.length; U.$('#c-members').textContent = d.profiles.length;
    U.$('#c-deals').classList.toggle('hot', agreed > 0);
    render();
  }

  function name(uid) { var p = d.pById[uid]; return p ? p.display_name : '?'; }
  function setTab(t) {
    tab = t;
    U.$$('#tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
    U.$('#status-filter').innerHTML = STATUS[t].map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('');
    render();
  }

  function render() {
    if (!d) return;
    var q = U.$('#search').value.trim().toLowerCase(), st = U.$('#status-filter').value, head, body, rows;
    function hit() { return !q || Array.prototype.join.call(arguments, ' ').toLowerCase().indexOf(q) >= 0; }

    if (tab === 'deals') {
      rows = d.offers.filter(function (o) { var l = d.lById[o.listing_id] || {}; return (!st || o.status === st) && hit(l.programme, name(o.buyer_id), name(o.seller_id), o.id); });
      head = ['Updated', 'Programme', 'Type', 'Buyer', 'Seller', 'Qty', 'Total', 'Status', ''];
      body = rows.map(function (o) {
        var l = d.lById[o.listing_id] || {};
        return '<tr><td>' + U.date(o.updated_at) + '</td><td><strong>' + U.esc(l.programme || '?') + '</strong></td><td>' + U.esc(U.kindLabel[o.kind]) + '</td>' +
          '<td>' + U.esc(name(o.buyer_id)) + '</td><td>' + U.esc(name(o.seller_id)) + '</td><td>' + U.num(o.quantity) + '</td><td>' + U.usd(o.total_usd) + '</td>' +
          '<td>' + U.statusChip(o.status) + '</td><td><a href="deal.html?id=' + encodeURIComponent(o.id) + '">Open →</a></td></tr>';
      });
      rowsForCsv = [['id', 'updated', 'programme', 'kind', 'buyer', 'buyer_email', 'seller', 'seller_email', 'quantity', 'price_cpp', 'total_usd', 'status']].concat(rows.map(function (o) {
        var l = d.lById[o.listing_id] || {}, b = d.pById[o.buyer_id] || {}, s = d.pById[o.seller_id] || {};
        return [o.id, o.updated_at, l.programme, o.kind, b.display_name, b.email, s.display_name, s.email, o.quantity, o.price_cpp, o.total_usd, o.status];
      }));
    } else if (tab === 'activity') {
      var verbs = { offer: 'New bid', counter: 'Counter-offer', accept: 'Deal agreed', decline: 'Declined' };
      rows = d.waEvents.filter(function (e) {
        var t = waTargets(e), allSent = t.length && t.every(function (x) { return waSent(e, x.role); });
        if (st === 'todo' && allSent) return false; if (st === 'sent' && !allSent) return false;
        var o = d.oById[e.offer_id] || {}, l = d.lById[o.listing_id] || {};
        return hit(l.programme, name(o.buyer_id), name(o.seller_id), verbs[e.action]);
      });
      head = ['When', 'What', 'Programme', 'Amount', 'Buyer → Seller', 'Send on WhatsApp', ''];
      body = rows.map(function (e) {
        var o = d.oById[e.offer_id] || {}, l = d.lById[o.listing_id] || {};
        var btns = waTargets(e).map(function (t) {
          var url = waLink(t.phone, t.text), sent = waSent(e, t.role), who = (t.role === 'buyer' ? 'Buyer' : 'Seller') + ' · ' + firstName(t.name);
          return url ? '<a class="btn wa sm' + (sent ? ' sent' : '') + '" target="_blank" rel="noopener" href="' + url + '" data-ev="' + e.id + '" data-r="' + t.role + '">' + (sent ? '✓ Sent · ' : 'WhatsApp ') + U.esc(who) + '</a>'
            : '<span class="chip grey">' + U.esc(who) + ': no phone</span>';
        }).join(' ');
        return '<tr><td>' + U.ago(e.created_at) + '</td><td><strong>' + U.esc(verbs[e.action]) + '</strong></td><td>' + U.esc(l.programme || '?') + (l.managed ? ' <span class="chip">via quote</span>' : '') + '</td>' +
          '<td>' + U.usd(e.total_usd || o.total_usd) + '</td><td>' + U.esc(name(o.buyer_id)) + ' → ' + U.esc(l.managed ? 'AirMilesHK (managed)' : name(o.seller_id)) + '</td>' +
          '<td><div class="actions">' + btns + '</div></td><td><a href="/deal.html?id=' + encodeURIComponent(e.offer_id) + '">Open →</a></td></tr>';
      });
      rowsForCsv = [['event_id', 'when', 'action', 'programme', 'amount', 'buyer', 'seller']].concat(rows.map(function (e) {
        var o = d.oById[e.offer_id] || {}, l = d.lById[o.listing_id] || {};
        return [e.id, e.created_at, e.action, l.programme, e.total_usd || o.total_usd, name(o.buyer_id), name(o.seller_id)];
      }));
    } else if (tab === 'quotes') {
      rows = d.quotes.filter(function (q) {
        if (st === 'listed' && !q.listing_id) return false; if (st === 'unlisted' && q.listing_id) return false;
        if (['new', 'contacted', 'closed'].indexOf(st) >= 0 && q.status !== st) return false;
        return hit(q.name, q.phone, q.email, q.programme, quoteRef(q));
      });
      var attachLabel = { new_member: 'New member', existing_member: 'Existing member (added paused)', managed: 'Offered by AirMilesHK', converted: 'Switched to member' };
      head = ['Received', 'Seller', 'Phone', 'Email', 'Programme', 'Balance', 'Price asked', 'Listing type', 'Marketplace ad', 'Status', ''];
      body = rows.map(function (q) {
        var l = q.listing_id ? d.lById[q.listing_id] : null, unit = q.programme_type === 'hotel' ? 'points' : 'miles';
        var wa = waLink(q.phone, 'Hi ' + firstName(q.name) + ', thanks for your ' + q.programme + ' quote request (' + U.num(q.balance) + ' ' + unit + ') on AirMilesHK. ');
        var price = q.price_mode === 'fixed' ? (q.price_cpp ? U.cpp(q.price_cpp) + '/pt' : q.whole_price_usd ? U.usd(q.whole_price_usd) + ' whole' : 'Fixed') : 'Open to offers';
        var ad = !l ? '<span class="muted">Not listed</span>' :
          '<a href="' + U.listingUrl(l.id) + '">' + U.esc(attachLabel[q.attach] || 'Listed') + '</a> ' + U.statusChip(l.status) +
          '<div class="actions" style="margin-top:6px">' + (l.status === 'active' ? '<button class="btn ol sm" data-l="' + l.id + '" data-st="paused">Pause</button>' : l.status === 'paused' ? '<button class="btn sm" data-l="' + l.id + '" data-st="active">Make live</button>' : '') +
          (l.status !== 'removed' ? '<button class="btn danger sm" data-l="' + l.id + '" data-st="removed">Remove</button>' : '') +
          (l.managed && l.status !== 'removed' ? '<button class="btn ol sm" data-convert="' + q.id + '" title="Move this ad to the customer\'s own member account">Switch to member</button>' : '') + '</div>';
        var ltype = !l ? '—' : l.managed ? '<span class="chip gold">AirMilesHK</span>' : '<span class="chip navy">Member</span>';
        var stSel = '<select class="f-select" style="padding:6px 30px 6px 10px;font-size:.8rem;min-width:120px" data-q="' + q.id + '">' +
          ['new', 'contacted', 'closed'].map(function (s) { return '<option' + (q.status === s ? ' selected' : '') + ' value="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</option>'; }).join('') + '</select>';
        return '<tr><td>' + U.ago(q.created_at) + (q.source === 'admin' ? ' <span class="chip gold">Added by you</span>' : q.source === 'mainsite' ? ' <span class="chip navy">airmileshk.com</span>' : '') + '<div class="muted" style="font-size:.72rem;font-family:JetBrains Mono,monospace">' + quoteRef(q) + '</div></td><td><strong>' + U.esc(q.name || '—') + '</strong></td><td>' + (q.phone ? U.esc(q.phone) : '<button class="btn ol sm" data-qphone="' + q.id + '">Add phone</button>') + '</td><td>' + U.esc(q.email || '—') + '</td>' +
          '<td>' + U.esc(q.programme) + '</td><td>' + U.num(q.balance) + '</td><td>' + U.esc(price) + '</td><td>' + ltype + '</td><td>' + ad + '</td><td>' + stSel + '</td>' +
          '<td>' + (wa ? '<a class="btn wa sm" target="_blank" rel="noopener" href="' + wa + '">WhatsApp</a>' : '') + '</td></tr>';
      });
      rowsForCsv = [['id', 'received', 'name', 'phone', 'email', 'programme', 'balance', 'price_mode', 'price_cpp', 'whole_price_usd', 'partial', 'min_per_deal', 'whole', 'booking', 'wants_listing', 'listing_id', 'attach', 'status']].concat(rows.map(function (q) {
        return [q.id, q.created_at, q.name, q.phone, q.email, q.programme, q.balance, q.price_mode, q.price_cpp, q.whole_price_usd, q.sell_partial, q.min_per_deal, q.sell_whole, q.offers_booking, q.wants_listing, q.listing_id, q.attach, q.status];
      }));
    } else if (tab === 'listings') {
      rows = d.listings.filter(function (l) { return (!st || l.status === st) && hit(l.programme, name(l.seller_id), l.notes); });
      head = ['Listed', 'Programme', 'Balance', 'Options', 'Price', 'Seller', 'Status', ''];
      body = rows.map(function (l) {
        var opts = [l.sell_partial ? 'Partial' + (l.min_per_deal ? ' (min ' + U.short(l.min_per_deal) + ')' : '') : '', l.sell_whole ? 'Whole' : '', l.offers_booking ? 'Books' : ''].filter(Boolean).join(', ');
        return '<tr><td>' + U.date(l.created_at) + '</td><td><a href="' + U.listingUrl(l.id) + '"><strong>' + U.esc(l.programme) + '</strong></a></td><td>' + U.num(l.balance) + '</td>' +
          '<td>' + U.esc(opts) + '</td><td>' + U.esc(U.priceLine(l).v) + '</td><td>' + U.esc(name(l.seller_id)) + '</td><td>' + U.statusChip(l.status) + '</td>' +
          '<td>' + (l.status === 'removed' ? '<button class="btn ol sm" data-l="' + l.id + '" data-st="active">Restore</button>' : '<button class="btn danger sm" data-l="' + l.id + '" data-st="removed">Remove</button>') + '</td></tr>';
      });
      rowsForCsv = [['id', 'created', 'programme', 'type', 'balance', 'partial', 'min_per_deal', 'whole', 'booking', 'price_mode', 'price_cpp', 'whole_price_usd', 'seller', 'seller_email', 'status']].concat(rows.map(function (l) {
        var s = d.pById[l.seller_id] || {};
        return [l.id, l.created_at, l.programme, l.programme_type, l.balance, l.sell_partial, l.min_per_deal, l.sell_whole, l.offers_booking, l.price_mode, l.price_cpp, l.whole_price_usd, s.display_name, s.email, l.status];
      }));
    } else {
      rows = d.profiles.filter(function (p) {
        if (st === 'suspended' && !p.is_suspended) return false;
        if (st === 'admin' && !p.is_admin) return false;
        if ((st === 'seller' || st === 'buyer') && p.role !== st && p.role !== 'both') return false;
        return hit(p.full_name, p.display_name, p.email, p.whatsapp, p.country);
      });
      head = ['Joined', 'Nickname', 'Full name', 'Email', 'WhatsApp', 'Country', 'Role', 'Listings', 'Deals', ''];
      body = rows.map(function (p) {
        var nl = d.listings.filter(function (l) { return l.seller_id === p.id && l.status !== 'removed'; }).length;
        var nd = d.offers.filter(function (o) { return o.buyer_id === p.id || o.seller_id === p.id; }).length;
        var wa = p.whatsapp ? '<a target="_blank" rel="noopener" href="https://wa.me/' + p.whatsapp.replace(/\D/g, '') + '">' + U.esc(p.whatsapp) + '</a>' : '—';
        return '<tr><td>' + U.date(p.created_at) + '</td><td><strong>' + U.esc(p.display_name) + '</strong>' + (p.is_admin ? ' <span class="chip gold">Admin</span>' : '') + (p.is_suspended ? ' <span class="chip red">Suspended</span>' : '') + '</td>' +
          '<td>' + U.esc(p.full_name) + '</td><td>' + U.esc(p.email) + '</td><td>' + wa + '</td><td>' + U.esc(p.country) + '</td><td>' + U.esc(p.role) + '</td><td>' + nl + '</td><td>' + nd + '</td>' +
          '<td>' + (p.id === ctx.user.id ? '' : '<button class="btn ' + (p.is_suspended ? 'ol' : 'danger') + ' sm" data-u="' + p.id + '" data-v="' + (!p.is_suspended) + '">' + (p.is_suspended ? 'Unsuspend' : 'Suspend') + '</button>') + '</td></tr>';
      });
      rowsForCsv = [['id', 'joined', 'display_name', 'full_name', 'email', 'whatsapp', 'country', 'role', 'is_admin', 'is_suspended', 'terms_accepted_at']].concat(rows.map(function (p) {
        return [p.id, p.created_at, p.display_name, p.full_name, p.email, p.whatsapp, p.country, p.role, p.is_admin, p.is_suspended, p.terms_accepted_at];
      }));
    }
    U.$('#tbl thead').innerHTML = '<tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>';
    U.$('#tbl tbody').innerHTML = body.length ? body.join('') : '<tr><td colspan="' + head.length + '" class="muted" style="text-align:center;padding:28px">Nothing here.</td></tr>';

    U.$$('#tbl [data-l]').forEach(function (b) {
      b.onclick = async function () {
        if (b.dataset.st === 'removed' && !confirm('Remove this listing from the marketplace?')) return;
        try { await API.adminSetListingStatus(b.dataset.l, b.dataset.st); U.toast('Listing updated'); load(); } catch (e) { U.toast(e.message, true); }
      };
    });
    U.$$('#tbl a[data-ev]').forEach(function (a) {
      a.addEventListener('click', function () {
        // The link opens WhatsApp in a new tab; record that it was sent.
        API.adminMarkWa(+a.dataset.ev, a.dataset.r).then(function () {
          d.waLog.push({ event_id: +a.dataset.ev, recipient: a.dataset.r }); a.classList.add('sent');
          if (!/^✓/.test(a.textContent)) a.textContent = '✓ Sent · ' + a.textContent.replace(/^WhatsApp /, '');
        }).catch(function (e) { U.toast(e.message, true); });
      });
    });
    // Switch a house listing to the customer's own member listing.
    U.$$('#tbl [data-convert]').forEach(function (b) {
      b.onclick = async function () {
        var q = d.qById[b.dataset.convert]; if (!q) return;
        var email = q.email;
        if (!email) {
          email = (prompt('Customer\'s email for ' + quoteRef(q) + '. They will get a sign-in link to manage the ad:', '') || '').trim();
          if (!email) return;
        }
        var hasAccount = d.profiles.some(function (p) { return (p.email || '').toLowerCase() === email.toLowerCase(); });
        if (!confirm('Move the ' + q.programme + ' ad to ' + email + '\'s own member account?\n\n' +
          (hasAccount ? 'They already have an account; the ad moves there.' : 'We will email them a sign-in link to create their account and manage the ad.') +
          '\nOffers already made on it stay with you.')) return;
        U.btnBusy(b, true, 'Switching…');
        try {
          if (email !== q.email) await API.adminSetQuoteEmail(q.id, email);
          if (!hasAccount) await API.quoteSignup(email, { full_name: q.name || '', display_name: (String(q.name || '').split(/\s+/)[0] || 'Member').slice(0, 40), whatsapp: q.phone || '', role: 'seller' });
          await API.adminConvertHouseListing(q.id);
          U.toast('Switched to a member listing'); load();
        } catch (e) { U.toast(e.message, true); U.btnBusy(b, false); }
      };
    });
    U.$$('#tbl [data-qphone]').forEach(function (b) {
      b.onclick = async function () {
        var q = d.qById[b.dataset.qphone]; if (!q) return;
        var phone = prompt('Seller\'s WhatsApp number for ' + quoteRef(q) + ' (with country code, e.g. +852 9123 4567):', '');
        if (!phone) return;
        var name = q.name ? q.name : (prompt('Seller\'s name (optional):', '') || '');
        try { await API.adminUpdateQuoteContact(q.id, name, phone); U.toast('Saved'); load(); } catch (e) { U.toast(e.message, true); }
      };
    });
    U.$$('#tbl select[data-q]').forEach(function (s) {
      s.onchange = async function () {
        try { await API.adminSetQuoteStatus(s.dataset.q, s.value); d.qById[s.dataset.q].status = s.value; U.toast('Status updated'); }
        catch (e) { U.toast(e.message, true); }
      };
    });
    U.$$('#tbl [data-u]').forEach(function (b) {
      b.onclick = async function () {
        var v = b.dataset.v === 'true';
        if (!confirm(v ? 'Suspend this member? They will not be able to list or make offers.' : 'Unsuspend this member?')) return;
        try { await API.adminSetSuspended(b.dataset.u, v); U.toast('Member updated'); load(); } catch (e) { U.toast(e.message, true); }
      };
    });
  }

  /* ── Create ad (admin-posted, "Listed via AirMilesHK") ── */
  var af = { prog: U.$('#ad-prog'), other: U.$('#ad-other'), ptype: U.$('#ad-ptype'), bal: U.$('#ad-bal'), partial: U.$('#ad-partial'), min: U.$('#ad-min'),
             whole: U.$('#ad-whole'), book: U.$('#ad-book'), mode: U.$('#ad-mode'), cpp: U.$('#ad-cpp'), wp: U.$('#ad-wp'), elite: U.$('#ad-elite'),
             notes: U.$('#ad-notes'), sname: U.$('#ad-sname'), sphone: U.$('#ad-sphone') };
  af.prog.innerHTML = U.programmeOptions();
  function adSync() {
    U.$('#ad-other-row').classList.toggle('hide', af.prog.value !== '__other');
    U.$('#ad-price-row').classList.toggle('hide', af.mode.value !== 'fixed');
    af.min.classList.toggle('hide', !af.partial.checked);
  }
  U.$$('#ad-form input, #ad-form select').forEach(function (i) { i.addEventListener('change', adSync); });
  adSync();
  U.$('#new-ad-btn').onclick = function () { U.$('#ad-form').classList.toggle('hide'); af.prog.focus(); };
  U.$('#ad-close').onclick = function () { U.$('#ad-form').classList.add('hide'); };
  U.$('#ad-form').onsubmit = async function (e) {
    e.preventDefault();
    var msg = U.$('#ad-msg'), opt = af.prog.selectedOptions[0];
    var programme = af.prog.value === '__other' ? af.other.value.trim() : af.prog.value;
    var p = {
      programme: programme, programme_type: af.prog.value === '__other' ? af.ptype.value : (opt && opt.dataset.type) || 'other',
      balance: U.parseNum(af.bal.value), sell_partial: af.partial.checked, min_per_deal: af.partial.checked ? U.parseNum(af.min.value) : null,
      sell_whole: af.whole.checked, offers_booking: af.book.checked, price_mode: af.mode.value,
      price_cpp: af.mode.value === 'fixed' ? U.parseDec(af.cpp.value) : null, whole_price_usd: af.mode.value === 'fixed' ? U.parseDec(af.wp.value) : null,
      elite_status: af.elite.value.trim(), notes: af.notes.value.trim(), seller_name: af.sname.value.trim(), seller_phone: af.sphone.value.trim()
    };
    if (!programme) { msg.innerHTML = '<div class="note red mb">Choose a programme.</div>'; return; }
    if (!p.balance) { msg.innerHTML = '<div class="note red mb">Enter the balance.</div>'; return; }
    var btn = U.$('#ad-save'); U.btnBusy(btn, true, 'Publishing…');
    try {
      var id = await API.adminCreateListing(p);
      msg.innerHTML = '<div class="note green mb">Published: ' + U.esc(programme) + ' — ' + U.num(p.balance) + '. <a class="lnk" href="' + U.listingUrl(id) + '" target="_blank">View ad ↗</a></div>';
      if (U.$('#ad-keep').checked) { af.bal.value = ''; af.sname.value = ''; af.sphone.value = ''; af.bal.focus(); }
      else { U.$('#ad-form').reset(); af.prog.innerHTML = U.programmeOptions(); adSync(); }
      load();
    } catch (x) { msg.innerHTML = '<div class="note red mb">' + U.esc(x.message) + '</div>'; }
    U.btnBusy(btn, false);
  };

  U.$$('#tabs button').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
  U.$('#search').oninput = render;
  U.$('#status-filter').onchange = render;
  U.$('#csv').onclick = function () {
    var csv = rowsForCsv.map(function (r) { return r.map(function (c) { c = c == null ? '' : String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'airmileshk-market-' + tab + '-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  };
  setTab('deals');
  load();
})();
