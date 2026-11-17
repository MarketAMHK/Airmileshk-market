(async function () {
  var ctx = await App.start({ page: 'sell', auth: 'required' });
  var id = U.param('id'), existing = null;
  var f = {
    prog: U.$('#prog'), other: U.$('#prog-other'), ptype: U.$('#ptype'), balance: U.$('#balance'), elite: U.$('#elite'),
    partial: U.$('#o-partial'), whole: U.$('#o-whole'), book: U.$('#o-book'), minq: U.$('#minq'),
    cpp: U.$('#cpp'), wprice: U.$('#wprice'), notes: U.$('#notes')
  };
  var msg = U.$('#msg');
  function say(t) { msg.innerHTML = t ? '<div class="note red mb">' + t + '</div>' : ''; if (t) msg.scrollIntoView({ block: 'center' }); }
  function pm() { return U.$('input[name=pm]:checked').value; }
  function type() { var o = f.prog.selectedOptions[0]; return f.prog.value === '__other' ? f.ptype.value : (o && o.dataset.type) || 'other'; }

  function sync() {
    U.$('#other-row').classList.toggle('hide', f.prog.value !== '__other');
    U.$('#min-wrap').classList.toggle('hide', !f.partial.checked);
    U.$$('[data-opt]').forEach(function (l) { l.classList.toggle('on', l.querySelector('input').checked); });
    U.$('#price-wrap').classList.toggle('hide', pm() !== 'fixed');
    U.$('#whole-price-field').classList.toggle('hide', !f.whole.checked);
    var t = type();
    U.$('#book-t').textContent = t === 'hotel' ? 'Book hotel stays for buyers' : t === 'airline' ? 'Issue award tickets for buyers' : 'Issue tickets or book hotel stays for buyers';
    var c = U.parseDec(f.cpp.value);
    U.$('#cpp-hint').textContent = c ? U.cpp(c) + ' = ' + U.usd(c * 10) + ' per 1,000' + (U.parseNum(f.balance.value) ? ' · ' + U.usd(c * U.parseNum(f.balance.value) / 100) + ' for the full balance' : '') : '1.25 = US$12.50 per 1,000';
  }

  f.prog.innerHTML = U.programmeOptions();
  if (id) {
    try { existing = await API.getListing(id); } catch (e) { existing = null; }
    if (!existing || existing.seller_id !== ctx.user.id) { say('Listing not found.'); U.$('#lf').classList.add('hide'); return; }
    U.$('#title').innerHTML = 'Edit your <em>listing</em>'; document.title = 'Edit listing | AirMilesHK Marketplace';
    U.$('#save').textContent = 'Save changes';
    if (U.programmeType(existing.programme)) f.prog.innerHTML = U.programmeOptions(existing.programme);
    else { f.prog.value = '__other'; f.other.value = existing.programme; f.ptype.value = existing.programme_type; }
    f.balance.value = U.num(existing.balance); f.elite.value = existing.elite_status || '';
    f.partial.checked = existing.sell_partial; f.whole.checked = existing.sell_whole; f.book.checked = existing.offers_booking;
    f.minq.value = existing.min_per_deal ? U.num(existing.min_per_deal) : '';
    U.$('input[name=pm][value=' + existing.price_mode + ']').checked = true;
    f.cpp.value = existing.price_cpp || ''; f.wprice.value = existing.whole_price_usd || ''; f.notes.value = existing.notes || '';
  } else {
    f.partial.checked = true;
  }
  U.$$('#lf input, #lf select').forEach(function (i) { i.addEventListener('input', sync); i.addEventListener('change', sync); });
  sync();

  U.$('#lf').onsubmit = async function (e) {
    e.preventDefault(); say('');
    var programme = f.prog.value === '__other' ? f.other.value.trim() : f.prog.value;
    var balance = U.parseNum(f.balance.value), minq = f.partial.checked ? U.parseNum(f.minq.value) : null;
    var cpp = pm() === 'fixed' ? U.parseDec(f.cpp.value) : null, wp = pm() === 'fixed' && f.whole.checked ? U.parseDec(f.wprice.value) : null;
    if (!programme || programme.length < 2) return say('Choose your programme.');
    if (!balance || balance <= 0) return say('Enter your balance.');
    if (!f.partial.checked && !f.whole.checked && !f.book.checked) return say('Choose at least one way to sell.');
    if (minq && minq > balance) return say('Your minimum per deal is larger than your balance.');
    if (pm() === 'fixed' && !cpp && !wp) return say('Enter an asking price, or choose "Open to offers".');
    if (cpp && (cpp <= 0 || cpp >= 100)) return say('Price per mile should be in US cents, e.g. 1.25.');
    if (/\+\d[\d\s-]{6,}\d|\b\d{8,}\b|[\w.]+@[\w-]+\.\w+|wa\.me|t\.me\//i.test(f.notes.value)) return say('Please remove phone numbers or emails from your notes — AirMilesHK handles contact.');

    var data = {
      programme: programme, programme_type: type(), balance: balance,
      sell_partial: f.partial.checked, sell_whole: f.whole.checked, offers_booking: f.book.checked,
      min_per_deal: minq || null, price_mode: pm(), price_cpp: cpp, whole_price_usd: wp,
      elite_status: f.elite.value.trim(), notes: f.notes.value.trim()
    };
    var btn = U.$('#save'); U.btnBusy(btn, true, 'Saving…');
    try {
      var saved = await API.saveListing(data, id);
      location.href = 'listing.html?id=' + encodeURIComponent(saved.id) + '&saved=1';
    } catch (err) { say(U.esc(err.message)); U.btnBusy(btn, false); }
  };
})();
