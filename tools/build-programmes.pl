#!/usr/bin/perl
# ════════════════════════════════════════════════════════════════════
#  Builds the public, Google-friendly programme pages (e.g. /emirates),
#  the "Browse by programme" links on the home page, assets/js/programmes.js
#  and sitemap.xml — all from the list below.
#
#  Run from the project folder:   perl tools/build-programmes.pl
#  Programme names must match the names in assets/js/config.js exactly.
# ════════════════════════════════════════════════════════════════════
use strict; use warnings; use utf8;
binmode STDOUT, ':utf8';

my $SITE = 'https://market.airmileshk.com';
my $MAIN = 'https://airmileshk.com';

# slug | programme name (as in config.js) | type | main-site page ('' if none) | one-line description
my @P = map { [ split /\s*\|\s*/, $_, 5 ] } grep { /\S/ } split /\n/, <<'LIST';
emirates        | Emirates Skywards             | airline | emirates-skywards-miles     | Emirates Skywards miles are most often used for Emirates Business and First Class flights through Dubai.
qatar           | Qatar Airways Avios           | airline | qatar-airways-avios         | Qatar Airways Avios are a favourite for Qsuite Business Class through Doha and for oneworld partner flights.
cathay          | Cathay Pacific Asia Miles     | airline | cathay-pacific-asia-miles   | Asia Miles is the home programme for many Hong Kong travellers, used on Cathay Pacific and oneworld partners.
united          | United MileagePlus            | airline | united-mileageplus          | United MileagePlus miles book United and Star Alliance partner flights, usually without fuel surcharges.
american        | American AAdvantage           | airline | american-airlines-aadvantage | AAdvantage miles book American Airlines and oneworld partners such as Cathay Pacific, Qatar Airways and JAL.
delta           | Delta SkyMiles                | airline | delta-skymiles              | Delta SkyMiles book Delta and SkyTeam partners such as Korean Air, Air France and KLM.
alaska          | Alaska Mileage Plan           | airline |                             | Alaska miles book Alaska Airlines and a wide range of oneworld and partner airlines.
british-airways | British Airways Avios         | airline | british-airways-avios       | British Airways Avios book British Airways and oneworld flights, and can be combined with other Avios programmes.
singapore       | Singapore KrisFlyer           | airline |                             | KrisFlyer miles book Singapore Airlines and Star Alliance partner flights.
aeroplan        | Air Canada Aeroplan           | airline | air-canada-aeroplan         | Aeroplan points book Air Canada and a wide range of Star Alliance partner airlines.
flying-blue     | Flying Blue (Air France/KLM)  | airline | air-france-klm-flying-blue  | Flying Blue miles book Air France, KLM and SkyTeam partner flights, including the monthly Promo Rewards.
lufthansa       | Lufthansa Miles & More        | airline | lufthansa-miles-more        | Miles & More miles book Lufthansa, SWISS, Austrian and other Star Alliance airlines.
turkish         | Turkish Miles&Smiles          | airline | turkish-miles-smiles        | Miles&Smiles miles book Turkish Airlines and Star Alliance partner flights.
ana             | ANA Mileage Club              | airline | ana-mileage-club            | ANA Mileage Club miles book ANA and Star Alliance partner flights.
jal             | JAL Mileage Bank              | airline | jal-mileage-bank            | JAL Mileage Bank miles book Japan Airlines and oneworld partner flights.
qantas          | Qantas Frequent Flyer         | airline | qantas-frequent-flyer       | Qantas Points book Qantas, Emirates and oneworld partner flights.
virgin-atlantic | Virgin Atlantic Flying Club   | airline | virgin-atlantic-flying-club | Flying Club points book Virgin Atlantic and partners such as Delta, Air France and KLM.
etihad          | Etihad Guest                  | airline |                             | Etihad Guest miles book Etihad Airways flights through Abu Dhabi and partner airlines.
finnair         | Finnair Plus                  | airline | finnair-plus-avios          | Finnair Plus Avios book Finnair and oneworld partner flights.
sas             | SAS EuroBonus                 | airline | sas-eurobonus               | EuroBonus points book SAS and partner airline flights.
thai            | Thai Royal Orchid Plus        | airline | thai-royal-orchid           | Royal Orchid Plus miles book Thai Airways and Star Alliance partner flights.
air-india       | Air India Maharaja Club       | airline | air-india-flying-returns    | Maharaja Club points book Air India and Star Alliance partner flights.
marriott        | Marriott Bonvoy               | hotel   | marriott-points-stays       | Marriott Bonvoy points book stays across Marriott's brands, from Courtyard to The Ritz-Carlton and St. Regis.
hilton          | Hilton Honors                 | hotel   | hilton-honors-status        | Hilton Honors points book stays at Hilton, Conrad, Waldorf Astoria and other Hilton brands.
ihg             | IHG One Rewards               | hotel   | ihg-rewards-status          | IHG One Rewards points book stays at InterContinental, Kimpton, Holiday Inn and other IHG hotels.
hyatt           | World of Hyatt                | hotel   | hyatt-globalist             | World of Hyatt points book stays at Park Hyatt, Andaz, Grand Hyatt and other Hyatt hotels.
accor           | Accor Live Limitless          | hotel   |                             | Accor Live Limitless points are used at Accor hotels such as Sofitel, Fairmont, Raffles and Novotel.
wyndham         | Wyndham Rewards               | hotel   |                             | Wyndham Rewards points book stays across Wyndham's hotel brands.
choice          | Choice Privileges             | hotel   |                             | Choice Privileges points book stays at Choice Hotels worldwide.
amex            | Amex Membership Rewards       | bank    | sell-amex-points            | Amex Membership Rewards points can be transferred to a long list of airline and hotel partners.
chase           | Chase Ultimate Rewards        | bank    | sell-chase-points           | Chase Ultimate Rewards points transfer to airline and hotel partners such as United and Hyatt.
citi            | Citi ThankYou Points          | bank    | sell-citi-points            | Citi ThankYou Points transfer to airline partners such as Singapore KrisFlyer and Turkish Miles&Smiles.
capital-one     | Capital One Miles             | bank    | sell-capital-one-miles      | Capital One Miles transfer to airline and hotel partners.
bilt            | Bilt Rewards                  | bank    | sell-bilt-points            | Bilt Rewards points transfer to airline and hotel partners.
LIST

my %TYPE = (airline => 'Airline miles', hotel => 'Hotel points', bank => 'Card points');
sub esc { my $s = shift; $s =~ s/&/&amp;/g; $s =~ s/</&lt;/g; $s =~ s/>/&gt;/g; $s =~ s/"/&quot;/g; return $s }
sub jstr { my $s = shift; $s =~ s/\\/\\\\/g; $s =~ s/"/\\"/g; return "\"$s\"" }
sub slurp { local $/; open my $f, '<:utf8', shift or die $!; my $s = <$f>; close $f; $s }
sub spit { my ($p, $s) = @_; open my $f, '>:utf8', $p or die "$p: $!"; print $f $s; close $f }

my $today = do { my @t = localtime; sprintf '%04d-%02d-%02d', $t[5] + 1900, $t[4] + 1, $t[3] };
my $HEAD_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,600;1,400&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">';

for my $p (@P) {
  my ($slug, $name, $type, $main, $blurb) = @$p;
  my $unit  = $type eq 'airline' ? 'miles' : 'points';
  my $one   = $type eq 'airline' ? 'mile' : 'point';
  my $book  = $type eq 'hotel' ? 'a hotel stay' : $type eq 'airline' ? 'an award ticket' : 'a booking';
  my $N = esc($name);
  my $title = "Buy & Sell $name " . ucfirst($unit) . " | AirMilesHK Marketplace";
  my $desc  = "Browse $name $unit listed by members on the AirMilesHK Marketplace. Buy part of a balance, request $book, or list your own $unit free. AirMilesHK holds payment until delivery.";
  my $mainLink = $main ? qq{<a class="lnk" href="$MAIN/$main">AirMilesHK's own $N page</a>} : qq{<a class="lnk" href="$MAIN/">AirMilesHK.com</a>};
  my @others = grep { $_->[2] eq $type && $_->[0] ne $slug } @P;
  my $otherLinks = join '', map { '<a class="chip" style="text-decoration:none" href="/' . $_->[0] . '">' . esc($_->[1]) . '</a>' } @others;
  my $ld = qq|{"\@context":"https://schema.org","\@type":"BreadcrumbList","itemListElement":[{"\@type":"ListItem","position":1,"name":"Marketplace","item":"$SITE/"},{"\@type":"ListItem","position":2,"name":| . jstr($name) . qq|,"item":"$SITE/$slug"}]}|;

  spit("$slug.html", <<"HTML");
<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- Generated by tools/build-programmes.pl — edit the list there, then re-run it. -->
<title>@{[esc($title)]}</title>
<meta name="description" content="@{[esc($desc)]}">
<link rel="canonical" href="$SITE/$slug">
$HEAD_FONTS
<link rel="stylesheet" href="/assets/market.css">
<link rel="icon" type="image/png" href="/assets/favicon.png"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website"><meta property="og:site_name" content="AirMilesHK Marketplace">
<meta property="og:title" content="@{[esc($title)]}"><meta property="og:description" content="@{[esc($desc)]}">
<meta property="og:url" content="$SITE/$slug"><meta property="og:image" content="https://airmileshk.com/assets/og-image.jpg">
<script type="application/ld+json">$ld</script>
</head><body data-programme="$N" data-unit="$unit">
<div id="hk-header"></div>
<main>
<section class="page-hero"><div class="W">
  <div class="ey"><a href="/" style="color:inherit;text-decoration:none">Marketplace</a> · $TYPE{$type}</div>
  <h1>$N <em>$unit</em></h1>
  <p class="hs">@{[esc($blurb)]} On the AirMilesHK Marketplace, members list the $N $unit they have, and buyers make offers or request $book. When a deal is agreed, AirMilesHK holds the payment until the seller delivers.</p>
  <div class="actions mt"><a href="#listings" class="btn">See $N listings →</a><a href="/sell.html" class="btn-ghost">List your $N $unit</a></div>
</div></section>

<section id="listings" class="sec"><div class="W">
  <div class="results-bar"><h2 style="margin:0">$N <em>listings</em></h2><span class="n" id="count"></span></div>
  <div id="results" class="grid cards"><div class="loading">Loading $N listings…</div></div>
  <noscript><div class="note">Turn on JavaScript to see live $N listings, or <a class="lnk" href="/">browse the marketplace</a>.</div></noscript>
</div></section>

<section class="sec" style="background:#fff;border-top:1px solid var(--border)"><div class="W">
  <div class="ey">How it works</div>
  <h2>Trading $N $unit, <em>safely</em></h2>
  <ol class="steps mt">
    <li><strong>Browse or list</strong>Anyone can browse $N listings. Joining is free and needed to make an offer or list your own $unit.</li>
    <li><strong>Make an offer</strong>Bid on part of a balance, the whole account where offered, or ask the seller to book $book for you.</li>
    <li><strong>Agree the terms</strong>The seller accepts, counters or declines. Counter as often as you need.</li>
    <li><strong>AirMilesHK in the middle</strong>The buyer pays AirMilesHK, the seller delivers, and we release the payment once both sides confirm.</li>
  </ol>
  <div class="note gold mt">Most loyalty programmes, including $N, do not allow selling or transferring $unit or accounts. Please read the <a class="lnk" href="/terms.html">marketplace rules</a> before you trade. Prefer a simple purchase? See $mainLink.</div>
  <h3 class="mt" style="margin-top:34px">Other @{[lc $TYPE{$type}]}</h3>
  <div class="chips mt">$otherLinks</div>
</div></section>
</main>
<div id="hk-footer"></div>
<script src="https://cdn.jsdelivr.net/npm/\@supabase/supabase-js\@2/dist/umd/supabase.js"></script>
<script src="/assets/js/config.js"></script><script src="/assets/js/programmes.js"></script><script src="/assets/js/api.js"></script><script src="/assets/js/app.js"></script>
<script src="/assets/js/page-programme.js"></script>
</body></html>
HTML
}

# programmes.js — name → page slug, used for links from listings.
spit('assets/js/programmes.js', "/* Generated by tools/build-programmes.pl */\nwindow.PROGRAMME_PAGES = {\n" .
  join(",\n", map { '  ' . jstr($_->[1]) . ': ' . jstr($_->[0]) } @P) . "\n};\n");

# Home page "Browse by programme" block (between the PROGRAMMES markers).
my $block = "<!--PROGRAMMES-->\n";
for my $t (['airline', 'Airline miles'], ['hotel', 'Hotel points'], ['bank', 'Card points']) {
  my @in = grep { $_->[2] eq $t->[0] } @P;
  $block .= qq{  <h3 class="mt">$t->[1]</h3>\n  <div class="chips mt">} .
    join('', map { '<a class="chip" style="text-decoration:none" href="/' . $_->[0] . '">' . esc($_->[1]) . '</a>' } @in) . "</div>\n";
}
$block .= "  <!--/PROGRAMMES-->";
my $index = slurp('index.html');
$index =~ s{<!--PROGRAMMES-->.*?<!--/PROGRAMMES-->}{$block}s or die "PROGRAMMES markers not found in index.html\n";
spit('index.html', $index);

# sitemap.xml — public pages only.
my @urls = ('/', (map { "/$_->[0]" } @P), '/terms.html');
spit('sitemap.xml', qq{<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n} .
  join('', map { "  <url><loc>$SITE$_</loc><lastmod>$today</lastmod></url>\n" } @urls) . "</urlset>\n");

printf "Built %d programme pages, programmes.js, index.html links and sitemap.xml (%d URLs).\n", scalar @P, scalar @urls;
