// ==UserScript==
// @name         GCC — Gestione Concordati
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  Gestione listino concordati con sync GitHub Gist
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  var LS_LISTINO   = 'tcp_listino';
  var LS_FUEL_PERC = 'tcp_fuel_perc';
  var LS_TOKEN     = 'tcp_gcc_token';
  var GIST_ID      = '93f3fe07c908d94f152c56ad805202f5';
  var GIST_FILE    = 'tcp_listino.json';
  var GIST_FILE_BASE = 'tcp_listino_base.json';
  var GIST_FILE_VETTORI_REG = 'tcp_vettori_registry.json';
  var LS_VETTORI_REG        = 'tcp_gcc_vettori';
  var GIST_FILE_CRT_LIV = 'tcp_crt_livorno.json';
  var GIST_FILE_CRT_SPE = 'tcp_crt_laspezia.json';
  var GIST_FILE_ADD  = 'tcp_gcc_addizionali.json';
  var LS_LISTINO_BASE = 'tcp_listino_base';
  var LS_VETTORI      = 'tcp_vettori';
  var LS_ADDIZIONALI  = 'tcp_gcc_addizionali';
  var LS_CRT_COLS    = 'tcp_crt_cols';

  // ═══════════════════════════════════════════════
  //  FLOATING BUTTON
  // ═══════════════════════════════════════════════

  var btn = document.createElement('div');
  btn.innerHTML = '&#x1F4CB; Concordati';
  btn.style.cssText = [
    'position:fixed','bottom:20px','left:20px',
    'background:#1a5276','color:white',
    'padding:10px 18px','border-radius:8px',
    'cursor:pointer','font-family:Arial,sans-serif',
    'font-size:13px','font-weight:bold',
    'z-index:2147483647',
    'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
    'user-select:none','letter-spacing:0.3px'
  ].join(';');
  document.body.appendChild(btn);

  // ═══════════════════════════════════════════════
  //  PANEL
  // ═══════════════════════════════════════════════

  var panel = document.createElement('div');
  panel.style.cssText = [
    'display:none','position:fixed','bottom:62px','left:20px',
    'background:white','border:1px solid #ccc','border-radius:10px','padding:14px',
    'z-index:2147483647','box-shadow:0 4px 16px rgba(0,0,0,0.18)',
    'font-family:Arial,sans-serif','font-size:13px','min-width:230px'
  ].join(';');

  var statoDiv = document.createElement('div');
  statoDiv.style.cssText = 'font-size:11px;margin-bottom:10px;';

  function makeBtn(label, bg, handler) {
    var b = document.createElement('button');
    b.innerHTML = label;
    b.style.cssText = 'width:100%;margin-bottom:6px;padding:7px;background:'+bg+';color:white;border:none;border-radius:5px;cursor:pointer;font-size:12px;';
    b.addEventListener('click', function(e){ e.stopPropagation(); handler(); });
    return b;
  }

  var titoloPanel = document.createElement('div');
  titoloPanel.innerHTML = '&#x2601; GCC &mdash; Concordati';
  titoloPanel.style.cssText = 'font-weight:bold;color:#1a5276;margin-bottom:10px;font-size:14px;';

  panel.appendChild(titoloPanel);
  panel.appendChild(statoDiv);
  panel.appendChild(makeBtn('&#x2601; Sync Listino',        '#2980b9', function(){ sincronizza(); }));
  panel.appendChild(makeBtn('&#x1F4CB; Elenco Concordati',  '#16a085', function(){ apriGestioneListino(); }));
  panel.appendChild(makeBtn('&#x1F50D; Calcola Concordati', '#27ae60', function(){ eseguiMatch(); }));
  panel.appendChild(makeBtn('&#x1F4CA; Tariffario C.R.T',   '#8e44ad', function(){ apriTariffarioCRT(); }));
  panel.appendChild(makeBtn('&#x1F69A; Gestisci Vettori',   '#d35400', function(){ apriGestioneVettori(); }));
  panel.appendChild(makeBtn('&#x2695; Addizionali',         '#c0392b', function(){ apriAddizionali(); }));
  panel.appendChild(makeBtn('&#x2699; Configura Sync',      '#7f8c8d', function(){ apriConfigSync(); }));
  document.body.appendChild(panel);

  // ── CRT in-memory cache ──────────────────────────────────
  var _gcc_crt_rows = [];   // unica fonte runtime, niente localStorage
  var _gcc_crt_loading = false;  // true durante il fetch Gist
  var _gcc_crt_callbacks = [];   // funzioni da eseguire quando CRT è pronto

  function _initCrtData() {
    var tok = localStorage.getItem(LS_TOKEN);
    if (!tok) return;
    _gcc_crt_loading = true;
    try { aggiornaStato(); } catch(e) {}
    fetch('https://api.github.com/gists/' + GIST_ID, {
      headers: { 'Authorization': 'token ' + tok, 'Accept': 'application/vnd.github.v3+json' }
    })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(gd) {
      if (!gd) return;
      var tok2 = localStorage.getItem(LS_TOKEN);
      Promise.all([
        _fetchGistFile(gd.files[GIST_FILE_CRT_LIV], tok2),
        _fetchGistFile(gd.files[GIST_FILE_CRT_SPE], tok2)
      ]).then(function(results) {
        var liv = results[0], spe = results[1];
        _gcc_crt_rows = liv.concat(spe);
        _gcc_crt_loading = false;
        console.log('[GCC] CRT caricato dal Gist: LIV=' + liv.length + ' SPE=' + spe.length);
        try { aggiornaStato(); } catch(e) {}
        var cbs = _gcc_crt_callbacks.splice(0);
        cbs.forEach(function(cb){ try{cb();}catch(e){} });
      });
    })
    .catch(function() { _gcc_crt_loading = false; try{aggiornaStato();}catch(e){} });
  }


  // ── Vettori in-memory ──────────────────────────────────────────────
  var _gcc_vettori_reg     = [];
  var _gcc_vettori_tariffe = {};
  var _gcc_vettori_loading = false;

  function _initVettoriData() {
    var tok = localStorage.getItem(LS_TOKEN); if (!tok) return;
    _gcc_vettori_loading = true;
    fetch('https://api.github.com/gists/' + GIST_ID, {
      headers: { 'Authorization': 'token ' + tok, 'Accept': 'application/vnd.github.v3+json' }
    })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(gd) {
      if (!gd) { _gcc_vettori_loading = false; return; }
      var rf = gd.files[GIST_FILE_VETTORI_REG];
      if (!rf) { _gcc_vettori_loading = false; return; }
      var p = rf.truncated
        ? fetch(rf.raw_url).then(function(r) { return r.json(); })
        : Promise.resolve(JSON.parse(rf.content));
      p.then(function(rd) {
        _gcc_vettori_reg = rd.vettori || [];
        var proms = _gcc_vettori_reg.map(function(v) {
          var fname = 'tcp_vettore_' + v.id + '.json';
          var f = gd.files[fname]; if (!f) return Promise.resolve();
          var fp = f.truncated
            ? fetch(f.raw_url).then(function(r) { return r.json(); })
            : Promise.resolve(JSON.parse(f.content));
          return fp.then(function(d) {
            if (d) {
              if (d.rows && d.rows.length) _gcc_vettori_tariffe[v.id] = d.rows;
              // add: usa file individuale solo se registry è vuoto per quel vettore
              if (d.add && (!v.add || !Object.keys(v.add).filter(function(k){return v.add[k]&&v.add[k]!=='0'&&v.add[k]!==''}).length)) {
                v.add = d.add;
              }
              if (d.colMap) v.colMap = d.colMap;
            }
          });
        });
        Promise.all(proms).then(function() {
          _gcc_vettori_loading = false;
          console.log('[GCC] Vettori: ' + _gcc_vettori_reg.length);
          try { aggiornaStato(); } catch(e) {}
        });
      });
    })
    .catch(function() { _gcc_vettori_loading = false; });
  }

  function _calcolaVettore(v, parsed, porto, ct, kmCRT, isADR, kmBase, isReefer) {
    if (v.porti.map(function(p){return p.toUpperCase();}).indexOf(porto.toUpperCase()) < 0) return null;
    var rows = _gcc_vettori_tariffe[v.id] || [];
    if (!rows.length) return null;
    var add = v.add || {};
    var base20 = 0, base40 = 0;

    var matchInfo = '';  // fonte usata per il calcolo (per il pannello)
    if (v.tipo === 'localita') {
      var match = cercaCRT(parsed, porto, rows);
      if (!match) return null;
      base20 = Math.round(parseFloat(match.riga.c20 || 0));
      base40 = Math.round(parseFloat(match.riga.c40 || match.riga.c20 || 0));
      matchInfo = (match.riga.localita || '') + (match.riga.prov ? ' (' + match.riga.prov + ')' : '')
        + (match.riga.cap ? ' ' + match.riga.cap : '')
        + (match.riga.km ? '  •  ' + match.riga.km + ' km' : '');
    } else {
      if (!kmCRT || kmCRT <= 0) return null;
      // Minimo chilometrico configurato
      var kmMin  = parseFloat(add.km_min  || 0);
      var effectiveKm = (kmMin > 0 && kmCRT < kmMin) ? kmMin : kmCRT;
      // Lookup: trova la riga con km >= effectiveKm (arrotonda alla fascia superiore)
      // Supporta sia formato singolo {km} che range {km_da,km_a}
      var sortedRows = rows.slice().sort(function(a,b){
        return parseFloat(a.km||a.km_da||0) - parseFloat(b.km||b.km_da||0);
      });
      var found = null;
      // Prima: cerca riga con km >= effectiveKm (fascia superiore più vicina)
      for (var ri=0; ri<sortedRows.length; ri++) {
        var rowKm = parseFloat(sortedRows[ri].km || sortedRows[ri].km_da || 0);
        if (rowKm >= effectiveKm) { found = sortedRows[ri]; break; }
      }
      // Fallback: usa ultima riga (km effettivi superano tutte le fasce)
      if (!found) found = sortedRows[sortedRows.length-1];
      // Fallback minimo: usa prima riga
      if (!found && sortedRows.length) found = sortedRows[0];
      if (!found) return null;
      base20 = Math.round(parseFloat(String(found.c20||'0').replace(/[^0-9.,]/g,'').replace(',','.')) || 0);
      base40 = Math.round(parseFloat(String(found.c40||found.c20||'0').replace(/[^0-9.,]/g,'').replace(',','.')) || 0);
      matchInfo = effectiveKm + ' km' + (kmMin > 0 && kmCRT < kmMin ? ' (min. ' + kmMin + ' km)' : '');
    }

    var costoBase = ct.isHC ? base40 : (ct.size === '20' ? base20 : base40);
    if (!costoBase || costoBase <= 0) return null;

    var fuelPerc = parseFloat(add.fuel_perc || 0);
    var fuelAmt  = fuelPerc > 0 ? Math.round(costoBase * fuelPerc / 100) : 0;
    var subtotale = costoBase + fuelAmt;
    var addExtra = [];

    if (ct.isHC && parseFloat(add.hc || 0) > 0)
      addExtra.push({ label: 'HC', amt: Math.round(parseFloat(add.hc)) });
    if (isADR && parseFloat(add.adr || 0) > 0)
      addExtra.push({ label: 'ADR', amt: Math.round(parseFloat(add.adr)) });
    var congKey = porto === 'ITSPE' ? 'congestion_spe' : 'congestion_liv';
    var congAmt = Math.round(parseFloat(add[congKey] || add.congestion || 0));
    if (congAmt > 0) addExtra.push({ label: 'Congestion', amt: congAmt });
    if (kmBase >= 750 && parseFloat(add.notte || 0) > 0)
      addExtra.push({ label: 'Sosta Notte', amt: Math.round(parseFloat(add.notte)) });
    var reeferPerc = parseFloat(add.reefer_perc || 0);
    if (reeferPerc > 0 && isReefer) {
      var rfAmt = Math.round(subtotale * reeferPerc / 100);
      if (rfAmt > 0) addExtra.push({ label: 'Reefer ' + reeferPerc + '%', amt: rfAmt });
    }

    var totale = subtotale + addExtra.reduce(function(s, a){ return s + a.amt; }, 0);

    // Minimo addebito (solo per KM)
    if (v.tipo !== 'localita') {
      var costMin = parseFloat(add.cost_min || 0);
      if (costMin > 0 && totale < costMin) {
        addExtra.push({ label: 'min.', amt: costMin - totale });
        totale = costMin;
      }
    }

    return { id:v.id, nome:v.nome, tipo:v.tipo, costoBase:costoBase,
             fuelPerc:fuelPerc, fuelAmt:fuelAmt, subtotale:subtotale,
             addExtra:addExtra, totale:totale, matchInfo:matchInfo };
  }

  // Cache dei gruppi per il pannello vettori (indicizzati dal popup)
  window._gccVettoriGroups = [];

  window._gccCalcolaVettori = function(g_str) {
    try {
      var g = JSON.parse(g_str);
      var porto  = (g.porto || '').toUpperCase();  // sempre uppercase per match con v.porti
      var ct     = g.containerType || { size:'40', isHC:false };
      var isReefer = ct.isReefer || false;
      var parsed = (g.indirizziParsed && g.indirizziParsed[0]) || null;
      var loc    = (parsed && parsed.loc) || '';
      var kmCRT  = g.crtMatch && g.crtMatch.riga ? parseFloat(g.crtMatch.riga.km || 0) : 0;
      // Per KM carrier su route mancanti: cerca km nel CRT
      if (!kmCRT && parsed) {
        try {
          var _cm2 = cercaCRT(parsed, porto, _gcc_crt_rows);
          if (_cm2 && _cm2.riga) kmCRT = parseFloat(_cm2.riga.km || 0);
        } catch(e) {}
      }
      var kmBase = kmCRT;
      var isADR  = g.isADR || false;
      // Multi-stop: per carrier KM il km non può essere un singolo stop
      var nStops = g.indirizziParsed ? g.indirizziParsed.length : 1;
      var isMultiStop = nStops > 1;

      // Diagnostico: se registry vuoto o tariffe vuote, segnala
      if (!_gcc_vettori_reg.length) {
        return JSON.stringify([{_diag:'NO_REG', msg:'Registry vettori vuoto. Apri Gestisci Vettori.'}]);
      }
      var _totRows = 0;
      _gcc_vettori_reg.forEach(function(v){ _totRows += (_gcc_vettori_tariffe[v.id]||[]).length; });
      if (!_totRows) {
        return JSON.stringify([{_diag:'NO_TARIFFE', msg:'Tariffe non in memoria ('+_gcc_vettori_reg.length+' vettori senza tariffe). Apri Gestisci Vettori per ricaricarle.'}]);
      }

      var results = [];
      var diagNulls = [];
      _gcc_vettori_reg.forEach(function(v) {
        // Route multi-stop: nessun carrier (km non affidabile per nessun tipo)
        if (isMultiStop) return;
        var r = _calcolaVettore(v, parsed, porto, ct, kmCRT, isADR, kmBase, isReefer);
        if (r) results.push(r);
        else {
          var rows = _gcc_vettori_tariffe[v.id]||[];
          var reason = v.porti.map(function(p){return p.toUpperCase();}).indexOf(porto.toUpperCase())<0 ? 'porto '+porto+' non coperto'
            : !rows.length ? 'tariffe vuote'
            : v.tipo!=='localita'&&!kmCRT ? 'km=0 (mancante nel CRT)'
            : 'no match tariffa';
          diagNulls.push(v.nome+': '+reason);
        }
      });
      results.sort(function(a, b){ return a.totale - b.totale; });
      if (isMultiStop && !results.length) {
        return JSON.stringify([{_diag:'MULTI_STOP', msg:'Route con '+nStops+' fermate: i costi vettori sono disponibili solo su tratte singola destinazione. Per route multi-stop usa la colonna Inserisci KM.'}]);
      }
      if (!results.length) {
        return JSON.stringify([{_diag:'NO_MATCH', loc:loc, porto:porto, km:kmCRT, details:diagNulls}]);
      }
      // Aggiungi loc/porto ai risultati per il titolo del pannello
      results.forEach(function(r){ r._loc=loc; });
      return JSON.stringify(results);
    } catch(e) { return '[{"_diag":"ERR","msg":"'+e.message+'"}]'; }
  };

  function aggiornaStato() {
    var raw = localStorage.getItem(LS_LISTINO);
    var info = null;
    try { if (raw) info = JSON.parse(raw); } catch(e) { localStorage.removeItem(LS_LISTINO); }
    var infoBase = _gcc_crt_rows.length ? {rows: {length: _gcc_crt_rows.length}} : null;
    var crtStatus = _gcc_crt_loading
      ? '<span style="color:#e67e22"> &mdash; &#x23F3; CRT caricamento...</span>'
      : (_gcc_crt_rows.length
          ? '<span style="color:#8e44ad"> &mdash; &#x1F4CA; '+_gcc_crt_rows.length+' tariffe CRT &#x2713;</span>'
          : '<span style="color:#c0392b"> &mdash; &#x26A0; CRT non caricato</span>');
    var token = localStorage.getItem(LS_TOKEN);
    var html = (info && info.rows)
      ? '<span style="color:green">&#x2705; '+(info.rows.length)+' concordati</span>'
      : '<span style="color:#c0392b">&#x274C; Nessun listino</span>';
    html += crtStatus;
    html += token
      ? '<span style="color:green"> &mdash; &#x1F511; Token OK</span>'
      : '<span style="color:#e67e22"> &mdash; &#x26A0; Token mancante</span>';
    statoDiv.innerHTML = html;
  }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    if (panel.style.display==='none'){
      try{aggiornaStato();}catch(e){console.warn('GCC:',e);}
      panel.style.display='block';
      _initCrtData(); // carica tariffe CRT da Gist in memoria
      _initVettoriData(); // carica tariffe vettori da Gist
    }
    else panel.style.display='none';
  });
  document.addEventListener('click', function(e){
    if (!panel.contains(e.target) && e.target!==btn) panel.style.display='none';
  });

  // ═══════════════════════════════════════════════
  //  MERGE / SYNC
  // ═══════════════════════════════════════════════

  var CAMPI_COSTO = ['costo_20','costo_40','costo_hc','congestion','extra_stop','s_notte','allaccio_rf','adr','fuel','fuel_perc','note','data_validita'];

  function chiaveTratta(r) {
    return [norm(r.luogo_1),norm(r.luogo_2),norm(r.delivery_place),
            norm(r.porto_riferimento),norm(r.traffic_type),norm(r.committente)].join('||');
  }

  function analizzaConflitto(esistente, nuova) {
    var conflitti = [];
    var complementare = false;
    CAMPI_COSTO.forEach(function(f){
      var ve = (esistente[f]||'').toString().trim();
      var vn = (nuova[f]||'').toString().trim();
      if (!ve && vn) { complementare = true; }
      else if (ve && vn && ve !== vn) { conflitti.push({ campo:f, mia:ve, sua:vn }); }
    });
    if (conflitti.length > 0) return { tipo:'conflitto', campiConflitto:conflitti };
    if (complementare) {
      var fusa = JSON.parse(JSON.stringify(esistente));
      CAMPI_COSTO.forEach(function(f){
        if (!(fusa[f]||'').toString().trim() && (nuova[f]||'').toString().trim()) {
          fusa[f] = nuova[f];
        }
      });
      return { tipo:'complementare', rigaFusa:fusa };
    }
    return { tipo:'uguale' };
  }

  // ═══════════════════════════════════════════════
  //  CONFIG SYNC
  // ═══════════════════════════════════════════════

  function apriConfigSync() {
    panel.style.display = 'none';
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:white;border-radius:10px;padding:24px;width:420px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.3);';
    var token = localStorage.getItem(LS_TOKEN) || '';
    modal.innerHTML =
      '<div style="font-weight:bold;color:#1a5276;font-size:15px;margin-bottom:4px">&#x2699; Configura Sync</div>'+
      '<div style="font-size:12px;color:#888;margin-bottom:14px">Gist ID: <code style="background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:11px">'+GIST_ID+'</code></div>'+
      '<div style="height:1px;background:#eee;margin-bottom:14px"></div>'+
      '<label style="font-size:12px;font-weight:bold;color:#555;display:block;margin-bottom:6px">&#x1F511; Personal Access Token GitHub (scope: gist)</label>'+
      '<input id="gcc-tok" type="password" value="'+token+'" placeholder="ghp_xxxxxxxxxxxx" '+
        'style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:5px;font-size:13px;box-sizing:border-box;margin-bottom:8px">'+
      '<div style="font-size:11px;color:#888;margin-bottom:16px">'+
        'Genera su <a href="https://github.com/settings/tokens/new?scopes=gist" target="_blank" style="color:#2980b9">github.com/settings/tokens</a> — spunta solo <strong>gist</strong>'+
      '</div>'+
      '<div style="display:flex;justify-content:flex-end;gap:8px">'+
        '<button id="gcc-cfg-cancel" style="padding:8px 18px;border:none;border-radius:5px;cursor:pointer;background:#bdc3c7;font-size:13px;font-weight:bold;">Annulla</button>'+
        '<button id="gcc-cfg-save"   style="padding:8px 18px;border:none;border-radius:5px;cursor:pointer;background:#27ae60;color:white;font-size:13px;font-weight:bold;">Salva</button>'+
      '</div>';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.getElementById('gcc-cfg-save').addEventListener('click', function(){
      var t = document.getElementById('gcc-tok').value.trim();
      if (!t) { alert('Inserisci il token.'); return; }
      localStorage.setItem(LS_TOKEN, t);
      document.body.removeChild(overlay);
      alert('Token salvato!');
    });
    document.getElementById('gcc-cfg-cancel').addEventListener('click', function(){ document.body.removeChild(overlay); });
    overlay.addEventListener('click', function(e){ if (e.target === overlay) document.body.removeChild(overlay); });
  }

  // ═══════════════════════════════════════════════
  //  SYNC — PULL + MERGE + PUSH
  // ═══════════════════════════════════════════════

  function sincronizza(dopoSync) {
    var token = localStorage.getItem(LS_TOKEN);
    if (!token) { apriConfigSync(); if (dopoSync) dopoSync(); return; }
    panel.style.display = 'none';
    statoDiv.innerHTML = '<span style="color:#e67e22">&#x23F3; Sync in corso...</span>';

    fetch('https://api.github.com/gists/' + GIST_ID, {
      headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
    })
    .then(function(resp) {
      if (resp.status === 401) { alert('Token non valido o scaduto.\nUsa ⋯ Configura Sync per aggiornarlo.'); apriConfigSync(); throw new Error('skip'); }
      if (!resp.ok) throw new Error('Pull fallito: HTTP ' + resp.status);
      return resp.json();
    })
    .then(function(gistData) {
      var remoteRaw = (gistData.files[GIST_FILE] && gistData.files[GIST_FILE].content) || '{"rows":[]}';
      var remoteRows;
      try { remoteRows = JSON.parse(remoteRaw).rows || []; } catch(e) { remoteRows = []; }

      var localRaw = localStorage.getItem(LS_LISTINO);
      var localRows = [];
      try{if(localRaw)localRows=JSON.parse(localRaw).rows||[];}catch(e){localStorage.removeItem(LS_LISTINO);}

      var mappaLocali = {};
      localRows.forEach(function(r, i) { mappaLocali[chiaveTratta(r)] = i; });

      var aggiunte = [], fuse = [], conflitti = [], ignorati = 0;

      remoteRows.forEach(function(r) {
        var k = chiaveTratta(r);
        if (!(k in mappaLocali)) {
          aggiunte.push(r);
        } else {
          var idx = mappaLocali[k];
          var analisi = analizzaConflitto(localRows[idx], r);
          if (analisi.tipo === 'complementare') {
            fuse.push({ indice:idx, rigaFusa:analisi.rigaFusa });
          } else if (analisi.tipo === 'conflitto') {
            conflitti.push({ esistente:localRows[idx], nuova:r, campiConflitto:analisi.campiConflitto, indice:idx });
          } else {
            ignorati++;
          }
        }
      });

      fuse.forEach(function(f) { localRows[f.indice] = f.rigaFusa; });

      if (conflitti.length === 0) {
        _applicaESalva(localRows.concat(aggiunte), token, aggiunte.length, fuse.length, ignorati, dopoSync);
      } else {
        window._gccSyncCallback = function(merged) {
          _applicaESalva(merged, token, aggiunte.length, fuse.length, ignorati, dopoSync);
          delete window._gccSyncCallback;
        };
        apriConflictResolver(conflitti, localRows, aggiunte, fuse.length, ignorati, 'Locale', 'Remoto', true);
      }
    })
    .catch(function(err) {
      if (err.message !== 'skip') alert('Errore sync: ' + err.message);
      aggiornaStato();
      if (dopoSync) dopoSync();
    });
  }

  function _applicaESalva(merged, token, nAggiunte, nFuse, nIgnorati, dopoSalva) {
    localStorage.setItem(LS_LISTINO, JSON.stringify({ rows:merged, filename:'GCC', loaded_at:new Date().toISOString() }));
    aggiornaStato();
    var content = JSON.stringify({ rows:merged, updated_at:new Date().toISOString() }, null, 2);
    fetch('https://api.github.com/gists/' + GIST_ID, {
      method: 'PATCH',
      headers: { 'Authorization':'token '+token, 'Accept':'application/vnd.github.v3+json', 'Content-Type':'application/json' },
      body: JSON.stringify({ files: { [GIST_FILE]: { content:content } } })
    })
    .then(function(resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var msg = 'Sync completato!\n';
      if (nAggiunte) msg += 'Ricevute: ' + nAggiunte + '\n';
      if (nFuse)     msg += 'Fuse (complementari): ' + nFuse + '\n';
      if (nIgnorati) msg += 'Identiche (ignorate): ' + nIgnorati + '\n';
      msg += 'Totale: ' + merged.length + ' tariffe';
      if (dopoSalva) dopoSalva(); else alert(msg);
    })
    .catch(function(err) {
      alert('Sync locale OK, push fallito: ' + err.message + '\nRiprova il sync.');
      if (dopoSalva) dopoSalva();
    });
  }

  // ═══════════════════════════════════════════════
  //  CONFLICT RESOLVER POPUP
  // ═══════════════════════════════════════════════

  function apriConflictResolver(conflitti, attuali, aggiunte, nFuse, nIgnorati, filenameMio, filenameCollega, isSync) {
    var popup = window.open('', 'tcp_conflitti', 'width=800,height=600,scrollbars=yes,resizable=yes');
    if(!popup){alert('Il browser ha bloccato il popup.\nAutorizza i popup per questo sito e riprova.');return;}

    var righeHtml = '';
    conflitti.forEach(function(c, ci){
      var tratta = [
        c.esistente.luogo_1, c.esistente.luogo_2, c.esistente.delivery_place,
        c.esistente.porto_riferimento, c.esistente.traffic_type, c.esistente.committente
      ].filter(Boolean).join(' / ');

      var campiHtml = '';
      c.campiConflitto.forEach(function(cf){
        campiHtml +=
          '<tr>'+
          '<td style="font-weight:bold;color:#555;padding:4px 8px">'+cf.campo+'</td>'+
          '<td style="padding:4px 8px;color:#27ae60">'+cf.mia+'</td>'+
          '<td style="padding:4px 8px;color:#8e44ad">'+cf.sua+'</td>'+
          '</tr>';
      });

      righeHtml +=
        '<div class="card" id="card_'+ci+'">' +
          '<div class="card-title">&#x26A0;&#xFE0F; '+tratta+'</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px">' +
            '<thead><tr>' +
              '<th style="padding:4px 8px;text-align:left;background:#f0f0f0">Campo</th>' +
              '<th style="padding:4px 8px;text-align:left;background:#d5f5e3">La tua ('+filenameMio+')</th>' +
              '<th style="padding:4px 8px;text-align:left;background:#e8daef">Del collega ('+filenameCollega+')</th>' +
            '</tr></thead>' +
            '<tbody>'+campiHtml+'</tbody>' +
          '</table>' +
          '<div class="btn-group">' +
            '<button class="btn-mia"    data-ci="'+ci+'" data-scelta="mia">&#x1F7E2; Tieni la tua</button>' +
            '<button class="btn-sua"    data-ci="'+ci+'" data-scelta="sua">&#x1F7E3; Prendi la sua</button>' +
            '<button class="btn-entram" data-ci="'+ci+'" data-scelta="entrambe">&#x2795; Tieni entrambe</button>' +
          '</div>' +
        '</div>';
    });

    var css =
      'body{font-family:Arial,sans-serif;padding:18px;background:#f4f6f8;margin:0}' +
      'h2{color:#1a5276;margin:0 0 4px}' +
      '.subtitle{font-size:12px;color:#888;margin-bottom:16px}' +
      '.card{background:white;border-radius:8px;padding:14px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,.1);border-left:4px solid #e67e22}' +
      '.card.risolto{border-left:4px solid #27ae60;opacity:.6}' +
      '.card-title{font-weight:bold;color:#1a5276;margin-bottom:8px;font-size:13px}' +
      '.btn-group{display:flex;gap:8px;flex-wrap:wrap}' +
      '.btn-group button{padding:6px 14px;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold}' +
      '.btn-mia{background:#27ae60;color:white}.btn-mia:hover{background:#219a52}' +
      '.btn-sua{background:#8e44ad;color:white}.btn-sua:hover{background:#7d3c98}' +
      '.btn-entram{background:#2980b9;color:white}.btn-entram:hover{background:#2471a3}' +
      '#footer{position:sticky;bottom:0;background:white;padding:12px 0;border-top:1px solid #eee;display:flex;align-items:center;justify-content:space-between}' +
      '#counter{font-size:13px;color:#555}' +
      '#btn-applica{padding:9px 22px;background:#1a5276;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold}' +
      '#btn-applica:disabled{background:#bdc3c7;cursor:not-allowed}';

    var scriptCR =
      'var _conflitti='+JSON.stringify(conflitti)+';' +
      'var _attuali='+JSON.stringify(attuali)+';' +
      'var _aggiunte='+JSON.stringify(aggiunte)+';' +
      'var _nFuse='+nFuse+';' +
      'var _nIgnorati='+nIgnorati+';' +
      'var _LS="'+LS_LISTINO+'";' +
      'var _isSync='+(isSync?'true':'false')+';' +
      'var _fname="'+filenameMio+' + '+filenameCollega+'";' +
      'var _scelte={};' +
      'var _totale='+conflitti.length+';' +

      'function aggiornaCounter(){' +
        'var n=Object.keys(_scelte).length;' +
        'document.getElementById("counter").textContent="Risolti: "+n+" / "+_totale;' +
        'document.getElementById("btn-applica").disabled=(n<_totale);' +
      '}' +

      'document.addEventListener("click",function(e){' +
        'var btn=e.target.closest("[data-ci]");' +
        'if(!btn)return;' +
        'var ci=parseInt(btn.dataset.ci);' +
        'var scelta=btn.dataset.scelta;' +
        '_scelte[ci]=scelta;' +
        'var card=document.getElementById("card_"+ci);' +
        'card.classList.add("risolto");' +
        'card.querySelectorAll("button").forEach(function(b){ b.style.opacity=b===btn?"1":"0.4"; });' +
        'aggiornaCounter();' +
      '});' +

      'document.getElementById("btn-applica").addEventListener("click",function(){' +
        'var righe=JSON.parse(JSON.stringify(_attuali));' +
        'var extra=[];' +
        'for(var ci=0;ci<_totale;ci++){' +
          'var sc=_scelte[ci];' +
          'var c=_conflitti[ci];' +
          'if(sc==="mia"){' +
            '/* lascia invariato */' +
          '}else if(sc==="sua"){' +
            'righe[c.indice]=c.nuova;' +
          '}else if(sc==="entrambe"){' +
            'extra.push(c.nuova);' +
          '}' +
        '}' +
        'var merged=righe.concat(_aggiunte).concat(extra);' +
        'localStorage.setItem(_LS,JSON.stringify({rows:merged,filename:_fname,loaded_at:new Date().toISOString()}));' +
        'if(_isSync && window.opener && window.opener._gccSyncCallback){' +
          'window.opener._gccSyncCallback(merged);' +
        '} else {' +
          'var msg="Merge completato!\\n";' +
          'if(_aggiunte.length) msg+="Aggiunte nuove: "+_aggiunte.length+"\\n";' +
          'if(_nFuse)           msg+="Fuse (complementari): "+_nFuse+"\\n";' +
          'if(_nIgnorati)       msg+="Identiche (ignorate): "+_nIgnorati+"\\n";' +
          'msg+="Totale: "+merged.length+" tariffe";' +
          'alert(msg);' +
        '}' +
        'window.close();' +
      '});' +

      'aggiornaCounter();';

    popup.document.write(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Merge - Conflitti<\/title>' +
      '<style>'+css+'<\/style><\/head><body>' +
      '<h2>&#x1F500; Merge Listino &mdash; Conflitti da risolvere<\/h2>' +
      '<div class="subtitle">Trovati '+conflitti.length+' conflitti. Scegli per ciascuno quale versione tenere.<\/div>' +
      righeHtml +
      '<div id="footer">' +
        '<span id="counter">Risolti: 0 / '+conflitti.length+'<\/span>' +
        '<button id="btn-applica" disabled>&#x2705; Applica e chiudi<\/button>' +
      '<\/div>' +
      '<scr'+'ipt>'+scriptCR+'<\/scr'+'ipt>' +
      '<\/body><\/html>'
    );
    popup.document.close();
  }

  // ═══════════════════════════════════════════════
  //  XLSX helper
  // ═══════════════════════════════════════════════

  function caricaXLSX(file, callback) {
    function parse(){
      var reader = new FileReader();
      reader.onload = function(ev){
        try {
          var wb = XLSX.read(new Uint8Array(ev.target.result),{type:'array'});
          callback(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}));
        } catch(err){ alert('Errore lettura file: '+err.message); }
      };
      reader.readAsArrayBuffer(file);
    }
    if (typeof XLSX!=='undefined'){ parse(); }
    else {
      var s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload=parse; document.head.appendChild(s);
    }
  }

  // ═══════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════

  function norm(s){ return (s||'').toString().toLowerCase().trim(); }
  function normSocieta(s){
    return norm(s)
      .replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|s\.?c\.?a\.?|s\.?c\.?r\.?l\.?)\b/gi,'')
      .replace(/\s+/g,' ').trim();
  }
  function normalizzaIndirizzo(addr){
    return addr
      .replace(/\s*\d{5}\s*/g,' ')
      .replace(/\s*\([A-Za-z]{2}\)\s*/g,' ')
      .replace(/\s+/g,' ').trim();
  }
  function parseIndirizzi(t){ return t.split('\n').map(function(a){ return normalizzaIndirizzo(a.trim()); }).filter(function(a){ return a.length>0; }); }
  // Estrae {loc, prov, cap} dal formato TMS: "CITTÀ (PR)\n12345" o "CITTÀ (PR) 12345"
  function parseIndirizzoCompleto(raw) {
    var s = (raw || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    var cap  = '';
    var prov = '';
    var mCap  = s.match(/\b(\d{5})\b/);
    if (mCap)  cap  = mCap[1];
    var mProv = s.match(/\(([A-Za-z]{2})\)/);
    if (mProv) prov = mProv[1].toUpperCase();
    // Località: tutto prima della parentesi provincia
    var loc = s.replace(/\s*\([A-Za-z]{2}\).*$/, '').replace(/\b\d{5}\b/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    return { loc: loc, prov: prov, cap: cap };
  }
  function parseContainerType(raw){
    var clean=raw.replace(/\[.*?\]/g,'').trim().toLowerCase();
    return { size:clean.startsWith('20')?'20':'40', isHC:clean.includes('high cube')||clean.includes('high-cube'), clean:clean };
  }
  function parsePorto(raw){ var m=raw.match(/\[([^\]]+)\]/); return m?m[1].toLowerCase():norm(raw); }
  function parseNome(raw){ return raw.replace(/^\[\d+\]\s*/,'').trim(); }
  function specificity(riga){
    var score=0;
    ['delivery_place','luogo_1','luogo_2','porto_riferimento','traffic_type','committente'].forEach(function(f){
      if(riga[f]&&riga[f].toString().trim()!=='') score++;
    });
    return score;
  }
  function oggiDDMMYY(){
    var d=new Date();
    return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getFullYear()).slice(-2);
  }

  // ═══════════════════════════════════════════════
  //  MATCHER
  // ═══════════════════════════════════════════════

  function matchaListino(ordine, listino){
    var candidati=listino.filter(function(riga){
      var rT=norm(riga.traffic_type), rC=norm(riga.committente), rD=norm(riga.delivery_place);
      var rL1=norm(normalizzaIndirizzo(riga.luogo_1||'')), rL2=norm(normalizzaIndirizzo(riga.luogo_2||''));
      var rP=norm(riga.porto_riferimento);
      if(rP&&!rP.startsWith('it'))                                                     return false;
      if(rT&&rT!==norm(ordine.traffic))                                                return false;
      if(rC&&!normSocieta(ordine.committente).includes(normSocieta(riga.committente))) return false;
      if(rD&&!norm(ordine.delivery_place).includes(rD))                               return false;
      if(rP&&norm(ordine.porto)!==rP)                                                 return false;
      var ind=ordine.indirizzi;
      if(rL1&&(!ind[0]||!norm(normalizzaIndirizzo(ind[0])).includes(rL1)))            return false;
      if(rL2&&(!ind[1]||!norm(normalizzaIndirizzo(ind[1])).includes(rL2)))            return false;
      return true;
    });
    if(candidati.length===0) return null;
    candidati.sort(function(a,b){ return specificity(b)-specificity(a); });
    return candidati[0];
  }

  // ═══════════════════════════════════════════════
  //  LEGGI ORDINI DAL GESTIONALE
  // ═══════════════════════════════════════════════

  function leggiOrdini(){
    var ordini=[];
    document.querySelectorAll('tr.ui-expanded-row').forEach(function(riga){
      var tds=riga.querySelectorAll('td'); if(tds.length<11) return;
      var orderId        = tds[1]  ? tds[1].innerText.trim()  : '';
      var lef            = tds[6]  ? tds[6].innerText.trim()  : '';
      var committente    = parseNome(tds[5] ? tds[5].innerText.trim() : '');
      var traffic        = tds[7]  ? tds[7].innerText.trim()  : '';
      var delivery_place = parseNome(tds[9] ? tds[9].innerText.trim() : '');
      var _rawAddr       = tds[10]?tds[10].innerText.trim():'';
      var indirizzi      = parseIndirizzi(_rawAddr);
      // Parsed con loc+prov+cap per matching CRT
      var indirizziParsed = _rawAddr.split('\n')
        .reduce(function(acc, line, i, arr) {
          // Raggruppa coppie: "CITTA (PR)" + "CAP" sulla riga successiva
          var t = line.trim();
          if (!t) return acc;
          // Se è solo un CAP e l'ultimo acc ha prov ma no cap → aggiungilo
          if (/^\d{5}$/.test(t) && acc.length > 0 && !acc[acc.length-1].cap) {
            acc[acc.length-1].cap = t;
          } else {
            acc.push(parseIndirizzoCompleto(t));
          }
          return acc;
        }, []);
      var containers=[];
      var nextRow=riga.nextElementSibling;
      if(nextRow){
        var sub=nextRow.querySelector('[id*="transportEquipmentsTable_data"]');
        if(sub){
          sub.querySelectorAll('tr').forEach(function(ctr){
            var ctds=ctr.querySelectorAll('td'); if(ctds.length<8) return;
            var ctr_raw=ctds[3]?ctds[3].innerText.trim():'';
            var pL=parsePorto(ctds[5]?ctds[5].innerText.trim():'');
            var pD=parsePorto(ctds[6]?ctds[6].innerText.trim():'');
            containers.push({
              containerNr:      ctds[2]?ctds[2].innerText.trim():'',
              containerTypeRaw: ctr_raw,
              containerType:    parseContainerType(ctr_raw),
              portLoading:pL, portDischarge:pD,
              porto: norm(traffic)==='export'?pL:pD,
              deliveryDT: ctds[12]?ctds[12].innerText.trim():''
            });
          });
        }
      }
      // ADR: icona sdb-icon-cabinet_warning presente nella riga o nella sub-riga
      var isADR = !!(riga.querySelector('.sdb-icon-cabinet_warning') ||
                     (nextRow && nextRow.querySelector('.sdb-icon-cabinet_warning')));
      ordini.push({ orderId:orderId, lef:lef, committente:committente, traffic:traffic,
        delivery_place:delivery_place, indirizzi:indirizzi, indirizziParsed:indirizziParsed,
        isADR:isADR, containers:containers });
    });
    return ordini;
  }

  // ═══════════════════════════════════════════════
  //  ESEGUI MATCH
  // ═══════════════════════════════════════════════

  function eseguiMatch(){
    // Se CRT in caricamento: aspetta il completamento
    if (_gcc_crt_loading) {
      _gcc_crt_callbacks.push(function() { eseguiMatch(); });
      return;
    }
    // Se CRT vuoto: fetchalo direttamente ora (non dipende dal popup)
    if (_gcc_crt_rows.length === 0 && localStorage.getItem(LS_TOKEN)) {
      var loadMsg = document.createElement('div');
      loadMsg.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);'
        + 'background:#1a5276;color:white;padding:12px 24px;border-radius:8px;'
        + 'font-size:14px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,.3)';
      loadMsg.textContent = '\u23F3 Caricamento tariffe CRT dal Gist...';
      document.body.appendChild(loadMsg);
      var tok = localStorage.getItem(LS_TOKEN);
      _gcc_crt_loading = true;
      fetch('https://api.github.com/gists/' + GIST_ID, {
        headers: { 'Authorization': 'token ' + tok, 'Accept': 'application/vnd.github.v3+json' }
      })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(gd) {
        if (!gd) return Promise.all([Promise.resolve([]), Promise.resolve([])]);
        return Promise.all([
          _fetchGistFile(gd.files[GIST_FILE_CRT_LIV], tok),
          _fetchGistFile(gd.files[GIST_FILE_CRT_SPE], tok)
        ]);
      })
      .then(function(results) {
        _gcc_crt_rows = (results[0] || []).concat(results[1] || []);
        _gcc_crt_loading = false;
        loadMsg.remove();
        console.log('[GCC] CRT caricato per concordati: ' + _gcc_crt_rows.length + ' righe');
        try { aggiornaStato(); } catch(e) {}
        eseguiMatch(); // riprova ora che i dati ci sono
      })
      .catch(function() {
        _gcc_crt_loading = false;
        loadMsg.remove();
        _eseguiMatchCore(); // procedi senza CRT
      });
      return;
    }
    var token = localStorage.getItem(LS_TOKEN);
    if (token) {
      sincronizza(function() { _eseguiMatchCore(); });
    } else {
      _eseguiMatchCore();
    }
  }

  function _eseguiMatchCore(){
    var raw=localStorage.getItem(LS_LISTINO);
    if(!raw){ alert('Nessun listino caricato. Fai un Sync.'); return; }
    var listino=[];
    try{listino=JSON.parse(raw).rows||[];}catch(e){alert('Dati corrotti, fai un Sync.');return;}
    var ordini=leggiOrdini();
    if(ordini.length===0){ alert('Nessun ordine trovato. Assicurati che ci siano righe espanse.'); return; }
    var risultati=[];
    ordini.forEach(function(ordine){
      ordine.containers.forEach(function(container){
        risultati.push({
          orderId:ordine.orderId, lef:ordine.lef,
          delivery_place:ordine.delivery_place, committente:ordine.committente,
          traffic:ordine.traffic, indirizzi:ordine.indirizzi,
          indirizziParsed:ordine.indirizziParsed, isADR:ordine.isADR||false,
          containerNr:container.containerNr, containerTypeRaw:container.containerTypeRaw,
          containerType:container.containerType, portLoading:container.portLoading,
          portDischarge:container.portDischarge, porto:container.porto, deliveryDT:container.deliveryDT,
          match:matchaListino({ traffic:ordine.traffic, committente:ordine.committente,
            delivery_place:ordine.delivery_place, indirizzi:ordine.indirizzi, porto:container.porto }, listino)
        });
      });
    });
    panel.style.display='none';
    apriPopup(risultati);
  }

  // ═══════════════════════════════════════════════
  //  RACCOGLIE SUGGERIMENTI PER AUTOCOMPLETE
  // ═══════════════════════════════════════════════

  function raccogliSuggerimenti() {
    var raw = localStorage.getItem(LS_LISTINO);
    var rows = raw ? JSON.parse(raw).rows : [];
    var sets = { committenti:{}, luoghi:{}, delivery_places:{}, porti:{} };
    var sugg = { committenti:[], luoghi:[], delivery_places:[], porti:[] };
    function addTo(set, arr, val) {
      val = (val||'').trim();
      if(val && !set[val]) { set[val]=1; arr.push(val); }
    }
    rows.forEach(function(r) {
      addTo(sets.committenti,     sugg.committenti,     r.committente);
      addTo(sets.luoghi,          sugg.luoghi,          r.luogo_1);
      addTo(sets.luoghi,          sugg.luoghi,          r.luogo_2);
      addTo(sets.delivery_places, sugg.delivery_places, r.delivery_place);
      addTo(sets.porti,           sugg.porti,           r.porto_riferimento);
    });
    document.querySelectorAll('tr.ui-expanded-row').forEach(function(riga) {
      var tds = riga.querySelectorAll('td');
      if(tds.length < 11) return;
      addTo(sets.committenti,     sugg.committenti,     parseNome(tds[5] ? tds[5].innerText.trim() : ''));
      addTo(sets.delivery_places, sugg.delivery_places, parseNome(tds[9] ? tds[9].innerText.trim() : ''));
      parseIndirizzi(tds[10] ? tds[10].innerText.trim() : '').forEach(function(ind) {
        addTo(sets.luoghi, sugg.luoghi, ind);
      });
      var nextRow = riga.nextElementSibling;
      if(nextRow) {
        var sub = nextRow.querySelector('[id*="transportEquipmentsTable_data"]');
        if(sub) {
          sub.querySelectorAll('tr').forEach(function(ctr) {
            var ctds = ctr.querySelectorAll('td');
            if(ctds.length < 8) return;
            addTo(sets.porti, sugg.porti, parsePorto(ctds[5] ? ctds[5].innerText.trim() : ''));
            addTo(sets.porti, sugg.porti, parsePorto(ctds[6] ? ctds[6].innerText.trim() : ''));
          });
        }
      }
    });
    return sugg;
  }


  // Compress/decompress per ridurre dimensione localStorage (porto: p,cap: c,prov: v,localita: l,km: k,costo_20: t2,costo_40: t4,costo_hc: th)
  function _crtCompress(rows) {
    return rows.map(function(r) {
      var o = {p:r.porto,c:r.cap||'',v:r.prov||'',l:r.localita||''};
      if (r.km)       o.k  = r.km;
      if (r.costo_20) o.t2 = r.costo_20;
      if (r.costo_40) o.t4 = r.costo_40;
      if (r.costo_hc) o.th = r.costo_hc;
      return o;
    });
  }
  function _crtDecompress(rows) {
    return rows.map(function(r) {
      // Supporta sia formato compresso che legacy
      return {
        porto:    r.porto || r.p || '',
        cap:      r.cap   || r.c || '',
        prov:     r.prov  || r.v || '',
        localita: r.localita || r.l || '',
        km:       r.km    || r.k  || '',
        costo_20: r.costo_20 || r.t2 || '',
        costo_40: r.costo_40 || r.t4 || '',
        costo_hc: r.costo_hc || r.th || ''
      };
    });
  }
  // Setter esposto su window — il popup lo usa per aggiornare la closure

  // Legge un file dal Gist gestendo il caso truncated
  function _fetchGistFile(fileObj, tok) {
    if (!fileObj) return Promise.resolve([]);
    if (!fileObj.truncated) {
      try { return Promise.resolve(JSON.parse(fileObj.content).rows || []); }
      catch(e) { return Promise.resolve([]); }
    }
    // File troncato: scarica dalla raw_url senza Authorization
    // (gist.githubusercontent.com non accetta auth nel CORS preflight)
    return fetch(fileObj.raw_url)
      .then(function(r) { return r.ok ? r.json() : {}; })
      .then(function(data) { return data.rows || []; })
      .catch(function() { return []; });
  }

  window._gccSetCrtRows = function(rows) {
    _gcc_crt_rows = rows;
    _gcc_crt_loading = false;
    try { aggiornaStato(); } catch(e) {}
    // Svuota callback in attesa
    var cbs = _gcc_crt_callbacks.splice(0);
    cbs.forEach(function(cb){ try{cb();}catch(e){} });
  };

  function _readCrtRows() {
    return _gcc_crt_rows;
  }

  function apriTariffarioCRT() {
    panel.style.display = 'none';

    var rows = _readCrtRows();

    var fuelPerc = 0;
    try {
      var rawAdd = localStorage.getItem(LS_ADDIZIONALI);
      if (rawAdd) {
        var addObj = JSON.parse(rawAdd);
        fuelPerc = parseFloat(addObj.fuel_perc || 0) || 0;
      }
      // fallback: LS_FUEL_PERC (usato dal popup calcola concordati)
      if (!fuelPerc) {
        var rawFP = localStorage.getItem(LS_FUEL_PERC);
        if (rawFP) fuelPerc = parseFloat(rawFP) || 0;
      }
    } catch(e) {}

    var rowsJson  = JSON.stringify(rows);
    var fuelPercJ = JSON.stringify(fuelPerc);

    // Mapping colonne configurabili
    var defaultCols = {cap:'CAP',prov:'Prov',localita:'Localita',km:'DIST KM A/R',c20:"20'",c40:"40'/20' HT"};
    var savedCols = {};
    try { var rawCols = localStorage.getItem(LS_CRT_COLS); if (rawCols) savedCols = JSON.parse(rawCols); } catch(e) {}
    var colMap = Object.assign({}, defaultCols, savedCols);
    var colMapJ = JSON.stringify(colMap);

    // Nome file importato in precedenza
    var importedFilename = '';
    var importedFilename = '';
    var importedFilenameJ = JSON.stringify(importedFilename);

    var cssC =
      'body{font-family:Arial,sans-serif;padding:0;background:#f4f6f8;margin:0}'+
      '#topbar{display:flex;align-items:center;justify-content:space-between;background:#1a5276;color:white;padding:10px 18px;gap:8px;position:sticky;top:0;z-index:100;flex-wrap:wrap}'+
      '#topbar h2{margin:0;font-size:14px;white-space:nowrap}'+
      '#topbar-right{display:flex;align-items:center;gap:6px;flex-wrap:wrap}'+
      '#tabs{display:flex;gap:4px;margin-right:6px}'+
      '#search{padding:6px 10px;border:none;border-radius:5px;font-size:12px;width:180px}'+
      '.tbtn{padding:7px 13px;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold;color:white;white-space:nowrap}'+
      '#table-wrap{overflow:auto;padding:14px;height:calc(100vh - 66px);box-sizing:border-box}'+
      'table{width:100%;border-collapse:collapse;font-size:11px}'+
      'th{background:#1a5276;color:white;padding:6px 8px;text-align:left;white-space:nowrap;position:sticky;top:0;z-index:10}'+
      'td{padding:4px 8px;border-bottom:1px solid #eee;vertical-align:middle;white-space:nowrap}'+
      'tr:hover td{background:#f0f7ff}'+
      '.tc{color:#27ae60;font-weight:bold}'+
      '.tf{color:#8e44ad;font-weight:bold}'+
      '.tna{color:#ddd}'+
      '#nrows{font-size:11px;color:#888;margin-top:8px}'+
      '#overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center}'+
      '#overlay.show{display:flex}'+
      '#modale{background:white;border-radius:10px;padding:24px;width:480px;max-width:96vw;box-shadow:0 8px 32px rgba(0,0,0,.3)}'+
      '#modale h3{margin:0 0 12px;color:#1a5276;font-size:15px}'+
      '.sep{height:1px;background:#eee;margin:10px 0}'+
      '.fg{display:grid;grid-template-columns:1fr 1fr;gap:8px}'+
      '.fg label{font-size:11px;color:#555;font-weight:bold;display:flex;flex-direction:column;gap:3px}'+
      '.fg input,.fg select{padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box;width:100%}'+
      '.fg input:focus,.fg select:focus{outline:none;border-color:#2980b9;box-shadow:0 0 0 2px rgba(41,128,185,.15)}'+
      '.full{grid-column:1/-1}'+
      '.mbtns{margin-top:14px;display:flex;justify-content:flex-end;gap:8px}'+
      '.mbtns button{padding:8px 18px;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:bold}'+
      '.btn-save{background:#27ae60;color:white}'+
      '.btn-cancel{background:#bdc3c7;color:#333}'+
      '.be{padding:3px 7px;border:none;background:#8e44ad;color:white;border-radius:3px;cursor:pointer;font-size:11px;margin-right:2px}'+
      '.bd{padding:3px 7px;border:none;background:#c0392b;color:white;border-radius:3px;cursor:pointer;font-size:11px}'+
      'button.tab-btn{padding:5px 12px;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold;background:rgba(255,255,255,.2);color:white}'+
      'button.tab-btn.active{background:white;color:#1a5276}'+
      'th.fuel-hdr{background:#6c3483;font-size:10px}';

    var scriptData =
      'var _rows='+rowsJson+';'+
      'var _editIdx=null;'+
      'var _fp="ITLIV";'+
      'var _fuelPerc='+fuelPercJ+';'+
      'var _LS_ADD="'+LS_ADDIZIONALI+'";'+
      'var _LS_FP="'+LS_FUEL_PERC+'";'+
      'var _LS="'+LS_LISTINO_BASE+'";'+
      'var _GID="'+GIST_ID+'";'+
      'var _GF="'+GIST_FILE_BASE+'";'+
      'var _GF_LIV="'+GIST_FILE_CRT_LIV+'";'+
      'var _GF_SPE="'+GIST_FILE_CRT_SPE+'";'+
      'var _TK="'+LS_TOKEN+'";'+
      'var _colMap='+colMapJ+';'+
      'var _LS_COLS="'+LS_CRT_COLS+'";'+
      'var _importedFilename='+importedFilenameJ+';';

    var scriptLogic = "function _fetchGistFile(fileObj,tok){if(!fileObj)return Promise.resolve([]);if(!fileObj.truncated){try{return Promise.resolve(JSON.parse(fileObj.content).rows||[]);}catch(e){return Promise.resolve([]);}}return fetch(fileObj.raw_url).then(function(r){return r.ok?r.json():{};}).then(function(d){return d.rows||[];}).catch(function(){return[];});}function _crtComp(rows){return rows.map(function(r){var o={p:r.porto,c:r.cap||\"\",v:r.prov||\"\",l:r.localita||\"\"};if(r.km)o.k=r.km;if(r.costo_20)o.t2=r.costo_20;if(r.costo_40)o.t4=r.costo_40;if(r.costo_hc)o.th=r.costo_hc;return o;});}function _crtDecomp(rows){return rows.map(function(r){return{porto:r.porto||r.p||\"\",cap:r.cap||r.c||\"\",prov:r.prov||r.v||\"\",localita:r.localita||r.l||\"\",km:r.km||r.k||\"\",costo_20:r.costo_20||r.t2||\"\",costo_40:r.costo_40||r.t4||\"\",costo_hc:r.costo_hc||r.th||\"\"};});}function saveLSCRT(rows,filename){var fn=filename!==undefined?filename:_importedFilename;_importedFilename=fn;if(window.opener&&window.opener._gccSetCrtRows)try{window.opener._gccSetCrtRows(rows.slice());}catch(e){}var badge=document.getElementById(\"save-badge\");if(badge)badge.textContent=rows.length+\" tariffe\";var tok=localStorage.getItem(_TK);if(!tok)return;var byPorto={\"ITLIV\":[],\"ITSPE\":[]};rows.forEach(function(r){var p=r.porto||\"ITLIV\";if(byPorto[p])byPorto[p].push(r);});var gFiles={};if(byPorto.ITLIV.length)gFiles[_GF_LIV]={content:JSON.stringify({rows:byPorto.ITLIV,filename:fn,updated_at:new Date().toISOString()},null,2)};if(byPorto.ITSPE.length)gFiles[_GF_SPE]={content:JSON.stringify({rows:byPorto.ITSPE,filename:fn,updated_at:new Date().toISOString()},null,2)};if(!Object.keys(gFiles).length)return;fetch(\"https://api.github.com/gists/\"+_GID,{method:\"PATCH\",headers:{\"Authorization\":\"token \"+tok,\"Content-Type\":\"application/json\"},body:JSON.stringify({files:gFiles})}).then(function(){var b=document.getElementById(\"save-badge\");if(b)b.textContent=rows.length+\" tariffe \u2713\";}).catch(function(){});}function tcell(v){if(!v&&v!==0)return'<td class=\"tna\">-</td>';var n=parseFloat(v);var d=(!isNaN(n)&&v!=='')?Math.round(n):v;return'<td class=\"tc\">'+d+'</td>';}function getFuelPerc(){var fp=_fuelPerc;try{var ra=localStorage.getItem(_LS_ADD);if(ra){var fp2=parseFloat(JSON.parse(ra).fuel_perc||0);if(fp2>0)fp=fp2;}if(!fp){var rf=localStorage.getItem(_LS_FP);if(rf)fp=parseFloat(rf)||0;}}catch(e){}return fp;}function tfcell(base,perc){if(!base)return'<td class=\"tna\">-</td>';var b=parseFloat(base);if(isNaN(b)||b<=0)return'<td class=\"tna\">-</td>';if(!perc||perc<=0)return'<td class=\"tna\">-</td>';var tot=Math.round(b*(1+perc/100));return'<td class=\"tf\">\\u20ac'+tot+'</td>';}function renderTable(){var filter=(document.getElementById(\"search\").value||\"\").toLowerCase();var html=\"\";var count=0;_rows.forEach(function(r,i){if((r.porto||\"\")!==_fp)return;var s=[r.cap,r.prov,r.localita,r.km].join(\" \").toLowerCase();if(filter&&!s.includes(filter))return;count++;html+='<tr>';html+='<td style=\"color:#aaa;font-size:10px\">'+count+'</td>';html+='<td>'+(r.cap||'')+'</td>';html+='<td>'+(r.prov||'').toUpperCase()+'</td>';html+='<td style=\"font-weight:bold\">'+(r.localita||'')+'</td>';var fp=getFuelPerc();html+=tcell(r.km);html+=tcell(r.costo_20);html+=tfcell(r.costo_20,fp);html+=tcell(r.costo_40);html+=tfcell(r.costo_40,fp);html+='<td><button class=\"be\" data-i=\"'+i+'\">&#x270F;</button><button class=\"bd\" data-i=\"'+i+'\">Canc</button></td>';html+='</tr>';});document.getElementById(\"tbody\").innerHTML=html;var tot=_rows.filter(function(r){return(r.porto||\"\")===_fp;}).length;var fpL=getFuelPerc();var fl=fpL>0?\" \\u2014 Fuel: \"+fpL+\"%\":\"\";var liv=_rows.filter(function(r){return r.porto===\"ITLIV\";}).length;var spe=_rows.filter(function(r){return r.porto===\"ITSPE\";}).length;document.getElementById(\"nrows\").textContent=\"Visualizzate: \"+count+\" / \"+tot+\" \\u2014 LIV: \"+liv+\" | SPE: \"+spe+fl;}function apriFormCRT(idx){_editIdx=idx;var r=idx>=0?_rows[idx]:{};document.getElementById(\"m-titolo\").textContent=idx>=0?\"Modifica tariffa\":\"Nuova tariffa\";[\"porto\",\"cap\",\"prov\",\"localita\",\"km\",\"costo_20\",\"costo_40\",\"costo_hc\"].forEach(function(f){var el=document.getElementById(\"cf-\"+f);if(el)el.value=r[f]||\"\";});if(idx<0){var elp=document.getElementById(\"cf-porto\");if(elp&&_fp)elp.value=_fp;}document.getElementById(\"overlay\").classList.add(\"show\");}function chiudiFormCRT(){document.getElementById(\"overlay\").classList.remove(\"show\");_editIdx=null;}function salvaFormCRT(){var r={};[\"porto\",\"cap\",\"prov\",\"localita\",\"km\",\"costo_20\",\"costo_40\",\"costo_hc\"].forEach(function(f){var el=document.getElementById(\"cf-\"+f);r[f]=el?el.value.trim():\"\";});if(!r.localita){alert(\"La Localit\\u00e0 \\u00e8 obbligatoria.\");return;}if(_editIdx>=0){_rows[_editIdx]=r;}else{_rows.push(r);}saveLSCRT(_rows);chiudiFormCRT();renderTable();}function cancellaCRT(idx){if(!confirm(\"Cancellare questa tariffa?\"))return;_rows.splice(idx,1);saveLSCRT(_rows);renderTable();}function parseEuro(v){if(v===null||v===undefined)return\"\";if(typeof v===\"number\")return isNaN(v)?\"\":String(v);var s=String(v).replace(/[\\u20ac$\\s]/g,\"\").replace(\",\",\".\").trim();return isNaN(parseFloat(s))?\"\":s;}function mostraConfigColonne(){var ov=document.getElementById(\"col-overlay\");if(ov){ov.remove();return;}ov=document.createElement(\"div\");ov.id=\"col-overlay\";ov.style.cssText=\"position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;\";var flds=[{k:\"cap\",l:\"Colonna CAP\"},{k:\"prov\",l:\"Colonna Provincia\"},{k:\"localita\",l:\"Colonna Localit\\u00e0\"},{k:\"km\",l:\"Colonna KM A/R\"},{k:\"c20\",l:\"Costo 20ft\"},{k:\"c40\",l:\"Costo 40ft/HT\"}];var rh=\"\";flds.forEach(function(fd){rh+='<label style=\"display:flex;flex-direction:column;gap:3px;font-size:11px;color:#555;font-weight:bold\">'+fd.l+'<input id=\"col-'+fd.k+'\" type=\"text\" value=\"'+(_colMap[fd.k]||'')+'\" style=\"padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box;\"/></label>';});ov.innerHTML='<div style=\"background:white;border-radius:10px;padding:24px;width:460px;max-width:96vw;box-shadow:0 8px 32px rgba(0,0,0,.3)\">'+'<h3 style=\"margin:0 0 8px;color:#1a5276;font-size:15px\">\\u2699\\ufe0f Mapping colonne Excel</h3>'+'<p style=\"font-size:11px;color:#888;margin:0 0 12px\">Inserisci i nomi esatti delle intestazioni del file Excel.</p>'+'<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px\">'+rh+'</div>'+'<div style=\"display:flex;justify-content:flex-end;gap:8px\">'+'<button id=\"col-annulla\" style=\"padding:8px 18px;border:none;border-radius:5px;cursor:pointer;background:#bdc3c7;color:#333;font-size:13px;font-weight:bold\">Annulla</button>'+'<button id=\"col-salva\" style=\"padding:8px 18px;border:none;border-radius:5px;cursor:pointer;background:#27ae60;color:white;font-size:13px;font-weight:bold\">Salva</button>'+'</div></div>';document.body.appendChild(ov);ov.addEventListener(\"click\",function(e){if(e.target.id===\"col-annulla\"||e.target===ov){ov.remove();return;}if(e.target.id===\"col-salva\"){var nm={};[\"cap\",\"prov\",\"localita\",\"km\",\"c20\",\"c40\"].forEach(function(k){var el=document.getElementById(\"col-\"+k);nm[k]=el?el.value.trim():\"\";});_colMap=nm;try{localStorage.setItem(_LS_COLS,JSON.stringify(nm));}catch(e){}ov.remove();alert(\"Mapping colonne salvato.\");}});}var _inputXls=document.createElement(\"input\");_inputXls.type=\"file\";_inputXls.accept=\".xlsx,.xls\";_inputXls.style.display=\"none\";document.body.appendChild(_inputXls);_inputXls.addEventListener(\"change\",function(){var f=_inputXls.files[0];if(!f)return;var fname=f.name;var reader=new FileReader();reader.onload=function(ev){try{var wb=XLSX.read(new Uint8Array(ev.target.result),{type:\"array\"});var nuove=[];var colWarnings=[];var perPorto={};wb.SheetNames.forEach(function(sn){var pc=null;var snl=sn.toLowerCase().trim();if(snl===\"livorno\"||snl.indexOf(\"livorno\")>=0)pc=\"ITLIV\";else if(snl===\"la spezia\"||snl.indexOf(\"spezia\")>=0)pc=\"ITSPE\";if(!pc){perPorto[\"? \"+sn]=0;return;}var rr=XLSX.utils.sheet_to_json(wb.Sheets[sn],{defval:\"\",raw:true});if(!rr.length)return;var fileKeys=Object.keys(rr[0]).map(function(k){return k.trim();});var missing=[];Object.keys(_colMap).forEach(function(k){var exp=_colMap[k];if(exp&&fileKeys.indexOf(exp)<0)missing.push(k+\" (\\u201c\"+exp+\"\\u201d)\");});if(missing.length)colWarnings.push(\"Foglio \\\"\"+sn+\"\\\": \"+missing.join(\", \"));var cnt=0;rr.forEach(function(rowRaw){var row={};Object.keys(rowRaw).forEach(function(k){row[k.trim()]=rowRaw[k];});var cap=String(row[_colMap.cap]||row[\"CAP\"]||row[\"cap\"]||\"\").trim();var prov=String(row[_colMap.prov]||row[\"Prov\"]||row[\"prov\"]||\"\").trim();var loc=String(row[_colMap.localita]||row[\"Localit\\u00e0\"]||row[\"Localita\"]||row[\"localita\"]||\"\").trim();var km=parseEuro(row[_colMap.km]||row[\"KM\"]||row[\"km\"]||0);var c20=parseEuro(row[_colMap.c20]||row[\"costo_20\"]||0);var c40=parseEuro(row[_colMap.c40]||row[\"costo_40\"]||0);var chc=parseEuro(row[\"HC\"]||row[\"costo_hc\"]||0);if(loc&&loc!==\"0\"&&loc!==\"\"){nuove.push({porto:pc,cap:cap,prov:prov,localita:loc,km:km,costo_20:c20,costo_40:c40,costo_hc:chc});cnt++;}});perPorto[pc+(pc===\"ITLIV\"?\" (Livorno)\":\" (La Spezia)\")]=cnt;});var unkSheets=Object.keys(perPorto).filter(function(k){return k.indexOf(\"?\")===0;});if(unkSheets.length)alert(\"Fogli non riconosciuti (ignorati):\\n\"+unkSheets.map(function(k){return k.slice(2);}).join(\", \")+\"\\n\\nNomi attesi: Livorno, La Spezia\");if(colWarnings.length){var proceed=confirm(\"\\u26a0 Colonne non trovate:\\n\\n\"+colWarnings.join(\"\\n\")+\"\\n\\nVerifica \\u2699 Colonne. Continuare?\");if(!proceed)return;}if(!nuove.length){alert(\"Nessuna tariffa trovata.\\nFogli riconosciuti: \"+Object.keys(perPorto).filter(function(k){return k.indexOf(\"?\")<0;}).join(\", \"));return;}var riepilogo=Object.keys(perPorto).filter(function(k){return k.indexOf(\"?\")<0;}).map(function(k){return k+\": \"+perPorto[k]+\" righe\";}).join(\"\\n\");if(confirm(\"Trovate \"+nuove.length+\" tariffe da \\\"\"+fname+\"\\\":\\n\\n\"+riepilogo+\"\\n\\nOK = Sostituisci tutto\\nAnnulla = Aggiungi a esistenti\")){_rows=nuove;}else{_rows=_rows.concat(nuove);}renderTable();var fnLabel=document.getElementById(\"imported-fn\");if(fnLabel)fnLabel.textContent=fname;if(window.opener&&window.opener._gccSetCrtRows)try{window.opener._gccSetCrtRows(_rows.slice());}catch(e){}var tok2=localStorage.getItem(_TK);var byP={\"ITLIV\":[],\"ITSPE\":[]};_rows.forEach(function(r){var p=r.porto||\"ITLIV\";if(byP[p])byP[p].push(r);});var gF={};if(byP.ITLIV.length)gF[_GF_LIV]={content:JSON.stringify({rows:byP.ITLIV,filename:fname,updated_at:new Date().toISOString()},null,2)};if(byP.ITSPE.length)gF[_GF_SPE]={content:JSON.stringify({rows:byP.ITSPE,filename:fname,updated_at:new Date().toISOString()},null,2)};var badge=document.getElementById(\"save-badge\");if(badge)badge.textContent=\"\u23f3 Salvataggio Gist...\";_importedFilename=fname;if(tok2&&Object.keys(gF).length){fetch(\"https://api.github.com/gists/\"+_GID,{method:\"PATCH\",headers:{\"Authorization\":\"token \"+tok2,\"Content-Type\":\"application/json\"},body:JSON.stringify({files:gF})}).then(function(resp){if(!resp.ok)throw new Error(\"HTTP \"+resp.status);return resp.json();}).then(function(){if(badge)badge.textContent=_rows.length+\" tariffe \u2713 Gist\";alert(\"Importate \"+nuove.length+\" tariffe da \\\"\"+fname+\"\\\":\\n\\n\"+riepilogo+\"\\n\\n\u2705 Salvato sul Gist.\");}).catch(function(e){if(badge)badge.textContent=_rows.length+\" tariffe \u26a0 Gist fallito\";alert(\"Importate \"+nuove.length+\" tariffe.\\n\\n\u26a0 Salvataggio Gist fallito: \"+e.message+\"\\nRiprova con il pulsante Sync.\");});}else{alert(\"Importate \"+nuove.length+\" tariffe da \\\"\"+fname+\"\\\":\\n\\n\"+riepilogo+\"\\n\\n\u26a0 Token non configurato: i dati non sono sul Gist.\");}}catch(e){alert(\"Errore lettura file: \"+e.message);}};reader.readAsArrayBuffer(f);});function syncDaGistCRT(){var tok=localStorage.getItem(_TK);if(!tok){alert(\"Token non configurato.\");return;}var badge=document.getElementById(\"save-badge\");if(badge)badge.textContent=\"\\u23f3 Sync...\";fetch(\"https://api.github.com/gists/\"+_GID,{headers:{\"Authorization\":\"token \"+tok,\"Accept\":\"application/vnd.github.v3+json\"}}).then(function(r){if(!r.ok)throw new Error(\"HTTP \"+r.status);return r.json();}).then(function(gd){var syncTok=localStorage.getItem(_TK);Promise.all([_fetchGistFile(gd.files[_GF_LIV],syncTok),_fetchGistFile(gd.files[_GF_SPE],syncTok)]).then(function(res){var livRows=res[0],speRows=res[1];if(!livRows.length&&!speRows.length){alert(\"Nessun tariffario CRT trovato sul Gist.\\nImporta prima un file Excel.\");return;}_rows=livRows.concat(speRows);if(window.opener&&window.opener._gccSetCrtRows)try{window.opener._gccSetCrtRows(_rows.slice());}catch(e){}renderTable();alert(\"Sync OK: LIV=\"+livRows.length+\" | SPE=\"+speRows.length+\" tariffe.\");});}).catch(function(e){alert(\"Errore sync: \"+e.message);});}function esportaExcelCRT(){var wb=XLSX.utils.book_new();var pm={\"ITLIV\":\"Livorno\",\"ITSPE\":\"La Spezia\"};Object.keys(pm).forEach(function(pc){var rr=_rows.filter(function(r){return(r.porto||\"\")===pc;});if(!rr.length)return;var data=[[\"CAP\",\"Prov\",\"Localit\\u00e0\",\"DIST KM A/R\",\"20ft\",\"40ft/HT\",\"40 HC\"]];rr.forEach(function(r){data.push([r.cap||\"\",r.prov||\"\",r.localita||\"\",r.km||\"\",r.costo_20||\"\",r.costo_40||\"\",r.costo_hc||\"\"]);});XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),pm[pc]);});XLSX.writeFile(wb,\"tariffario_crt_\"+new Date().toISOString().slice(0,10)+\".xlsx\");}document.addEventListener(\"click\",function(e){var t=e.target.classList?e.target:(e.target.parentNode||e.target);if(t.id===\"btn-nuova-crt\"){apriFormCRT(-1);}if(t.id===\"btn-carica-excel-crt\"){_inputXls.value=\"\";_inputXls.click();}if(t.id===\"btn-config-cols\"){mostraConfigColonne();}if(t.id===\"btn-export-crt\"){esportaExcelCRT();}if(t.id===\"btn-sync-crt\"){syncDaGistCRT();}if(t.classList&&t.classList.contains(\"be\")){apriFormCRT(parseInt(t.dataset.i));}if(t.classList&&t.classList.contains(\"bd\")){cancellaCRT(parseInt(t.dataset.i));}if(t.id===\"btn-annulla-crt\"||t.id===\"overlay\"){chiudiFormCRT();}if(t.id===\"btn-salva-crt\"){salvaFormCRT();}if(t.classList&&t.classList.contains(\"tab-btn\")){document.querySelectorAll(\".tab-btn\").forEach(function(b){b.classList.remove(\"active\");});t.classList.add(\"active\");_fp=t.dataset.porto;renderTable();}});document.getElementById(\"search\").addEventListener(\"input\",renderTable);renderTable();if(!_rows.length){var autoTok=localStorage.getItem(_TK);if(autoTok){var tbody=document.getElementById(\"tbody\");if(tbody)tbody.innerHTML='<tr><td colspan=\"10\" style=\"text-align:center;padding:20px;color:#888\">\\u23f3 Caricamento tariffario dal Gist...</td></tr>';fetch(\"https://api.github.com/gists/\"+_GID,{headers:{\"Authorization\":\"token \"+autoTok,\"Accept\":\"application/vnd.github.v3+json\"}}).then(function(r){return r.ok?r.json():null;}).then(function(gd){if(!gd)return;var autoTokF=localStorage.getItem(_TK);Promise.all([_fetchGistFile(gd.files[_GF_LIV],autoTokF),_fetchGistFile(gd.files[_GF_SPE],autoTokF)]).then(function(res){var liv=res[0],spe=res[1];if(!liv.length&&!spe.length){var tb2=document.getElementById(\"tbody\");if(tb2)tb2.innerHTML='<tr><td colspan=\"10\" style=\"text-align:center;padding:30px;color:#c0392b\">\u26a0\ufe0f Nessun tariffario CRT trovato sul Gist.<br><span style=\"font-size:12px;color:#888\">Usa <b>Carica Excel</b> per importare il tariffario.</span></td></tr>';return;}_rows=liv.concat(spe);if(window.opener&&window.opener._gccSetCrtRows)try{window.opener._gccSetCrtRows(_rows.slice());}catch(e){}renderTable();});}).catch(function(){});}}";

    // Intestazioni: 20' | 20'+fuel | 40'/HT | 40'+fuel | HC suppl | Azioni
    var fuelLabel = fuelPerc > 0 ? ' (+'+fuelPerc+'% fuel)' : ' (+fuel)';
    var thH =
      '<th>#</th><th>CAP</th><th>Prov</th><th>Localit\u00e0</th>'+
      '<th>KM A/R</th>'+
      '<th>20\'</th><th class="fuel-hdr">20\''+fuelLabel+'</th>'+
      '<th>40\'/HT</th><th class="fuel-hdr">40\''+fuelLabel+'</th>'+
      '<th>Azioni</th>';

    // Blob URL: stessa origin della pagina padre → localStorage condiviso
    var _crtHtml = [
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tariffario C.R.T.</title>',
      '<style>'+cssC+'</style></head><body>',
      '<div id="topbar">',
        '<h2>&#x1F4CA; Tariffario C.R.T.</h2>',
        '<div id="topbar-right">',
          '<div id="tabs">',
            '<button class="tab-btn active" data-porto="ITLIV">Livorno</button>',
            '<button class="tab-btn" data-porto="ITSPE">La Spezia</button>',
            '</div>',
          '<input id="search" placeholder="\uD83D\uDD0D Filtra..."/>',
          '<button class="tbtn" id="btn-sync-crt" style="background:#2980b9" title="Carica tariffe dal Gist (sovrascrive dati attuali)">↓ Da Gist</button>',
          '<button class="tbtn" id="btn-nuova-crt" style="background:#27ae60">+ Nuova</button>',
          '<button class="tbtn" id="btn-carica-excel-crt" style="background:#e67e22">Carica Excel</button>',
          '<button class="tbtn" id="btn-config-cols" style="background:#7d6608" title="Configura mapping colonne Excel">\u2699 Colonne</button>',
          '<button class="tbtn" id="btn-export-crt" style="background:#16a085">Esporta Excel</button>',
      '<span id="save-badge" style="font-size:10px;color:rgba(255,255,255,.7);margin-left:4px"></span>',
        '</div>',
      '</div>',
      '<div id="table-wrap">',
        '<table><thead><tr>'+thH+'</tr></thead><tbody id="tbody"></tbody></table>',
        '<div id="nrows"></div>',
        '<div style="font-size:10px;color:#8e44ad;margin-top:5px;padding-left:2px">&#x1F4C2; File: <span id="imported-fn">'+importedFilename+'</span></div>',
      '</div>',
      '<div id="overlay">',
        '<div id="modale">',
          '<h3 id="m-titolo">Nuova tariffa</h3>',
          '<div class="sep"></div>',
          '<div class="fg">',
            '<label>Porto<select id="cf-porto">',
              '<option value="ITLIV">Livorno</option>',
              '<option value="ITSPE">La Spezia</option>',
            '</select></label>',
            '<label>CAP<input type="text" id="cf-cap" maxlength="10" placeholder="es. 19100"></label>',
            '<label>Prov<input type="text" id="cf-prov" maxlength="5" placeholder="es. SP"></label>',
            '<label class="full">Localit\u00e0<input type="text" id="cf-localita" placeholder="es. La Spezia"></label>',
            '<label>KM A/R<input type="number" id="cf-km" min="0" placeholder="es. 18"></label>',
            '<label class="full" style="border-top:2px solid #ebf5fb;padding-top:8px;margin-top:4px;font-size:11px;color:#1a5276;text-transform:uppercase;letter-spacing:.5px">Tariffe</label>',
            '<label>Costo 20\' (&euro;)<input type="number" id="cf-costo_20" min="0" step="0.01" placeholder="es. 361"></label>',
            '<label>Costo 40\'/HT (&euro;)<input type="number" id="cf-costo_40" min="0" step="0.01" placeholder="es. 381"></label>',
            '<label>Suppl. HC (&euro;)<input type="number" id="cf-costo_hc" min="0" step="0.01" placeholder="es. 30"></label>',
          '</div>',
          '<div class="mbtns">',
            '<button class="btn-cancel" id="btn-annulla-crt">Annulla</button>',
            '<button class="btn-save" id="btn-salva-crt">Salva</button>',
          '</div>',
        '</div>',
      '</div>',
      '<script>'+scriptData+'<\/script>',
      '<script>(function(){',
        'var s=document.createElement("script");',
        's.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";',
        's.onload=function(){'+scriptLogic+'};',
        'document.head.appendChild(s);',
      '})();<\/script>',
      '</body></html>'
    ].join('');
    var _crtBlob = new Blob([_crtHtml], {type: 'text/html;charset=utf-8'});
    var _crtUrl  = URL.createObjectURL(_crtBlob);
    var popup = window.open('', 'tcp_crt', 'width=1200,height=720,scrollbars=yes,resizable=yes');
    popup.location.replace(_crtUrl);
    setTimeout(function(){ URL.revokeObjectURL(_crtUrl); }, 8000);
  }

  function apriGestioneVettori() {
    panel.style.display = 'none';

    // Notifica main page quando i dati cambiano
    window._gccOnVettoriSaved = function(reg) {
      // il main page può leggere dal Gist quando serve
    };
    // Chiamata dal popup vettori dopo ogni import tariffe
    window._gccOnVettoriTariffeUpdated = function(id, rows, add, colMap) {
      if (rows) _gcc_vettori_tariffe[id] = rows;
      var _v = _gcc_vettori_reg.filter(function(x){ return x.id===id; })[0];
      if (_v && add)    _v.add    = add;
      if (_v && colMap) _v.colMap = colMap;
      console.log('[GCC] Vettore ' + id + ' aggiornato: ' + (rows||[]).length + ' righe');
    };

    // Script iniziale: inietta valori runtime tramite concatenazione JS
    var _initVars = 'var _GID="' + GIST_ID + '";'
      + 'var _TK_KEY="' + LS_TOKEN + '";'
      + 'var _REG_FILE="' + GIST_FILE_VETTORI_REG + '";';

    // Funzioni del popup (statica, nessun valore runtime)
    var _fns = "\nvar _registry=[], _selected=null, _tariffe={}, _colMap={};\n\nfunction u(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}\n\n/* \u2500\u2500 Sidebar \u2500\u2500 */\nfunction renderSidebar(){\n  var h='';\n  _registry.forEach(function(v){\n    var b='';\n    if(v.porti.indexOf('ITSPE')>=0)b+='<span class=\"badge badge-spe\">SPE</span>';\n    if(v.porti.indexOf('ITLIV')>=0)b+='<span class=\"badge badge-liv\">LIV</span>';\n    if(v.tipo!=='localita')b+='<span class=\"badge badge-km\">KM</span>';\n    h+='<div class=\"vitem'+(_selected===v.id?' active':'')+'\" onclick=\"selectV(\\''+v.id+'\\')\">'\n      +'<span class=\"vname\">'+u(v.nome)+'</span><div class=\"vbadges\">'+b+'</div></div>';\n  });\n  document.getElementById('vlist').innerHTML=h||'<div style=\"padding:12px;font-size:12px;color:#bbb\">Nessun vettore. Usa + Nuovo o Sync Gist.</div>';\n}\n\n/* \u2500\u2500 Editor \u2500\u2500 */\nfunction selectV(id){\n  _selected=id;\n  renderSidebar();\n  var v=_registry.find(function(x){return x.id===id;});\n  if(!v)return;\n  renderEditor(v);\n}\n\nfunction renderEditor(v){\n  var add=v.add||{};\n  var rows=_tariffe[v.id]||[];\n  var isKm=v.tipo!=='localita';\n  var cm=v.colMap||{localita:'Localita',cap:'CAP',prov:'Prov',km:'KM',c20:'C20',c40:'C40'};\n\n  var addFlds=[\n    {k:'fuel_perc',l:'Fuel %',u:'%',h:'Sul costo base'},\n    {k:'hc',l:'HC',u:'\u20ac'},{k:'adr',l:'ADR',u:'\u20ac'},{k:'vgm',l:'VGM',u:'\u20ac'},\n    {k:'extra_stop',l:'Extra Stop',u:'\u20ac'},{k:'notte',l:'Sosta Notte',u:'\u20ac'},\n    {k:'congestion_liv',l:'Congestion Livorno',u:'\u20ac'},{k:'congestion_spe',l:'Congestion La Spezia',u:'\u20ac'},\n    {k:'reefer_perc',l:'Reefer %',u:'%',h:'Su base+fuel'}\n  ];\n  if(isKm)addFlds=addFlds.concat([\n    {k:'km_min',l:'Minimo KM',u:'km',h:'km reali < soglia \u2192 addebita per soglia (0 = nessuno)'},\n    {k:'cost_min',l:'Minimo addebito',u:'\u20ac',h:'costo < soglia \u2192 applica soglia come minimo (0 = nessuno)'}\n  ]);\n  var addH='<div class=\"row3\">';\n  addFlds.forEach(function(f){\n    addH+='<label class=\"field\"><span class=\"lbl\">'+f.l+(f.h?' <span class=\"hint\">&#8212; '+f.h+'</span>':'')+' <span class=\"unit\">'+f.u+'</span></span>'\n      +'<input type=\"number\" class=\"add-field\" data-key=\"'+f.k+'\" min=\"0\" step=\"0.01\" value=\"'+(add[f.k]||'')+'\" placeholder=\"0\"></label>';\n  });\n  addH+='</div>';\n\n  /* Tariff preview */\n  var prevH='';\n  if(rows.length){\n    if(isKm){\n      prevH='<table class=\"tt\"><thead><tr><th>KM</th><th>Costo 20\\'</th><th>Costo 40\\'</th></tr></thead><tbody>';\n      rows.slice(0,15).forEach(function(r){prevH+='<tr><td>'+r.km+'</td><td>\u20ac'+r.c20+'</td><td>\u20ac'+r.c40+'</td></tr>';});\n    }else{\n      prevH='<table class=\"tt\"><thead><tr><th>Localit&#xE0;</th><th>Prov</th><th>CAP</th><th>KM</th><th>20\\'</th><th>40\\'</th></tr></thead><tbody>';\n      rows.slice(0,15).forEach(function(r){prevH+='<tr><td>'+u(r.localita||'')+'</td><td>'+(r.prov||'')+'</td><td>'+(r.cap||'')+'</td><td>'+(r.km||'')+'</td><td>\u20ac'+(r.c20||'')+'</td><td>\u20ac'+(r.c40||'')+'</td></tr>';});\n    }\n    prevH+='</tbody></table>';\n    if(rows.length>15)prevH+='<div class=\"more\">...+'+(rows.length-15)+' righe</div>';\n  }else{\n    prevH='<div class=\"empty-rows\">Nessun tariffario. Importa un file Excel.</div>';\n  }\n\n  /* Mapping colonne (solo tipo localita) */\n  var _cm=v.colMap||{};\n  var _isKm=isKm;\n  var _mapFlds=_isKm\n    ?[{k:'km',l:'KM'},\n      {k:'c20',l:'Costo 20\\'\"'},{k:'c40',l:'Costo 40\\' (vuoto=usa 20\\')'}]\n    :[{k:'localita',l:'Localit\\u00e0'},{k:'cap',l:'CAP'},{k:'prov',l:'Prov'},\n      {k:'km',l:'KM A/R'},{k:'c20',l:'Costo 20\\'\"'},{k:'c40',l:'Costo 40\\''}];\n  var _mapNote=_isKm\n    ?'Inserisci il nome della colonna KM del file. Costo 40\\' vuoto = usa Costo 20\\' per tutti i tipi container.'\n    :'Inserisci il nome esatto dell\\'intestazione Excel.';\n  var _mapIn='';\n  _mapFlds.forEach(function(f){\n    _mapIn+='<label class=\"field\"><span class=\"lbl\">'+f.l+'</span>'\n      +'<input type=\"text\" class=\"col-field\" data-key=\"'+f.k+'\" '\n      +'value=\"'+(_cm[f.k]||'')+'\" placeholder=\"colonna nel file Excel\"></label>';\n  });\n  var mapH='<div id=\"colmap-panel\" style=\"display:none\">';\n  mapH+='<div class=\"card-title\" style=\"margin-top:10px\">Mapping colonne Excel</div>';\n  mapH+='<p style=\"font-size:11px;color:#888;margin-bottom:8px\">'+_mapNote+'</p>';\n  mapH+='<div class=\"row2\" style=\"margin-bottom:8px\">'+_mapIn+'</div>';\n  mapH+='<button class=\"btn btn-sm btn-save\" onclick=\"saveColMap()\">Salva mapping</button></div>';\n\n  document.getElementById('editor').className='';\n  document.getElementById('editor').innerHTML=\n    '<div class=\"card\">'\n    +'<div class=\"card-title\">Anagrafica</div>'\n    +'<div class=\"row2\" style=\"margin-bottom:10px\">'\n    +'<label class=\"field\"><span class=\"lbl\">Nome vettore</span><input type=\"text\" id=\"v-nome\" value=\"'+u(v.nome)+'\"></label>'\n    +'<div><div class=\"lbl\" style=\"margin-bottom:6px\">Tipo tariffario</div>'\n    +'<div class=\"radios\">'\n    +'<label><input type=\"radio\" name=\"v-tipo\" value=\"localita\"'+(v.tipo==='localita'?' checked':'')+'>Per Localit&#xE0;</label>'\n    +'<label><input type=\"radio\" name=\"v-tipo\" value=\"km_nuovo\"'+(v.tipo==='km_nuovo'?' checked':'')+'>KM (nuovo dist.)</label>'\n    +'<label><input type=\"radio\" name=\"v-tipo\" value=\"km_vecchio\"'+(v.tipo==='km_vecchio'?' checked':'')+'>KM (vecchio dist.)</label>'\n    +'</div></div></div>'\n    +'<div class=\"lbl\" style=\"margin-bottom:6px\">Porti operativi</div>'\n    +'<div class=\"checks\">'\n    +'<label><input type=\"checkbox\" id=\"v-spe\"'+(v.porti.indexOf('ITSPE')>=0?' checked':'')+'>La Spezia</label>'\n    +'<label><input type=\"checkbox\" id=\"v-liv\"'+(v.porti.indexOf('ITLIV')>=0?' checked':'')+'>Livorno</label>'\n    +'</div>'\n    +'<label class=\"field\" style=\"margin-top:10px\"><span class=\"lbl\">Note</span>'\n    +'<textarea id=\"v-note\" rows=\"2\" style=\"padding:7px;border:1px solid #d0d7de;border-radius:5px;font-size:12px;width:100%;resize:vertical;box-sizing:border-box\">'+(v.note||'')+'</textarea></label>'\n    +'<div class=\"btn-row\" style=\"margin-top:12px\">'\n    +'<button class=\"btn btn-save\" onclick=\"saveAnagrafica()\">&#x1F4BE; Salva</button>'\n    +'<button class=\"btn btn-del\" onclick=\"deleteVettore()\">&#x1F5D1; Elimina</button>'\n    +'</div></div>'\n\n    +'<div class=\"card\">'\n    +'<div class=\"card-title\">Addizionali</div>'\n    +addH\n    +'<div class=\"btn-row\" style=\"margin-top:12px\">'\n    +'<button class=\"btn btn-save\" onclick=\"saveAddizionali()\">&#x1F4BE; Salva addizionali</button>'\n    +'</div></div>'\n\n    +'<div class=\"card\">'\n    +'<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:10px\">'\n    +'<div class=\"card-title\" style=\"margin:0\">Tariffario <span style=\"font-weight:normal;color:#aaa\">('+rows.length+' righe)</span></div>'\n    +'<div style=\"display:flex;gap:6px\">'\n    +'<button class=\"btn btn-sm\" style=\"background:#7d6608;color:white\" onclick=\"toggleColMap()\">&#x2699; Colonne</button>'\n    +'<input type=\"file\" id=\"inp-xls\" accept=\".xlsx,.xls\" style=\"display:none\" onchange=\"importExcel(this)\">'\n    +'<button class=\"btn btn-sm btn-imp\" onclick=\"document.getElementById(\\'inp-xls\\').click()\">&#x1F4C2; Carica Excel</button>'\n    +(rows.length?'<button class=\"btn btn-sm\" style=\"background:#7f8c8d;color:white\" onclick=\"clearTariffe()\">&#x2716; Svuota</button>':'')\n    +'</div></div>'\n    +mapH\n    +prevH\n    +'</div>';\n}\n\n/* \u2500\u2500 CRUD \u2500\u2500 */\nfunction saveAnagrafica(){\n  var v=_registry.find(function(x){return x.id===_selected;});if(!v)return;\n  v.nome=document.getElementById('v-nome').value.trim()||v.nome;\n  v.tipo=document.querySelector('input[name=\"v-tipo\"]:checked').value;\n  var noteEl=document.getElementById('v-note');if(noteEl)v.note=noteEl.value.trim();\n  v.porti=[];\n  if(document.getElementById('v-spe').checked)v.porti.push('ITSPE');\n  if(document.getElementById('v-liv').checked)v.porti.push('ITLIV');\n  pushRegistry();renderSidebar();setStatus('Anagrafica salvata \\u2713');\n}\nfunction saveAddizionali(){\n  var v=_registry.find(function(x){return x.id===_selected;});if(!v)return;\n  v.add={};\n  document.querySelectorAll('.add-field').forEach(function(el){v.add[el.dataset.key]=el.value.trim();});\n  pushRegistry();\n  pushTariffe(_selected); // notifica main page degli addizionali aggiornati\n  setStatus('Addizionali salvati \\u2713');\n}\nfunction saveColMap(){\n  var v=_registry.find(function(x){return x.id===_selected;});if(!v)return;\n  v.colMap={};\n  document.querySelectorAll('.col-field').forEach(function(el){v.colMap[el.dataset.key]=el.value.trim();});\n  pushRegistry();setStatus('Mapping colonne salvato \\u2713');\n}\nfunction toggleColMap(){\n  var p=document.getElementById('colmap-panel');\n  if(p)p.style.display=p.style.display==='none'?'block':'none';\n}\nfunction deleteVettore(){\n  if(!confirm('Eliminare '+(_registry.find(function(x){return x.id===_selected;})||{}).nome+'?'))return;\n  _registry=_registry.filter(function(x){return x.id!==_selected;});\n  _selected=null;\n  pushRegistry();renderSidebar();\n  document.getElementById('editor').className='empty';\n  document.getElementById('editor').innerHTML='<span>Seleziona un vettore</span>';\n  setStatus('Vettore eliminato');\n}\nfunction nuovoVettore(){\n  var nome=prompt('Nome del nuovo vettore:');if(!nome||!nome.trim())return;\n  var id=nome.trim().toLowerCase().replace(/[^a-z0-9]/g,'_')+'_'+Date.now().toString(36);\n  _registry.push({id:id,nome:nome.trim(),porti:['ITSPE'],tipo:'localita',add:{},colMap:{}});\n  pushRegistry();renderSidebar();selectV(id);\n}\nfunction clearTariffe(){\n  if(!confirm('Svuotare le tariffe?'))return;\n  _tariffe[_selected]=[];\n  pushTariffe(_selected);selectV(_selected);setStatus('Tariffe svuotate');\n}\n\n/* \u2500\u2500 Import Excel \u2500\u2500 */\nfunction importExcel(inp){\n  var f=inp.files[0];if(!f)return;\n  var v=_registry.find(function(x){return x.id===_selected;});\n  var isKm=v&&v.tipo!=='localita';\n  var cm=v.colMap||{localita:'Localita',cap:'CAP',prov:'Prov',km:'KM',c20:'C20',c40:'C40'};\n  var reader=new FileReader();\n  reader.onload=function(ev){\n    try{\n      var wb=XLSX.read(new Uint8Array(ev.target.result),{type:'array'});\n      var rows=[];\n      wb.SheetNames.forEach(function(sn){\n        var rr=XLSX.utils.sheet_to_json(wb.Sheets[sn],{defval:'',raw:true});\n        rr.forEach(function(r){\n          var row={};Object.keys(r).forEach(function(k){row[k.trim()]=r[k];});\n          if(isKm){\n            var cmap=v&&v.colMap||{};\n            var kmK=cmap.km||'km'; // singola colonna km\n            var c2K=cmap.c20||'C20';\n            var c4K=cmap.c40||'';\n            var gv2=function(r,k){return r[k]!==undefined?String(r[k]).trim():'';};\n            var kv=gv2(row,kmK)||gv2(row,'km')||gv2(row,'KM')||'';\n            var c2=gv2(row,c2K)||gv2(row,'COSTO')||gv2(row,'C20')||gv2(row,'costo_20')||'';\n            var c4=c4K?gv2(row,c4K):'';\n            if(kv&&c2)rows.push({km:kv,c20:c2,c40:c4||c2});\n}else{\n            var loc=String(row[cm.localita]||row['Localita']||row['localita']||row['Localit\\u00e0']||'').trim();\n            var cap=String(row[cm.cap]||row['CAP']||row['cap']||'').trim();\n            var prov=String(row[cm.prov]||row['Prov']||row['prov']||'').trim();\n            var km=String(row[cm.km]||row['KM']||row['km']||'').trim();\n            var c2=String(row[cm.c20]||row['C20']||row['c20']||row['costo_20']||'').trim();\n            var c4=String(row[cm.c40]||row['C40']||row['c40']||row['costo_40']||'').trim();\n            if(loc)rows.push({cap:cap,prov:prov,localita:loc,km:km,c20:c2,c40:c4});\n          }\n        });\n      });\n      if(!rows.length){alert('Nessuna riga trovata.\\nColonne attese:\\n'+(isKm?'KM_DA, KM_A, C20, C40':'Configura il mapping con \u2699 Colonne'));return;}\n      _tariffe[_selected]=rows;\n      pushTariffe(_selected);selectV(_selected);\n      setStatus('Importate '+rows.length+' tariffe \\u2713');\n    }catch(e){alert('Errore: '+e.message);}\n  };\n  reader.readAsArrayBuffer(f);inp.value='';\n}\n\n/* \u2500\u2500 Gist (unico storage) \u2500\u2500 */\nvar _pushing=false;\nfunction pushRegistry(){\n  if(window.opener&&window.opener._gccOnVettoriSaved)\n    try{window.opener._gccOnVettoriSaved(_registry);}catch(e){}\n  var tok=localStorage.getItem(_TK_KEY);if(!tok)return;\n  var content=JSON.stringify({vettori:_registry,updated_at:new Date().toISOString()},null,2);\n  var files={};files[_REG_FILE]={content:content};\n  _push(files);\n}\nfunction pushTariffe(id){\n  var v=_registry.find(function(x){return x.id===id;});if(!v)return;\n  var fname='tcp_vettore_'+id+'.json';\n  var content=JSON.stringify({id:id,nome:v.nome,tipo:v.tipo,porti:v.porti,add:v.add||{},colMap:v.colMap||{},rows:_tariffe[id]||[],updated_at:new Date().toISOString()},null,2);\n  var files={};files[fname]={content:content};\n  // Notifica il main page: rows + add + colMap tutti aggiornati\n  if(window.opener&&window.opener._gccOnVettoriTariffeUpdated)\n    try{window.opener._gccOnVettoriTariffeUpdated(id,_tariffe[id]||[],v.add||{},v.colMap||{});}catch(e){}\n  _push(files);\n}\nfunction _push(files){\n  var tok=localStorage.getItem(_TK_KEY);if(!tok){setStatus('\\u26A0 Token non configurato');return;}\n  setStatus('\\u23F3 Salvataggio Gist...');\n  fetch('https://api.github.com/gists/'+_GID,{\n    method:'PATCH',\n    headers:{'Authorization':'token '+tok,'Content-Type':'application/json'},\n    body:JSON.stringify({files:files})\n  }).then(function(r){setStatus(r.ok?'\\u2705 Gist aggiornato':'\\u26A0 Gist errore '+r.status);})\n   .catch(function(e){setStatus('\\u26A0 '+e.message);});\n}\nfunction syncFromGist(){\n  var tok=localStorage.getItem(_TK_KEY);if(!tok){alert('Token non configurato.');return;}\n  setStatus('\\u23F3 Caricamento dal Gist...');\n  fetch('https://api.github.com/gists/'+_GID,{\n    headers:{'Authorization':'token '+tok,'Accept':'application/vnd.github.v3+json'}\n  }).then(function(r){return r.ok?r.json():null;})\n  .then(function(gd){\n    if(!gd){setStatus('\\u26A0 Errore accesso Gist');return;}\n    var rf=gd.files[_REG_FILE];\n    if(!rf){var _seed=[{\"id\": \"gavi\", \"nome\": \"Gavi\", \"porti\": [\"ITSPE\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}, {\"id\": \"paglianiti\", \"nome\": \"Paglianiti\", \"porti\": [\"ITSPE\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}, {\"id\": \"romeo\", \"nome\": \"Romeo\", \"porti\": [\"ITSPE\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}, {\"id\": \"doublev\", \"nome\": \"Double V\", \"porti\": [\"ITSPE\", \"ITLIV\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}, {\"id\": \"cfidenza\", \"nome\": \"C.Fidenza\", \"porti\": [\"ITSPE\", \"ITLIV\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}, {\"id\": \"medlog\", \"nome\": \"Medlog\", \"porti\": [\"ITSPE\", \"ITLIV\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}, {\"id\": \"trg\", \"nome\": \"TRG\", \"porti\": [\"ITSPE\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}, {\"id\": \"truckrail\", \"nome\": \"Truck Rail\", \"porti\": [\"ITSPE\"], \"tipo\": \"km_nuovo\", \"add\": {}, \"colMap\": {}}, {\"id\": \"baccetti\", \"nome\": \"Baccetti\", \"porti\": [\"ITSPE\", \"ITLIV\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}, {\"id\": \"silt\", \"nome\": \"Silt\", \"porti\": [\"ITSPE\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}, {\"id\": \"gmt\", \"nome\": \"GMT\", \"porti\": [\"ITLIV\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}, {\"id\": \"martelli\", \"nome\": \"Martelli\", \"porti\": [\"ITLIV\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}, {\"id\": \"rat\", \"nome\": \"Rat\", \"porti\": [\"ITLIV\"], \"tipo\": \"localita\", \"add\": {}, \"colMap\": {}}];_registry=_seed;pushRegistry();renderSidebar();setStatus('\\u2705 Registry inizializzato con '+_registry.length+' vettori');return;}\n    var p=rf.truncated?fetch(rf.raw_url).then(function(r){return r.json();}):Promise.resolve(JSON.parse(rf.content));\n    p.then(function(rd){\n      _registry=rd.vettori||[];\n      var proms=_registry.map(function(v){\n        var fname='tcp_vettore_'+v.id+'.json';\n        var f=gd.files[fname];if(!f)return Promise.resolve();\n        var fp=f.truncated?fetch(f.raw_url).then(function(r){return r.json();}):Promise.resolve(JSON.parse(f.content));\n        return fp.then(function(d){if(d&&d.rows){_tariffe[v.id]=d.rows;if(d.add)v.add=d.add; // usa sempre il file individuale (\u00e8 il pi\u00f9 aggiornato)v.colMap=d.colMap||v.colMap||{};if(window.opener&&window.opener._gccOnVettoriTariffeUpdated)try{window.opener._gccOnVettoriTariffeUpdated(v.id,d.rows,d.add||{},d.colMap||{});}catch(e){}}});\n      });\n      Promise.all(proms).then(function(){\n        renderSidebar();\n        if(_selected)selectV(_selected);\n        setStatus('\\u2705 Sync OK \\u2014 '+_registry.length+' vettori');\n      });\n    });\n  }).catch(function(e){setStatus('\\u26A0 '+e.message);});\n}\n\n/* \u2500\u2500 Helpers \u2500\u2500 */\nfunction setStatus(m){document.getElementById('status').textContent=m;}\n\n/* \u2500\u2500 Init: carica dal Gist al primo avvio \u2500\u2500 */\nwindow.onload=function(){\n  var s=document.createElement('script');\n  s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';\n  s.onload=function(){\n    renderSidebar();\n    syncFromGist();\n  };\n  document.head.appendChild(s);\n};\n";

    var _html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>Gestione Vettori</title><style>*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}body{background:#f0f3f6;height:100vh;display:flex;flex-direction:column;overflow:hidden}#topbar{display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,#6c3483,#9b59b6);color:white;padding:9px 16px;flex-shrink:0}#topbar h2{font-size:14px;font-weight:bold;flex:1}.tbtn{padding:6px 14px;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold;color:white}#main{display:flex;flex:1;overflow:hidden}#sidebar{width:200px;background:white;border-right:1px solid #e0e0e0;display:flex;flex-direction:column;flex-shrink:0}#sidebar-header{padding:9px 12px;border-bottom:1px solid #eee;font-size:11px;font-weight:bold;color:#888;display:flex;align-items:center;justify-content:space-between}#btn-nuovo{padding:3px 10px;background:#9b59b6;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold}#vlist{flex:1;overflow-y:auto}.vitem{padding:8px 12px;cursor:pointer;border-bottom:1px solid #f5f5f5;display:flex;flex-direction:column;gap:3px}.vitem:hover{background:#f8f0ff}.vitem.active{background:#ede0f8;border-left:3px solid #9b59b6}.vname{font-size:13px;font-weight:bold;color:#333}.vbadges{display:flex;gap:3px;flex-wrap:wrap}.badge{padding:1px 5px;border-radius:10px;font-size:9px;font-weight:bold;color:white}.badge-spe{background:#2980b9}.badge-liv{background:#27ae60}.badge-km{background:#e67e22}#editor{flex:1;overflow-y:auto;padding:18px}#editor.empty{display:flex;align-items:center;justify-content:center;color:#bbb;font-size:13px}.card{background:white;border-radius:10px;padding:14px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.07)}.card-title{font-size:11px;font-weight:bold;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px}.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}label.field{display:flex;flex-direction:column;gap:3px}.lbl{font-size:11px;font-weight:bold;color:#555}.hint{font-size:10px;color:#aaa}.unit{font-size:10px;color:#aaa}input[type=text],input[type=number]{padding:6px 9px;border:1px solid #d0d7de;border-radius:5px;font-size:13px;width:100%;transition:border .2s}input:focus{outline:none;border-color:#9b59b6;box-shadow:0 0 0 2px rgba(155,89,182,.15)}.checks{display:flex;gap:14px;margin-top:4px}.checks label{display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer}.radios{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px}.radios label{display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer}.btn-row{display:flex;gap:7px}.btn{padding:7px 14px;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold}.btn-sm{padding:4px 10px;font-size:11px}.btn-save{background:#27ae60;color:white}.btn-del{background:#e74c3c;color:white}.btn-imp{background:#e67e22;color:white}.tt{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}.tt th{background:#6c3483;color:white;padding:5px 7px;text-align:left}.tt td{padding:4px 7px;border-bottom:1px solid #f0f0f0}.tt tr:hover td{background:#f8f0ff}.more{font-size:11px;color:#aaa;padding:5px 0}.empty-rows{color:#bbb;font-size:12px;padding:8px 0}#status{font-size:11px;color:rgba(255,255,255,.8);margin-right:4px}</style></head><body><div id=\"topbar\"><h2>&#x1F69A; Gestione Vettori</h2><span id=\"status\"></span><button class=\"tbtn\" onclick=\"syncFromGist()\" style=\"background:#2980b9\">&#x21C5; Sync Gist</button><button class=\"tbtn\" onclick=\"window.close()\" style=\"background:#7f8c8d;margin-left:4px\">Chiudi</button></div><div id=\"main\"><div id=\"sidebar\"><div id=\"sidebar-header\">VETTORI <button id=\"btn-nuovo\" onclick=\"nuovoVettore()\">+ Nuovo</button></div><div id=\"vlist\"></div></div><div id=\"editor\" class=\"empty\"><span>Seleziona un vettore dalla lista</span></div></div>"
      + '<scr'+'ipt>' + _initVars + _fns + '<\/scr'+'ipt>'
      + '</body></html>';

    var blob = new Blob([_html], {type:'text/html;charset=utf-8'});
    var url  = URL.createObjectURL(blob);
    var win  = window.open('', 'tcp_vettori', 'width=980,height=700,scrollbars=yes,resizable=yes');
    win.location.replace(url);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 10000);
  }

  function apriAddizionali() {
    panel.style.display = 'none';

    // Migrazione automatica da vecchia chiave tcp_addizionali
    if (!localStorage.getItem(LS_ADDIZIONALI) && localStorage.getItem('tcp_addizionali')) {
      try {
        localStorage.setItem(LS_ADDIZIONALI, localStorage.getItem('tcp_addizionali'));
        localStorage.removeItem('tcp_addizionali');
      } catch(e) {}
    }
    var raw = localStorage.getItem(LS_ADDIZIONALI);
    var add = { fuel_perc:'', hc:'', adr:'', vgm_liv:'', vgm_spe:'',
      extra_stop:'', extra_stop_2:'', extra_stop_3:'', extra_stop_4:'', notte:'',
      congestion_liv:'', congestion_spe:'', reefer_perc:'', reefer_min:'' };
    try {
      if (raw) {
        var p = JSON.parse(raw);
        Object.keys(add).forEach(function(k){ if (p[k] !== undefined) add[k] = p[k]; });
        if (!add.vgm_liv && p.vgm)             add.vgm_liv = p.vgm;
        if (!add.congestion_liv && p.congestion) add.congestion_liv = p.congestion;
      }
    } catch(e) { localStorage.removeItem(LS_ADDIZIONALI); }
    var fp = localStorage.getItem(LS_FUEL_PERC) || '';
    if (!add.fuel_perc && fp) add.fuel_perc = fp;

    var css = '*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}'
      + 'body{background:#f0f3f6;min-height:100vh}'
      + '#topbar{display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#1a5276,#2980b9);color:white;padding:10px 18px}'
      + '#topbar h2{font-size:15px;font-weight:bold;flex:1}'
      + '.tbtn{padding:7px 14px;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold;color:white}'
      + '.content{padding:20px;max-width:700px;margin:0 auto}'
      + '.section{background:white;border-radius:10px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden}'
      + '.sec-header{padding:10px 16px;font-size:12px;font-weight:bold;color:white}'
      + '.sec-body{padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:12px}'
      + '.sec-note{padding:0 16px 12px;font-size:11px;color:#888}'
      + 'label{display:flex;flex-direction:column;gap:4px}'
      + '.lbl{font-size:11px;font-weight:bold;color:#555}'
      + '.hint{font-size:10px;color:#aaa;font-weight:normal}'
      + '.sub{font-size:10px;color:#aaa;font-style:italic;margin-top:2px}'
      + '.input-row{display:flex;align-items:center;gap:6px}'
      + 'input[type=number]{padding:7px 10px;border:1px solid #d0d7de;border-radius:5px;font-size:14px;width:85px;transition:border .2s}'
      + 'input[type=number]:focus{outline:none;border-color:#2980b9;box-shadow:0 0 0 2px rgba(41,128,185,.15)}'
      + '.unit{font-size:13px;color:#888;min-width:16px}'
      + '#status{font-size:11px;color:rgba(255,255,255,.8)}';

    function fld(key, label, unit, hint, sub) {
      return '<label>'
        + '<span class="lbl">' + label + (hint ? ' <span class="hint">&#8212; ' + hint + '</span>' : '') + '</span>'
        + '<div class="input-row"><input type="number" id="add-' + key + '" min="0" step="0.01" value="' + (add[key]||'') + '" placeholder="0">'
        + '<span class="unit">' + unit + '</span></div>'
        + (sub ? '<span class="sub">' + sub + '</span>' : '')
        + '</label>';
    }

    var secHtml =
      '<div class="section"><div class="sec-header" style="background:#e67e22">&#x26FD; Fuel Surcharge</div><div class="sec-body">'
      + fld('fuel_perc','Fuel %','%','% sul costo base')
      + '</div></div>'

      + '<div class="section"><div class="sec-header" style="background:#2980b9">&#x2795; Supplementi fissi</div><div class="sec-body">'
      + fld('hc',       'Supplemento HC',  '&#8364;','Per container High Cube')
      + fld('adr',      'ADR',             '&#8364;','Merci pericolose')
      + fld('vgm_liv',  'VGM Livorno',     '&#8364;','Pesata container')
      + fld('vgm_spe',  'VGM La Spezia',   '&#8364;','Pesata container')
      + fld('notte',    'Sosta Notte',     '&#8364;','Per notte di sosta')
      + '</div></div>'

      + '<div class="section"><div class="sec-header" style="background:#8e44ad">&#x21C6; Extra Stop</div><div class="sec-body">'
      + fld('extra_stop',  'Extra Stop 1&#176;','&#8364;','Prima fermata aggiuntiva')
      + fld('extra_stop_2','Extra Stop 2&#176;','&#8364;','','Vuoto &#x2192; stesso del 1&#176;')
      + fld('extra_stop_3','Extra Stop 3&#176;','&#8364;','','Vuoto &#x2192; stesso del 2&#176;')
      + fld('extra_stop_4','Extra Stop 4&#176;','&#8364;','','Vuoto &#x2192; stesso del 3&#176;')
      + '</div></div>'

      + '<div class="section"><div class="sec-header" style="background:#c0392b">&#x26A0; Congestion</div><div class="sec-body">'
      + fld('congestion_liv','Congestion Livorno',   '&#8364;','Sovraffollamento porto')
      + fld('congestion_spe','Congestion La Spezia', '&#8364;','Sovraffollamento porto')
      + '</div></div>'

      + '<div class="section"><div class="sec-header" style="background:#16a085">&#x2744; Reefer</div><div class="sec-body">'
      + fld('reefer_perc','Reefer %',      '%',      '% su (base + fuel)')
      + fld('reefer_min', 'Reefer minimo', '&#8364;','Importo minimo garantito')
      + '</div>'
      + '<div class="sec-note">Calcolo: <b>subtotale &#215; %</b> &#8212; se il risultato &egrave; inferiore al minimo viene usato il minimo.</div>'
      + '</div>';

    var allKeys = JSON.stringify(Object.keys(add));

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Addizionali</title><style>' + css + '</style></head><body>'
      + '<div id="topbar"><h2>&#x2695; Addizionali C.R.T.</h2>'
      + '<span id="status"></span>'
      + '<button class="tbtn" id="btn-salva" style="background:#27ae60;margin-left:8px">&#x1F4BE; Salva</button>'
      + '<button class="tbtn" id="btn-chiudi" style="background:#7f8c8d">Chiudi</button>'
      + '</div>'
      + '<div class="content"><p style="font-size:11px;color:#888;margin-bottom:16px">Supplementi applicati sul prezzo base C.R.T. &#8212; sincronizzati sul Gist.</p>'
      + secHtml + '</div>'
      + '<scr' + 'ipt>'
      + 'var _LS="' + LS_ADDIZIONALI + '";'
      + 'var _LS_FP="' + LS_FUEL_PERC + '";'
      + 'var _GID="' + GIST_ID + '";'
      + 'var _GFA="' + GIST_FILE_ADD + '";'
      + 'var _TK="' + LS_TOKEN + '";'
      + 'var _keys=' + allKeys + ';'
      + 'document.getElementById("btn-chiudi").onclick=function(){window.close();};'
      + 'document.getElementById("btn-salva").onclick=function(){'
      + 'var n={};_keys.forEach(function(k){var e=document.getElementById("add-"+k);n[k]=e?e.value.trim():"";});'
      + 'try{localStorage.setItem(_LS,JSON.stringify(n));}catch(e){}'
      + 'if(n.fuel_perc)try{localStorage.setItem(_LS_FP,n.fuel_perc);}catch(e){}'
      + 'if(window.opener&&window.opener._gccOnAddSaved)try{window.opener._gccOnAddSaved(n);}catch(e){}'
      + 'var st=document.getElementById("status"),tok=localStorage.getItem(_TK);'
      + 'if(tok){st.textContent="\u23F3 Salvataggio Gist...";'
      + 'fetch("https://api.github.com/gists/"+_GID,{method:"PATCH",'
      + 'headers:{"Authorization":"token "+tok,"Content-Type":"application/json"},'
      + 'body:JSON.stringify({files:{[_GFA]:{content:JSON.stringify(n,null,2)}}})})'
      + '.then(function(r){st.textContent=r.ok?"\u2705 Salvato sul Gist":"\u26A0 Errore "+r.status;})'
      + '.catch(function(e){st.textContent="\u26A0 "+e.message;});'
      + '}else{st.textContent="\u2705 Salvato in locale";}'
      + '};'
      + '<\/scr' + 'ipt></body></html>';

    var blob = new Blob([html], {type:'text/html;charset=utf-8'});
    var url  = URL.createObjectURL(blob);
    var win  = window.open('', 'tcp_gcc_addizionali', 'width=700,height=700,scrollbars=yes,resizable=yes');
    win.location.replace(url);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 8000);

    window._gccOnAddSaved = function(nuovi) {
      try { localStorage.setItem(LS_ADDIZIONALI, JSON.stringify(nuovi)); } catch(e) {}
      if (nuovi.fuel_perc) try { localStorage.setItem(LS_FUEL_PERC, nuovi.fuel_perc); } catch(e) {}
    };
  }


  // ═══════════════════════════════════════════════
  //  GESTIONE LISTINO — POPUP COMPLETO
  // ═══════════════════════════════════════════════

  function apriGestioneListino() {
    var raw = localStorage.getItem(LS_LISTINO);
    var lsData = raw ? JSON.parse(raw) : { rows:[], filename:'GCC' };
    var rows = lsData.rows;
    var fname = lsData.filename || 'listino';
    var sugg = raccogliSuggerimenti();
    var dataOggi = oggiDDMMYY();
    panel.style.display = 'none';

    var cssG =
      'body{font-family:Arial,sans-serif;padding:0;background:#f4f6f8;margin:0}'+
      '#topbar{display:flex;align-items:center;justify-content:space-between;background:#1a5276;color:white;padding:10px 18px;gap:10px;position:sticky;top:0;z-index:100}'+
      '#topbar h2{margin:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#topbar-right{display:flex;align-items:center;gap:8px;flex-shrink:0}'+
      '#search{padding:6px 10px;border:none;border-radius:5px;font-size:12px;width:240px}'+
      '.btn-top{padding:7px 14px;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold;white-space:nowrap}'+
      '#btn-nuova{background:#27ae60;color:white}'+
      '#btn-export-full{background:#16a085;color:white}'+
      '#btn-carica-excel{background:#2980b9;color:white}'+
      '#table-wrap{overflow:auto;padding:14px;height:calc(100vh - 62px);box-sizing:border-box}'+
      'table{width:100%;border-collapse:collapse;font-size:11px}'+
      'th{background:#1a5276;color:white;padding:6px 8px;text-align:left;white-space:nowrap;position:sticky;top:0;z-index:10}'+
      'td{padding:4px 8px;border-bottom:1px solid #eee;vertical-align:middle;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}'+
      'tr:hover td{background:#f0f7ff}'+
      '.tc{color:#27ae60;font-weight:bold}'+
      '.tna{color:#ddd}'+
      '#nrows{font-size:11px;color:#888;margin-top:8px}'+
      '#overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center}'+
      '#overlay.show{display:flex}'+
      '#modale{background:white;border-radius:10px;padding:24px;width:580px;max-width:96vw;max-height:92vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.3)}'+
      '#modale h3{margin:0 0 4px;color:#1a5276;font-size:15px}'+
      '.sep{height:1px;background:#eee;margin:10px 0}'+
      '.slabel{font-size:11px;font-weight:bold;color:#1a5276;text-transform:uppercase;letter-spacing:.5px;margin:12px 0 6px;padding-bottom:4px;border-bottom:2px solid #ebf5fb}'+
      '.fg{display:grid;grid-template-columns:1fr 1fr;gap:8px}'+
      '.fg label{font-size:11px;color:#555;font-weight:bold;display:flex;flex-direction:column;gap:3px}'+
      '.fg input,.fg select{padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box;width:100%}'+
      '.fg input:focus,.fg select:focus{outline:none;border-color:#2980b9;box-shadow:0 0 0 2px rgba(41,128,185,.15)}'+
      '.full{grid-column:1/-1}'+
      '.fuel-row{display:flex;align-items:center;gap:10px;padding:7px 10px;background:#fef9e7;border-radius:6px;border:1px solid #f9ca24;margin-top:10px}'+
      '.fuel-row label{font-size:12px;font-weight:bold;color:#7d6608;margin:0}'+
      '#m-fuel-tog{cursor:pointer;padding:4px 12px;border:none;border-radius:4px;font-size:12px;font-weight:bold;background:#bdc3c7;color:#333}'+
      '#m-fuel-tog.on{background:#e67e22;color:white}'+
      '.mbtns{margin-top:14px;display:flex;align-items:flex-end;justify-content:flex-end;gap:8px}'+
      '.mbtns button{padding:8px 18px;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:bold}'+
      '.btn-save{background:#27ae60;color:white}.btn-cancel{background:#bdc3c7;color:#333}'+
      '.ldata{font-size:11px;color:#555;font-weight:bold;display:flex;flex-direction:column;gap:3px;margin-right:auto}'+
      '.ldata input{padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;width:90px}'+
      '.be{padding:3px 7px;border:none;background:#8e44ad;color:white;border-radius:3px;cursor:pointer;font-size:11px;margin-right:2px}'+
      '.bd{padding:3px 7px;border:none;background:#c0392b;color:white;border-radius:3px;cursor:pointer;font-size:11px}'+
      '.porto-hint{font-size:10px;color:#e67e22;margin-top:2px}';

    var scriptData =
      'var _rows='+JSON.stringify(rows)+';'+
      'var _sugg='+JSON.stringify(sugg)+';'+
      'var _fname='+JSON.stringify(fname)+';'+
      'var _LS='+JSON.stringify(LS_LISTINO)+';'+
      'var _editIdx=null;'+
      'var _mFuelOn=false;'+
      'var _dataOggi='+JSON.stringify(dataOggi)+';';

    var scriptLogic =
      'function populateDL(id,arr){var dl=document.getElementById(id);if(!dl)return;dl.innerHTML="";arr.forEach(function(v){var o=document.createElement("option");o.value=v;dl.appendChild(o);});}'+
      'function initDLs(){populateDL("dl-comm",_sugg.committenti);populateDL("dl-luoghi",_sugg.luoghi);populateDL("dl-deliv",_sugg.delivery_places);populateDL("dl-porti",_sugg.porti);}'+
      'function addSugg(key,dlId,val){val=(val||"").trim();if(!val)return;if(_sugg[key].indexOf(val)===-1){_sugg[key].push(val);populateDL(dlId,_sugg[key]);}}'+

      'function pushGistGL(rows){var tok=localStorage.getItem("tcp_gcc_token");if(!tok)return;fetch("https://api.github.com/gists/93f3fe07c908d94f152c56ad805202f5",{method:"PATCH",headers:{"Authorization":"token "+tok,"Content-Type":"application/json"},body:JSON.stringify({files:{"tcp_listino.json":{content:JSON.stringify({rows:rows,updated_at:new Date().toISOString()},null,2)}}})}).catch(function(){});}'+
      'function renderTable(){'+
        'var filter=(document.getElementById("search").value||"").toLowerCase();'+
        'var html="";var count=0;'+
        '_rows.forEach(function(r,i){'+
          'var s=[r.traffic_type,r.committente,r.luogo_1,r.luogo_2,r.delivery_place,r.porto_riferimento,r.note].join(" ").toLowerCase();'+
          'if(filter&&!s.includes(filter))return;'+
          'count++;'+
          'function v(f){return(r[f]||"");}'+
          'function tc(f){return r[f]?"<td class=\'tc\'>"+r[f]+"</td>":"<td class=\'tna\'>-</td>";}'+
          'html+="<tr>";'+
          'html+="<td style=\'color:#aaa;font-size:10px\'>"+i+"</td>";'+
          'html+="<td style=\'font-weight:bold\'>"+v("traffic_type")+"</td>";'+
          'html+="<td>"+v("committente")+"</td>";'+
          'html+="<td>"+v("luogo_1")+"</td>";'+
          'html+="<td>"+v("luogo_2")+"</td>";'+
          'html+="<td>"+v("delivery_place")+"</td>";'+
          'html+="<td style=\'font-weight:bold;color:#1a5276\'>"+v("porto_riferimento").toUpperCase()+"</td>";'+
          'html+=tc("costo_20");html+=tc("costo_40");html+=tc("costo_hc");'+
          'html+=tc("congestion");html+=tc("extra_stop");html+=tc("s_notte");'+
          'html+=tc("allaccio_rf");html+=tc("adr");'+
          'html+="<td style=\'color:"+(v("fuel").toLowerCase()==="si"?"#e67e22":"#ccc")+"\'>"+(v("fuel").toLowerCase()==="si"?"SI":"-")+"</td>";'+
          'html+="<td style=\'color:#888;font-size:10px\'>"+v("note")+"</td>";'+
          'html+="<td style=\'color:#aaa;font-size:10px\'>"+v("data_validita")+"</td>";'+
          'html+="<td style=\'font-size:10px;font-weight:bold;color:#1a5276\'>"+v("operatore")+"</td>";'+
          'html+="<td><button class=\'be\' data-i=\'"+i+"\'>&#x270F;</button><button class=\'bd\' data-i=\'"+i+"\'>&#x1F5D1;</button></td>";'+
          'html+="</tr>";'+
        '});'+
        'document.getElementById("tbody").innerHTML=html;'+
        'document.getElementById("nrows").textContent="Visualizzate: "+count+" / "+_rows.length+" tariffe";'+
      '}'+

      'function initDataInput(el){'+
        'el.addEventListener("input",function(){'+
          'var v=this.value.replace(/[^0-9]/g,"");var out="";'+
          'if(v.length>0)out=v.substring(0,2);'+
          'if(v.length>=3)out+="/"+v.substring(2,4);'+
          'if(v.length>=5)out+="/"+v.substring(4,6);'+
          'this.value=out;'+
        '});'+
        'el.addEventListener("keydown",function(e){if(e.key==="Backspace"&&this.value.endsWith("/"))this.value=this.value.slice(0,-1);});'+
      '}'+

      'var TRATTA_FLDS=["traffic_type","committente","luogo_1","luogo_2","delivery_place","porto_riferimento"];'+
      'var COSTO_FLDS=["costo_20","costo_40","costo_hc","congestion","extra_stop","s_notte","allaccio_rf","adr","note"];'+
      'function fid(f){return "f-"+f.replace(/_/g,"-");}'+

      'function apriForm(idx){'+
        '_editIdx=idx;_mFuelOn=false;'+
        'var r=idx>=0?_rows[idx]:{};'+
        'document.getElementById("m-titolo").textContent=idx>=0?"Modifica tariffa":"Nuova tariffa";'+
        'TRATTA_FLDS.concat(COSTO_FLDS).forEach(function(f){'+
          'var el=document.getElementById(fid(f));if(el)el.value=r[f]||"";'+
        '});'+
        'var elD=document.getElementById("f-data-validita");'+
        'elD.value=r.data_validita||_dataOggi;'+
        'var elOp3=document.getElementById("f-operatore");if(elOp3)elOp3.value=r.operatore||"";'+
        'if(r.fuel&&r.fuel.toUpperCase()==="SI")_mFuelOn=true;'+
        'var tog=document.getElementById("m-fuel-tog");'+
        'tog.textContent=_mFuelOn?"SI":"NO";tog.classList.toggle("on",_mFuelOn);'+
        'document.getElementById("overlay").classList.add("show");'+
      '}'+

      'function chiudiForm(){document.getElementById("overlay").classList.remove("show");_editIdx=null;_mFuelOn=false;}'+

      'function salvaForm(){'+
        'var r={};'+
        'TRATTA_FLDS.concat(COSTO_FLDS).forEach(function(f){var el=document.getElementById(fid(f));r[f]=el?el.value.trim():"";});'+
        'r.data_validita=document.getElementById("f-data-validita").value.trim();'+
        'r.fuel=_mFuelOn?"SI":"NO";r.fuel_perc="";'+
        'r.operatore=(document.getElementById("f-operatore")||{value:""}).value.trim().toUpperCase();'+
        /* FIX: avviso porto non italiano */
        'if(r.porto_riferimento && !r.porto_riferimento.toLowerCase().startsWith("it")){'+
          'if(!confirm("Il porto \\""+r.porto_riferimento+"\\" non \u00e8 un porto italiano (dovrebbe iniziare con IT, es. ITLIV).\\nVuoi salvare comunque?"))return;'+
        '}'+
        'addSugg("committenti","dl-comm",r.committente);'+
        'addSugg("luoghi","dl-luoghi",r.luogo_1);'+
        'addSugg("luoghi","dl-luoghi",r.luogo_2);'+
        'addSugg("delivery_places","dl-deliv",r.delivery_place);'+
        'addSugg("porti","dl-porti",r.porto_riferimento);'+
        'if(_editIdx>=0){_rows[_editIdx]=r;}else{_rows.push(r);}'+
        'try{'+
          'var lsRaw=localStorage.getItem(_LS);'+
          'var lsData=lsRaw?JSON.parse(lsRaw):{rows:[],filename:_fname};'+
          'lsData.rows=_rows;lsData.loaded_at=new Date().toISOString();'+
          'localStorage.setItem(_LS,JSON.stringify(lsData));'+
        '}catch(e){console.warn("TCP save error",e);}'+
        'chiudiForm();renderTable();'+
      '}'+

      'function cancellaRiga(idx){'+
        'if(!confirm("Cancellare questa tariffa dal listino?"))return;'+
        '_rows.splice(idx,1);'+
        'try{var d=JSON.parse(localStorage.getItem(_LS)||"{}");d.rows=_rows;localStorage.setItem(_LS,JSON.stringify(d));pushGistGL(_rows);}catch(e){}'+
        'renderTable();'+
      '}'+

      'function esportaExcelFull(){'+
        'var hdr=[["traffic_type","committente","luogo_1","luogo_2","delivery_place","porto_riferimento","costo_20","costo_40","costo_hc","congestion","extra_stop","s_notte","allaccio_rf","adr","fuel","note","data_validita"]];'+
        '_rows.forEach(function(r){hdr.push([r.traffic_type||"",r.committente||"",r.luogo_1||"",r.luogo_2||"",r.delivery_place||"",r.porto_riferimento||"",r.costo_20||"",r.costo_40||"",r.costo_hc||"",r.congestion||"",r.extra_stop||"",r.s_notte||"",r.allaccio_rf||"",r.adr||"",r.fuel||"",r.note||"",r.data_validita||""]);});'+
        'var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(hdr),"Listino");'+
        'XLSX.writeFile(wb,"listino_concordati_"+new Date().toISOString().slice(0,10)+".xlsx");'+
      '}'+

      'var _inputExcel=document.createElement("input");_inputExcel.type="file";_inputExcel.accept=".xlsx,.xls";_inputExcel.style.display="none";document.body.appendChild(_inputExcel);'+
      '_inputExcel.addEventListener("change",function(){'+
        'var f=_inputExcel.files[0];if(!f)return;'+
        'var r=new FileReader();r.onload=function(ev){'+
          'try{var wb=XLSX.read(new Uint8Array(ev.target.result),{type:"array"});'+
          'var nuove=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});'+
          '_rows=_rows.concat(nuove);'+
          'var lsRaw=localStorage.getItem(_LS);var lsData=lsRaw?JSON.parse(lsRaw):{rows:[],filename:_fname};'+
          'lsData.rows=_rows;localStorage.setItem(_LS,JSON.stringify(lsData));'+
          'renderTable();alert("Importate "+nuove.length+" tariffe.");}'+
          'catch(e){alert("Errore lettura: "+e.message);}'+
        '};r.readAsArrayBuffer(f);'+
      '});'+
      'document.addEventListener("click",function(e){'+
        'if(e.target.id==="btn-carica-excel"){_inputExcel.value="";_inputExcel.click();}'+
        'if(e.target.id==="btn-nuova"){apriForm(-1);}'+
        'if(e.target.id==="btn-export-full"){esportaExcelFull();}'+
        'if(e.target.classList.contains("be")){apriForm(parseInt(e.target.dataset.i));}'+
        'if(e.target.classList.contains("bd")){cancellaRiga(parseInt(e.target.dataset.i));}'+
        'if(e.target.id==="btn-annulla"||e.target.id==="overlay"){chiudiForm();}'+
        'if(e.target.id==="btn-salva"){salvaForm();}'+
        'if(e.target.id==="m-fuel-tog"){_mFuelOn=!_mFuelOn;e.target.textContent=_mFuelOn?"SI":"NO";e.target.classList.toggle("on",_mFuelOn);}'+
      '});'+
      'document.getElementById("search").addEventListener("input",renderTable);'+

      'initDataInput(document.getElementById("f-data-validita"));'+

      /* porto: avviso live se non it* */
      'document.getElementById("f-porto-riferimento").addEventListener("blur",function(){'+
        'var v=this.value.trim();'+
        'var hint=document.getElementById("porto-hint");'+
        'if(v&&!v.toLowerCase().startsWith("it")){hint.textContent="⚠ Il matcher accetta solo porti italiani (IT...)";hint.style.display="block";}'+
        'else{hint.style.display="none";}'+
      '});'+

      'initDLs();renderTable();';

    var thH =
      '<th>#</th><th>Traffic</th><th>Committente</th><th>Luogo 1</th><th>Luogo 2</th>'+
      '<th>Delivery Place</th><th>Porto</th><th>20\'</th><th>40\'</th><th>HC</th>'+
      '<th>Cong.</th><th>Ex.Stop</th><th>S.Notte</th><th>All.RF</th><th>ADR</th>'+
      '<th>Fuel</th><th>Note</th><th>Validit\u00e0</th><th>Op.</th><th>Azioni</th>';

    var popup = window.open('','tcp_gestione','width=1280,height=720,scrollbars=yes,resizable=yes');
    if(!popup){alert('Il browser ha bloccato il popup.\nAutorizza i popup per questo sito e riprova.');return;}
    popup.document.write(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Gestione Listino<\/title>'+
      '<style>'+cssG+'<\/style><\/head><body>'+
      '<div id="topbar">'+
        '<h2>&#x1F4CB; Elenco Concordati \u2014 '+fname+'<\/h2>'+
        '<div id="topbar-right">'+
          '<input id="search" placeholder="\uD83D\uDD0D Filtra per committente, luogo, porto...">'+
          '<button class="btn-top" id="btn-carica-excel">&#x1F4C2; Carica Excel<\/button>'+
          '<button class="btn-top" id="btn-nuova">&#x2795; Nuova tariffa<\/button>'+
          '<button class="btn-top" id="btn-export-full">&#x1F4BE; Esporta Excel<\/button>'+
        '<\/div>'+
      '<\/div>'+
      '<div id="table-wrap">'+
        '<table><thead><tr>'+thH+'<\/tr><\/thead><tbody id="tbody"><\/tbody><\/table>'+
        '<div id="nrows"><\/div>'+
      '<\/div>'+
      '<datalist id="dl-comm"><\/datalist>'+
      '<datalist id="dl-luoghi"><\/datalist>'+
      '<datalist id="dl-deliv"><\/datalist>'+
      '<datalist id="dl-porti"><\/datalist>'+
      '<div id="overlay">'+
        '<div id="modale">'+
          '<h3 id="m-titolo">Nuova tariffa<\/h3>'+
          '<div class="sep"><\/div>'+
          '<div class="slabel">&#x1F4CD; Tratta<\/div>'+
          '<div class="fg">'+
            '<label>Traffic Type<select id="f-traffic-type"><option value="">-- seleziona --<\/option><option>Import<\/option><option>Export<\/option><\/select><\/label>'+
            '<label>Porto (IT...)<input type="text" id="f-porto-riferimento" list="dl-porti" placeholder="es. ITLIV"><div id="porto-hint" class="porto-hint" style="display:none"><\/div><\/label>'+
            '<label>Committente<input type="text" id="f-committente" list="dl-comm" placeholder="es. Savino Del Bene"><\/label>'+
            '<label>Delivery Place<input type="text" id="f-delivery-place" list="dl-deliv" placeholder="nome ditta destinataria"><\/label>'+
            '<label>Luogo 1<input type="text" id="f-luogo-1" list="dl-luoghi" placeholder="es. Livorno (LI)"><\/label>'+
            '<label>Luogo 2<input type="text" id="f-luogo-2" list="dl-luoghi" placeholder="vuoto se tappa singola"><\/label>'+
          '<\/div>'+
          '<div class="slabel">&#x1F4B6; Tariffe<\/div>'+
          '<div class="fg">'+
            '<label>Costo 20\' (&euro;)<input type="number" id="f-costo-20" placeholder="es. 300"><\/label>'+
            '<label>Costo 40\' (&euro;)<input type="number" id="f-costo-40" placeholder="es. 450"><\/label>'+
            '<label>Add. HC (&euro;)<input type="number" id="f-costo-hc" placeholder="es. 30"><\/label>'+
            '<label>Congestion (&euro;)<input type="number" id="f-congestion" placeholder="vuoto = no"><\/label>'+
            '<label>Extra Stop (&euro;)<input type="number" id="f-extra-stop" placeholder="vuoto = no"><\/label>'+
            '<label>S. Notte (&euro;)<input type="number" id="f-s-notte" placeholder="vuoto = no"><\/label>'+
            '<label>Reefer (%)<input type="number" id="f-allaccio-rf" min="0" step="0.1" placeholder="vuoto = no"><\/label>'+
            '<label>ADR (&euro;)<input type="number" id="f-adr" placeholder="vuoto = no"><\/label>'+
            '<label class="full">Note<input type="text" id="f-note" placeholder="annotazioni libere"><\/label>'+
          '<\/div>'+
          '<div class="fuel-row">'+
            '<label>&#x26FD; Fuel Surcharge:<\/label>'+
            '<button id="m-fuel-tog">NO<\/button>'+
          '<\/div>'+
          '<div class="mbtns">'+
            '<label class="ldata">Data Validit\u00e0<input type="text" id="f-data-validita" maxlength="8" placeholder="DD/MM/YY"><\/label>'+
            '<label class="ldata" style="width:70px">Op.<input type="text" id="f-operatore" maxlength="5" placeholder="MR" style="text-transform:uppercase"><\/label>'+
            '<button class="btn-cancel" id="btn-annulla">Annulla<\/button>'+
            '<button class="btn-save" id="btn-salva">&#x1F4BE; Salva<\/button>'+
          '<\/div>'+
        '<\/div>'+
      '<\/div>'+
      '<scr'+'ipt>'+scriptData+'<\/scr'+'ipt>'+
      '<scr'+'ipt src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"><\/scr'+'ipt>'+
      '<scr'+'ipt>'+scriptLogic+'<\/scr'+'ipt>'+
      '<\/body><\/html>'
    );
    popup.document.close();
  }


  // ═══════════════════════════════════════════════
  //  MATCH CRT — calcola costo da tariffario base
  // ═══════════════════════════════════════════════

  // Estrae CAP, Provincia e Località da una stringa indirizzo
  function parseIndirizzoDettaglio(addr) {
    var cap   = '';
    var prov  = '';
    var mCap  = addr.match(/\b(\d{5})\b/);
    if (mCap) cap = mCap[1];
    var mProv = addr.match(/\(([A-Za-z]{2})\)/);
    if (mProv) prov = mProv[1].toUpperCase();
    // Locality: stringa intera pulita (non solo ultima parola)
    var loc = addr
      .replace(/\b\d{5}\b/g, '')        // rimuovi CAP
      .replace(/\([A-Za-z]{2}\)/g, '')   // rimuovi (PR)
      .replace(/\bS\.?\s*R\.?\s*L\.?\b/gi, '')  // rimuovi SRL
      .replace(/\bS\.?\s*P\.?\s*A\.?\b/gi, '')  // rimuovi SPA
      .replace(/Via |Viale |Corso |Piazza |Largo |Str\. |Strada |Loc\. |Fraz\. /gi, '')
      .replace(/,.*$/, '')               // taglia dopo la virgola
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    return { cap: cap, prov: prov, loc: loc };
  }

  // Cerca nel tariffario CRT la riga che corrisponde all'indirizzo
  // Strategia: 1) Località (+ conferma Prov se disponibile), 2) CAP esatto
  // Restituisce { riga, metodo } o null
  // Formatta indirizzo con provincia e CAP per la visualizzazione
  function formatIndirizzoDisplay(parsed, fallback) {
    if (!parsed) return fallback || '';
    var s = parsed.loc || fallback || '';
    if (parsed.prov) s += ' (' + parsed.prov + ')';
    if (parsed.cap)  s += ' ' + parsed.cap;
    return s;
  }

  // Restituisce true se la località è intermedia/escludibile dal tariffario CRT
  // (porto, interporto, svincoli autostradali, terminal, ecc.)
  function isLocalitaIntermedia(loc) {
    if (!loc) return false;
    var l = loc.toUpperCase();
    // Svincoli autostradali: contiene codice A+numero (A1, A10, A11, A12, A13, ecc.)
    if (/\bA\d{1,2}\b/.test(l)) return true;
    // Interporto (hub logistico) — ma NON "Porto Mantovano" o comuni con "Porto"
    if (/\bINTERPORTO\b/.test(l)) return true;
    // "Porto di X" o "Porto X" dove X è un nome di porto (non un comune)
    if (/\bPORTO\s+DI\b/.test(l)) return true;
    // Terminal, Gate, Darsena, Svincolo
    if (/\b(TERMINAL|GATE|DARSENA|SVINCOLO|AREA\s+PORTUALE|ZONA\s+PORTUALE)\b/.test(l)) return true;
    return false;
  }

  // Normalizza abbreviazioni comuni nei nomi di località italiani
  // Converte tutto alla forma abbreviata per confronto uniforme
  // San/Santo/Santa → S.   Di/Del/Della → D.   Sul/Sulla/Sullo → S.   In → I.
  function normalizzaAbbreviazioni(s) {
    var u = s.toUpperCase()
      // Articolati di SU (prima di SAN per evitare conflitti)
      .replace(/\bSULL[OA]?\b'?/g, 'S.')
      .replace(/\bSULLE\b/g, 'S.')
      .replace(/\bS\//g, 'S.')            // S/Arno → S.Arno (notazione slash)
      .replace(/\bSUGLI\b/g, 'S.')
      .replace(/\bSUL\b/g, 'S.')
      // San/Santo/Santa
      .replace(/\bSANTA\b/g, 'S.')
      .replace(/\bSANTO\b/g, 'S.')
      .replace(/\bSAN\b/g, 'S.')
      // Di e articolati
      .replace(/\bDELL[OA]\b/g, 'D.')
      .replace(/\bDELL'/g, 'D.')
      .replace(/\bDEGLI\b/g, 'D.')
      .replace(/\bDELLE\b/g, 'D.')
      .replace(/\bDEL\b/g, 'D.')
      .replace(/\bDEI\b/g, 'D.')
      .replace(/\bDI\b/g, 'D.')
      // In
      .replace(/\bIN\b/g, 'I.')
      // Normalizza spazio dopo il punto: 'S. Pietro' → 'S.PIETRO'
      .replace(/([A-Z])\.\s+/g, '$1.')
      // Vocali accentate → base (FORLÌ → FORLI, FORLI' → FORLI)
      .replace(/[ÀÁÂÃ]/g, 'A').replace(/[ÈÉÊË]/g, 'E')
      .replace(/[ÌÍÎÏ]/g, 'I').replace(/[ÒÓÔÕ]/g, 'O')
      .replace(/[ÙÚÛÜ]/g, 'U')
      .replace(/([AEIOU])'/g, '$1')    // FORLI' → FORLI
      .replace(/\s+/g, ' ')
      .trim();
    return u;
  }

  function cercaCRT(indirizzo, porto, crtRows) {
    if (!crtRows || crtRows.length === 0) return null;
    // Accetta sia oggetto {loc,prov,cap} che stringa raw
    var det;
    if (indirizzo && typeof indirizzo === 'object') {
      det = { loc: (indirizzo.loc||'').toUpperCase(), prov: (indirizzo.prov||'').toUpperCase(), cap: indirizzo.cap||'' };
    } else {
      det = parseIndirizzoDettaglio(indirizzo || '');
    }
    var righePorto = crtRows.filter(function(r) {
      return (r.porto || '').toUpperCase() === porto.toUpperCase() && !isLocalitaIntermedia(r.localita);
    });
    if (righePorto.length === 0) {
      // Fallback SOLO su righe senza porto specificato (mai mischiare Livorno con La Spezia)
      righePorto = crtRows.filter(function(r) { return !r.porto && !isLocalitaIntermedia(r.localita); });
    }
    if (righePorto.length === 0) return null;

    function lbl(r) { return r.localita + (r.cap ? ' ' + r.cap : '') + (r.prov ? ' (' + r.prov + ')' : ''); }
    function ret(r, m) { return { riga: r, metodo: m, label: lbl(r) }; }

    var locQ = det.loc ? det.loc.toUpperCase() : '';
    var capQ = det.cap ? det.cap.replace(/\s/g, '') : '';

    // Trova righe che corrispondono alla locality (multi-strategia)
    function trovaPerLoc(righe, q) {
      if (!q || q.length < 2) return [];
      var qN = normalizzaAbbreviazioni(q); // versione normalizzata della query
      function matchPair(rl, q_) {
        var rlN = normalizzaAbbreviazioni(rl);
        // esatto (originale o normalizzato)
        if (rl === q_ || rlN === qN) return 'exact';
        // tariffario contenuto nell'ordine
        if (rl.length > 2 && (q_.indexOf(rl) !== -1 || qN.indexOf(rlN) !== -1)) return 'in-ord';
        // ordine contenuto nel tariffario
        if (rl.length > 2 && (rl.indexOf(q_) !== -1 || rlN.indexOf(qN) !== -1)) return 'in-tar';
        return null;
      }
      // a) exact
      var es = righe.filter(function(r) { return matchPair((r.localita||'').toUpperCase(), q) === 'exact'; });
      if (es.length) return es;
      // b) tariffario contenuto nell'ordine
      var inOrd = righe.filter(function(r) { return matchPair((r.localita||'').toUpperCase(), q) === 'in-ord'; });
      inOrd.sort(function(a,b){ return (b.localita||'').length-(a.localita||'').length; });
      if (inOrd.length) return inOrd;
      // c) ordine contenuto nel tariffario
      var inTar = righe.filter(function(r) { return matchPair((r.localita||'').toUpperCase(), q) === 'in-tar'; });
      inTar.sort(function(a,b){ return (a.localita||'').length-(b.localita||'').length; });
      if (inTar.length) return inTar;
      // d) tutte le parole significative (normalizzate) presenti
      var words = qN.split(' ').filter(function(w){ return w.length > 1; });
      if (words.length > 1) {
        var byW = righe.filter(function(r) {
          var rlN = normalizzaAbbreviazioni((r.localita||'').toUpperCase());
          return words.every(function(w){ return rlN.indexOf(w) !== -1; });
        });
        if (byW.length) return byW;
      }
      return [];
    }

    // ── 1. Locality + Provincia ───────────────────────────────────
    if (locQ) {
      var byLoc = trovaPerLoc(righePorto, locQ);
      if (byLoc.length > 0) {
        if (det.prov) {
          // Provincia disponibile: valido SOLO se provincia identica
          var locProv = byLoc.filter(function(r) {
            return (r.prov||'').toUpperCase() === det.prov;
          });
          if (locProv.length > 0) return ret(locProv[0], 'loc+prov');
          // Locality ok ma provincia diversa → scarta, prova CAP
        } else {
          // Nessuna provincia nell'ordine: usa locality match diretto
          return ret(byLoc[0], 'loc');
        }
      }
    }

    // ── 2b. Parole locality nelle righe con CAP corrispondente ──────
    if (capQ) {
      var byCapRows = righePorto.filter(function(r) {
        return (r.cap||'').replace(/\s/g,'') === capQ;
      });
      if (byCapRows.length > 0) {
        if (locQ) {
          var byCapLoc = trovaPerLoc(byCapRows, locQ);
          if (byCapLoc.length > 0) return ret(byCapLoc[0], 'cap+loc');
        }
        return ret(byCapRows[0], 'cap');
      }
    }

    return null;
  }

  // Calcola il costo CRT — mostra solo addizionali certi dall'ordine
  // nExtraStops = nr fermate aggiuntive oltre la prima (derivato dagli indirizzi)
  function calcolaCRT(rigaCRT, containerType, addizionali, nExtraStops, isADR, kmBase) {
    var ct    = containerType;
    var porto = (rigaCRT && rigaCRT.porto) || '';
    var costoBase = parseFloat(ct.isHC ? (rigaCRT.costo_40 || 0) : (ct.size === '20' ? (rigaCRT.costo_20 || 0) : (rigaCRT.costo_40 || 0)));
    if (isNaN(costoBase) || costoBase === 0) return null;

    costoBase = Math.round(costoBase);
    var add      = addizionali || {};
    var fuelPerc = parseFloat(add.fuel_perc || 0);
    var fuelAmt  = fuelPerc > 0 ? Math.round(costoBase * fuelPerc / 100) : 0;
    var subtotale = costoBase + fuelAmt;

    var addExtra = [];

    // HC — solo se il container è effettivamente HC
    if (ct.isHC && parseFloat(add.hc || 0) > 0)
      addExtra.push({ label: 'HC', amt: Math.round(parseFloat(add.hc)) });

    // Congestion — sempre, per porto specifico
    var congKey = porto === 'ITSPE' ? 'congestion_spe' : 'congestion_liv';
    var congAmt = Math.round(parseFloat(add[congKey] || add.congestion || 0));
    if (congAmt > 0) addExtra.push({ label: 'Congestion', amt: congAmt });

    // ADR — se segnalato sull'ordine TMS
    if (isADR && parseFloat(add.adr || 0) > 0)
      addExtra.push({ label: 'ADR', amt: Math.round(parseFloat(add.adr)) });

    // Sosta Notte — automatica se km >= 750
    var kmVal = parseFloat(kmBase || rigaCRT.km || 0);
    if (kmVal >= 750 && parseFloat(add.notte || 0) > 0)
      addExtra.push({ label: 'Sosta Notte', amt: Math.round(parseFloat(add.notte)) });

    // Extra Stop — uno per ogni fermata aggiuntiva oltre la prima
    var nStops = parseInt(nExtraStops || 0);
    if (nStops > 0) {
      var stopAmts = [
        Math.round(parseFloat(add.extra_stop   || 0)),
        Math.round(parseFloat(add.extra_stop_2 || 0)),
        Math.round(parseFloat(add.extra_stop_3 || 0)),
        Math.round(parseFloat(add.extra_stop_4 || 0))
      ];
      for (var i = 1; i < stopAmts.length; i++) {
        if (!stopAmts[i] && stopAmts[i-1]) stopAmts[i] = stopAmts[i-1];
      }
      for (var s = 0; s < nStops && s < stopAmts.length; s++) {
        if (stopAmts[s] > 0)
          addExtra.push({ label: 'Extra Stop ' + (s+1) + '°', amt: stopAmts[s] });
      }
    }

    return { costoBase: costoBase, fuelAmt: fuelAmt, fuelPerc: fuelPerc, subtotale: subtotale, addExtra: addExtra };
  }

  // ═══════════════════════════════════════════════
  //  POPUP RISULTATI
  // ═══════════════════════════════════════════════

  function apriPopup(risultati){
    var trovati  = risultati.filter(function(r){ return r.match!==null; });
    var mancanti = risultati.filter(function(r){ return r.match===null; });
    var fuelPercSalvata = localStorage.getItem(LS_FUEL_PERC)||'';
    var dataOggi = oggiDDMMYY();

    // ── Helper: etichetta equipment semplificata ──
    function equipLabel(ct){
      if(ct.isHC) return ct.size==='20'?'20\' HC':'40\' HC';
      return ct.size==='20'?'20\'':'40\'';
    }

    // ── Raggruppa trovati per tratta + tipo equipment ──
    // costoB vuoto (taglia non presente nel listino) → sposta in mancanti
    var gruppiMap = {};
    var gruppiOrdine = [];
    trovati.forEach(function(r){
      var m=r.match, ct=r.containerType;
      var costoB = ct.isHC ? (m.costo_40||'') : (ct.size==='20' ? (m.costo_20||'') : (m.costo_40||''));

      // Se il listino matcha la tratta ma non ha il costo per questa taglia → mancanti
      if(costoB===''){
        mancanti.push(r);
        return;
      }

      var chiave = [norm(m.luogo_1),norm(m.luogo_2),norm(m.delivery_place),
                    norm(m.porto_riferimento),norm(m.traffic_type),norm(m.committente)].join('||');
      // gKey include anche la taglia → 20' e 40' HC sono gruppi separati
      var equipKey = ct.size+(ct.isHC?'hc':'');
      var gKey = chiave + '||' + equipKey + '||' + costoB;
      if(!gruppiMap[gKey]){
        var extras=[];
        if(ct.isHC&&m.costo_hc&&m.costo_hc!=='') extras.push('+ \u20ac'+m.costo_hc+' HC');
        if(m.congestion&&m.congestion!=='')        extras.push('+ \u20ac'+m.congestion+' Congestion');
        if(m.extra_stop&&m.extra_stop!=='')        extras.push('+ \u20ac'+m.extra_stop+' Extra Stop');
        if(m.s_notte&&m.s_notte!=='')              extras.push('+ \u20ac'+m.s_notte+' Sosta Notte');
        if(m.allaccio_rf&&m.allaccio_rf!=='') {
          var _rfBase=parseFloat(costoB||0);
          if(hasFuel&&_rfBase>0&&parseFloat(fuelPercSalvata)>0)
            _rfBase=_rfBase*(1+parseFloat(fuelPercSalvata)/100);
          var _rfAmt=_rfBase>0?Math.round(_rfBase*parseFloat(m.allaccio_rf)/100):0;
          if(_rfAmt>0) extras.push('+\u20ac'+_rfAmt+'\u00a0Reefer\u00a0('+m.allaccio_rf+'%)');
        }
        if(m.adr&&m.adr!=='')                      extras.push('+ \u20ac'+m.adr+' ADR');
        var hasFuel=norm(m.fuel)==='si';
        gruppiMap[gKey] = {
          gKey:gKey, chiave:chiave,
          indirizzi:r.indirizzi, indirizziParsed:r.indirizziParsed, isADR:r.isADR||false, delivery_place:r.delivery_place,
          committente:r.committente, traffic:r.traffic, porto:r.porto,
          costoB:costoB, extras:extras, hasFuel:hasFuel,
          equip:equipLabel(ct),
          note:m.note||'', data_validita:m.data_validita||'',
          containerType:ct,
          containers:[]
        };
        gruppiOrdine.push(gKey);
      }
      gruppiMap[gKey].containers.push({
        containerNr:r.containerNr, containerTypeRaw:r.containerTypeRaw,
        lef:r.lef, orderId:r.orderId
      });
    });

    // thCols per trovati: aggiunta colonna Equip.
    var thColsTrovati =
      '<th>Containers</th><th>Equip.</th><th>Indirizzi</th><th>Delivery Place</th>' +
      '<th>Committente</th><th>Traffic</th><th>Porto</th>' +
      '<th>Costo</th><th>Note</th><th>Validit\u00e0</th><th class="no-print">Vettori</th><th class="no-print">Azioni</th>';

    // Raggruppa mancanti per tratta + equip
    var mGruppiM = [];
    (function(){
      var mappa = {};
      mancanti.forEach(function(r){
        var ct = r.containerType;
        var eqKey = ct.size + (ct.isHC ? 'hc' : '');
        var mKey = [norm(r.indirizzi[0]||''),norm(r.indirizzi[1]||''),
                    norm(r.delivery_place),norm(r.porto),
                    norm(r.traffic),norm(r.committente),eqKey].join('||');
        if (!mappa[mKey]) {
          mappa[mKey] = { mKey:mKey, equip:equipLabel(ct), containerType:ct,
            indirizzi:r.indirizzi, indirizziParsed:r.indirizziParsed, isADR:r.isADR||false, delivery_place:r.delivery_place,
            committente:r.committente, traffic:r.traffic, porto:r.porto,
            containers:[] };
          mGruppiM.push(mappa[mKey]);
        }
        mappa[mKey].containers.push(r);
      });
    })();

    // ── Leggi CRT e addizionali, calcola match per ogni gruppo mancante ──
    var _crtRows = [];
    var _addCRT  = {};
    try {
      _crtRows = _readCrtRows();
    } catch(e) {}
    try {
      var _rawAdd = localStorage.getItem(LS_ADDIZIONALI);
      if (_rawAdd) _addCRT = JSON.parse(_rawAdd);
    } catch(e) {}
    // Leggi KM salvati manualmente (localStorage: tcp_km_tratte)
    var _kmTratte = {};
    try {
      var _rawKm = localStorage.getItem('tcp_km_tratte');
      if (_rawKm) _kmTratte = JSON.parse(_rawKm);
    } catch(e) {}

    // Calcola match CRT per ogni gruppo mancante
    // Espone trovati e mancanti separatamente per evitare offset nei bottoni
    window._gccTrovatiGroups  = gruppiOrdine.map(function(k){ var g=gruppiMap[k]; g._gKey=k; return g; });
    window._gccMancantiGroups = mGruppiM.slice();

    mGruppiM.forEach(function(g) {
      var indirizzi = g.indirizzi || [];
      var isDoppia  = indirizzi.length > 1 && (indirizzi[1] || '').trim() !== '';
      var porto     = (g.porto || '').toUpperCase();

      // Chiave KM per questa coppia di indirizzi
      var kmKey = [norm(indirizzi[0]||''), norm(indirizzi[1]||''), norm(porto)].join('|||');

      if (isDoppia) {
        // Doppia località: cerca prima KM salvati manualmente
        if (_kmTratte[kmKey]) {
          var kmSalvati = parseFloat(_kmTratte[kmKey]);
          // Cerca nel CRT la riga con KM più vicini
          var rigaKm = null;
          var diffMin = Infinity;
          _crtRows.filter(function(r){ return (r.porto||'')=== porto || porto===''; }).forEach(function(r) {
            var km = parseFloat(r.km || 0);
            if (km > 0) {
              var diff = Math.abs(km - kmSalvati);
              if (diff < diffMin) { diffMin = diff; rigaKm = r; }
            }
          });
          if (rigaKm) {
            var calc = calcolaCRT(rigaKm, g.containerType, _addCRT, Math.max(0, indirizzi.length - 1), g.isADR, parseFloat(rigaKm.km||0));
            if (calc) {
              g.crtMatch = { riga: rigaKm, metodo: 'km', label: kmSalvati + ' km A/R → ' + rigaKm.localita };
              g.crtCalc  = calc;
            }
          }
        }
        // Se non ci sono KM salvati, segnala che servono KM manuali
        if (!g.crtMatch) {
          g.crtNeedKm = true;
          g.crtKmKey  = kmKey;
        }
      } else {
        // Singola località: cerca nel CRT usando dati parsati (loc+prov+cap)
        var parsed0 = (g.indirizziParsed && g.indirizziParsed[0]) || null;
        var match = cercaCRT(parsed0 || indirizzi[0] || '', porto, _crtRows);
        if (match) {
          var calc = calcolaCRT(match.riga, g.containerType, _addCRT, 0, g.isADR, parseFloat(match.riga.km||0));
          if (calc) {
            g.crtMatch = match;
            g.crtCalc  = calc;
          }
        }
      }
      g.isDoppia = isDoppia;
      g.kmKey    = kmKey;
    });

    var thCols =
      '<th>Containers</th><th>Equip.</th><th>Indirizzi</th><th>Delivery Place</th>' +
      '<th>Committente</th><th>Traffic</th><th>Porto</th>' +
      '<th>Costo CRT</th><th>Note</th><th>Validit\u00e0</th><th class="no-print">Vettori</th><th class="no-print">Azioni</th>';

    // Genera HTML trovati raggruppati
    var htmlTrovati='';
    gruppiOrdine.forEach(function(gKey, gi){
      var g = gruppiMap[gKey];
      var n = g.containers.length;

      var costoHtml =
        '<span style="font-weight:bold;color:#27ae60">\u20ac'+g.costoB+'</span>'+
        (g.hasFuel?' <span class="fuel-cell" data-base="'+g.costoB+'" style="color:#e67e22;font-size:11px"></span>':'')+
        (g.extras.length?' <span style="color:#7f8c8d;font-size:11px"> '+g.extras.join(' ')+'</span>':'');

      // Encode containers list for the badge
      var ctrsJson = JSON.stringify(g.containers).replace(/"/g,'&quot;');

      htmlTrovati+=
        '<tr id="trow_'+gi+'">'+
        '<td>'+
          '<button class="btn-ctr-badge" data-gi="'+gi+'" data-ctrs="'+ctrsJson+'" '+
            'style="padding:4px 10px;border:none;background:#2471a3;color:white;border-radius:5px;cursor:pointer;font-size:11px;font-weight:bold;white-space:nowrap;">'+
            '&#x1F4E6; '+n+(n===1?' container':' containers')+
          '<\/button>'+
        '</td>'+
        '<td><span style="display:inline-block;background:#eaf0fb;color:#1a5276;font-weight:bold;font-size:11px;padding:2px 8px;border-radius:4px;white-space:nowrap;">'+g.equip+'<\/span><\/td>'+
        '<td style="line-height:1.4">'+(g.indirizziParsed&&g.indirizziParsed.length&&g.indirizziParsed[0]&&g.indirizziParsed[0].loc?g.indirizziParsed.map(function(p,i,arr){var loc=(p&&p.loc)||'';var prov=(p&&p.prov)?'<span style="color:#555"> ('+p.prov+')</span>':'';var cap=(p&&p.cap)?'<br><span style="font-size:10px;color:#aaa;letter-spacing:.5px">'+p.cap+'</span>':'';var sep=i<arr.length-1?'<span style="color:#bbb;margin:0 4px">&#x2192;</span>':'';return (loc?loc+prov+cap:'')+sep;}).join(''):g.indirizzi.join(' \u2192 '))+'</td>'+
        '<td>'+g.delivery_place+'</td>'+
        '<td>'+g.committente+'</td>'+
        '<td>'+g.traffic+'</td>'+
        '<td>'+g.porto.toUpperCase()+'</td>'+
        '<td style="white-space:nowrap" id="tcosto_'+gi+'">'+costoHtml+'</td>'+
        '<td style="color:#888;font-size:11px" id="tnote_'+gi+'">'+(g.note||'')+'</td>'+
        '<td style="color:#aaa;font-size:11px" id="tdata_'+gi+'">'+(g.data_validita||'')+'</td>'+
        '<td class="no-print" style="white-space:nowrap">'+
          '<button title="Confronta vettori" '+
            'style="padding:3px 9px;background:#d35400;color:white;border:none;border-radius:3px;cursor:pointer;font-size:14px" '+
            'data-vgi="'+gi+'" '+
            'onclick="showVettoriByKey(this.dataset.vgi,\'t\')">&#x1F69A;<\/button>'+
        '</td>'+
        '<td class="no-print" style="white-space:nowrap">'+
          '<button class="btn-modifica" data-chiave="'+g.chiave+'" data-gi="'+gi+'" title="Modifica tariffa" '+
            'style="padding:4px 9px;border:none;background:#8e44ad;color:white;border-radius:4px;cursor:pointer;font-size:13px;margin-right:4px;">&#x270F;<\/button>'+
          '<button class="btn-cancella" data-chiave="'+g.chiave+'" data-gi="'+gi+'" title="Cancella tariffa" '+
            'style="padding:4px 9px;border:none;background:#c0392b;color:white;border-radius:4px;cursor:pointer;font-size:13px;">&#x1F5D1;<\/button>'+
        '</td>'+
        '</tr>';
    });

    var htmlMancanti='';
    mGruppiM.forEach(function(g,mgi){
      var n=g.containers.length;

      // Costruisci cella costo CRT
      var costoCrtHtml = '';
      if (g.crtCalc) {
        var c = g.crtCalc;
        var metodo = g.crtMatch ? g.crtMatch.label : '';
        // €280 + €42 fuel (15%) = €322
        var riga1 = '€' + c.costoBase;
        if (c.fuelAmt > 0) riga1 += ' + €' + c.fuelAmt + ' fuel (' + c.fuelPerc + '%) = €' + c.subtotale;
        // + €30 HC + €50 ADR ...
        var riga2 = c.addExtra.map(function(x){ return '+ €' + x.amt + ' ' + x.label; }).join(' ');
        costoCrtHtml =
          '<span style="font-weight:bold;color:#8e44ad;font-size:12px">' + riga1 + '</span>' +
          (riga2 ? '<span style="color:#7f8c8d;font-size:11px"> &nbsp;' + riga2 + '</span>' : '') +
          '<br><span style="font-size:10px;color:#2980b9;font-style:italic">&#x1F4CC; ' + metodo + '</span>';
      } else if (g.crtNeedKm) {
        costoCrtHtml =
          '<span style="color:#e67e22;font-size:11px">&#x1F69A; Doppia loc. &mdash; </span>' +
          '<button class="btn-km" data-mgi="' + mgi + '" ' +
            'style="padding:2px 8px;border:none;background:#e67e22;color:white;border-radius:3px;cursor:pointer;font-size:11px">' +
            'Inserisci KM' +
          '</button>';
      } else if (_crtRows.length === 0) {
        // CRT vuoto ma non in caricamento: Gist non ha tariffe
        // Procedi comunque mostrando i concordati esistenti
        console.warn('[GCC] Concordati: _crtRows vuoto, nessuna tariffa CRT disponibile');
        costoCrtHtml = '<span style="color:#aaa;font-size:11px">Tariffario CRT non caricato</span>';
      } else {
        costoCrtHtml = '<span style="color:#c0392b;font-style:italic;font-size:11px">-- no match CRT --</span>';
      }

      htmlMancanti+=
        '<tr id="mrow_'+mgi+'">'+
        '<td><span style="display:inline-block;background:#c0392b;color:white;'+
          'font-weight:bold;font-size:11px;padding:2px 10px;border-radius:5px;white-space:nowrap">'+
          '&#x1F4E6; '+n+(n===1?' container':' containers')+
        '</span></td>'+
        '<td><span style="display:inline-block;background:#fde8e8;color:#c0392b;'+
          'font-weight:bold;font-size:11px;padding:2px 8px;border-radius:4px">'+
          g.equip+'</span></td>'+
        '<td style="line-height:1.4">'+(g.indirizziParsed&&g.indirizziParsed.length&&g.indirizziParsed[0]&&g.indirizziParsed[0].loc?g.indirizziParsed.map(function(p,i,arr){var loc=(p&&p.loc)||'';var prov=(p&&p.prov)?'<span style="color:#555"> ('+p.prov+')</span>':'';var cap=(p&&p.cap)?'<br><span style="font-size:10px;color:#aaa;letter-spacing:.5px">'+p.cap+'</span>':'';var sep=i<arr.length-1?'<span style="color:#bbb;margin:0 4px">&#x2192;</span>':'';return (loc?loc+prov+cap:'')+sep;}).join(''):g.indirizzi.join(' \u2192 '))+'</td>'+
        '<td>'+g.delivery_place+'</td>'+
        '<td>'+g.committente+'</td>'+
        '<td>'+g.traffic+'</td>'+
        '<td>'+g.porto.toUpperCase()+'</td>'+
        '<td id="mcosto_'+mgi+'" style="white-space:nowrap;line-height:1.6">'+costoCrtHtml+'</td>'+
        '<td style="font-size:11px;color:#888" id="mnote_'+mgi+'"></td>'+
        '<td style="color:#aaa;font-size:11px" id="mdata_'+mgi+'"></td>'+
        '<td class="no-print" style="white-space:nowrap">'+
          '<button title="Confronta vettori" '+
            'style="padding:3px 9px;background:#d35400;color:white;border:none;border-radius:3px;cursor:pointer;font-size:14px" '+
            'data-vmgi="'+mgi+'" '+
            'onclick="showVettoriByKey(this.dataset.vmgi,\'m\')">&#x1F69A;<\/button>'+
        '</td>'+
        '<td class="no-print" style="white-space:nowrap">'+
          '<button data-mgi="'+mgi+'" class="btn-ins" '+
            'style="padding:3px 7px;background:#e67e22;color:white;border:none;border-radius:3px;cursor:pointer;font-size:12px">'+
            '&#x270F;<\/button>'+
        '</td>'+
        '</tr>';
    });

    var css=
      'body{font-family:Arial,sans-serif;padding:0;background:#f4f6f8;margin:0}'+
      '#topbar{display:flex;align-items:center;justify-content:space-between;background:#1a5276;color:white;padding:10px 18px;position:sticky;top:0;z-index:100;gap:10px}'+
      '#topbar h2{margin:0;font-size:16px;white-space:nowrap}'+
      '#topbar-right{display:flex;align-items:center;gap:10px}'+
      '#search-res{padding:6px 10px;border:none;border-radius:5px;font-size:12px;width:220px;background:rgba(255,255,255,.15);color:white;}'+
      '#search-res::placeholder{color:rgba(255,255,255,.65)}'+
      '#search-res:focus{outline:none;background:white;color:#333}'+
      '#fuel-box{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);padding:6px 12px;border-radius:7px;font-size:13px}'+
      '#fuel-box label{margin:0;font-weight:bold;white-space:nowrap}'+
      '#fuel-toggle{cursor:pointer;background:#555;border:none;color:white;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:bold}'+
      '#fuel-toggle.on{background:#e67e22}'+
      '#fuel-perc-wrap{display:none;align-items:center;gap:4px}'+
      '#fuel-perc-wrap.show{display:flex}'+
      '#fuel-perc{width:58px;padding:4px 6px;border:none;border-radius:4px;font-size:13px;text-align:center}'+
      '#btn-stampa{cursor:pointer;background:#16a085;border:none;color:white;padding:6px 14px;border-radius:5px;font-size:12px;font-weight:bold;white-space:nowrap}'+
      '#content{padding:18px}'+
      '.section{background:white;border-radius:8px;padding:14px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.1)}'+
      '.section-title{font-size:15px;font-weight:bold;margin-bottom:10px}'+
      '.ok{color:#27ae60}.warn{color:#e67e22}'+
      'table{width:100%;border-collapse:collapse;font-size:12px}'+
      'th{background:#1a5276;color:white;padding:7px 8px;text-align:left;white-space:nowrap}'+
      'td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:middle}'+
      'tr:hover td{background:#f0f7ff}'+
      '.empty{color:#aaa;font-style:italic;padding:10px}'+
      '.btn-exp{padding:8px 18px;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:bold;background:#27ae60;color:white;margin-top:10px}'+
      '#overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center}'+
      '#overlay.show{display:flex}'+
      '#modale{background:white;border-radius:10px;padding:26px;width:480px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.3)}'+
      '#modale h3{margin:0 0 4px;color:#1a5276;font-size:15px}'+
      '.sub{font-size:11px;color:#888;margin-bottom:14px}'+
      '.sep{height:1px;background:#eee;margin:12px 0}'+
      '.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}'+
      '.form-grid label{font-size:11px;color:#555;font-weight:bold;display:flex;flex-direction:column;gap:3px}'+
      '.form-grid input{padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px}'+
      '.form-grid input:focus{outline:none;border-color:#2980b9;box-shadow:0 0 0 2px rgba(41,128,185,.15)}'+
      '.full{grid-column:1/-1}'+
      '.fuel-row{display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fef9e7;border-radius:6px;border:1px solid #f9ca24;margin-top:10px}'+
      '.fuel-row label{font-size:12px;font-weight:bold;color:#7d6608;margin:0}'+
      '#m-fuel-toggle{cursor:pointer;padding:5px 14px;border:none;border-radius:4px;font-size:12px;font-weight:bold;background:#bdc3c7;color:#333}'+
      '#m-fuel-toggle.on{background:#e67e22;color:white}'+
      '.fuel-hint{font-size:11px;color:#999;margin-left:auto}'+
      '.modal-btns{margin-top:18px;display:flex;justify-content:flex-end;gap:8px}'+
      '.modal-btns button{padding:8px 18px;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:bold}'+
      '.btn-save{background:#27ae60;color:white}.btn-cancel{background:#bdc3c7;color:#333}'+
      '.riga-highlight td{background:#ffe000!important;transition:background 0.3s}'+
      /* dropdown containers */
      '#ctr-dropdown{display:none;position:fixed;z-index:99999;background:white;border:1px solid #d0d7de;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.18);min-width:320px;max-width:480px;padding:6px 0;font-family:Arial,sans-serif;}'+
      '#ctr-dropdown.show{display:block}'+
      '#ctr-dropdown-title{font-size:11px;font-weight:bold;color:#888;padding:4px 12px 6px;border-bottom:1px solid #f0f0f0;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}'+
      '.ctr-item{display:flex;align-items:center;gap:8px;padding:5px 12px;}'+
      '.ctr-item:hover{background:#f0f7ff}'+
      '.ctr-nr{font-size:12px;font-weight:bold;color:#1a5276;font-family:monospace;min-width:130px}'+
      '.ctr-lef{font-size:11px;color:#888;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
      '.ctr-nav{padding:3px 8px;border:none;background:#2980b9;color:white;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;flex-shrink:0}'+
      '@page{size:A4 landscape;margin:8mm}'+
      '@media print{'+
        '.no-print{display:none!important}'+
        'table{font-size:9px}td,th{padding:2px 4px!important}'+
        '#topbar,#overlay{display:none!important}'+
        'body{background:white}'+
        '.section{box-shadow:none;border:1px solid #ccc;break-inside:avoid}'+
        '#print-header{display:block!important}'+
        'tr:hover td{background:white!important}'+
        'th{background:#1a5276!important;color:white!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
        'body.print-solo-trovati #sect-mancanti{display:none!important}'+
        'body.print-solo-mancanti #sect-trovati{display:none!important}'+
      '}'+
      '#print-header{display:none;margin-bottom:16px;border-bottom:2px solid #1a5276;padding-bottom:8px}'+
      '#print-header h2{margin:0 0 2px;color:#1a5276;font-size:18px}'+
      '#print-header p{margin:0;font-size:11px;color:#666}'+
      '#km-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99998;align-items:center;justify-content:center}'+
      '#km-overlay.show{display:flex}'+
      '#km-modale{background:white;border-radius:10px;padding:26px;width:400px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.3);font-family:Arial,sans-serif}'+
      '#km-modale h3{margin:0 0 6px;color:#e67e22;font-size:15px}'+
      '#km-modale-sub{font-size:11px;color:#888;margin-bottom:14px;border-bottom:1px solid #eee;padding-bottom:10px}'+
      '#km-modale label{font-size:12px;font-weight:bold;color:#555;display:block;margin-bottom:6px}'+
      '#km-input{padding:8px 10px;border:1px solid #ccc;border-radius:5px;font-size:16px;width:140px;box-sizing:border-box}'+
      '#km-hint{font-size:11px;color:#999;margin-top:4px;margin-bottom:14px}'+
      '#km-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}'+
      '#km-btns button{padding:8px 18px;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:bold}'+
      '#km-btn-salva{background:#e67e22;color:white}'+
      '#km-btn-annulla{background:#bdc3c7;color:#333}';

    // scriptData: identico a v9.1 tranne _gruppi aggiunto,
    // apriModaleModifica e cancellaRigaTrovati aggiornati per gi
    var scriptData=
      'var _mancanti='+JSON.stringify(mancanti)+';'+
      'var _mGruppiM='+JSON.stringify(mGruppiM)+';'+
      'var _trovati='+JSON.stringify(trovati)+';'+
      'var _gruppi='+JSON.stringify(gruppiOrdine.map(function(k){ return gruppiMap[k]; }))+';'+
      'var _LS_LISTINO="'+LS_LISTINO+'";'+
      'var _LS_FUEL_PERC="'+LS_FUEL_PERC+'";'+
      'var _LS_KM_TRATTE="tcp_km_tratte";'+
      'var _crtRowsPopup='+JSON.stringify(_crtRows)+';'+
      'var _addCRTPopup='+JSON.stringify(_addCRT)+';'+
      'var _vettoriLoading='+(_gcc_vettori_loading?'true':'false')+';'+
      'var _vettoriCount='+(_gcc_vettori_reg?_gcc_vettori_reg.length:0)+';'+
      'var _idxCorrente=null;'+
      'var _chiaveCorrente=null;'+
      'var _giCorrente=null;'+
      'var _modalMode="nuovo";'+
      'var _fuelOn=false;'+
      'var _mFuelOn=false;'+
      'var _dataOggi="'+dataOggi+'";'+

      'function showVettoriByKey(key,tipo){'+
      'if(!window.opener||!window.opener._gccCalcolaVettori){alert("Dati vettori non disponibili. Ricarica lo script.");return;}'+
      'var loading=!!(window.opener._gcc_vettori_loading);'+
      'if(loading){alert("Vettori in caricamento, attendi un momento e riprova.");return;}'+
      'if(!_vettoriCount){alert("Nessun vettore configurato.\\nUsa Gestisci Vettori e poi riapri i concordati.");return;}'+
      'var g=null;'+
      'if(key.substring(0,2)==="t:"){'+
        'var _gk=key.substring(2);'+
        'var _tg=window.opener._gccTrovatiGroups||[];'+
        'for(var _i=0;_i<_tg.length;_i++){if(_tg[_i]&&(_tg[_i]._gKey===_gk||_tg[_i].gKey===_gk)){g=_tg[_i];break;}}'+
      '}else if(key.substring(0,2)==="m:"){'+
        'var _mi=parseInt(key.substring(2));'+
        'var _mg=window.opener._gccMancantiGroups||[];'+
        'if(!isNaN(_mi)&&_mi<_mg.length)g=_mg[_mi];'+
      '}'+
      'if(!g){alert("Gruppo non trovato. Riapri i concordati.");return;}'+
      'var res=JSON.parse(window.opener._gccCalcolaVettori(JSON.stringify(g)));'+
      'document.querySelectorAll(".gcc-vp-ov").forEach(function(e){e.remove();});'+
      'var ov=document.createElement("div");ov.className="gcc-vp-ov";'+
      'ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9998";'+
      'var pn=document.createElement("div");'+
      'pn.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.35);z-index:9999;width:620px;max-width:96vw;max-height:80vh;overflow-y:auto";'+
      'var porto=(g.porto||"").toUpperCase();'+
      'var ct=g.containerType||{size:"40",isHC:false};'+
      'var ctL=ct.isHC?(ct.size==="20"?"20\' HC":"40\' HC"):(ct.size==="20"?"20\'":"40\'");'+
      'var _loc=(res[0]&&res[0]._loc)||(g.indirizziParsed&&g.indirizziParsed[0]?g.indirizziParsed[0].loc:"");'+
      'var h="<div style=\\"background:linear-gradient(135deg,#d35400,#e67e22);color:white;padding:12px 18px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center\\"><b>\uD83D\uDE9A Confronto Vettori &#8212; "+(_loc?_loc+" &#8212; ":"")+porto+" &#8212; "+ctL+"</b><button id=\\"gcc-vp-x\\" style=\\"background:rgba(255,255,255,.2);border:none;color:white;cursor:pointer;font-size:18px;border-radius:4px;padding:1px 10px\\">&times;</button></div>";'+
      'h+="<div style=\\"padding:16px\\">";'+
      'if(res.length&&res[0]&&res[0]._diag){'+
        'var _d=res[0];'+
        'if(_d._diag==="MULTI_STOP"){'+
          'h+="<div style=\\"padding:16px;color:#e67e22;text-align:center\\">\uD83D\uDEA7 "+_d.msg+"</div>";'+
        '}else if(_d._diag==="NO_REG"||_d._diag==="NO_TARIFFE"){'+
          'h+="<div style=\\"color:#e74c3c;padding:16px;text-align:center\\">\u26A0 "+_d.msg+"</div>";'+
        '}else if(_d._diag==="NO_MATCH"){'+
          'h+="<p style=\\"color:#888;margin-bottom:8px\\">Nessun vettore copre questa tratta.</p>";'+
          'h+="<ul style=\\"font-size:11px;color:#aaa;list-style:none;padding:0\\">";'+
          '(_d.details||[]).forEach(function(x){h+="<li>&#x2716; "+x+"</li>";});'+
          'h+="</ul>"+(_d.km?"<p style=\\"font-size:11px;color:#aaa\\">KM trovati: "+_d.km+"</p>":"");'+
        '}else{'+
          'h+="<p style=\\"color:#888\\">"+ (_d.msg||JSON.stringify(_d))+"</p>";'+
        '}'+
      '}else if(!res.length){'+
        'h+="<p style=\\"color:#aaa;text-align:center;padding:20px\\">Nessun vettore trovato.</p>";'+
      '}else{'+
        'res.forEach(function(v,i){'+
          'if(!v||v._diag)return;'+
          'var addStr=(v.addExtra||[]).map(function(a){return" +\u20ac"+a.amt+"\u00a0"+a.label;}).join("");'+
          'var bg=i===0?"#fff8f0":"#f8f9fa";'+
          'var bd=i===0?"border:1px solid #f5a623":"border:1px solid #eee";'+
          'var medal=i===0?"\uD83E\uDD47":i===1?"\uD83E\uDD48":i===2?"\uD83E\uDD49":""+(i+1)+".";'+
          'var cStr="\u20ac"+(v.costoBase||0);'+
          'if(v.fuelAmt>0)cStr+=" +\u20ac"+v.fuelAmt+" fuel ("+v.fuelPerc+"%) = \u20ac"+v.subtotale;'+
          'if(addStr)cStr+=addStr;'+
          'var showDet=(cStr!=="\u20ac"+(v.totale||0));'+
          'h+="<div style=\\"border-radius:7px;margin-bottom:8px;background:"+bg+";"+bd+"\\">";'+
          'h+="<div style=\\"display:flex;align-items:center;gap:10px;padding:9px 12px\\">";'+
          'h+="<span style=\\"font-size:18px;width:28px;text-align:center\\">"+medal+"</span>";'+
          'h+="<span style=\\"font-weight:bold;min-width:120px;font-size:13px\\">"+( v.nome||"?")+ "</span>";'+
          'if(showDet)h+="<span style=\\"flex:1;font-size:12px;color:#555\\">"+cStr+"</span>";'+
          'h+="<span style=\\"font-size:16px;font-weight:bold;color:#27ae60;margin-left:auto\\">\u20ac"+(v.totale||0)+"</span></div>";'+
          'if(v.matchInfo)h+="<div style=\\"font-size:10px;color:#aaa;padding:0 12px 7px 58px\\">\uD83D\uDCCC "+v.matchInfo+"</div>";'+
          'h+="</div>";'+
        '});'+
      '}'+
      'h+="</div>";'+
      'pn.innerHTML=h;pn.id="gcc-vp-panel";document.body.appendChild(ov);document.body.appendChild(pn);'+'document.getElementById("gcc-vp-x").onclick=function(){ov.remove();pn.remove();};'+
      'ov.onclick=function(){ov.remove();pn.remove();};'+
      '}'+

      'function stampaConcordati(){'+
  'var sel=document.getElementById("print-sel").value;'+
  'var st=document.getElementById("sect-trovati");'+
  'var sm=document.getElementById("sect-mancanti");'+
  'var parts=[];'+
  'if(sel==="all"||sel==="trovati")parts.push(st?st.outerHTML:"");'+
  'if(sel==="all")parts.push("<div style=\\"height:20px\\"></div>");'+
  'if(sel==="all"||sel==="mancanti")parts.push(sm?sm.outerHTML:"");'+
  'var now=new Date();var ds=now.getDate()+"/"+(now.getMonth()+1)+"/"+now.getFullYear();'+
  'var hdr="<div style=\\"border-bottom:2px solid #1a5276;margin-bottom:14px;padding-bottom:6px;display:flex;justify-content:space-between;align-items:flex-end\\"><div><h2 style=\\"margin:0;color:#1a5276;font-size:16px\\">Listino Concordati</h2><p style=\\"margin:2px 0 0;font-size:11px;color:#666\\">Stampato il "+ds+"</p></div><p style=\\"margin:0;font-size:11px;color:#888\\">Savino Del Bene S.p.A.</p></div>";'+
  'var pw=window.open("","gcc_print","width=1400,height=900,toolbar=0,menubar=0,location=0,scrollbars=1");'+
  'pw.document.write("<html><head><title>Listino Concordati</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;padding:10px;font-size:10px}table{width:100%;border-collapse:collapse;font-size:9px}th{padding:4px 6px;text-align:left;background:#1a5276;color:#fff;font-size:9px}td{padding:3px 6px;border-bottom:1px solid #eee;font-size:9px}.no-print,.btn-ins,.btn-vettori{display:none!important}.section{margin-bottom:20px;padding-bottom:8px}.section-title{font-weight:bold;font-size:11px;margin:0 0 6px;padding:4px 8px;border-radius:3px}.section-title.ok{background:#d5f5e3;color:#1a5276}.section-title.warn{background:#fdebd0;color:#784212}.badge-container{display:inline-block}</style></head><body>"+hdr+parts.join("") +"</body></html>");'+
  'pw.document.close();pw.focus();setTimeout(function(){pw.print();},400);'+
'}'+
'function pushGist(rows){var tok=localStorage.getItem("tcp_gcc_token");if(!tok)return;fetch("https://api.github.com/gists/93f3fe07c908d94f152c56ad805202f5",{method:"PATCH",headers:{"Authorization":"token "+tok,"Content-Type":"application/json"},body:JSON.stringify({files:{"tcp_listino.json":{content:JSON.stringify({rows:rows,updated_at:new Date().toISOString()},null,2)}}})}).catch(function(){});}'+
      /* ── data input auto-format DD/MM/YY ── */
      'function initDataInput(el){'+
        'el.value=_dataOggi;'+
        'el.addEventListener("input",function(){'+
          'var v=this.value.replace(/[^0-9]/g,"");'+
          'var out="";'+
          'if(v.length>0)out=v.substring(0,2);'+
          'if(v.length>=3)out+="/"+v.substring(2,4);'+
          'if(v.length>=5)out+="/"+v.substring(4,6);'+
          'this.value=out;'+
        '});'+
        'el.addEventListener("keydown",function(e){'+
          'if(e.key==="Backspace"&&this.value.endsWith("/"))this.value=this.value.slice(0,-1);'+
        '});'+
      '}'+
      'initDataInput(document.getElementById("f_data_validita"));'+

      /* ── init fuel% da localStorage ── */
      '(function(){'+
        'var saved="'+fuelPercSalvata+'";'+
        'if(saved){'+
          'document.getElementById("fuel-perc").value=saved;'+
          '_fuelOn=true;'+
          'var t=document.getElementById("fuel-toggle");'+
          't.textContent="Fuel ON";t.classList.add("on");'+
          'document.getElementById("fuel-perc-wrap").classList.add("show");'+
          'aggiornaFuelCells();'+
        '}'+
      '})();'+

      /* ── fuel globale ── */
      'document.getElementById("fuel-toggle").addEventListener("click",function(){'+
        '_fuelOn=!_fuelOn;'+
        'this.textContent=_fuelOn?"Fuel ON":"Fuel OFF";'+
        'this.classList.toggle("on",_fuelOn);'+
        'document.getElementById("fuel-perc-wrap").classList.toggle("show",_fuelOn);'+
        'if(!_fuelOn)localStorage.removeItem(_LS_FUEL_PERC);'+
        'aggiornaFuelCells();'+
      '});'+
      'document.getElementById("fuel-perc").addEventListener("input",function(){'+
        'localStorage.setItem(_LS_FUEL_PERC,this.value);'+
        'aggiornaFuelCells();'+
      '});'+
      'function aggiornaFuelCells(){'+
        'var perc=_fuelOn?(parseFloat(document.getElementById("fuel-perc").value)||0):0;'+
        'document.querySelectorAll(".fuel-cell").forEach(function(el){'+
          'if(perc>0){'+
            'var base=parseFloat(el.dataset.base);'+
            'var fv=Math.round(base*perc/100);'+
            'var tot=Math.round(base+fv);'+
            'el.textContent=" + \u20ac"+fv+" fuel ("+perc+"%) = \u20ac"+tot;'+
          '}else{el.textContent="";}'+
        '});'+
      '}'+

      /* ── ricerca nel popup risultati ── */
      'document.getElementById("search-res").addEventListener("input",function(){'+
        'var q=this.value.toLowerCase().trim();'+
        'document.querySelectorAll("tr[id^=\'trow_\']").forEach(function(tr){'+
          'if(!q){tr.style.display="";return;}'+
          'var txt=Array.from(tr.querySelectorAll("td")).map(function(td){return td.textContent;}).join(" ").toLowerCase();'+
          'tr.style.display=txt.includes(q)?"":"none";'+
        '});'+
        'document.querySelectorAll("tr[id^=\'mrow_\']").forEach(function(tr){'+
          'if(!q){tr.style.display="";return;}'+
          'var txt=Array.from(tr.querySelectorAll("td")).map(function(td){return td.textContent;}).join(" ").toLowerCase();'+
          'tr.style.display=txt.includes(q)?"":"none";'+
        '});'+
      '});'+

      /* ── stampa ── */
      'document.getElementById("btn-stampa").addEventListener("click",function(){stampaConcordati();});'+

      /* ── fuel toggle modale ── */
      'document.getElementById("m-fuel-toggle").addEventListener("click",function(){'+
        '_mFuelOn=!_mFuelOn;'+
        'this.textContent=_mFuelOn?"SI":"NO";'+
        'this.classList.toggle("on",_mFuelOn);'+
        'var hint=document.querySelector(".fuel-hint");'+
        'if(hint)hint.textContent=_mFuelOn?"usa il valore % in alto":"";'+
      '});'+

      /* ── navigazione verso gestionale ── */
      'function scrollToOrder(orderId, containerNr){'+
        'var win=window.opener;'+
        'if(!win){alert("Gestionale non raggiungibile");return;}'+
        'try{'+
          'var righe=win.document.querySelectorAll("tr.ui-expanded-row");'+
          'var master=null;'+
          'righe.forEach(function(r){'+
            'if(r.querySelector("td:nth-child(2)")&&r.querySelector("td:nth-child(2)").innerText.trim()===orderId) master=r;'+
          '});'+
          'if(!master){alert("Riga "+orderId+" non trovata.");return;}'+
          'var sottoRiga=null;'+
          'var nextRow=master.nextElementSibling;'+
          'if(nextRow){'+
            'var sub=nextRow.querySelector("[id*=\\"transportEquipmentsTable_data\\"]");'+
            'if(sub){'+
              'sub.querySelectorAll("tr").forEach(function(ctr){'+
                'var cnr=ctr.querySelector("td:nth-child(3)");'+
                'if(cnr&&cnr.innerText.trim()===containerNr) sottoRiga=ctr;'+
              '});'+
            '}'+
          '}'+
          'var target=sottoRiga||master;'+
          'target.scrollIntoView({behavior:"smooth",block:"center"});'+
          'var tds=target.querySelectorAll("td");'+
          'tds.forEach(function(td){td.style.setProperty("background","#ffe000","important");});'+
          'setTimeout(function(){tds.forEach(function(td){td.style.removeProperty("background");});},4000);'+
          'win.focus();'+
        '}catch(ex){alert("Errore navigazione: "+ex.message);}'+
      '}'+

      /* ── dropdown containers badge ── */
      'var _ddOpen=false;'+
      'function apriDropdown(btn){'+
        'var dd=document.getElementById("ctr-dropdown");'+
        'var list=document.getElementById("ctr-dropdown-list");'+
        'var gi=parseInt(btn.dataset.gi);'+
        'var ctrs=_gruppi[gi].containers;'+
        'var title=document.getElementById("ctr-dropdown-title");'+
        'title.textContent=ctrs.length+(ctrs.length===1?" container":" containers");'+
        'list.innerHTML=ctrs.map(function(c){'+
          'return "<div class=\'ctr-item\'>"+'+
            '"<span class=\'ctr-nr\'>"+c.containerNr+"<\/span>"+'+
            '"<span class=\'ctr-lef\'>"+(c.lef||c.orderId)+"<\/span>"+'+
            '"<button class=\'ctr-nav btn-nav-scroll\' data-orderid=\'"+c.orderId+"\' data-containernr=\'"+c.containerNr+"\'>&#x1F50D; Vai<\/button>"+'+
          '"<\/div>";'+
        '}).join("");'+
        /* posiziona sotto il badge */
        'var rect=btn.getBoundingClientRect();'+
        'dd.style.top=(rect.bottom+6)+"px";'+
        'dd.style.left=Math.min(rect.left, window.innerWidth-340)+"px";'+
        'dd.classList.add("show");'+
        '_ddOpen=true;'+
      '}'+
      'function chiudiDropdown(){'+
        'document.getElementById("ctr-dropdown").classList.remove("show");'+
        '_ddOpen=false;'+
      '}'+
      'document.addEventListener("click",function(e){'+
        'if(e.target.classList.contains("btn-ctr-badge")){'+
          'var dd=document.getElementById("ctr-dropdown");'+
          'if(dd.classList.contains("show")&&_ddOpen){chiudiDropdown();return;}'+
          'apriDropdown(e.target); return;'+
        '}'+
        'if(!e.target.closest("#ctr-dropdown"))chiudiDropdown();'+
      '});'+
      'document.addEventListener("keydown",function(e){if(e.key==="Escape")chiudiDropdown();});'+

      /* ── delegazione click globale ── */
      'document.addEventListener("click",function(e){'+
        'if(e.target.classList.contains("btn-ins")){apriModale(parseInt(e.target.dataset.mgi));}'+
        'if(e.target.classList.contains("btn-nav-scroll")){scrollToOrder(e.target.dataset.orderid,e.target.dataset.containernr);}'+
        'if(e.target.classList.contains("btn-modifica")){apriModaleModifica(e.target.dataset.chiave,parseInt(e.target.dataset.gi));}'+
        'if(e.target.classList.contains("btn-cancella")){cancellaRigaTrovati(e.target.dataset.chiave,parseInt(e.target.dataset.gi));}'+
        'if(e.target.id==="btn-export"){esportaExcel();}'+
        'if(e.target.id==="overlay"){chiudiModale();}'+
      '});'+

      /* ── apri modale MODIFICA (trovati) ── */
      'function apriModaleModifica(chiave, gi){'+
        '_modalMode="modifica";'+
        '_chiaveCorrente=chiave;'+
        '_giCorrente=gi;'+
        '_idxCorrente=null;'+
        '_mFuelOn=false;'+
        'var rigaLS=null;'+
        'try{'+
          'var lsRaw=localStorage.getItem(_LS_LISTINO);'+
          'if(lsRaw){'+
            'var lsData=JSON.parse(lsRaw);'+
            'lsData.rows.forEach(function(row){'+
              'var k=[row.luogo_1,row.luogo_2,row.delivery_place,row.porto_riferimento,row.traffic_type,row.committente]'+
                '.map(function(v){return(v||"").toString().toLowerCase().trim();}).join("||");'+
              'if(k===chiave)rigaLS=row;'+
            '});'+
          '}'+
        '}catch(e){}'+
        'document.getElementById("modale-titolo").textContent="Modifica tariffa";'+
        'var g=_gruppi[gi];'+
        'var desc=g.indirizzi.join(" \u2192 ")+" \u2014 "+g.delivery_place+" \u2014 "+g.porto.toUpperCase();'+
        'document.getElementById("modale-sub").textContent=desc;'+
        'var flds=["costo_20","costo_40","costo_hc","congestion","extra_stop","s_notte","allaccio_rf","adr","note"];'+
        'flds.forEach(function(f){'+
          'var el=document.getElementById("f_"+f);'+
          'if(el)el.value=(rigaLS&&rigaLS[f])?rigaLS[f]:"";'+
        '});'+
        'var elData=document.getElementById("f_data_validita");'+
        'elData.value=(rigaLS&&rigaLS.data_validita)?rigaLS.data_validita:_dataOggi;'+
        'var elOp2=document.getElementById("f_operatore");if(elOp2)elOp2.value=(rigaLS&&rigaLS.operatore)||"";'+
        'if(rigaLS&&(rigaLS.fuel||"").toUpperCase()==="SI"){_mFuelOn=true;}'+
        'var t=document.getElementById("m-fuel-toggle");'+
        't.textContent=_mFuelOn?"SI":"NO";t.classList.toggle("on",_mFuelOn);'+
        'var elOp=document.getElementById("f_operatore");if(elOp)elOp.value=(g._edit&&g._edit.operatore)||"";'+
        'document.getElementById("overlay").classList.add("show");'+
      '}'+

      /* ── cancella riga trovati ── */
      'function cancellaRigaTrovati(chiave, gi){'+
        'if(!confirm("Sei sicuro di voler cancellare questa tariffa dal listino?"))return;'+
        'try{'+
          'var lsRaw=localStorage.getItem(_LS_LISTINO);'+
          'if(lsRaw){'+
            'var lsData=JSON.parse(lsRaw);'+
            'lsData.rows=lsData.rows.filter(function(row){'+
              'var k=[row.luogo_1,row.luogo_2,row.delivery_place,row.porto_riferimento,row.traffic_type,row.committente]'+
                '.map(function(v){return(v||"").toString().toLowerCase().trim();}).join("||");'+
              'return k!==chiave;'+
            '});'+
            'localStorage.setItem(_LS_LISTINO,JSON.stringify(lsData));'+
          '}'+
        '}catch(e){alert("Errore cancellazione: "+e.message);return;}'+
        'var tr=document.getElementById("trow_"+gi);if(tr)tr.parentNode.removeChild(tr);'+
        'try{var _d=JSON.parse(localStorage.getItem(_LS_LISTINO)||"{}")||{};pushGist(_d.rows||[]);}catch(_e){}'+
      '}'+

      /* ── apri modale INSERIMENTO (mancanti) ── */
      'function apriModale(mgi){'+
        '_idxCorrente=mgi;_mFuelOn=false;'+
        '_modalMode="nuovo";'+
        'var g=_mGruppiM[mgi];'+
        'document.getElementById("modale-titolo").textContent="Inserisci tariffa";'+
        'var _desc=(g.indirizzi||[]).join(" \u2192 ")+" \u2014 "+g.delivery_place+" \u2014 "+g.equip+(g.containers.length>1?" ("+g.containers.length+" containers)":"");'+
        'document.getElementById("modale-sub").textContent=_desc;'+
        'var flds=["costo_20","costo_40","costo_hc","congestion","extra_stop","s_notte","allaccio_rf","adr","note"];'+
        'flds.forEach(function(f){var el=document.getElementById("f_"+f);if(el)el.value=(g._edit&&g._edit[f])||"";});'+
        'var elData=document.getElementById("f_data_validita");'+
        'elData.value=(g._edit&&g._edit.data_validita)?g._edit.data_validita:_dataOggi;'+
        'if(g._edit&&g._edit.fuel==="SI"){_mFuelOn=true;}'+
        'var t=document.getElementById("m-fuel-toggle");'+
        't.textContent=_mFuelOn?"SI":"NO";t.classList.toggle("on",_mFuelOn);'+
        'document.getElementById("overlay").classList.add("show");'+
      '}'+

      'function chiudiModale(){'+
        'document.getElementById("overlay").classList.remove("show");'+
        '_idxCorrente=null;_chiaveCorrente=null;_giCorrente=null;_modalMode="nuovo";'+
      '}'+
      'document.getElementById("btn-annulla").addEventListener("click",chiudiModale);'+
      'document.getElementById("btn-salva").addEventListener("click",salvaModale);'+

      /* ── salva modale (nuovo inserimento da mancanti) ── */
      'function salvaModale(){'+
        'if(_modalMode==="modifica"){salvaModifica();return;}'+
        'if(_idxCorrente===null)return;'+
        'var edit={};'+
        'var flds=["costo_20","costo_40","costo_hc","congestion","extra_stop","s_notte","allaccio_rf","adr","data_validita","note"];'+
        'flds.forEach(function(f){var el=document.getElementById("f_"+f);if(el)edit[f]=el.value.trim();});'+
        'edit.fuel=_mFuelOn?"SI":"NO";'+
        'edit.operatore=(document.getElementById("f_operatore")||{value:""}).value.trim().toUpperCase();'+
        'var mgi=_idxCorrente;var g=_mGruppiM[mgi];g._edit=edit;'+
        'var r=g.containers[0];'+
        'var nuovaRiga={'+
          'luogo_1:(r.indirizzi&&r.indirizzi[0])||"",' +
          'luogo_2:(r.indirizzi&&r.indirizzi[1])||"",' +
          'delivery_place:r.delivery_place||"",' +
          'porto_riferimento:r.porto||"",' +
          'traffic_type:r.traffic||"",' +
          'committente:r.committente||"",' +
          'costo_20:edit.costo_20||"",' +
          'costo_40:edit.costo_40||"",' +
          'costo_hc:edit.costo_hc||"",' +
          'congestion:edit.congestion||"",' +
          'extra_stop:edit.extra_stop||"",' +
          's_notte:edit.s_notte||"",' +
          'allaccio_rf:edit.allaccio_rf||"",' +
          'adr:edit.adr||"",' +
          'fuel:edit.fuel,fuel_perc:"",' +
          'note:edit.note||"",' +
          'data_validita:edit.data_validita||"",'+
          'operatore:edit.operatore||""'+
        '};'+
        'try{'+
          'var lsRaw=localStorage.getItem(_LS_LISTINO);'+
          'if(lsRaw){var lsData=JSON.parse(lsRaw);lsData.rows.push(nuovaRiga);localStorage.setItem(_LS_LISTINO,JSON.stringify(lsData));}'+
        '}catch(err){console.warn("TCP: errore salvataggio",err);}'+
        'var ct=r.containerType;'+
        'var costoB=ct.isHC?(edit.costo_40||""):(ct.size==="20"?(edit.costo_20||""):(edit.costo_40||""));'+
        'var extras=[];'+
        'if(ct.isHC&&edit.costo_hc)extras.push("+ \u20ac"+edit.costo_hc+" HC");'+
        'if(edit.congestion)extras.push("+ \u20ac"+edit.congestion+" Congestion");'+
        'if(edit.extra_stop)extras.push("+ \u20ac"+edit.extra_stop+" Extra Stop");'+
        'if(edit.s_notte)extras.push("+ \u20ac"+edit.s_notte+" Sosta Notte");'+
        'if(edit.allaccio_rf&&parseFloat(costoB)>0){'+
        'var _rfBase=parseFloat(costoB);'+
        'if(edit.fuel==="SI"&&_fuelOn){'+
          'var _fp=parseFloat(document.getElementById("fuel-perc").value)||0;'+
          'if(_fp>0)_rfBase=_rfBase*(1+_fp/100);'+
        '}'+
        'var _rfAmt=Math.round(_rfBase*parseFloat(edit.allaccio_rf)/100);'+
        'if(_rfAmt>0)extras.push("+\u20ac"+_rfAmt+"\u00a0Reefer\u00a0("+edit.allaccio_rf+"%)");'+
        '}'+
        'if(edit.adr)extras.push("+ \u20ac"+edit.adr+" ADR");'+
        'var fuelStr="";'+
        'if(edit.fuel==="SI"&&costoB){'+
          'var perc=_fuelOn?(parseFloat(document.getElementById("fuel-perc").value)||0):0;'+
          'fuelStr=perc>0?" <span style=\'color:#e67e22\'>[Fuel: +\u20ac"+(parseFloat(costoB)*perc/100).toFixed(2)+"]</span>":" <span style=\'color:#e67e22\'>[Fuel: ON]</span>";'+
        '}'+
        'var costoTd=document.getElementById("mcosto_"+mgi);'+
        'if(costoTd){costoTd.innerHTML=costoB?"<span style=\'font-weight:bold;color:#e67e22\'>\u20ac\u00a0"+costoB+"</span>"+(extras.length?" <span style=\'color:#7f8c8d;font-size:11px\'>"+extras.join(" ")+"</span>":"")+fuelStr:"<span style=\'color:#e67e22;font-style:italic\'>-- inserito --</span>";}'+
        'var noteTd=document.getElementById("mnote_"+mgi);if(noteTd)noteTd.textContent=edit.note||"";'+
        'var dataTd=document.getElementById("mdata_"+mgi);if(dataTd)dataTd.textContent=edit.data_validita||"";'+
        'chiudiModale();'+
      '}'+

      /* ── salva modifica (aggiorna riga esistente in LS) ── */
      'function salvaModifica(){'+
        'var edit={};'+
        'var flds=["costo_20","costo_40","costo_hc","congestion","extra_stop","s_notte","allaccio_rf","adr","data_validita","note"];'+
        'flds.forEach(function(f){var el=document.getElementById("f_"+f);if(el)edit[f]=el.value.trim();});'+
        'edit.fuel=_mFuelOn?"SI":"NO";'+
        'try{'+
          'var lsRaw=localStorage.getItem(_LS_LISTINO);'+
          'if(lsRaw){'+
            'var lsData=JSON.parse(lsRaw);'+
            'var chiave=_chiaveCorrente;'+
            'lsData.rows.forEach(function(row,i){'+
              'var k=[row.luogo_1,row.luogo_2,row.delivery_place,row.porto_riferimento,row.traffic_type,row.committente]'+
                '.map(function(v){return(v||"").toString().toLowerCase().trim();}).join("||");'+
              'if(k===chiave){'+
                'flds.forEach(function(f){lsData.rows[i][f]=edit[f]||"";});'+
                'lsData.rows[i].fuel=edit.fuel;'+
                'lsData.rows[i].operatore=(document.getElementById("f_operatore")||{value:""}).value.trim().toUpperCase();'+
              '}'+
            '});'+
            'localStorage.setItem(_LS_LISTINO,JSON.stringify(lsData));'+
          '}'+
        '}catch(err){console.warn("TCP: errore modifica",err);}'+
        'var gi=_giCorrente;'+
        'var g=_gruppi[gi];'+
        'var ct=g.containerType;'+
        'var costoB=ct.isHC?(edit.costo_40||""):(ct.size==="20"?(edit.costo_20||""):(edit.costo_40||""));'+
        'var extras=[];'+
        'if(ct.isHC&&edit.costo_hc)extras.push("+ \u20ac"+edit.costo_hc+" HC");'+
        'if(edit.congestion)extras.push("+ \u20ac"+edit.congestion+" Congestion");'+
        'if(edit.extra_stop)extras.push("+ \u20ac"+edit.extra_stop+" Extra Stop");'+
        'if(edit.s_notte)extras.push("+ \u20ac"+edit.s_notte+" Sosta Notte");'+
        'if(edit.allaccio_rf&&parseFloat(costoB)>0){'+
        'var _rfBase=parseFloat(costoB);'+
        'if(edit.fuel==="SI"&&_fuelOn){'+
          'var _fp=parseFloat(document.getElementById("fuel-perc").value)||0;'+
          'if(_fp>0)_rfBase=_rfBase*(1+_fp/100);'+
        '}'+
        'var _rfAmt=Math.round(_rfBase*parseFloat(edit.allaccio_rf)/100);'+
        'if(_rfAmt>0)extras.push("+\u20ac"+_rfAmt+"\u00a0Reefer\u00a0("+edit.allaccio_rf+"%)");'+
        '}'+
        'if(edit.adr)extras.push("+ \u20ac"+edit.adr+" ADR");'+
        'var fuelStr="";'+
        'if(edit.fuel==="SI"&&costoB){'+
          'var perc=_fuelOn?(parseFloat(document.getElementById("fuel-perc").value)||0):0;'+
          'fuelStr=perc>0?" <span style=\'color:#e67e22\'>[Fuel: +\u20ac"+(parseFloat(costoB)*perc/100).toFixed(2)+"]</span>":" <span style=\'color:#e67e22\'>[Fuel: ON]</span>";'+
        '}'+
        'var costoTd=document.getElementById("tcosto_"+gi);'+
        'if(costoTd){costoTd.innerHTML=costoB?"<span style=\'font-weight:bold;color:#27ae60\'>\u20ac\u00a0"+costoB+"</span>"+(extras.length?" <span style=\'color:#7f8c8d;font-size:11px\'>"+extras.join(" ")+"</span>":"")+fuelStr:"";}'+
        'var noteTd=document.getElementById("tnote_"+gi);if(noteTd)noteTd.textContent=edit.note||"";'+
        'var dataTd=document.getElementById("tdata_"+gi);if(dataTd)dataTd.textContent=edit.data_validita||"";'+
        'chiudiModale();'+
      '}'+

      /* ── modale inserimento KM per doppia localita ── */
      'var _kmModaleOpen=false;'+
      'var _kmMgi=null;'+

      'function apriModaleKm(mgi){'+
        '_kmMgi=mgi;'+
        'var g=_mGruppiM[mgi];'+
        'var inds=(g.indirizzi||[]).join(" \u2192 ");'+
        'document.getElementById("km-modale-sub").textContent=inds;'+
        'document.getElementById("km-input").value="";'+
        'document.getElementById("km-overlay").classList.add("show");'+
      '}'+
      'function chiudiModaleKm(){'+
        'document.getElementById("km-overlay").classList.remove("show");'+
        '_kmMgi=null;'+
      '}'+
      'function salvaKm(){'+
        'var km=parseFloat(document.getElementById("km-input").value);'+
        'if(!km||km<=0){alert("Inserisci un valore KM valido (A/R).");return;}'+
        'var g=_mGruppiM[_kmMgi];'+
        // Salva KM in localStorage
        'var kmTratte={};'+
        'try{var r=localStorage.getItem(_LS_KM_TRATTE);if(r)kmTratte=JSON.parse(r);}catch(e){}'+
        'kmTratte[g.kmKey]=km;'+
        'try{localStorage.setItem(_LS_KM_TRATTE,JSON.stringify(kmTratte));}catch(e){}'+
        // Cerca nel CRT la riga con KM piu vicini
        'var porto=(g.porto||"").toUpperCase();'+
        'var righePorto=_crtRowsPopup.filter(function(r){return(r.porto||"")===porto;});'+
        'if(!righePorto.length)righePorto=_crtRowsPopup;'+
        'var rigaKm=null;var diffMin=Infinity;'+
        'righePorto.forEach(function(r){'+
          'var k=parseFloat(r.km||0);'+
          'if(k>0){var d=Math.abs(k-km);if(d<diffMin){diffMin=d;rigaKm=r;}}'+
        '});'+
        'if(!rigaKm){alert("Nessuna riga trovata nel CRT con KM simili a "+km+".");chiudiModaleKm();return;}'+
        // Calcola costo
        'var ct=g.containerType;'+
        'var costoBase=parseFloat(ct.isHC?(rigaKm.costo_40||0):(ct.size==="20"?(rigaKm.costo_20||0):(rigaKm.costo_40||0)));'+
        'if(!costoBase){alert("La riga CRT trovata non ha costo per questa taglia container.");chiudiModaleKm();return;}'+
        'var fuelPerc=parseFloat(_addCRTPopup.fuel_perc||0);'+
        'var fuelAmt=fuelPerc>0?parseFloat((costoBase*fuelPerc/100).toFixed(2)):0;'+
        'var subtotale=parseFloat((costoBase+fuelAmt).toFixed(2));'+
        'var addExtra=[];'+
        'if(ct.isHC&&parseFloat(_addCRTPopup.hc||0)>0)addExtra.push("+\u20ac"+_addCRTPopup.hc+" HC");'+
        'if(parseFloat(_addCRTPopup.adr||0)>0)addExtra.push("+\u20ac"+_addCRTPopup.adr+" ADR");'+
        'if(parseFloat(_addCRTPopup.seconda_presa||0)>0)addExtra.push("+\u20ac"+_addCRTPopup.seconda_presa+" 2\u00aa presa");'+
        'if(parseFloat(_addCRTPopup.notte||0)>0)addExtra.push("+\u20ac"+_addCRTPopup.notte+" sosta notte");'+
        'if(parseFloat(_addCRTPopup.vgm||0)>0)addExtra.push("+\u20ac"+_addCRTPopup.vgm+" VGM");'+
        'var riga1="\u20ac"+costoBase;'+
        'if(fuelAmt>0)riga1+=" + \u20ac"+fuelAmt+" fuel ("+fuelPerc+"%) = \u20ac"+subtotale;'+
        'var riga2=addExtra.join(" ");'+
        'var label=km+" km A/R \u2192 "+rigaKm.localita+(rigaKm.prov?" ("+rigaKm.prov+")":"");'+
        'var costoCrtHtml='+
          '"<span style=\\"font-weight:bold;color:#8e44ad;font-size:12px\\">"+riga1+"</span>"+'+
          '(riga2?"<span style=\\"color:#7f8c8d;font-size:11px\\"> &nbsp;"+riga2+"</span>":"")+'+
          '"<br><span style=\\"font-size:10px;color:#2980b9;font-style:italic\\">&#x1F4CC; "+label+"</span>";'+
        'var td=document.getElementById("mcosto_"+_kmMgi);'+
        'var td=document.getElementById("mcosto_"+_kmMgi);'+
        'if(td)td.innerHTML=costoCrtHtml;'+
        'chiudiModaleKm();'+
      '}'+

      /* ── delegazione click per btn-km ── */
      'document.addEventListener("click",function(e){'+
        'if(e.target.classList.contains("btn-km")){apriModaleKm(parseInt(e.target.dataset.mgi));return;}'+
        'if(e.target.id==="km-btn-annulla"||e.target.id==="km-overlay"){chiudiModaleKm();return;}'+
        'if(e.target.id==="km-btn-salva"){salvaKm();return;}'+
      '});'+

      /* ── export excel mancanti ── */
      'function esportaExcel(){'+
        'var hdr=[["lef","orderId","indirizzi","delivery_place","committente","traffic","containerNr","tipoContainer","porto","costo_20","costo_40","costo_hc","congestion","extra_stop","s_notte","allaccio_rf","adr","fuel","note","data_validita"]];'+
        '_mancanti.forEach(function(r){'+
          'var e2=r._edit||{};'+
          'hdr.push([r.lef||"",r.orderId,(r.indirizzi||[]).join(" -> "),r.delivery_place,r.committente,r.traffic,r.containerNr,r.containerTypeRaw,r.porto,e2.costo_20||"",e2.costo_40||"",e2.costo_hc||"",e2.congestion||"",e2.extra_stop||"",e2.s_notte||"",e2.allaccio_rf||"",e2.adr||"",e2.fuel||"",e2.note||"",e2.data_validita||""]);'+
        '});'+
        'var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(hdr),"Mancanti");XLSX.writeFile(wb,"concordati_mancanti.xlsx");'+
      '}';

    var htmlTrovatiSection = gruppiOrdine.length>0
      ? '<table><thead><tr>'+thColsTrovati+'</tr></thead><tbody>'+htmlTrovati+'</tbody></table>'
      : '<div class="empty">Nessuna tariffa trovata</div>';

    var htmlMancantiSection = mancanti.length>0
      ? '<table><thead><tr>'+thCols+'</tr></thead><tbody>'+htmlMancanti+'</tbody></table>'+
        '<button class="btn-exp no-print" id="btn-export">&#x1F4BE; Scarica Excel aggiornato</button>'
      : '<div class="empty">Tutti i costi sono stati trovati &#x1F389;</div>';

    var popup=window.open('','tcp_concordati','width=1300,height=780,scrollbars=yes,resizable=yes');
    if(!popup){alert('Il browser ha bloccato il popup.\nAutorizza i popup per questo sito e riprova.');return;}
    popup.document.write(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Concordati<\/title>'+
      '<style>'+css+'<\/style><\/head><body>'+

      '<div id="topbar">'+
        '<h2>&#x1F4CB; Listino Concordati<\/h2>'+
        '<div id="topbar-right">'+
          '<input id="search-res" placeholder="\uD83D\uDD0D Cerca committente, luogo, container...">'+
          '<div id="fuel-box">'+
            '<label>&#x26FD; Fuel:<\/label>'+
            '<button id="fuel-toggle">Fuel OFF<\/button>'+
            '<div id="fuel-perc-wrap">'+
              '<input type="number" id="fuel-perc" min="0" max="100" step="0.1" placeholder="%">'+
              '<span style="font-size:12px;color:white">%<\/span>'+
            '<\/div>'+
          '<\/div>'+
          '<select id="print-sel" style="padding:5px 9px;border:1px solid #bbb;border-radius:5px;font-size:12px;cursor:pointer">'+'<option value="all">Stampa tutto</option>'+'<option value="trovati">Solo concordati</option>'+'<option value="mancanti">Solo mancanti</option>'+'</select> '+'<button id="btn-stampa">&#x1F5A8; Stampa<\/button>'+
        '<\/div>'+
      '<\/div>'+

      '<div id="print-header"><h2>Listino Concordati<\/h2><p id="print-date"><\/p><\/div>'+

      '<div id="content">'+
        '<div class="section" id="sect-trovati">'+
          '<div class="section-title ok">&#x2705; Costi trovati ('+trovati.length+' containers, '+gruppiOrdine.length+' tratte)<\/div>'+
          htmlTrovatiSection+
        '<\/div>'+
        '<div class="section warn-section" id="sect-mancanti">'+
          '<div class="section-title warn">&#x26A0;&#xFE0F; Costi mancanti ('+mancanti.length+' containers, '+mGruppiM.length+' tratte)<\/div>'+
          htmlMancantiSection+
        '<\/div>'+
      '<\/div>'+

      '<div id="ctr-dropdown"><div id="ctr-dropdown-title">Containers<\/div><div id="ctr-dropdown-list"><\/div><\/div>'+

      '<div id="overlay">'+
        '<div id="modale">'+
          '<h3 id="modale-titolo">Inserisci tariffa<\/h3>'+
          '<div class="sub" id="modale-sub"><\/div>'+
          '<div class="sep"><\/div>'+
          '<div class="form-grid">'+
            '<label>Costo 20\' (&euro;)<input type="number" id="f_costo_20" placeholder="es. 300"><\/label>'+
            '<label>Costo 40\' (&euro;)<input type="number" id="f_costo_40" placeholder="es. 450"><\/label>'+
            '<label>Add. HC (&euro;)<input type="number" id="f_costo_hc" placeholder="es. 30"><\/label>'+
            '<label>Congestion (&euro;)<input type="number" id="f_congestion" placeholder="vuoto = no"><\/label>'+
            '<label>Extra Stop (&euro;)<input type="number" id="f_extra_stop" placeholder="vuoto = no"><\/label>'+
            '<label>S. Notte (&euro;)<input type="number" id="f_s_notte" placeholder="vuoto = no"><\/label>'+
            '<label>Reefer (%)<input type="number" id="f_allaccio_rf" min="0" step="0.1" placeholder="vuoto = no"><\/label>'+
            '<label>ADR (&euro;)<input type="number" id="f_adr" placeholder="vuoto = no"><\/label>'+
            '<label class="full">Note<input type="text" id="f_note" placeholder="annotazioni libere"><\/label>'+
          '<\/div>'+
          '<div class="fuel-row">'+
            '<label>&#x26FD; Fuel Surcharge:<\/label>'+
            '<button id="m-fuel-toggle">NO<\/button>'+
            '<span class="fuel-hint"><\/span>'+
          '<\/div>'+
          '<div class="modal-btns">'+
            '<label style="font-size:11px;color:#555;font-weight:bold;display:flex;flex-direction:column;gap:3px;margin-right:auto">'+
              'Data Validita<input type="text" id="f_data_validita" maxlength="8" placeholder="DD/MM/YY" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;width:90px">'+
            '<\/label>'+
            '<label style="font-size:11px;color:#555;font-weight:bold;display:flex;flex-direction:column;gap:3px;">'+
              'Operatore<input type="text" id="f_operatore" maxlength="5" placeholder="MR" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;width:60px;text-transform:uppercase">'+
            '<\/label>'+
            '<button class="btn-cancel" id="btn-annulla">Annulla<\/button>'+
            '<button class="btn-save" id="btn-salva">&#x1F4BE; Salva<\/button>'+
          '<\/div>'+
        '<\/div>'+
      '<\/div>'+

      '<div id="km-overlay">'+
        '<div id="km-modale">'+
          '<h3>&#x1F69A; Inserisci KM per doppia localit\u00e0<\/h3>'+
          '<div id="km-modale-sub"><\/div>'+
          '<label>Kilometri A/R totali<\/label>'+
          '<input type="number" id="km-input" min="1" step="1" placeholder="es. 320">'+
          '<div id="km-hint">Inserisci i KM andata e ritorno del giro completo.<br>Il costo verr\u00e0 calcolato dalla riga CRT con KM pi\u00f9 vicini.<\/div>'+
          '<div id="km-btns">'+
            '<button id="km-btn-annulla">Annulla<\/button>'+
            '<button id="km-btn-salva">&#x1F4BE; Calcola e salva<\/button>'+
          '<\/div>'+
        '<\/div>'+
      '<\/div>'+
      '<scr'+'ipt src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"><\/scr'+'ipt>'+
      '<scr'+'ipt>'+scriptData+'<\/scr'+'ipt>'+
      '<\/body><\/html>'
    );
    popup.document.close();
  }

})();
