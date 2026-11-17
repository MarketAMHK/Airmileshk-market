// Public programme page (e.g. /emirates): shows live listings for one programme, no login needed.
(async function () {
  var ctx = await App.start({ page: 'browse' });
  var name = document.body.getAttribute('data-programme'), unit = document.body.getAttribute('data-unit') || 'miles';
  var res = U.$('#results'), count = U.$('#count');
  var rows;
  try { rows = (await API.listListings()).filter(function (l) { return l.programme === name; }); }
  catch (e) { res.innerHTML = '<div class="note red" style="grid-column:1/-1">Could not load listings: ' + U.esc(e.message) + '</div>'; return; }
  count.textContent = rows.length + ' live listing' + (rows.length === 1 ? '' : 's');
  res.innerHTML = rows.length ? rows.map(function (l) { return U.listingCard(l, ctx.user); }).join('') :
    '<div class="empty" style="grid-column:1/-1"><h3>No ' + U.esc(name) + ' listings right now</h3>' +
    '<p>New listings appear here as soon as members post them. Have ' + U.esc(name) + ' ' + unit + '? List them free in two minutes.</p>' +
    '<a class="btn" href="/sell.html">List your ' + unit + ' →</a> <a class="btn ol" href="/">Browse all listings</a></div>';
})();
