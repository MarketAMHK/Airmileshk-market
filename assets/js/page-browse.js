(async function () {
  var ctx = await App.start({ page: 'browse' });
  var all = [];
  var el = { prog: U.$('#f-prog'), type: U.$('#f-type'), bal: U.$('#f-bal'), price: U.$('#f-price'), sort: U.$('#f-sort'),
             whole: U.$('#o-whole'), partial: U.$('#o-partial'), book: U.$('#o-book'), res: U.$('#results'), count: U.$('#count') };

  function card(l) { return U.listingCard(l, ctx.user); }

  function render() {
    var f = { prog: el.prog.value, type: el.type.value, bal: +el.bal.value, price: el.price.value };
    var rows = all.filter(function (l) {
      if (f.prog && l.programme !== f.prog) return false;
      if (f.type && l.programme_type !== f.type) return false;
      if (f.bal && l.balance < f.bal) return false;
      if (f.price === 'fixed' && l.price_mode !== 'fixed') return false;
      if (f.price === 'offers' && l.price_mode !== 'offers') return false;
      if (el.whole.checked && !l.sell_whole) return false;
      if (el.partial.checked && !l.sell_partial) return false;
      if (el.book.checked && !l.offers_booking) return false;
      return true;
    });
    var s = el.sort.value;
    rows.sort(function (a, b) {
      if (s === 'bal') return b.balance - a.balance;
      if (s === 'price') return (a.price_cpp || 1e9) - (b.price_cpp || 1e9);
      return a.created_at < b.created_at ? 1 : -1;
    });
    el.count.textContent = rows.length + ' of ' + all.length + ' listing' + (all.length === 1 ? '' : 's');
    el.res.innerHTML = rows.length ? rows.map(card).join('') :
      '<div class="empty" style="grid-column:1/-1"><h3>' + (all.length ? 'No listings match those filters' : 'No listings yet') + '</h3>' +
      '<p>' + (all.length ? 'Try clearing a filter.' : 'Be the first. List your miles or points in two minutes.') + '</p>' +
      '<a class="btn" href="sell.html">List your miles →</a></div>';
  }

  try { all = await API.listListings(); }
  catch (e) { el.res.innerHTML = '<div class="note red" style="grid-column:1/-1">Could not load listings: ' + U.esc(e.message) + '</div>'; return; }

  var progs = all.map(function (l) { return l.programme; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
  el.prog.innerHTML = '<option value="">All programmes</option>' + progs.map(function (p) { return '<option>' + U.esc(p) + '</option>'; }).join('');
  var qp = U.param('programme'); if (qp && progs.indexOf(qp) >= 0) el.prog.value = qp;

  U.$$('#filters select, #filters input').forEach(function (i) { i.addEventListener('change', render); });
  U.$('#f-clear').onclick = function () { U.$('#filters').reset(); render(); };
  render();
})();
