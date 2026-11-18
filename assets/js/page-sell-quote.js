// Public sell-quote form: always saves the request; optionally creates a marketplace listing; then opens WhatsApp.
(async function () {
  var CFG = window.MARKET_CONFIG || {};
  await App.start({ page: 'sell' });
  var f = {
    name: U.$('#q-name'), cc: U.$('#q-cc'), num: U.$('#q-num'), email: U.$('#q-email'),
    prog: U.$('#prog'), other: U.$('#prog-other'), ptype: U.$('#ptype'), balance: U.$('#balance'),
    partial: U.$('#o-partial'), whole: U.$('#o-whole'), book: U.$('#o-book'), minq: U.$('#minq'),
    cpp: U.$('#cpp'), wprice: U.$('#wprice'), list: U.$('#q-list'), hp: U.$('#q-website')
  };
  var CODES = [['+852', 'Hong Kong'], ['+853', 'Macau'], ['+86', 'China'], ['+886', 'Taiwan'], ['+65', 'Singapore'], ['+60', 'Malaysia'],
    ['+66', 'Thailand'], ['+63', 'Philippines'], ['+62', 'Indonesia'], ['+84', 'Vietnam'], ['+81', 'Japan'], ['+82', 'Korea'], ['+91', 'India'],
    ['+971', 'UAE'], ['+972', 'Israel'], ['+966', 'Saudi Arabia'], ['+974', 'Qatar'], ['+44', 'UK'], ['+1', 'USA / Canada'], ['+61', 'Australia'],
    ['+64', 'New Zealand'], ['+49', 'Germany'], ['+33', 'France'], ['+41', 'Switzerland'], ['+31', 'Netherlands'], ['', 'Other (type full number)']];
  f.cc.innerHTML = CODES.map(function (c) { return '<option value="' + c[0] + '">' + (c[0] ? c[0] + ' ' : '') + c[1] + '</option>'; }).join('');
  f.prog.innerHTML = U.programmeOptions();

  // Pre-fill from ?programme=emirates (page slug) or the full programme name.
  var want = (U.param('programme') || '').trim();
  if (want) {
    var pages = window.PROGRAMME_PAGES || {}, name = null;
    Object.keys(pages).forEach(function (n) { if (pages[n] === want.toLowerCase() || n.toLowerCase() === want.toLowerCase()) name = n; });
    if (name) f.prog.innerHTML = U.programmeOptions(name);
  }

  function pm() { return U.$('input[name=pm]:checked').value; }
  function type() { var o = f.prog.selectedOptions[0]; return f.prog.value === '__other' ? f.ptype.value : (o && o.dataset.type) || 'other'; }
  function sync() {
    U.$('#other-row').classList.toggle('hide', f.prog.value !== '__other');
    U.$('#min-wrap').classList.toggle('hide', !f.partial.checked);
    U.$$('[data-opt], #list-box').forEach(function (l) { l.classList.toggle('on', l.querySelector('input').checked); });
    U.$('#price-wrap').classList.toggle('hide', pm() !== 'fixed');
    U.$('#whole-price-field').classList.toggle('hide', !f.whole.checked);
    var t = type();
    U.$('#book-t').textContent = t === 'hotel' ? 'Book hotel stays for buyers' : t === 'airline' ? 'Issue award tickets for buyers' : 'Issue tickets or book hotel stays for buyers';
  }
  U.$$('#qf input, #qf select').forEach(function (i) { i.addEventListener('input', sync); i.addEventListener('change', sync); });
  sync();

  var err = U.$('#q-err');
  function say(t) { err.innerHTML = t ? '<div class="note red mt">' + t + '</div>' : ''; if (t) err.scrollIntoView({ block: 'center' }); }

  U.$('#qf').onsubmit = async function (e) {
    e.preventDefault(); say('');
    var num = f.num.value.trim(), phone = (f.cc.value ? f.cc.value + ' ' : '') + num;
    var digits = phone.replace(/\D/g, ''), email = f.email.value.trim();
    var programme = f.prog.value === '__other' ? f.other.value.trim() : f.prog.value;
    var balance = U.parseNum(f.balance.value), minq = f.partial.checked ? U.parseNum(f.minq.value) : null;
    var cpp = pm() === 'fixed' ? U.parseDec(f.cpp.value) : null, wp = pm() === 'fixed' && f.whole.checked ? U.parseDec(f.wprice.value) : null;
    var wants = f.list.checked;
    if (digits.length < 7) return say('Enter your WhatsApp or phone number.');
    if (!f.cc.value && !/^\s*\+/.test(num)) return say('Choose your country code, or type the full number starting with +.');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say('That email address looks wrong.');
    if (!programme || programme.length < 2) return say('Choose your programme.');
    if (!balance || balance <= 0) return say('Enter your balance.');
    if (wants && !f.partial.checked && !f.whole.checked && !f.book.checked) return say('To list on the marketplace, choose at least one way to sell.');
    if (wants && pm() === 'fixed' && !cpp && !wp) return say('Enter your price, or choose "Open to offers".');
    if (cpp && (cpp <= 0 || cpp >= 100)) return say('Price per mile should be in US cents, e.g. 1.25.');

    var btn = U.$('#q-send'); U.btnBusy(btn, true, 'Sending…');
    var name = f.name.value.trim();
    try {
      if (wants && email) {
        // Creates the member account (or finds it) and emails a login link. If this fails, the ad is still listed via AirMilesHK.
        try { await API.quoteSignup(email, { full_name: name, display_name: (name.split(/\s+/)[0] || 'Member').slice(0, 40), whatsapp: phone, role: 'seller', terms_accepted: true }); }
        catch (x) { console.warn('Login link not sent:', x.message); }
      }
      var res = await API.submitSellQuote({
        name: name, phone: phone, email: email, programme: programme, programme_type: type(), balance: balance,
        sell_partial: f.partial.checked, min_per_deal: minq || null, sell_whole: f.whole.checked, offers_booking: f.book.checked,
        price_mode: pm(), price_cpp: cpp, whole_price_usd: wp, wants_listing: wants, website: f.hp.value
      });
      var unit = type() === 'hotel' ? 'points' : 'miles';
      var listedLine = !res.listing_id ? 'No' : res.attach === 'existing_member' ? 'Yes (added to my account, paused)' : 'Yes';
      var text = 'Hello AirMilesHK! I would like a quote to sell my ' + programme + '.\n' +
        'Balance: ' + U.num(balance) + ' ' + unit + '\n' +
        (pm() === 'fixed' && (cpp || wp) ? 'My price: ' + (cpp ? U.cpp(cpp) + ' per ' + unit.replace(/s$/, '') : U.usd(wp) + ' for the whole account') + '\n' : '') +
        'Listed on the Marketplace: ' + listedLine + '\n' + (name ? 'Name: ' + name : '');
      var wa = 'https://wa.me/' + (CFG.WHATSAPP || '85294400450') + '?text=' + encodeURIComponent(text.trim());
      var head = !res.listing_id ? 'Request received' : res.attach === 'existing_member' ? 'Added to your account' : 'Your ad is live';
      var line = !res.listing_id ? 'Send us the WhatsApp message and we will reply with a quote.'
        : res.attach === 'new_member' ? 'We emailed you a login link so you can edit your ad and get bid alerts. Now send us the WhatsApp message for your quote.'
        : res.attach === 'existing_member' ? 'You already have a marketplace account, so we added the ad there, paused. Sign in to switch it on. Now send us the WhatsApp message for your quote.'
        : 'AirMilesHK lists it on your behalf and will contact you on WhatsApp about any bids. Now send us the WhatsApp message for your quote.';
      U.$('#qf').outerHTML = '<div class="form-card done-card"><div class="big">' + head + '</div><p>' + line + '</p>' +
        '<a class="btn" style="background:#25D366;color:#fff" href="' + wa + '" target="_blank" rel="noopener">Open WhatsApp →</a>' +
        (res.listing_id && res.listing_status === 'active' ? '<p class="mt"><a class="lnk" href="' + U.listingUrl(res.listing_id) + '">See your ad</a></p>' : '') + '</div>';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(function () { location.href = wa; }, 1500);
    } catch (x) { say(U.esc(x.message)); U.btnBusy(btn, false); }
  };
})();
