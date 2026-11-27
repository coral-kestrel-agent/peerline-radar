// Peerline Radar dashboard: a static page over window.RADAR (../data.js, written by main.ts).
// No fetch, no network, no framework. Views are chosen by the location hash so any view can be
// linked — and screenshotted — directly: #/ board, #/live peers, #/model, #/p/<slug> detail,
// and a filtered board as #/?cat=Lending&watch=1.
(function () {
  'use strict';
  var R = window.RADAR;
  var app = document.getElementById('app');
  var meta = document.getElementById('meta');
  var foot = document.getElementById('foot');
  if (!R) { app.innerHTML = '<p class="empty">No data: run the entry program first.</p>'; return; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n == null) return '<span class="flat">—</span>';
    var cls = n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function ageLabel(days) {
    if (days == null) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    return days + ' days';
  }
  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/';
    var q = {};
    var qi = h.indexOf('?');
    if (qi >= 0) {
      new URLSearchParams(h.slice(qi + 1)).forEach(function (v, k) { q[k] = v; });
      h = h.slice(0, qi);
    }
    return { path: h, q: q };
  }
  function setTab(view) {
    document.querySelectorAll('.tabs a').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-view') === view);
    });
  }

  meta.textContent = 'Snapshot ' + R.as_of + ' · ' + R.source + ' · watchlist floor ' + money(R.floor_usd) +
    ' · model ' + R.model_version + ' · peer median mcap/TVL ' + R.calibration.global_median_ratio +
    ' across ' + R.calibration.live_peers + ' live peers';
  foot.textContent = 'Implied value is this entry\u2019s own claim: what a token would be worth if the protocol\u2019s ' +
    'record stayed as it is and the market paid it the multiple it pays its live category peers. It is not a ' +
    'prediction that a token will be issued. A protocol here records no token in the snapshot; that is all the board claims.';

  // ---------- board ----------
  function boardView(q) {
    setTab('board');
    var cats = [], chains = [], seenC = {}, seenH = {};
    R.rows.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      if (!seenC[c]) { seenC[c] = 1; cats.push(c); }
      r.chains.forEach(function (ch) { if (!seenH[ch]) { seenH[ch] = 1; chains.push(ch); } });
    });
    cats.sort(); chains.sort();
    var sort = q.sort || 'implied';
    var rows = R.rows.filter(function (r) {
      if (q.q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q.q.toLowerCase()) < 0) return false;
      if (q.cat && (r.category || 'Uncategorized') !== q.cat) return false;
      if (q.chain && r.chains.indexOf(q.chain) < 0) return false;
      if (q.watch === '1' && !r.watchlist) return false;
      return true;
    });
    var by = {
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
      name: function (a, b) { return a.name < b.name ? -1 : 1; }
    };
    rows = rows.slice().sort(by[sort] || by.implied);

    var html = '<section class="stats">' +
      stat(R.board_size, 'protocols ranked') + stat(R.watchlist_size, 'watchlist covered') +
      stat(R.early_size, 'early finds below the floor') + stat(R.calibration.live_peers, 'live peers calibrate the model') +
      stat(money(rows.length ? rows[0].implied_value_usd : 0), 'top implied value') + '</section>';
    html += '<form class="controls" id="ctl">' +
      '<input type="search" name="q" placeholder="Search name or slug\u2026" value="' + esc(q.q || '') + '">' +
      '<select name="cat"><option value="">All categories</option>' + cats.map(function (c) {
        return '<option' + (q.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select name="chain"><option value="">All chains</option>' + chains.map(function (c) {
        return '<option' + (q.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<label class="check"><input type="checkbox" name="watch"' + (q.watch === '1' ? ' checked' : '') + '> Watchlist only</label>' +
      '<select name="sort">' + [['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7d growth'], ['age', 'Sort: age'], ['name', 'Sort: name']].map(function (o) {
        return '<option value="' + o[0] + '"' + (sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<span class="count">' + rows.length + ' shown</span></form>';
    if (!rows.length) { app.innerHTML = html + '<p class="empty">No protocol matches that filter.</p>'; wire(q); return; }
    html += '<table><thead><tr><th>#</th><th class="l">Protocol</th><th class="l hideS">Category</th>' +
      '<th class="l hideS">Chains</th><th>TVL</th><th>7d</th><th class="hideS">Age</th>' +
      '<th class="hideS">Peer \u00d7</th><th>Implied value</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td class="l"><strong>' + esc(r.name) + '</strong>' +
        (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '<span class="badge early">EARLY</span>') +
        '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td class="l hideS">' + esc(r.category || 'Uncategorized') + '</td>' +
        '<td class="l hideS chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num hideS">' + ageLabel(r.age_days) + '</td>' +
        '<td class="num hideS">' + r.model.peer_multiple.toFixed(3) + '</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td></tr>';
    });
    html += '</tbody></table>';
    app.innerHTML = html;
    wire(q);
    app.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + tr.getAttribute('data-slug'); });
    });
  }
  function stat(v, label) { return '<div class="stat"><b>' + v + '</b><span>' + label + '</span></div>'; }
  function wire(q) {
    var form = document.getElementById('ctl');
    if (!form) return;
    form.addEventListener('change', function () {
      var f = new FormData(form), p = new URLSearchParams();
      if (f.get('q')) p.set('q', f.get('q'));
      if (f.get('cat')) p.set('cat', f.get('cat'));
      if (f.get('chain')) p.set('chain', f.get('chain'));
      if (f.get('watch')) p.set('watch', '1');
      if (f.get('sort') && f.get('sort') !== 'implied') p.set('sort', f.get('sort'));
      var s = p.toString();
      history.replaceState(null, '', '#/' + (s ? '?' + s : ''));
      boardView(parseHash().q);
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });
  }

  // ---------- detail ----------
  function detailView(slug) {
    setTab('board');
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) { app.innerHTML = '<p class="empty">No board row for ' + esc(slug) + '.</p>'; return; }
    var m = r.model;
    // The thesis: where this row stands among its own category and the board, in the
    // snapshot's own figures — computed here from the same rows the board shows.
    var catName = r.category || 'Uncategorized';
    var catRows = R.rows.filter(function (x) { return (x.category || 'Uncategorized') === catName; });
    var tvlRank = 1 + catRows.filter(function (x) { return x.tvl_usd > r.tvl_usd; }).length;
    var nextDown = null;
    catRows.forEach(function (x) { if (x.tvl_usd < r.tvl_usd && (nextDown === null || x.tvl_usd > nextDown)) nextDown = x.tvl_usd; });
    var changes = R.rows.map(function (x) { return x.change_7d; }).filter(function (v) { return v != null; })
      .sort(function (a, b) { return a - b; });
    var medChange = changes.length ? changes[Math.floor(changes.length / 2)] : null;
    var thesis = 'Why it ranks here: ' + (tvlRank === 1
      ? 'the largest of ' + catRows.length + ' ' + esc(catName) + ' rows by TVL' +
        (nextDown ? ', ' + (r.tvl_usd / nextDown).toFixed(1) + '\u00d7 the next one down' : '')
      : 'number ' + tvlRank + ' of ' + catRows.length + ' ' + esc(catName) + ' rows by TVL') + '. ';
    if (r.change_7d != null && medChange != null) {
      thesis += 'Its seven-day change of ' + r.change_7d.toFixed(1) + '% is ' +
        (Math.abs(r.change_7d) <= Math.abs(medChange) ? 'milder' : 'steeper') +
        ' than the board median of ' + medChange.toFixed(1) + '%. ';
    }
    thesis += m.category_peers >= 5
      ? 'Its multiple is priced off ' + m.category_peers + ' live peers in its category.'
      : m.category_peers >= 1
        ? 'Its category has only ' + m.category_peers + ' live ' + (m.category_peers === 1 ? 'peer' : 'peers') +
          ' in the snapshot, so the strengthened prior holds its multiple near the market median of ' +
          R.calibration.global_median_ratio + ' instead of letting thin evidence set the price.'
        : 'Its category has no live peer in the snapshot, so it is priced at the market median of ' +
          R.calibration.global_median_ratio + '.';
    function multCard(title, value, note, frac) {
      return '<div class="card"><h3>' + title + '</h3><div class="big">\u00d7 ' + value.toFixed(3) + '</div>' +
        '<div class="bar"><i style="width:' + Math.max(3, Math.min(100, frac * 100)) + '%"></i></div>' +
        '<p class="note">' + note + '</p></div>';
    }
    var html = '<a class="back" href="#/">&larr; Back to the board</a><section class="detail">' +
      '<h2>' + esc(r.name) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '<span class="badge early">EARLY</span>') + '</h2>' +
      '<p class="note">' + esc(r.slug) + ' · rank #' + r.rank + ' of ' + R.board_size + ' · ' + esc(r.category || 'Uncategorized') +
      ' · on ' + esc(r.chains.join(', ') || 'no chain recorded') + ' · records no token in the snapshot</p>' +
      '<p class="thesis">' + thesis + '</p>' +
      '<div class="grid">' +
      '<div class="card"><h3>Implied value</h3><div class="big">' + money(r.implied_value_usd) + '</div>' +
      '<p class="note">TVL ' + money(r.tvl_usd) + ' \u00d7 the multipliers below</p></div>' +
      multCard('Peer multiple', m.peer_multiple, 'Median mcap/TVL of ' + m.category_peers + ' live ' + esc(r.category || 'Uncategorized') + (m.category_peers === 1 ? ' peer' : ' peers') + ', winsorised, shrunk toward the market median under a prior that strengthens as the peer set thins, and held inside the 0.02\u20133 band', m.peer_multiple / 3) +
      multCard('Momentum', m.momentum_multiplier, 'Seven-day TVL change of ' + (r.change_7d == null ? 'none recorded' : r.change_7d.toFixed(1) + '%') + ', damped and clamped', (m.momentum_multiplier - 0.8) / 0.6) +
      multCard('Seasoning', m.seasoning_multiplier, 'Running ' + ageLabel(r.age_days) + ' with no token (listed ' + esc(r.listed_at || 'date not recorded') + ')', (m.seasoning_multiplier - 0.85) / 0.3) +
      multCard('Breadth', m.breadth_multiplier, r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ' of distribution', (m.breadth_multiplier - 1) / 0.18) +
      '</div>' +
      '<h3>How to farm it</h3><ol class="steps">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="note">The plan is generated from this protocol\u2019s own record \u2014 category, chains, TVL, age and ' +
      'momentum. It never names a points programme the snapshot does not record: only the protocol\u2019s own page can confirm one.</p>' +
      '</section>';
    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  // ---------- live peers ----------
  function liveView() {
    setTab('live');
    var html = '<div class="prose"><h2>The calibration set</h2><p>These protocols already have a token, so the board ' +
      'never ranks them. They are the market\u2019s own answer to the radar\u2019s question, and the model learns its ' +
      'multiples from them: each category\u2019s implied multiple is the median market-cap-to-TVL ratio of its live ' +
      'peers, shrunk toward the global median of ' + R.calibration.global_median_ratio + '.</p></div>';
    html += '<table><thead><tr><th class="l">Protocol</th><th class="l hideS">Category</th><th>Market cap</th>' +
      '<th>TVL</th><th>mcap / TVL</th><th>7d</th></tr></thead><tbody>';
    R.live.forEach(function (p) {
      html += '<tr><td class="l"><strong>' + esc(p.name) + '</strong><br><span class="slug">' + esc(p.slug) + '</span></td>' +
        '<td class="l hideS">' + esc(p.category || 'Uncategorized') + '</td>' +
        '<td class="num">' + money(p.mcap_usd) + '</td><td class="num">' + money(p.tvl_usd) + '</td>' +
        '<td class="num">' + (p.ratio == null ? '—' : p.ratio.toFixed(3)) + '</td><td class="num">' + pct(p.change_7d) + '</td></tr>';
    });
    html += '</tbody></table>';
    app.innerHTML = html;
  }

  // ---------- model ----------
  function modelView() {
    setTab('model');
    var html = '<div class="prose"><h2>How Peerline prices a token that does not exist</h2>' +
      '<p>The board asks: if this protocol\u2019s record stayed exactly as the snapshot holds it, and the market paid ' +
      'its token the multiple it already pays comparable live protocols, what would that token be worth? Every ' +
      'ingredient comes from the snapshot\u2019s ten fields; the code names no protocol.</p>' +
      '<div class="formula">implied = TVL \u00d7 peer_multiple(category) \u00d7 momentum(7d change) \u00d7 seasoning(age) \u00d7 breadth(chains)\n' +
      'peer_multiple(c) = (n\u00b7median_c + (4 + 12/n)\u00b7median_all) / (n + 4 + 12/n), from the snapshot\u2019s live set</div>' +
      '<p><strong>Peer multiple.</strong> A lending market and a DEX do not trade at the same share of the value they ' +
      'custody, so there is no single constant: each category\u2019s multiple is the median mcap/TVL of its own live ' +
      'peers, shrunk toward the global median (' + R.calibration.global_median_ratio + '). The shrinkage prior is ' +
      'count-aware \u2014 weight 4 + 12/n against the category\u2019s own n peers \u2014 so the thinner the peer set, the ' +
      'harder the market median pulls: a category with one live peer is priced mostly off the market, because one ' +
      'peer is an anecdote, not a market. On this snapshot ' +
      R.calibration.categories.filter(function (c) { return c.peers < 3; }).length +
      ' categories have fewer than three live peers and are held toward the prior that way. Two guards keep the ' +
      'calibration honest: each peer\u2019s ratio is winsorised at ' +
      R.model.ratio_cap + ' before any median is taken, and the multiple used is held inside the ' +
      R.model.multiple_floor + '\u2013' + R.model.multiple_cap + ' band \u2014 a launch priced above three times the value a ' +
      'protocol custodies is a claim this board will not make.</p>' +
      '<p><strong>Momentum</strong> is damped: one week of TVL change moves value by at most +40% or \u221220%. ' +
      '<strong>Seasoning</strong> pays up to +15% for four years run without a token \u2014 time served is usage a launch ' +
      'would capitalise. <strong>Breadth</strong> pays 3% per extra chain, capped at six.</p>' +
      '<h2>Calibration on this snapshot</h2></div>' +
      '<table><thead><tr><th class="l">Category</th><th>Live peers</th><th>Median mcap/TVL</th><th>Multiple used</th></tr></thead><tbody>';
    R.calibration.categories.forEach(function (c) {
      html += '<tr><td class="l">' + esc(c.category) + '</td><td class="num">' + c.peers + '</td>' +
        '<td class="num">' + c.median_ratio.toFixed(3) + '</td><td class="num">' + c.multiple.toFixed(3) + '</td></tr>';
    });
    html += '</tbody></table>';
    app.innerHTML = html;
  }

  function route() {
    var h = parseHash();
    if (h.path === '/live') liveView();
    else if (h.path === '/model') modelView();
    else if (h.path.indexOf('/p/') === 0) detailView(decodeURIComponent(h.path.slice(3)));
    else boardView(h.q);
  }
  window.addEventListener('hashchange', route);
  route();
})();
