(async function () {
  var next = U.param('next') || 'account.html';
  if (!/^(listing\/[\w\-]+|[\w\-]+(\.html)?)(\?[\w=&%\-.]*)?$/.test(next)) next = 'account.html';   // only allow local pages
  next = '/' + next;
  var msg = U.$('#msg');
  function say(text, kind) { msg.innerHTML = text ? '<div class="note ' + (kind || 'red') + ' mb">' + text + '</div>' : ''; }
  function mode(m) {
    U.$$('form[data-mode]').forEach(function (f) { f.classList.toggle('hide', f.dataset.mode !== m); });
    U.$$('#auth-tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.mode === m ? 'true' : 'false'); });
    U.$('#auth-tabs').classList.toggle('hide', m === 'reset' || m === 'newpass');
    say('');
  }

  var initial = U.param('mode') || 'signin';
  // Arriving from the password-reset email: Supabase signs the user in with a recovery session.
  if (/type=recovery/.test(location.hash)) initial = 'newpass';
  API.onAuth(function (ev) { if (ev === 'PASSWORD_RECOVERY') mode('newpass'); });

  var ctx = await App.start({ page: 'login' });
  if (ctx.user && (initial === 'signin' || initial === 'signup')) { location.replace(next); return; }
  if (ctx.user && initial === 'reset') U.$('#rs-email').value = ctx.user.email || '';
  mode(initial);

  U.$$('#auth-tabs button').forEach(function (b) { b.onclick = function () { mode(b.dataset.mode); }; });
  U.$$('[data-go]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); mode(a.dataset.go); }; });

  if (API.demo) {
    U.$('#demo-users').classList.remove('hide');
    U.$$('[data-demo]').forEach(function (b) {
      b.onclick = async function () { await API.signIn(b.dataset.demo, 'demo'); location.href = next; };
    });
  }

  function friendly(e) {
    var m = e.message || String(e);
    if (/invalid login/i.test(m)) return 'Email or password is not right.';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox for the link we sent.';
    if (/already registered/i.test(m)) return 'That email is already registered. Sign in instead.';
    return U.esc(m);
  }

  U.$('#f-signin').onsubmit = async function (e) {
    e.preventDefault(); var btn = this.querySelector('[type=submit]'); U.btnBusy(btn, true);
    try { await API.signIn(U.$('#si-email').value.trim(), U.$('#si-pw').value); location.href = next; }
    catch (err) { say(friendly(err)); U.btnBusy(btn, false); }
  };

  U.$('#f-signup').onsubmit = async function (e) {
    e.preventDefault(); var btn = this.querySelector('[type=submit]');
    if (!U.$('#su-terms').checked) { say('Please accept the marketplace rules.'); return; }
    U.btnBusy(btn, true, 'Creating account…');
    try {
      var r = await API.signUp(U.$('#su-email').value.trim(), U.$('#su-pw').value, {
        full_name: U.$('#su-name').value.trim(), display_name: U.$('#su-dn').value.trim(),
        whatsapp: U.$('#su-wa').value.trim(), country: U.$('#su-country').value.trim(),
        role: U.$('#su-role').value, terms_accepted: true
      });
      if (r.needsConfirm) {
        this.reset(); U.btnBusy(btn, false);
        say('<strong>Almost done.</strong> We sent a confirmation link to your email. Click it, then sign in.', 'green');
      } else location.href = next;
    } catch (err) { say(friendly(err)); U.btnBusy(btn, false); }
  };

  U.$('#f-reset').onsubmit = async function (e) {
    e.preventDefault(); var btn = this.querySelector('[type=submit]'); U.btnBusy(btn, true);
    try { await API.resetPassword(U.$('#rs-email').value.trim()); say('If that email has an account, a reset link is on its way.', 'green'); }
    catch (err) { say(friendly(err)); }
    U.btnBusy(btn, false);
  };

  U.$('#f-newpass').onsubmit = async function (e) {
    e.preventDefault(); var btn = this.querySelector('[type=submit]'); U.btnBusy(btn, true);
    try { await API.updatePassword(U.$('#np-pw').value); U.toast('Password updated'); location.href = 'account.html'; }
    catch (err) { say(friendly(err)); U.btnBusy(btn, false); }
  };
})();
