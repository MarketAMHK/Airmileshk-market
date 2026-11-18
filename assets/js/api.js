/* ══════════════════════════════════════════════════════════════
   AirMilesHK Marketplace — data layer
   Uses Supabase when config.js has keys; otherwise a DEMO backend
   that stores everything in this browser's localStorage.
   Every page talks only to window.API, never to Supabase directly.
   ══════════════════════════════════════════════════════════════ */
(function () {
  var CFG = window.MARKET_CONFIG || {};
  var LISTING_FIELDS = ['programme', 'programme_type', 'balance', 'sell_whole', 'sell_partial', 'min_per_deal',
    'offers_booking', 'price_mode', 'price_cpp', 'whole_price_usd', 'elite_status', 'notes', 'status'];
  var PROFILE_FIELDS = ['full_name', 'display_name', 'whatsapp', 'country', 'role'];

  function pick(obj, keys) { var o = {}; keys.forEach(function (k) { if (k in obj) o[k] = obj[k]; }); return o; }
  function fail(msg) { throw new Error(msg); }

  /* ─────────────────────────── Supabase ─────────────────────────── */
  function supabaseBackend() {
    var sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    function chk(res) { if (res.error) throw new Error(res.error.message); return res.data; }
    async function uid() { var s = (await sb.auth.getSession()).data.session; return s ? s.user.id : null; }
    async function names(ids) {
      ids = ids.filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
      if (!ids.length) return {};
      var rows = chk(await sb.from('member_directory').select('id,display_name,created_at').in('id', ids));
      var m = {}; rows.forEach(function (r) { m[r.id] = r; }); return m;
    }
    function base() { return location.href.replace(/[^/]*([?#].*)?$/, ''); }

    return {
      demo: false,
      async session() { var s = (await sb.auth.getSession()).data.session; return s ? s.user : null; },
      onAuth(cb) { sb.auth.onAuthStateChange(function (ev, s) { cb(ev, s ? s.user : null); }); },
      async profile() {
        var id = await uid(); if (!id) return null;
        return chk(await sb.from('profiles').select('*').eq('id', id).maybeSingle());
      },
      async signUp(email, password, meta) {
        var d = chk(await sb.auth.signUp({ email: email, password: password,
          options: { data: meta, emailRedirectTo: base() + 'account.html' } }));
        return { needsConfirm: !d.session };
      },
      async signIn(email, password) { chk(await sb.auth.signInWithPassword({ email: email, password: password })); },
      async signOut() { await sb.auth.signOut(); },
      async resetPassword(email) { chk(await sb.auth.resetPasswordForEmail(email, { redirectTo: base() + 'login.html?mode=newpass' })); },
      async updatePassword(pw) { chk(await sb.auth.updateUser({ password: pw })); },
      async updateProfile(fields) {
        var id = await uid();
        chk(await sb.from('profiles').update(pick(fields, PROFILE_FIELDS)).eq('id', id));
      },

      async listListings() {
        var rows = chk(await sb.from('listings').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(1000));
        var n = await names(rows.map(function (r) { return r.seller_id; }));
        rows.forEach(function (r) { r.seller = n[r.seller_id] || null; });
        return rows;
      },
      async getListing(id) {
        var r = chk(await sb.from('listings').select('*').eq('id', id).maybeSingle());
        if (r) r.seller = (await names([r.seller_id]))[r.seller_id] || null;
        return r;
      },
      async myListings() {
        var id = await uid();
        return chk(await sb.from('listings').select('*').eq('seller_id', id).neq('status', 'removed').order('created_at', { ascending: false }));
      },
      async saveListing(data, id) {
        var row = pick(data, LISTING_FIELDS);
        if (id) return chk(await sb.from('listings').update(row).eq('id', id).select().single());
        return chk(await sb.from('listings').insert(row).select().single());
      },
      async setListingStatus(id, status) { chk(await sb.from('listings').update({ status: status }).eq('id', id)); },

      async createOffer(p) {
        return chk(await sb.rpc('create_offer', { p_listing: p.listing_id, p_kind: p.kind, p_quantity: p.quantity,
          p_price_cpp: p.price_cpp, p_total_usd: p.total_usd, p_message: p.message || '', p_booking_details: p.booking_details || '' }));
      },
      async respondOffer(p) {
        chk(await sb.rpc('respond_offer', { p_offer: p.offer_id, p_action: p.action, p_quantity: p.quantity,
          p_price_cpp: p.price_cpp, p_total_usd: p.total_usd, p_message: p.message || '' }));
      },
      async myOffers() {
        var id = await uid();
        var rows = chk(await sb.from('offers').select('*, listing:listings(id,programme,programme_type,balance,status)')
          .or('buyer_id.eq.' + id + ',seller_id.eq.' + id).order('updated_at', { ascending: false }));
        var n = await names(rows.reduce(function (a, r) { return a.concat([r.buyer_id, r.seller_id]); }, []));
        rows.forEach(function (r) { r.buyer = n[r.buyer_id]; r.seller = n[r.seller_id]; });
        return rows;
      },
      async getOffer(id) {
        var o = chk(await sb.from('offers').select('*, listing:listings(*)').eq('id', id).maybeSingle());
        if (!o) return null;
        o.events = chk(await sb.from('offer_events').select('*').eq('offer_id', id).order('id'));
        var n = await names([o.buyer_id, o.seller_id].concat(o.events.map(function (e) { return e.actor_id; })));
        o.names = n; o.buyer = n[o.buyer_id]; o.seller = n[o.seller_id];
        return o;
      },

      /* sell-quote form (public) */
      async quoteSignup(email, meta) {
        // Creates the member account (if new) and emails a login link.
        chk(await sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true, data: meta, emailRedirectTo: base() + 'account.html' } }));
      },
      async submitSellQuote(p) { return chk(await sb.rpc('submit_sell_quote', { p: p })); },

      /* notifications */
      async notifications() { return chk(await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(60)); },
      async unreadCount() {
        var r = await sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
        if (r.error) throw new Error(r.error.message); return r.count || 0;
      },
      async markRead(ids) { chk(await sb.rpc('mark_notifications_read', { p_ids: ids && ids.length ? ids : null })); },

      async adminData() {
        var res = await Promise.all([
          sb.from('profiles').select('*').order('created_at', { ascending: false }),
          sb.from('listings').select('*').order('created_at', { ascending: false }),
          sb.from('offers').select('*').order('updated_at', { ascending: false }),
          sb.from('quote_requests').select('*').order('created_at', { ascending: false }).limit(500),
          sb.from('offer_events').select('*').order('id', { ascending: false }).limit(300),
          sb.from('admin_wa_log').select('*')
        ]);
        return { profiles: chk(res[0]), listings: chk(res[1]), offers: chk(res[2]), quotes: chk(res[3]), events: chk(res[4]), waLog: chk(res[5]) };
      },
      async adminSetQuoteStatus(id, status) { chk(await sb.rpc('admin_set_quote_status', { p_quote: id, p_status: status })); },
      async adminCreateListing(p) { return chk(await sb.rpc('admin_create_listing', { p: p })); },
      async adminUpdateQuoteContact(id, name, phone) { chk(await sb.rpc('admin_update_quote_contact', { p_quote: id, p_name: name, p_phone: phone })); },
      async adminSetQuoteEmail(id, email) { chk(await sb.rpc('admin_set_quote_email', { p_quote: id, p_email: email })); },
      async adminConvertHouseListing(id) { chk(await sb.rpc('admin_convert_house_listing', { p_quote: id })); },
      async adminMarkWa(eventId, recipient) {
        var r = await sb.from('admin_wa_log').insert({ event_id: eventId, recipient: recipient });
        if (r.error && !/duplicate/i.test(r.error.message)) throw new Error(r.error.message);
      },
      async adminUpdateOffer(id, status, message) { chk(await sb.rpc('admin_update_offer', { p_offer: id, p_status: status, p_message: message || '' })); },
      async adminSetSuspended(userId, value) { chk(await sb.rpc('admin_set_suspended', { p_user: userId, p_value: value })); },
      async adminSetListingStatus(id, status) { chk(await sb.from('listings').update({ status: status }).eq('id', id)); }
    };
  }

  /* ─────────────────────────── Demo ─────────────────────────── */
  function demoBackend() {
    var KEY = 'amhk_market_demo_v1', SKEY = 'amhk_market_demo_session';
    var listeners = [];
    function now() { return new Date().toISOString(); }
    function uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
    function ago(days) { return new Date(Date.now() - days * 864e5).toISOString(); }
    function seed() {
      var P = function (id, email, dn, admin, days) { return { id: id, email: email, full_name: dn, display_name: dn, whatsapp: '', country: 'Hong Kong', role: 'both', is_admin: !!admin, is_suspended: false, terms_accepted_at: ago(days), created_at: ago(days) }; };
      var L = function (id, seller, prog, type, bal, o) { return Object.assign({ id: id, seller_id: seller, programme: prog, programme_type: type, balance: bal, sell_whole: false, sell_partial: true, min_per_deal: null, offers_booking: false, price_mode: 'offers', price_cpp: null, whole_price_usd: null, elite_status: '', notes: '', status: 'active', created_at: ago(o.d || 1), updated_at: ago(o.d || 1) }, o); };
      var db = {
        profiles: [P('u-admin', 'admin@demo.test', 'AirMilesHK Admin', true, 30), P('u-seller', 'seller@demo.test', 'SkyTrader', false, 20), P('u-buyer', 'buyer@demo.test', 'Wanderer', false, 10), P('u-s2', 'mei@demo.test', 'MeiPoints', false, 15)],
        listings: [
          L('l1', 'u-seller', 'United MileagePlus', 'airline', 420000, { sell_partial: true, min_per_deal: 50000, offers_booking: true, price_mode: 'fixed', price_cpp: 1.25, notes: 'Can book Star Alliance business class awards. Fast turnaround.', d: 2 }),
          L('l2', 'u-s2', 'Marriott Bonvoy', 'hotel', 850000, { sell_whole: true, sell_partial: true, min_per_deal: 100000, offers_booking: true, price_mode: 'offers', elite_status: 'Titanium Elite', notes: 'Happy to book stays for you, any Marriott brand.', d: 1 }),
          L('l3', 'u-seller', 'Cathay Pacific Asia Miles', 'airline', 180000, { sell_partial: false, offers_booking: true, price_mode: 'offers', notes: 'Award tickets only — I issue in your name.', d: 4 }),
          L('l4', 'u-s2', 'IHG One Rewards', 'hotel', 1200000, { sell_whole: false, sell_partial: true, min_per_deal: 200000, price_mode: 'fixed', price_cpp: 0.42, d: 6 }),
          L('l5', 'u-seller', 'Emirates Skywards', 'airline', 95000, { sell_whole: true, sell_partial: false, price_mode: 'fixed', whole_price_usd: 1300, d: 8 })
        ],
        offers: [], events: []
      };
      db.offers.push({ id: 'o1', listing_id: 'l1', buyer_id: 'u-buyer', seller_id: 'u-seller', kind: 'purchase', quantity: 100000, price_cpp: 1.1, total_usd: 1100, booking_details: '', status: 'open', awaiting: 'u-seller', created_at: ago(1), updated_at: ago(1) });
      db.events.push({ id: 1, offer_id: 'o1', actor_id: 'u-buyer', action: 'offer', quantity: 100000, price_cpp: 1.1, total_usd: 1100, message: 'Hi — would you do 1.1¢ for 100k?', created_at: ago(1) });
      return db;
    }
    function load() {
      var d = null; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
      if (!d || !d.profiles) { d = seed(); save(d); }
      ['notifications', 'quotes', 'waLog'].forEach(function (k) { if (!d[k]) d[k] = []; });
      return d;
    }
    function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }
    function me(db) { var id = localStorage.getItem(SKEY); return id ? db.profiles.find(function (p) { return p.id === id; }) || null : null; }
    function need(db) { var u = me(db); if (!u) fail('Please sign in first.'); return u; }
    function active(u) { if (u.is_suspended) fail('Your account cannot do this right now.'); }
    function nameMap(db) { var m = {}; db.profiles.forEach(function (p) { m[p.id] = { id: p.id, display_name: p.display_name, created_at: p.created_at }; }); return m; }
    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    function emit(ev) { var db = load(), u = me(db); listeners.forEach(function (cb) { cb(ev, u ? { id: u.id, email: u.email } : null); }); }
    function validateListing(r) {
      if (!r.programme || r.programme.length < 2) fail('Choose a programme.');
      if (!(r.balance > 0)) fail('Enter your balance.');
      if (!(r.sell_whole || r.sell_partial || r.offers_booking)) fail('Choose at least one way to sell.');
      if (r.price_mode === 'fixed' && !r.price_cpp && !r.whole_price_usd) fail('Enter an asking price, or choose "Open to offers".');
    }
    function total(q, cpp, t) { var v = t != null ? +t : (q != null && cpp != null ? Math.round(q * cpp) / 100 : null); if (!(v > 0)) fail('Enter a price.'); return v; }
    function event(db, o, actor, action, extra) {
      var e = Object.assign({ id: db.events.length + 1, offer_id: o.id, actor_id: actor, action: action, quantity: null, price_cpp: null, total_usd: null, message: '', created_at: now() }, extra || {});
      db.events.push(e); notifyDemo(db, o, e);
    }
    // Mirrors notify_on_offer_event() in supabase/002_addons.sql.
    function notifyDemo(db, o, e) {
      var l = db.listings.find(function (x) { return x.id === o.listing_id; }) || {}, prog = l.programme || 'your listing';
      var amt = 'US$' + Number(e.total_usd || o.total_usd || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
      var what = o.kind === 'booking' ? 'booking request (budget ' + amt + ')' : 'offer of ' + amt;
      var other = e.actor_id === o.buyer_id ? o.seller_id : o.buyer_id, link = '/deal.html?id=' + o.id;
      var admins = db.profiles.filter(function (p) { return p.is_admin; }).map(function (p) { return p.id; });
      function add(uid, kind, title, body) { if (uid) db.notifications.push({ id: db.notifications.length + 1, user_id: uid, kind: kind, title: title, body: body || '', link: link, offer_id: o.id, read_at: null, created_at: now() }); }
      if (e.action === 'offer') { add(o.seller_id, 'new_offer', 'New ' + what + ' on your ' + prog + ' listing', e.message); admins.filter(function (a) { return a !== o.seller_id; }).forEach(function (a) { add(a, 'admin_new_offer', 'New ' + what + ' on ' + prog, e.message); }); }
      else if (e.action === 'counter') add(other, 'counter', 'Counter-offer of ' + amt + ' on ' + prog, e.message);
      else if (e.action === 'accept') { add(other, 'accepted', 'Deal agreed: ' + prog + ' for ' + amt, 'AirMilesHK will contact you on WhatsApp to arrange payment and delivery.'); admins.filter(function (a) { return a !== o.buyer_id && a !== o.seller_id; }).forEach(function (a) { add(a, 'admin_deal_agreed', 'Deal agreed: ' + prog + ' for ' + amt, 'Arrange payment and delivery.'); }); }
      else if (e.action === 'decline') add(other, 'declined', 'Offer declined on ' + prog, e.message);
      else if (e.action === 'withdraw') add(o.seller_id, 'withdrawn', 'Offer withdrawn on ' + prog, e.message);
      else if (['complete', 'cancel', 'reopen'].indexOf(e.action) >= 0) [o.buyer_id, o.seller_id].forEach(function (u) { add(u, 'deal_' + e.action, ({ complete: 'Deal completed: ', cancel: 'Deal cancelled: ', reopen: 'Deal back to agreed: ' })[e.action] + prog, e.message); });
    }

    return {
      demo: true,
      async session() { var u = me(load()); return u ? { id: u.id, email: u.email } : null; },
      onAuth(cb) { listeners.push(cb); },
      async profile() { var u = me(load()); return u ? clone(u) : null; },
      async signUp(email, password, meta) {
        var db = load(); email = String(email).trim().toLowerCase();
        if (db.profiles.some(function (p) { return p.email === email; })) fail('That email is already registered — sign in instead.');
        if (String(password).length < 8) fail('Password must be at least 8 characters.');
        var p = { id: uuid(), email: email, full_name: meta.full_name || '', display_name: meta.display_name || 'Member', whatsapp: meta.whatsapp || '', country: meta.country || '', role: meta.role || 'both', is_admin: false, is_suspended: false, terms_accepted_at: meta.terms_accepted ? now() : null, created_at: now() };
        db.profiles.push(p); save(db); localStorage.setItem(SKEY, p.id); emit('SIGNED_IN');
        return { needsConfirm: false };
      },
      async signIn(email) {
        var db = load(); email = String(email).trim().toLowerCase();
        var p = db.profiles.find(function (x) { return x.email === email; });
        if (!p) fail('No account with that email. (Demo mode: try seller@demo.test, buyer@demo.test or admin@demo.test.)');
        localStorage.setItem(SKEY, p.id); emit('SIGNED_IN');
      },
      async signOut() { localStorage.removeItem(SKEY); emit('SIGNED_OUT'); },
      async resetPassword() {},
      async updatePassword() {},
      async updateProfile(fields) { var db = load(), u = need(db); Object.assign(u, pick(fields, PROFILE_FIELDS)); save(db); },

      async listListings() {
        var db = load(), n = nameMap(db);
        return clone(db.listings.filter(function (l) { return l.status === 'active'; })
          .sort(function (a, b) { return b.created_at < a.created_at ? -1 : 1; })
          .map(function (l) { return Object.assign({}, l, { seller: n[l.seller_id] }); }));
      },
      async getListing(id) {
        var db = load(), u = me(db), l = db.listings.find(function (x) { return x.id === id; });
        if (!l) return null;
        var mine = u && (u.id === l.seller_id || u.is_admin || db.offers.some(function (o) { return o.listing_id === id && o.buyer_id === u.id; }));
        if (l.status !== 'active' && !mine) return null;
        return clone(Object.assign({}, l, { seller: nameMap(db)[l.seller_id] }));
      },
      async myListings() {
        var db = load(), u = need(db);
        return clone(db.listings.filter(function (l) { return l.seller_id === u.id && l.status !== 'removed'; }).reverse());
      },
      async saveListing(data, id) {
        var db = load(), u = need(db); active(u);
        var row = pick(data, LISTING_FIELDS); validateListing(Object.assign({}, id ? db.listings.find(function (x) { return x.id === id; }) : {}, row));
        if (id) {
          var l = db.listings.find(function (x) { return x.id === id; });
          if (!l || l.seller_id !== u.id) fail('Listing not found.');
          Object.assign(l, row, { updated_at: now() }); save(db); return clone(l);
        }
        var nl = Object.assign({ id: uuid(), seller_id: u.id, status: 'active', created_at: now(), updated_at: now(), elite_status: '', notes: '' }, row);
        db.listings.push(nl); save(db); return clone(nl);
      },
      async setListingStatus(id, status) {
        var db = load(), u = need(db), l = db.listings.find(function (x) { return x.id === id; });
        if (!l || (l.seller_id !== u.id && !u.is_admin)) fail('Listing not found.');
        l.status = status; l.updated_at = now(); save(db);
      },

      async createOffer(p) {
        var db = load(), u = need(db); active(u);
        var l = db.listings.find(function (x) { return x.id === p.listing_id; });
        if (!l || l.status !== 'active') fail('This listing is no longer available.');
        if (l.seller_id === u.id) fail('You cannot make an offer on your own listing.');
        if (db.offers.some(function (o) { return o.listing_id === l.id && o.buyer_id === u.id && o.status === 'open'; })) fail('You already have an open offer on this listing — open it from My Deals.');
        var q = p.quantity;
        if (p.kind === 'purchase') {
          if (!l.sell_partial) fail('This seller is not selling partial amounts.');
          if (!(q > 0)) fail('Enter how many miles/points you want.');
          if (q > l.balance) fail('That is more than the seller has.');
          if (l.min_per_deal && q < l.min_per_deal) fail('The minimum for this listing is ' + l.min_per_deal.toLocaleString() + ' per deal.');
        } else if (p.kind === 'whole_account') { if (!l.sell_whole) fail('This seller is not selling the whole account.'); q = l.balance; }
        else if (p.kind === 'booking') { if (!l.offers_booking) fail('This seller does not issue tickets or book stays.'); if (!String(p.booking_details || '').trim()) fail('Describe the ticket or stay you need.'); }
        else fail('Unknown offer type.');
        var t = total(q, p.price_cpp, p.total_usd);
        var o = { id: uuid(), listing_id: l.id, buyer_id: u.id, seller_id: l.seller_id, kind: p.kind, quantity: q || null, price_cpp: p.price_cpp, total_usd: t, booking_details: p.booking_details || '', status: 'open', awaiting: l.seller_id, created_at: now(), updated_at: now() };
        db.offers.push(o); event(db, o, u.id, 'offer', { quantity: o.quantity, price_cpp: o.price_cpp, total_usd: t, message: p.message || '' });
        save(db); return o.id;
      },
      async respondOffer(p) {
        var db = load(), u = need(db), o = db.offers.find(function (x) { return x.id === p.offer_id; });
        if (!o || (u.id !== o.buyer_id && u.id !== o.seller_id)) fail('Deal not found.');
        if (o.status !== 'open') fail('This deal is already ' + o.status + '.');
        var other = u.id === o.buyer_id ? o.seller_id : o.buyer_id, extra = { message: p.message || '' };
        if (p.action === 'withdraw') { if (u.id !== o.buyer_id) fail('Only the buyer can withdraw an offer.'); o.status = 'withdrawn'; o.awaiting = null; }
        else if (['accept', 'decline', 'counter'].indexOf(p.action) >= 0) {
          if (o.awaiting !== u.id) fail('Waiting for the other side to respond.');
          if (p.action === 'accept') { o.status = 'accepted'; o.awaiting = null; }
          else if (p.action === 'decline') { o.status = 'declined'; o.awaiting = null; }
          else {
            var l = db.listings.find(function (x) { return x.id === o.listing_id; });
            var q = o.kind === 'whole_account' ? o.quantity : p.quantity;
            if (o.kind === 'purchase') { if (!(q > 0)) fail('Enter a quantity.'); if (q > l.balance) fail('That is more than the listed balance.'); }
            var t = total(q, p.price_cpp, p.total_usd);
            o.quantity = q || o.quantity; o.price_cpp = p.price_cpp; o.total_usd = t; o.awaiting = other;
            extra.quantity = o.quantity; extra.price_cpp = p.price_cpp; extra.total_usd = t;
          }
        } else fail('Unknown action.');
        o.updated_at = now(); event(db, o, u.id, p.action, extra); save(db);
      },
      async myOffers() {
        var db = load(), u = need(db), n = nameMap(db);
        return clone(db.offers.filter(function (o) { return o.buyer_id === u.id || o.seller_id === u.id; })
          .sort(function (a, b) { return b.updated_at < a.updated_at ? -1 : 1; })
          .map(function (o) { var l = db.listings.find(function (x) { return x.id === o.listing_id; }); return Object.assign({}, o, { listing: l, buyer: n[o.buyer_id], seller: n[o.seller_id] }); }));
      },
      async getOffer(id) {
        var db = load(), u = need(db), o = db.offers.find(function (x) { return x.id === id; });
        if (!o || (u.id !== o.buyer_id && u.id !== o.seller_id && !u.is_admin)) return null;
        var n = nameMap(db);
        return clone(Object.assign({}, o, { listing: db.listings.find(function (x) { return x.id === o.listing_id; }), events: db.events.filter(function (e) { return e.offer_id === id; }), names: n, buyer: n[o.buyer_id], seller: n[o.seller_id] }));
      },

      /* sell-quote form (mirrors submit_sell_quote in supabase/002_addons.sql) */
      async quoteSignup(email, meta) {
        var db = load(); email = String(email).trim().toLowerCase();
        if (!db.profiles.some(function (p) { return p.email === email; })) {
          db.profiles.push({ id: uuid(), email: email, full_name: meta.full_name || '', display_name: meta.display_name || 'Member', whatsapp: meta.whatsapp || '', country: '', role: 'seller', is_admin: false, is_suspended: false, terms_accepted_at: now(), created_at: now() });
          save(db);
        }
      },
      async submitSellQuote(p) {
        var db = load(), digits = String(p.phone || '').replace(/\D/g, ''), email = String(p.email || '').trim().toLowerCase();
        var src = p.source === 'mainsite' ? 'mainsite' : 'form';
        if (p.website) fail('Something went wrong. Please try again.');
        if (digits.length < 7) { if (src === 'form') fail('Enter your phone number with country code.'); p.phone = ''; }
        if (!p.programme) fail('Choose your programme.');
        p.balance = Number(String(p.balance || '').replace(/\D/g, '')) || 0;
        if (!(p.balance > 0)) fail('Enter your balance.');
        var wants = !!p.wants_listing;
        if (!p.sell_whole && !p.sell_partial && !p.offers_booking) p.sell_partial = true;
        if (p.price_mode === 'fixed' && !p.price_cpp && !p.whole_price_usd) p.price_mode = 'offers';
        var q = Object.assign({}, p, { id: uuid(), created_at: now(), source: src, email: email, listing_id: null, member_id: null, attach: 'none', status: 'new' }); delete q.website;
        db.quotes.push(q);
        var res = { quote_id: q.id, listing_id: null, attach: 'none', listing_status: null };
        {
          // Mirrors submit_sell_quote (005): ticked + account = member listing; otherwise a house listing.
          var m = wants && email && db.profiles.find(function (x) { return x.email === email; }), seller, status = 'active', attach;
          if (m) { seller = m.id; attach = (Date.now() - new Date(m.created_at)) < 15 * 6e4 ? 'new_member' : 'existing_member'; if (attach === 'existing_member') status = 'paused'; }
          else { attach = 'managed'; seller = (db.profiles.find(function (x) { return x.is_admin; }) || {}).id; if (!seller) fail('The marketplace is not ready yet.'); }
          var l = { id: uuid(), seller_id: seller, programme: p.programme, programme_type: p.programme_type || 'other', balance: p.balance, sell_whole: !!p.sell_whole, sell_partial: !!p.sell_partial, min_per_deal: p.sell_partial ? p.min_per_deal || null : null, offers_booking: !!p.offers_booking, price_mode: p.price_mode || 'offers', price_cpp: p.price_mode === 'fixed' ? p.price_cpp : null, whole_price_usd: p.price_mode === 'fixed' ? p.whole_price_usd : null, elite_status: '', notes: '', status: status, managed: attach === 'managed', quote_id: q.id, created_at: now(), updated_at: now() };
          if (!m) Object.assign(l, { sell_whole: false, sell_partial: true, min_per_deal: null, offers_booking: false, price_mode: 'offers', price_cpp: null, whole_price_usd: null });
          db.listings.push(l); q.listing_id = l.id; q.member_id = m ? m.id : null; q.attach = attach;
          res = { quote_id: q.id, listing_id: l.id, attach: attach, listing_status: status, listing_type: m ? 'member' : 'house', ref: 'Q-' + q.id.replace(/-/g, '').slice(0, 6).toUpperCase() };
        }
        save(db); return res;
      },

      /* notifications */
      async notifications() { var db = load(), u = need(db); return clone(db.notifications.filter(function (n) { return n.user_id === u.id; }).reverse().slice(0, 60)); },
      async unreadCount() { var db = load(), u = me(db); return u ? db.notifications.filter(function (n) { return n.user_id === u.id && !n.read_at; }).length : 0; },
      async markRead(ids) { var db = load(), u = need(db); db.notifications.forEach(function (n) { if (n.user_id === u.id && !n.read_at && (!ids || !ids.length || ids.indexOf(n.id) >= 0)) n.read_at = now(); }); save(db); },

      async adminData() {
        var db = load(), u = need(db); if (!u.is_admin) fail('Admins only.');
        return clone({ profiles: db.profiles.slice().reverse(), listings: db.listings.slice().reverse(), offers: db.offers.slice().sort(function (a, b) { return b.updated_at < a.updated_at ? -1 : 1; }),
          quotes: db.quotes.slice().reverse(), events: db.events.slice().reverse(), waLog: db.waLog });
      },
      async adminSetQuoteEmail(id, email) {
        var db = load(), u = need(db); if (!u.is_admin) fail('Admins only.');
        email = String(email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('That email address looks wrong.');
        var q = db.quotes.find(function (x) { return x.id === id; }); if (q) { q.email = email; save(db); }
      },
      async adminConvertHouseListing(id) {
        var db = load(), u = need(db); if (!u.is_admin) fail('Admins only.');
        var q = db.quotes.find(function (x) { return x.id === id; }); if (!q || !q.listing_id) fail('This request has no listing.');
        var l = db.listings.find(function (x) { return x.id === q.listing_id; }); if (!l || !l.managed) fail('This is already a member listing.');
        var m = q.member_id ? db.profiles.find(function (x) { return x.id === q.member_id; }) : q.email && db.profiles.find(function (x) { return x.email === q.email; });
        if (!m) fail('The customer has no marketplace account yet. Add their email first.');
        l.seller_id = m.id; l.managed = false; q.member_id = m.id; q.attach = 'converted'; q.wants_listing = true; save(db);
      },
      async adminUpdateQuoteContact(id, name, phone) {
        var db = load(), u = need(db); if (!u.is_admin) fail('Admins only.');
        if (phone && String(phone).replace(/\D/g, '').length < 7) fail('That phone number looks too short.');
        var q = db.quotes.find(function (x) { return x.id === id; }); if (q) { if (name) q.name = name; if (phone) q.phone = phone; save(db); }
      },
      async adminCreateListing(p) {
        var db = load(), u = need(db); if (!u.is_admin) fail('Admins only.');
        validateListing(p);
        var q = { id: uuid(), created_at: now(), source: 'admin', name: p.seller_name || '', phone: p.seller_phone || '', email: '', programme: p.programme, programme_type: p.programme_type || 'other', balance: p.balance,
          sell_whole: !!p.sell_whole, sell_partial: !!p.sell_partial, min_per_deal: p.sell_partial ? p.min_per_deal || null : null, offers_booking: !!p.offers_booking, price_mode: p.price_mode || 'offers',
          price_cpp: p.price_mode === 'fixed' ? p.price_cpp : null, whole_price_usd: p.price_mode === 'fixed' ? p.whole_price_usd : null, wants_listing: true, attach: 'managed', status: 'contacted', listing_id: null };
        var l = { id: uuid(), seller_id: u.id, programme: q.programme, programme_type: q.programme_type, balance: q.balance, sell_whole: q.sell_whole, sell_partial: q.sell_partial, min_per_deal: q.min_per_deal,
          offers_booking: q.offers_booking, price_mode: q.price_mode, price_cpp: q.price_cpp, whole_price_usd: q.whole_price_usd, elite_status: p.elite_status || '', notes: p.notes || '', status: 'active', managed: true, quote_id: q.id, created_at: now(), updated_at: now() };
        q.listing_id = l.id; db.quotes.push(q); db.listings.push(l); save(db); return l.id;
      },
      async adminSetQuoteStatus(id, status) { var db = load(), u = need(db); if (!u.is_admin) fail('Admins only.'); var q = db.quotes.find(function (x) { return x.id === id; }); if (q) { q.status = status; save(db); } },
      async adminMarkWa(eventId, recipient) { var db = load(), u = need(db); if (!u.is_admin) fail('Admins only.'); if (!db.waLog.some(function (w) { return w.event_id === eventId && w.recipient === recipient; })) { db.waLog.push({ event_id: eventId, recipient: recipient, sent_at: now() }); save(db); } },
      async adminUpdateOffer(id, status, message) {
        var db = load(), u = need(db); if (!u.is_admin) fail('Admins only.');
        var o = db.offers.find(function (x) { return x.id === id; }); if (!o) fail('Deal not found.');
        o.status = status; o.awaiting = null; o.updated_at = now();
        event(db, o, u.id, status === 'completed' ? 'complete' : status === 'cancelled' ? 'cancel' : 'reopen', { message: message || '' }); save(db);
      },
      async adminSetSuspended(userId, value) {
        var db = load(), u = need(db); if (!u.is_admin) fail('Admins only.'); if (userId === u.id) fail('You cannot suspend yourself.');
        var p = db.profiles.find(function (x) { return x.id === userId; }); if (p) { p.is_suspended = value; save(db); }
      },
      async adminSetListingStatus(id, status) { return this.setListingStatus(id, status); },
      resetDemo() { localStorage.removeItem(KEY); localStorage.removeItem(SKEY); }
    };
  }

  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
    if (window.supabase) { window.API = supabaseBackend(); }
    else {
      // Never fall back to demo on the live site — that would look like real data.
      var down = function () { return Promise.reject(new Error('Could not connect to the marketplace. Check your internet connection and reload.')); };
      window.API = new Proxy({ demo: false, onAuth: function () {}, session: function () { return Promise.resolve(null); } },
        { get: function (t, k) { return k in t ? t[k] : down; } });
    }
  } else {
    window.API = demoBackend();
  }
})();
