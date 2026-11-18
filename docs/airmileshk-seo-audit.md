# airmileshk.com — SEO & AI-search audit

*18 Nov 2026. Based on the live site: all 123 pages in the sitemap, robots.txt, llms.txt, redirects, speed and structured data.*

## Summary

The technical foundation is **strong**, better than most competitors: fast pages, clean URLs, HTTPS, unique titles,
one H1 per page, structured data on nearly every page, hreflang for Chinese, AI crawlers explicitly allowed, and an
unusually good `llms.txt`. The site also publishes original data (the Miles Price Index) and is candid about risks,
both of which AI assistants reward.

What holds it back is mostly **trust and entity signals** rather than technical problems. There's no named human
expert, the brand barely exists outside the site (only Trustpilot is linked), dates aren't visible, and the review
stars in the structured data break Google's rules. Fixing those is what turns "good" into "very strong", for Google
and especially for ChatGPT, Perplexity, Gemini and Google's AI Overviews.

---

## 🔴 High priority

### 1. Remove the Trustpilot review stars from the Product structured data (17 pages)
Pages such as `/emirates-skywards-miles` mark up `"aggregateRating": 4.9 / 110 reviews` on a Product. Those reviews
come from Trustpilot. Google's guidelines don't allow review markup built from reviews collected on another site, or
self-serving ratings, and this can lead to a manual penalty that removes all rich results.
**Fix:** delete the `aggregateRating` block from the Product schema on all 17 pages. Keep the visible Trustpilot
badge and link, which are fine and still help AI assistants.

### 2. Put a real, named expert behind the content (E-E-A-T)
All 41 articles list the author as "Organization: AirMilesHK". There's no visible byline and no person anywhere.
Google's quality guidelines, and AI assistants choosing which sources to quote, weigh *who* wrote something.
**Fix:**
- Create an author page (e.g. `/team/eran`) with a photo, role, years in the business, and what you personally do
  (pricing, award booking). Optionally add a LinkedIn link.
- Add a visible byline ("By Eran …, founder · Updated 18 Nov 2026") to every article and programme page.
- In the schema, change `author` to a `Person` with `url` pointing to the author page and `sameAs` to LinkedIn.
  Add `founder` to the Organization schema.

### 3. Build the brand "entity" outside the website
The Organization `sameAs` only lists Trustpilot and WhatsApp. AI systems decide whether a business is real and
notable by cross-checking it across the web.
**Fix:**
- Create or claim a **Google Business Profile** for the Houston Centre office.
- Set up a **LinkedIn company page**, and Facebook/Instagram if you use them.
- Add a **Crunchbase** profile, and a **Wikidata** item if notability allows.
- Add every profile to `sameAs`, and use exactly the same name, address and phone everywhere.
- **Brand consistency:** the schema uses "AirMilesHK", "AirMilesHK.com" and "SAL Limited" in different places, and
  Trustpilot is on the `airmiles.hk` domain. Pick one public name, with SAL Limited as `legalName`, and use it
  everywhere. Also fix the copy bug on `/about`: *"AirMilesHK.com and its parent company AirMilesHK.com"*.

### 4. Bing matters for ChatGPT and Copilot
ChatGPT search and Microsoft Copilot rely heavily on Bing's index, but `robots.txt` sets `Crawl-delay: 1` for Bingbot.
**Fix:**
- Remove the Bing crawl-delay lines.
- Verify the site in **Bing Webmaster Tools** and submit the sitemap.
- Turn on **IndexNow** (a Netlify plugin exists) so Bing learns about price and page updates within minutes.

### 5. Show honest, visible "last updated" dates
- 82 pages have no `dateModified`, and 29 of 41 articles have `dateModified` equal to `datePublished`.
- Programme pages show no visible "updated" date, even though prices change.
- In the sitemap, 43 pages show today's date as `lastmod`, which looks auto-stamped. Google ignores `lastmod` when it
  doesn't reflect real changes.

**Fix:** add a visible "Prices updated: 18 Nov 2026" line to programme pages and "Updated …" to articles. Keep
`dateModified` and sitemap `lastmod` in step with real edits. Fresh dates strongly influence AI answers about prices.

---

## 🟠 Medium priority

### 6. Shorten titles and descriptions
- **Titles:** 55 pages have titles over 60 characters (the longest is 95). Google cuts them off around 60, often
  losing the brand. Example: *"Book Singapore Airlines with Miles for Less (2026): Award Tickets at 1.65¢ a Mile |
  AirMilesHK"* could become *"Singapore Airlines Award Tickets from 1.65¢/Mile | AirMilesHK"*.
- **Descriptions:** 36 are over 160 characters, and 6 are under 70.

### 7. Redirect the `.html` duplicates
`/about` and `/about.html` (and `/index.html`) both load with a 200 status. The canonical tag limits the damage, but
Google still crawls both. **Fix:** add 301 redirects from every `*.html` address to the clean version, and
`/index.html` → `/`, in `_redirects`.

### 8. The Chinese section is a big missed opportunity
Hong Kong searches heavily in Traditional Chinese, but `/zh/` has only 6 pages of about 550–760 characters each.
The `/zh/` home page has no structured data and a 188-character description.
**Fix:**
- Translate fully, not summarise, the top 10 pages (Asia Miles 亞洲萬里通, Emirates, Qatar, BA Avios, KrisFlyer,
  hotel status, selling miles, award tickets).
- Add Product, FAQ and Breadcrumb schema to them.
- Add Chinese articles. Few competitors do this well in Chinese.

### 9. Price schema expires on 31 Dec 2026
`priceValidUntil: 2026-12-31` is hard-coded. In six weeks Google will flag every Product as expired.
**Fix:** move it to a rolling date, or generate it from `site.config.json` when prices are published.

### 10. Make the money pages "AI-quotable"
AI assistants lift short, self-contained facts. Add a compact **Key facts** box near the top of each programme page,
as plain HTML text:
- Price per mile and volume tiers
- Minimum order
- Delivery time
- How the miles are delivered
- Refund policy
- Last updated date

Add a comparison table where relevant (e.g. "Buying miles vs paying cash" for 3–4 routes). Keep the existing FAQs,
but vary them between pages, since many repeat across the 105 FAQ blocks.

### 11. Keep `llms.txt` in sync
It's excellent, but it's written by hand. It carries an old "updated 2026-08-05" route-price list, and its prices can
drift from `site.config.json`. **Fix:**
- Add a "Last updated" line.
- Regenerate the price section whenever prices change.
- Optionally publish `/llms-full.txt` with the key page text in Markdown.

---

## 🟢 Low priority / fine as is
- **Speed:** main content appears in about 0.6 s, with no layout shift and Brotli compression. Nothing to do.
- **Redirects:** `http://www` → `https://www` → apex takes two hops. A single hop is slightly better but not urgent.
- **Terms and Privacy:** short pages (~370–400 words), which is normal for legal pages.
- **FAQ rich results:** Google only shows FAQ rich results for government and health sites now. Keep the FAQ schema
  anyway, because AI assistants and Bing still use it.
- **Third-party tags** (Google Tag Manager, Ads) are present but aren't hurting speed.

## Marketplace and main site
`market.airmileshk.com` now has programme pages such as `/emirates`. To avoid competing with the main site's buying
pages, the marketplace pages should target peer-to-peer searches ("Emirates miles marketplace", "sell Emirates miles
to members", "award ticket booking service"), and the main site should link to the marketplace from its menu and
sell-miles pages.

## What this audit couldn't check
- **Backlinks** and domain authority.
- **Actual rankings** and Search Console data (impressions, queries, indexing errors).
- **AI citations:** how often ChatGPT, Perplexity or Gemini cite the site today.

Sharing Search Console access, or running a monthly set of test questions in each AI assistant, would fill these gaps.
