(async function () {
  var ctx = await App.start({ page: 'admin', auth: 'admin' });
  var d, tab = 'deals', rowsForCsv = [];
  var STATUS = {
    deals: [['', 'All deals'], ['accepted', 'Agreed — needs action'], ['open', 'Negotiating'], ['completed', 'Completed'], ['declined', 'Declined'], ['withdrawn', 'Withdrawn'], ['cancelled', 'Cancelled']],
    listings: [['', 'All listings'], ['active', 'Active'], ['paused', 'Paused'], ['removed', 'Removed']],
    members: [['', 'All members'], ['seller', 'Sellers'], ['buyer', 'Buyers'], ['suspended', 'Suspended'], ['admin', 'Admins']]
  };

  async function load() {
    try { d = await API.adminData(); }
    catch (e) { U.$('#tbl tbody').innerHTML = '<tr><td><div class="note red">' + U.esc(e.message) + '</div></td></tr>'; return; }
    d.pById = {}; d.profiles.forEach(function (p) { d.pById[p.id] = p; });
    d.lById = {}; d.listings.forEach(function (l) { d.lById[l.id] = l; });
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
    } else if (tab === 'listings') {
      rows = d.listings.filter(function (l) { return (!st || l.status === st) && hit(l.programme, name(l.seller_id), l.notes); });
      head = ['Listed', 'Programme', 'Balance', 'Options', 'Price', 'Seller', 'Status', ''];
      body = rows.map(function (l) {
        var opts = [l.sell_partial ? 'Partial' + (l.min_per_deal ? ' (min ' + U.short(l.min_per_deal) + ')' : '') : '', l.sell_whole ? 'Whole' : '', l.offers_booking ? 'Books' : ''].filter(Boolean).join(', ');
        return '<tr><td>' + U.date(l.created_at) + '</td><td><a href="listing.html?id=' + encodeURIComponent(l.id) + '"><strong>' + U.esc(l.programme) + '</strong></a></td><td>' + U.num(l.balance) + '</td>' +
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
    U.$$('#tbl [data-u]').forEach(function (b) {
      b.onclick = async function () {
        var v = b.dataset.v === 'true';
        if (!confirm(v ? 'Suspend this member? They will not be able to list or make offers.' : 'Unsuspend this member?')) return;
        try { await API.adminSetSuspended(b.dataset.u, v); U.toast('Member updated'); load(); } catch (e) { U.toast(e.message, true); }
      };
    });
  }

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
