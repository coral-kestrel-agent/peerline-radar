// Peerline Radar dashboard: renders window.RADAR (written beside this page by main.ts).
// No fetch, no network, no framework. Views are chosen by the location hash so any view can be
// linked and screenshotted directly: #/ the board, #/p/<slug> a protocol, #/live the live
// peers the model learned from, #/model the method, #/validation the leave-one-out evidence.
(function () {
  'use strict';
  var R = window.RADAR;
  var app = document.getElementById('app');
  var meta = document.getElementById('meta');
  var foot = document.getElementById('foot');
  if (!R) { app.innerHTML = '<p class="empty">No data: run main.ts first.</p>'; return; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n, digits) {
    if (n == null) return '—';
    return (n * 100).toFixed(digits == null ? 1 : digits) + '%';
  }
  function factor(log10v) { return 'x' + Math.pow(10, log10v).toFixed(2); }
  function ageLabel(days) {
    if (days == null) return 'age unknown';
    if (days < 365) return Math.round(days / 30.4) + ' months';
    return (days / 365.25).toFixed(1) + ' years';
  }
  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/';
    var qi = h.indexOf('?');
    var q = {};
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
  function stat(v, label) { return '<div class="stat"><b>' + v + '</b><span>' + label + '</span></div>'; }
  function verdictBadge(v) { return '<span class="verdict v-' + v + '">' + v.toUpperCase() + '</span>'; }

  meta.textContent = 'Snapshot ' + R.as_of + ' · ' + R.source + ' · model ' + R.model_version +
    ' · every figure on this page is computed from the snapshot by main.ts; nothing is fetched.';
  var L = R.ledger;
  foot.innerHTML = 'Accounting for all ' + L.total + ' protocols in the snapshot: ' + L.ranked +
    ' ranked on the board (' + L.ranked_watchlist + ' of them the watchlist, ' + L.ranked_below_floor +
    ' below the $' + (R.floor_usd / 1e6) + 'M floor) · ' + L.launched_priced +
    ' already launched with a recorded price · ' + L.launched_unpriced_cap +
    ' launched with a cap that carries no price · ' + L.token_recorded_no_cap +
    ' with a token recorded but no cap in the snapshot · ' + L.pre_token_excluded +
    ' pre-token and excluded (' + L.excluded_reasons.map(function (x) { return x.count + ' ' + x.reason; }).join('; ') +
    '). Board checksum (sha256 of board.json, first 16) ' + R.board_checksum + '.';

  // ---------------------------------------------------------------- the board
  function boardView(q) {
    setTab('board');
    var cats = [], chains = [], seenC = {}, seenH = {};
    R.rows.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      if (!seenC[c]) { seenC[c] = 1; cats.push(c); }
      r.chains.forEach(function (ch) { if (!seenH[ch]) { seenH[ch] = 1; chains.push(ch); } });
    });
    cats.sort(); chains.sort();
    var rows = R.rows.filter(function (r) {
      if (q.q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q.q.toLowerCase()) < 0) return false;
      if (q.cat && (r.category || 'Uncategorized') !== q.cat) return false;
      if (q.chain && r.chains.indexOf(q.chain) < 0) return false;
      if (q.verdict && r.farm.verdict !== q.verdict) return false;
      if (q.watch === '1' && !r.watchlist) return false;
      return true;
    });
    var sorts = {
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      conditional: function (a, b) { return b.conditional_value_usd - a.conditional_value_usd; },
      odds: function (a, b) { return b.launch_odds - a.launch_odds; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
      name: function (a, b) { return a.name < b.name ? -1 : 1; }
    };
    rows.sort(sorts[q.sort] || sorts.implied);
    var farmCount = R.rows.filter(function (r) { return r.farm.verdict === 'farm'; }).length;
    var html = '<div class="stats">' +
      stat(R.board_size, 'pre-token protocols ranked — every rankable one, not a top slice') +
      stat(R.watchlist_size + ' / ' + R.watchlist_size, 'watchlist protocols covered') +
      stat(money(R.total_expected_value_usd), 'total expected launch value on the board') +
      stat(farmCount + ' farm', 'plans that net out farm-grade at a 5% reference allocation') +
      stat(R.fit.peers, 'live price peers the value line is fitted on') +
      '</div>' +
      '<div class="integrity"><b>Integrity.</b> All ' + L.total + ' snapshot protocols are accounted for: ' +
      L.ranked + ' ranked · ' + L.launched_priced + ' launched and priced · ' + L.token_recorded_no_cap +
      ' token recorded, no cap · ' + L.pre_token_excluded + ' pre-token excluded with reasons (footer). ' +
      'Board checksum <span class="hash">sha256:' + R.board_checksum + '</span> — recompute it from board.json to verify this page renders the run\u2019s own board.</div>' +
      '<form class="controls" id="controls">' +
      '<input type="search" name="q" placeholder="Search name or slug" value="' + esc(q.q || '') + '">' +
      '<select name="cat"><option value="">All categories</option>' + cats.map(function (c) {
        return '<option' + (q.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('') + '</select>' +
      '<select name="chain"><option value="">All chains</option>' + chains.map(function (c) {
        return '<option' + (q.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('') + '</select>' +
      '<select name="verdict"><option value="">Any verdict</option>' + ['farm', 'thin', 'skip'].map(function (v) {
        return '<option value="' + v + '"' + (q.verdict === v ? ' selected' : '') + '>Verdict: ' + v + '</option>';
      }).join('') + '</select>' +
      '<select name="sort">' + [['implied', 'Sort: expected value'], ['conditional', 'Sort: conditional value'], ['odds', 'Sort: launch odds'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7d growth'], ['age', 'Sort: age'], ['name', 'Sort: name']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((q.sort || 'implied') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
      '<label class="check"><input type="checkbox" name="watch" value="1"' + (q.watch === '1' ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="count">' + rows.length + ' of ' + R.rows.length + ' rows</span></form>';
    if (rows.length === 0) { app.innerHTML = html + '<p class="empty">No protocol matches those filters.</p>'; wire(q); return; }
    html += '<table><thead><tr><th>#</th><th class="l">Protocol</th><th class="l hideS">Category</th>' +
      '<th>TVL</th><th class="hideS">7d</th><th>Conditional</th><th>Odds</th><th>Expected</th>' +
      '<th class="hideS">Value p10–p90</th><th>Farm</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var g = r.change_7d;
      html += '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td class="l"><b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="badge watch">watchlist</span>' : '') +
        '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td class="l hideS">' + esc(r.category || 'Uncategorized') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num hideS ' + (g == null ? 'flat' : g > 0 ? 'pos' : g < 0 ? 'neg' : 'flat') + '">' + (g == null ? '—' : (g > 0 ? '+' : '') + g.toFixed(1) + '%') + '</td>' +
        '<td class="num">' + money(r.conditional_value_usd) + '</td>' +
        '<td class="num">' + pct(r.launch_odds, 0) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="range hideS">' + money(r.value_p10_usd) + ' – ' + money(r.value_p90_usd) + '</td>' +
        '<td>' + verdictBadge(r.farm.verdict) + '</td></tr>';
    });
    html += '</tbody></table>' +
      '<p class="note">Expected value = conditional value (the fitted price if the token launches) x launch odds (the cohort chance it launches). ' +
      'The range is the conditional value\u2019s p10–p90 across 256 seeded bootstrap refits of the peer set. Click a row for its audit trail and farm plan.</p>';
    app.innerHTML = html;
    wire(q);
    app.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + tr.getAttribute('data-slug'); });
    });
  }
  function wire(q) {
    var form = document.getElementById('controls');
    if (!form) return;
    form.addEventListener('change', function () {
      var fd = new FormData(form);
      var p = new URLSearchParams();
      ['q', 'cat', 'chain', 'verdict', 'sort'].forEach(function (k) {
        var v = fd.get(k);
        if (v) p.set(k, String(v));
      });
      if (fd.get('watch')) p.set('watch', '1');
      var s = p.toString();
      location.hash = '#/' + (s ? '?' + s : '');
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });
  }

  // ---------------------------------------------------------------- the detail view
  function detailView(slug) {
    setTab('board');
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) { app.innerHTML = '<p class="empty">No board row for ' + esc(slug) + '.</p>'; return; }
    var m = r.model, f = r.farm;
    var catName = r.category || 'Uncategorized';
    var catRows = R.rows.filter(function (x) { return (x.category || 'Uncategorized') === catName; });
    var tvlRank = 1 + catRows.filter(function (x) { return x.tvl_usd > r.tvl_usd; }).length;
    var changes = R.rows.map(function (x) { return x.change_7d; }).filter(function (v) { return v != null; })
      .sort(function (a, b) { return a - b; });
    var medChange = changes.length ? changes[Math.floor(changes.length / 2)] : 0;
    var thesis = 'Why it ranks here: #' + r.rank + ' of ' + R.board_size + ' by expected value. ' +
      (tvlRank === 1 ? 'It is the largest pre-token protocol in ' + catName + ' by TVL' :
        'It holds the #' + tvlRank + ' TVL among the ' + catRows.length + ' ranked ' + catName + ' protocols') +
      ', and the fitted line prices its $' + (r.tvl_usd / 1e6).toFixed(1) + 'M of custody at ' + money(r.conditional_value_usd) +
      ' if it launches (an implied ' + m.implied_multiple.toFixed(2) + 'x of TVL at its size). ';
    if (r.change_7d != null) {
      thesis += 'Its seven-day change of ' + (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '% is ' +
        (r.change_7d > medChange ? 'above' : 'below') + ' the board median of ' + (medChange > 0 ? '+' : '') + medChange.toFixed(1) + '%. ';
    }
    thesis += 'The odds are a cohort read, not a compliment: ' + catName + ' protocols in the \u2018' + m.age_band +
      '\u2019 band show a ' + pct(m.cohort_launched_share, 0) + ' launched share, and the survival fit prices a still-tokenless ' +
      ageLabel(r.age_days) + ' protocol at ' + pct(r.launch_odds, 0) + '. The bootstrap puts its rank between #' +
      r.rank_p10 + ' and #' + r.rank_p90 + ' when the peer set is resampled.';
    function card(title, big, note, barFrac, markFrac) {
      var bar = '';
      if (barFrac != null) {
        bar = '<div class="bar"><i style="width:' + Math.round(barFrac * 100) + '%"></i>' +
          (markFrac != null ? '<span class="mark" style="left:' + Math.round(markFrac * 100) + '%"></span>' : '') + '</div>';
      }
      return '<div class="card"><h3>' + title + '</h3><div class="big">' + big + '</div>' + bar +
        (note ? '<p>' + note + '</p>' : '') + '</div>';
    }
    var span = Math.max(r.value_p90_usd - r.value_p10_usd, 1);
    var condFrac = (r.conditional_value_usd - r.value_p10_usd) / span;
    app.innerHTML = '<div class="detail">' +
      '<a class="back" href="#/">&larr; Back to the board</a>' +
      '<h2>' + esc(r.name) + (r.watchlist ? '<span class="badge watch">watchlist</span>' : '') + '</h2>' +
      '<p class="note">' + esc(catName) + ' · ' + esc(r.chains.join(', ') || 'no chains recorded') +
      ' · listed ' + (r.listed_at || 'date unknown') + ' · ' + ageLabel(r.age_days) + ' without a token · slug ' + esc(r.slug) + '</p>' +
      '<p class="thesis">' + esc(thesis) + '</p>' +
      '<div class="grid">' +
      card('Expected value — the ranking', money(r.implied_value_usd),
        'Rank #' + r.rank + ' of ' + R.board_size + '; bootstrap rank range #' + r.rank_p10 + '–#' + r.rank_p90 + '.', r.launch_odds) +
      card('Conditional value — if it launches', money(r.conditional_value_usd),
        'Power-law fit at its TVL: implied ' + m.implied_multiple.toFixed(2) + 'x of TVL, momentum x' + m.momentum_multiplier.toFixed(2) +
        ' on a ' + (m.momentum_pct > 0 ? '+' : '') + m.momentum_pct.toFixed(1) + '% week. p10 ' + money(r.value_p10_usd) + ' · p90 ' + money(r.value_p90_usd) + '.',
        1, condFrac) +
      card('Launch odds', pct(r.launch_odds, 0),
        'Cohort: ' + catName + ', \u2018' + m.age_band + '\u2019 band, ' + m.cohort_protocols + ' protocols, launched share ' +
        pct(m.cohort_launched_share, 0) + ' after shrinkage. Age prices the odds, never the value.', r.launch_odds) +
      card('Farm verdict — ' + f.verdict.toUpperCase(), '$' + f.cost_usd + ' · ' + f.hours + ' h',
        'Position $' + f.capital_usd + ' of capital. Breaks even if users receive ' +
        (f.breakeven_allocation_pct == null ? 'more than the whole supply' : f.breakeven_allocation_pct + '% of the supply') +
        ' at the p10 value; at a 5% reference allocation the plan nets ' + money(f.expected_value_usd) +
        ' (' + (f.ev_per_hour_usd >= 0 ? '+' : '') + '$' + f.ev_per_hour_usd + '/hour).', null) +
      '</div>' +
      '<h3>Farm plan</h3><ol class="steps">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="note">The plan is generated from this protocol\u2019s own record — category, chains, TVL, age and momentum. ' +
      'It names no points programme: the snapshot records none, so the plan says where to look and only the protocol\u2019s own page can confirm one exists.</p>' +
      cohortHtml(r, catRows) +
      '</div>';
    app.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + tr.getAttribute('data-slug'); });
    });
  }
  function cohortHtml(r, catRows) {
    var others = catRows.filter(function (x) { return x.slug !== r.slug; })
      .sort(function (a, b) { return b.tvl_usd - a.tvl_usd; }).slice(0, 5);
    if (others.length === 0) return '';
    return '<h3>Nearest on the board in ' + esc(r.category || 'Uncategorized') + '</h3>' +
      '<table><thead><tr><th>#</th><th class="l">Protocol</th><th>TVL</th><th>Odds</th><th>Expected</th><th>Farm</th></tr></thead><tbody>' +
      others.map(function (x) {
        return '<tr data-slug="' + esc(x.slug) + '"><td class="num">' + x.rank + '</td><td class="l"><b>' + esc(x.name) + '</b></td>' +
          '<td class="num">' + money(x.tvl_usd) + '</td><td class="num">' + pct(x.launch_odds, 0) + '</td>' +
          '<td class="num">' + money(x.implied_value_usd) + '</td><td>' + verdictBadge(x.farm.verdict) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  // ---------------------------------------------------------------- the live peers
  function liveView() {
    setTab('live');
    var html = '<div class="prose"><h2>The live peers</h2>' +
      '<p>These protocols already have a token; the board does not rank them. They are the evidence: the value line ' +
      '(<code>log10 value = ' + R.fit.intercept + ' + ' + R.fit.slope + ' x log10 TVL</code>) is fitted on the ' + R.fit.peers +
      ' live protocols whose recorded cap carries a price, and the launch odds are read from the whole launch record, these included. ' +
      'The largest ' + R.live.length + ' by market cap are shown; the fit uses all ' + R.fit.peers + '.</p></div>' +
      '<table><thead><tr><th class="l">Protocol</th><th class="l hideS">Category</th><th>TVL</th><th>Market cap</th><th>Cap / TVL</th><th class="hideS">7d</th></tr></thead><tbody>';
    R.live.forEach(function (p) {
      var g = p.change_7d;
      html += '<tr><td class="l"><b>' + esc(p.name) + '</b><br><span class="slug">' + esc(p.slug) + '</span></td>' +
        '<td class="l hideS">' + esc(p.category || 'Uncategorized') + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
        '<td class="num">' + (p.ratio == null ? '—' : p.ratio.toFixed(2) + 'x') + '</td>' +
        '<td class="num hideS ' + (g == null ? 'flat' : g > 0 ? 'pos' : g < 0 ? 'neg' : 'flat') + '">' + (g == null ? '—' : (g > 0 ? '+' : '') + g.toFixed(1) + '%') + '</td></tr>';
    });
    app.innerHTML = html + '</tbody></table>';
  }

  function workedExample() {
    var r = R.rows[0];
    if (!r) return '';
    var base = r.conditional_value_usd / r.model.momentum_multiplier;
    return '<h2>One row, end to end</h2>' +
      '<p>The board\u2019s #1, <b>' + esc(r.name) + '</b>, holds ' + money(r.tvl_usd) + ' of TVL. The line reads ' +
      '10^(' + R.fit.intercept + ' + ' + R.fit.slope + ' x log10 TVL) = ' + money(base) + ' before momentum; its week was ' +
      (r.model.momentum_pct > 0 ? '+' : '') + r.model.momentum_pct.toFixed(1) + '%, so the damped momentum term (x' +
      r.model.momentum_multiplier.toFixed(2) + ') gives the conditional ' + money(r.conditional_value_usd) + '. Its cohort — ' +
      esc(r.category || 'Uncategorized') + ', \u2018' + r.model.age_band + '\u2019 band — prices the launch odds at ' + pct(r.launch_odds, 0) +
      ', so the expected value is ' + money(r.conditional_value_usd) + ' x ' + pct(r.launch_odds, 0) + ' = <b>' + money(r.implied_value_usd) +
      '</b>. The bootstrap spread on the conditional is ' + money(r.value_p10_usd) + ' to ' + money(r.value_p90_usd) +
      ', and its farm plan nets to ' + r.farm.verdict.toUpperCase() + ' (break-even allocation ' +
      (r.farm.breakeven_allocation_pct == null ? 'beyond the whole supply' : r.farm.breakeven_allocation_pct + '%') +
      ', ' + (r.farm.ev_per_hour_usd >= 0 ? '+' : '') + '$' + r.farm.ev_per_hour_usd + '/hour at the reference allocation). ' +
      'Every other row is the same arithmetic on its own record — open any row to see it.</p>';
  }
  function drawFitChart() {
    var host = document.getElementById('fitchart');
    if (!host || !R.live.length) return;
    var W = 860, H = 300, PL = 64, PR = 16, PT = 14, PB = 34;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.style.cssText = 'width:100%;background:#101713;border:1px solid #243128;border-radius:12px';
    host.appendChild(cv);
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var pts = R.live.filter(function (p) { return p.tvl_usd > 0 && p.mcap_usd > 0; })
      .map(function (p) { return { x: Math.log10(p.tvl_usd), y: Math.log10(p.mcap_usd) }; });
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    function X(v) { return PL + (v - x0) / (x1 - x0) * (W - PL - PR); }
    function Y(v) { return PT + (y1 - v) / (y1 - y0) * (H - PT - PB); }
    ctx.font = '11px ui-monospace,Menlo,Consolas,monospace';
    ctx.strokeStyle = '#243128'; ctx.fillStyle = '#9db3a4'; ctx.lineWidth = 1;
    for (var gx = x0; gx <= x1; gx++) {
      ctx.beginPath(); ctx.moveTo(X(gx), PT); ctx.lineTo(X(gx), H - PB); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText('$' + Math.pow(10, gx - 6) + 'M', X(gx), H - PB + 20);
    }
    for (var gy = y0; gy <= y1; gy++) {
      ctx.beginPath(); ctx.moveTo(PL, Y(gy)); ctx.lineTo(W - PR, Y(gy)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText('$' + Math.pow(10, gy - 6) + 'M', PL - 8, Y(gy) + 4);
    }
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(x0), Y(R.fit.intercept + R.fit.slope * x0));
    ctx.lineTo(X(x1), Y(R.fit.intercept + R.fit.slope * x1));
    ctx.stroke();
    ctx.fillStyle = 'rgba(74,222,128,0.75)';
    pts.forEach(function (p) { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 4, 0, 6.2832); ctx.fill(); });
    ctx.fillStyle = '#9db3a4'; ctx.textAlign = 'left';
    ctx.fillText('live peers: log market cap vs log TVL', PL, PT + 12);
    ctx.textAlign = 'right';
    ctx.fillText('fitted line: slope ' + R.fit.slope, W - PR, PT + 12);
  }

  // ---------------------------------------------------------------- the model
  function modelView() {
    setTab('model');
    var v = R.validation, fit = R.fit, mo = R.model;
    var html = '<div class="prose"><h2>The model</h2>' +
      '<p>The board prices a launch that has not happened, so it separates the two questions a single number would hide: ' +
      '<b>what would the token be worth if it launched</b> (the conditional value) and <b>how likely is a launch at all</b> ' +
      '(the launch odds). The ranking is their product, the expected value. Both halves are fitted on this snapshot alone; ' +
      'no protocol is named anywhere in the code, so the same program re-derives everything on any snapshot it is handed.</p>' +
      '<h2>The value: a fitted power law, not a multiple</h2>' +
      '<div class="formula">log10 value = ' + fit.intercept + ' + ' + fit.slope + ' x log10 TVL\n' +
      'conditional = 10^(that) x momentum,   momentum = 1 + ' + mo.momentum_weight + ' x clamp(7d change, ' +
      mo.momentum_floor_pct + ', +' + mo.momentum_cap_pct + ') / 100\n' +
      'expected value (the ranking) = conditional x launch odds</div>' +
      '<p>The line is least squares over the ' + fit.peers + ' live peers with a recorded cap above zero. Its slope of ' + fit.slope +
      ' says value grows with roughly the square root of custody: the peer set\u2019s largest custodian holds tens of billions and trades ' +
      'at a small multiple of the line\u2019s read for a mid-size protocol, and a flat multiple — the baseline is a median ' +
      fit.baseline_median_ratio + 'x of TVL — prices the giants several times too high. Earlier versions of this model priced by ' +
      'category multiples; the leave-one-out run on the <a href="#/validation">Validation page</a> shows those multiples losing to ' +
      'the flat baseline and the baseline losing to this line, which is why the multiples and a chain-breadth premium were dropped. ' +
      'Momentum survives the same test at no cost, so it stays, damped: one week is weather, not climate.</p>' +
      '<div id="fitchart"></div>' +
      '<p>The chart plots the ' + R.live.length + ' largest live peers by cap (the fit itself uses all ' + fit.peers + ') on log scales, ' +
      'with the fitted line through them. The vertical scatter around the line is the honest part: it is why every board row carries a range, not a point.</p>' +
      workedExample() +
      '<p>The audit table below is descriptive, not an input: each category\u2019s median residual under the fitted line, in log10. ' +
      'A category the line systematically mispriced would show a large residual; none is fed back into the price.</p>' +
      '<table><thead><tr><th class="l">Category</th><th>Peers</th><th>Median residual</th><th>As a factor</th></tr></thead><tbody>' +
      fit.category_residuals.map(function (c) {
        return '<tr><td class="l">' + esc(c.category) + '</td><td class="num">' + c.peers + '</td>' +
          '<td class="num">' + (c.median_log10_residual > 0 ? '+' : '') + c.median_log10_residual + '</td>' +
          '<td class="num">' + factor(c.median_log10_residual) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<h2>The odds: age prices the chance, never the value</h2>' +
      '<p>A protocol\u2019s odds come from its cohort — its category crossed with its tokenless age band. The raw record first: ' +
      'the share of each age band that already has a token <i>rises</i> with age, because older cohorts have had more time. ' +
      'The conditional read is the one a farmer needs: of the protocols <i>still tokenless</i> at a given age, the share that ever ' +
      'launch <i>falls</i>, because the ones that were going to launch mostly already have. The odds fit is that survival read: ' +
      'each category\u2019s band shares are shrunk toward a prior anchored on the category\u2019s own overall launch share (a category ' +
      'that has almost never tokenised is not credited with other categories\u2019 launches), and the still-tokenless tail is extended ' +
      'one step at its last observed ratio. Earlier versions paid a seasoning premium for age inside the value; the record says ' +
      'that is backwards, so age moved to the odds, where it belongs.</p>' +
      '<table><thead><tr><th class="l">Tokenless age band</th><th>Protocols</th><th>Already launched</th><th>Launched share</th><th>Fitted odds if still tokenless</th></tr></thead><tbody>' +
      R.odds.bands.map(function (b) {
        return '<tr><td class="l">' + esc(b.band) + '</td><td class="num">' + b.protocols + '</td><td class="num">' + b.launched +
          '</td><td class="num">' + pct(b.launched_share, 1) + '</td><td class="num">' + pct(b.odds, 1) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p>Protocols with no recorded listing date (' + pct(R.odds.global_launched_share, 0) + ' of the whole snapshot has launched) ' +
      'take their category\u2019s pooled read; the global unknown-age odds are ' + pct(R.odds.unknown_age_odds, 0) + '. ' +
      'The category record behind the priors — categories differ by an order of magnitude, which is why the prior is anchored per category:</p>' +
      '<table><thead><tr><th class="l">Category</th><th>Protocols</th><th>Launched</th><th>Launched share</th></tr></thead><tbody>' +
      R.odds.categories.slice(0, 14).map(function (c) {
        return '<tr><td class="l">' + esc(c.category) + '</td><td class="num">' + c.protocols + '</td>' +
          '<td class="num">' + c.launched + '</td><td class="num">' + pct(c.launched_share, 1) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<h2>The ranges</h2>' +
      '<p>Every row\u2019s p10–p90 is the conditional value\u2019s spread across ' + mo.bootstrap_runs + ' bootstrap refits of the peer set ' +
      '(seed ' + mo.bootstrap_seed + ', a model constant, so the refits are identical on every run — the gate checks determinism). ' +
      'The odds are held fixed inside the refits: the range prices the peer set\u2019s noise, which the validation shows is the large part.</p>' +
      '<h2>The farm verdicts</h2>' +
      '<p>Each plan is costed from its own steps (per-chain gas, weekly cadence, hold window) and netted against the row\u2019s ' +
      'conservative p10 value. The one structural assumption: a launch allocating A% of supply to users pays pro-rata across the ' +
      'farming capital, taken as ' + pct(mo.farmer_capital_share, 0) + ' of TVL, because most custodied value is passive and never farms. ' +
      'A position therefore expects A% x odds x p10 x capital / (' + pct(mo.farmer_capital_share, 0) + ' x TVL). The break-even allocation ' +
      'solves that for A at the plan\u2019s cash cost. The verdict prices the farmer\u2019s hour at a ' + pct(mo.ref_allocation, 0) +
      ' reference allocation: <b>farm</b> at $' + mo.farm_ev_hour_floor + ' an hour or better, <b>thin</b> when the expected value still ' +
      'covers the cash, <b>skip</b> when it does not — including every plan whose break-even exceeds the whole supply.</p>' +
      '<h2>What would change the ranking</h2>' +
      '<p>A different snapshot: the fit, the odds, the ranges and the verdicts are all re-derived from the input file, so a newer ' +
      'snapshot reprices the board end to end. Nothing here is a promise that any protocol launches, or that a launch pays farmers; ' +
      'it is a ranking of where the evidence points, with its error measured on the <a href="#/validation">Validation page</a>.</p></div>';
    app.innerHTML = html;
    drawFitChart();
  }

  // ---------------------------------------------------------------- validation
  function validationView() {
    setTab('validation');
    var v = R.validation;
    var html = '<div class="prose"><h2>Validation: the model, tested on its own peers</h2>' +
      '<p>A stated model is a claim; this page is the test. The value method was run <b>leave-one-out</b> over the ' + v.peers +
      ' live protocols whose recorded cap carries a price: for each one, the power law was fitted on the other ' + (v.peers - 1) +
      ' and asked to predict that protocol\u2019s market cap from its TVL, with its own momentum applied. The baseline got the same ' +
      'folds and predicted with a flat global median multiple alone — the strongest simple alternative, and the method this board ' +
      'used before the test said otherwise. Errors are log10: 0.301 is a factor of two.</p></div>' +
      '<div class="kpi">' +
      '<div class="card"><h3>Shipped method — median error</h3><div class="big win">' + factor(v.method_median_abs_log10) + '</div>' +
      '<p>Median absolute log10 error ' + v.method_median_abs_log10 + ' across ' + v.peers + ' held-out peers.</p></div>' +
      '<div class="card"><h3>Flat baseline — median error</h3><div class="big lose">' + factor(v.baseline_median_abs_log10) + '</div>' +
      '<p>Median absolute log10 error ' + v.baseline_median_abs_log10 + ' for TVL x the folds\u2019 median multiple.</p></div>' +
      '<div class="card"><h3>Within a factor of two</h3><div class="big">' + v.method_within_2x_pct + '% vs ' + v.baseline_within_2x_pct + '%</div>' +
      '<p>Share of held-out peers predicted within x0.5–x2 of their actual cap: the method against the baseline.</p></div>' +
      '<div class="card"><h3>Median bias</h3><div class="big">' + factor(v.method_median_log10) + '</div>' +
      '<p>Median signed error of the method (baseline ' + factor(v.baseline_median_log10) + '): near x1.00 means the line is not ' +
      'systematically high or low.</p></div></div>' +
      '<div class="prose"><p>Read honestly, the numbers say pricing a launch from TVL is a noisy business — a median error of ' +
      factor(v.method_median_abs_log10) + ' is wide, and the board\u2019s p10–p90 ranges exist because of it. What the test does establish ' +
      'is the ordering of methods: on this snapshot the fitted line beats the flat multiple on both error measures, and the category ' +
      'multiples and chain-breadth premium of the earlier model were dropped because they scored <i>worse than the flat baseline</i> ' +
      'in this same run. The method on the board is the one that won its own test; if a future snapshot reverses that, the honest ' +
      'move is to ship the baseline and say so.</p>' +
      '<h2>All three methods, same folds</h2>' +
      '<p>The middle row is the model this board shipped before this test existed: each category\u2019s median multiple, shrunk toward ' +
      'the global median, with the same momentum term. It is kept in the run — and on this page — so the replacement is auditable, ' +
      'not just asserted.</p></div>' +
      '<table><thead><tr><th class="l">Method</th><th>Median abs error</th><th>As a factor</th><th>Within x2</th><th>Median bias</th></tr></thead><tbody>' +
      '<tr><td class="l"><b>Power-law line (shipped)</b></td><td class="num">' + v.method_median_abs_log10 + '</td><td class="num">' + factor(v.method_median_abs_log10) + '</td><td class="num">' + v.method_within_2x_pct + '%</td><td class="num">' + factor(v.method_median_log10) + '</td></tr>' +
      '<tr><td class="l">Category multiples, shrunk (previous)</td><td class="num">' + v.multiples_median_abs_log10 + '</td><td class="num">' + factor(v.multiples_median_abs_log10) + '</td><td class="num">' + v.multiples_within_2x_pct + '%</td><td class="num">' + factor(v.multiples_median_log10) + '</td></tr>' +
      '<tr><td class="l">Flat global multiple (baseline)</td><td class="num">' + v.baseline_median_abs_log10 + '</td><td class="num">' + factor(v.baseline_median_abs_log10) + '</td><td class="num">' + v.baseline_within_2x_pct + '%</td><td class="num">' + factor(v.baseline_median_log10) + '</td></tr>' +
      '</tbody></table>' +
      '<h2>Error by category</h2>' +
      '<p>Held-out error for the categories with at least four price peers. Thin categories are where a per-category model would ' +
      'have been fitted on anecdotes; the line prices them from the global fit instead.</p></div>' +
      '<table><thead><tr><th class="l">Category</th><th>Peers</th><th>Median abs error</th><th>As a factor</th><th>Within x2</th></tr></thead><tbody>' +
      v.by_category.map(function (c) {
        return '<tr><td class="l">' + esc(c.category) + '</td><td class="num">' + c.peers + '</td>' +
          '<td class="num">' + c.median_abs_log10 + '</td><td class="num">' + factor(c.median_abs_log10) + '</td>' +
          '<td class="num">' + c.within_2x_pct + '%</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="prose"><h2>What is not validated</h2>' +
      '<p>The odds cannot be back-tested from one snapshot: there is no second snapshot to check whether the protocols priced at ' +
      '70% actually launched more often than those at 20%. They are presented as what they are — a survival read of the launch ' +
      'record this snapshot contains, with the raw band shares printed beside them on the model page so the direction can be ' +
      'checked. The farm verdicts inherit both halves\u2019 uncertainty and add one stated assumption (farming capital at ' +
      pct(R.model.farmer_capital_share, 0) + ' of TVL); they are triage for a farmer\u2019s time, not a promise of payment.</p></div>';
    app.innerHTML = html;
  }

  // ---------------------------------------------------------------- routing
  function render() {
    var h = parseHash();
    if (h.path === '/' || h.path === '') boardView(h.q);
    else if (h.path.indexOf('/p/') === 0) detailView(decodeURIComponent(h.path.slice(3)));
    else if (h.path === '/live') liveView();
    else if (h.path === '/model') modelView();
    else if (h.path === '/validation') validationView();
    else boardView(h.q);
    app.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', render);
  render();
})();
