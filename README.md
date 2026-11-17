# AirMilesHK Marketplace (market.airmileshk.com)

A members' marketplace for airline miles and hotel points, styled to match airmileshk.com.
It's a plain website with no build step. Netlify publishes the files as they are, and Supabase
handles logins and the database.

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | Browse and filter listings, plus "How it works" |
| `listing.html` | One listing, with the offer / ticket-request form |
| `sell.html` | Create or edit a listing (with all the opt-in options) |
| `account.html` | My Deals: offers received, offers sent, my listings, my details |
| `deal.html` | One deal: accept / counter / decline / withdraw, and its full history |
| `login.html` | Sign in, join, forgot password |
| `admin.html` | Eran only: all members, listings and deals, with CSV download |
| `terms.html` | Marketplace rules (**draft**, finalise before launch) |
| `assets/js/config.js` | **The only file you edit** to connect Supabase |
| `assets/market.css` | Styles. Header, footer, buttons and cards are copied from airmileshk.com |
| `supabase/schema.sql` | Database and security rules. Paste into Supabase once |

## Try it right now (demo mode)

While `config.js` has no Supabase keys, the site runs in **demo mode**: sample listings, and
everything you do is saved only in your own browser. Use the demo buttons on the Sign in page
(Seller / Buyer / Admin) to try every role. A gold bar at the bottom shows when you are in demo mode.

---

## Going live: step by step

> Never paste passwords into Claude or into any file here. The Supabase **anon / publishable**
> key is designed to be public and is safe in `config.js`. The **service_role / secret** key must
> never go anywhere in this project.

### 1. GitHub
1. Create a free account at github.com.
2. In Claude Code, connect GitHub and push this folder to a new repository, e.g. `airmileshk-market`.

### 2. Supabase (database and logins)
1. Go to supabase.com and create a free account and a **New project** (region: Singapore is closest to HK).
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and click **Run**.
   You should see "Success. No rows returned".
3. **Authentication → URL Configuration**:
   - Site URL: `https://market.airmileshk.com`
   - Redirect URLs: add `https://market.airmileshk.com/**` (and your `*.netlify.app` address while testing)
4. **Authentication → Sign In / Providers → Email**: keep "Confirm email" **on**.
5. **Project Settings → API** (or the **Connect** button): copy the **Project URL** and the
   **anon / publishable key** into `assets/js/config.js`:
   ```js
   SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJ...or sb_publishable_...',
   ```
   Commit and push. Netlify redeploys automatically.
6. Optional but recommended: Supabase's built-in email sender is rate-limited and for testing only.
   Before launch, set up your own email sender under **Authentication → Emails → SMTP Settings**
   (for example Resend or Brevo, both have free tiers) so sign-up emails arrive reliably.

### 3. Netlify (hosting)
1. Netlify → **Add new site → Import an existing project → GitHub** → pick `airmileshk-market`.
2. Build command: leave empty. Publish directory: `.` (already set in `netlify.toml`).
3. Deploy. You get an address like `amazing-name-123.netlify.app`.
4. **Domain management → Add a domain** → `market.airmileshk.com`. Copy the netlify.app address it shows.

Your main airmileshk.com site stays exactly as it is on its own Netlify site.

### 4. GoDaddy DNS
DNS for airmileshk.com → **Add record**:
- Type `CNAME`, Name `market`, Value = your `xxxx.netlify.app` address, TTL default.

Wait 10–60 minutes. Netlify then issues the HTTPS certificate automatically.

### 5. Make yourself admin
1. Go to market.airmileshk.com and **Join** with your own email. Confirm the email.
2. In Supabase **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set is_admin = true where email = 'YOUR-EMAIL-HERE';
   ```
3. Sign out and back in. An **Admin** link appears in the menu.

### 6. Link the main site to the marketplace
This is the only change to airmileshk.com, and it's optional: one link in the menu. It has no SEO
impact. In the main site's header `<ul class="hk-nav-links">`, add:
```html
<li><a href="https://market.airmileshk.com/">Marketplace</a></li>
```
and in the mobile menu (`<div class="hk-mobile" …>`):
```html
<a href="https://market.airmileshk.com/">Marketplace</a>
```

---

## SEO (Google)

- **Programme pages:** every programme has a public page at a clean address, such as
  `market.airmileshk.com/emirates`, `/qatar`, `/marriott` or `/ihg`. Each has its own title, description and
  heading, and shows that programme's live listings without login. The home page links to all of them.
- **Listing pages:** public at `market.airmileshk.com/listing/<id>`. Making an offer needs an account.
- **sitemap.xml and robots.txt:** the sitemap lists the home page, all programme pages and the rules page.
  `robots.txt` points to it and keeps My Deals, admin, sign-in and the listing form out of Google
  (these pages are also marked `noindex`).
- **Adding or renaming a programme:** edit the list at the top of `tools/build-programmes.pl` (and
  `assets/js/config.js`), then run `perl tools/build-programmes.pl`. That rebuilds the pages, the
  home-page links and the sitemap.
- **Google Search Console:** add `market.airmileshk.com` as a new property. To verify with an HTML file,
  put Google's file (e.g. `google1234abcd.html`) in the top folder and upload it. Then submit
  `https://market.airmileshk.com/sitemap.xml`.
- Links from the main site (menu, sell-miles page, articles) are added in the main site's own build.

## How deals work (phase one)

1. Buyer sends an offer (part of the balance / the whole account) or a ticket/stay request.
2. Seller **accepts**, **counters** or **declines**. Either side can keep countering. The buyer can withdraw.
3. When a deal is **Agreed**, it shows at the top of Admin ("Agreed — need action"). You contact both
   sides on WhatsApp (their numbers are in Admin), take the buyer's payment, confirm delivery, pay the seller.
4. In the deal page (as admin), click **Mark completed** (or **Cancel deal**). You can add a note that both members see.

Members never see each other's email or WhatsApp, only nicknames. Listing notes that contain
phone numbers or emails are blocked, to keep deals going through AirMilesHK.

The deal rules (whose turn it is, minimum per deal, no offers on your own listing, one open offer per
listing per buyer) are enforced in the database itself, so they can't be bypassed from the browser.

## Not in phase one (by design)
- Online payments or escrow automation (handled manually by AirMilesHK)
- Fees and memberships
- Ratings and reviews
- Email notifications for new offers (members check My Deals; you check Admin). Adding these is a good next step.

## Decide before launch
`terms.html` is a draft that covers the open question in the brief: the programme rules risk,
ID matching, written agreements for whole-account sales, and steering members toward award bookings
(lowest risk) rather than account sales. Review it, ideally with a lawyer, and then remove the
"Draft" box at the top.
