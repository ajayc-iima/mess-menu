/*
 * app.js — upload → pick a date → render the menu card.
 * All work happens client side; nothing is uploaded anywhere.
 */
(function () {
  'use strict';

  const els = {
    dropzone: document.getElementById('dropzone'),
    file: document.getElementById('file'),
    error: document.getElementById('dz-error'),
    sample: document.getElementById('btn-sample'),
    picker: document.getElementById('picker'),
    chips: document.getElementById('chips'),
    prev: document.getElementById('prev-day'),
    next: document.getElementById('next-day'),
    dateInput: document.getElementById('date-input'),
    count: document.getElementById('picker-count'),
    stage: document.getElementById('stage'),
    card: document.getElementById('card'),
    foot: document.getElementById('stage-foot'),
    actions: document.getElementById('topbar-actions'),
    btnCalories: document.getElementById('btn-calories'),
    btnPrint: document.getElementById('btn-print'),
    btnPng: document.getElementById('btn-png'),
    btnChange: document.getElementById('btn-change'),
  };

  const state = {
    fileName: '',
    days: [],
    byIso: new Map(),
    current: null,
    showCalories: true,
  };

  /* ----------------------------------------------------------- file input */

  function showError(msg) {
    els.error.textContent = msg;
    els.error.hidden = !msg;
  }

  function readFile(file) {
    showError('');
    if (!file) return;
    if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
      showError('“' + file.name + '” is not an .xlsx file. Upload the weekly mess menu spreadsheet.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => showError('That file could not be read. Try re-downloading it.');
    reader.onload = () => {
      try {
        loadWorkbook(reader.result, file.name);
      } catch (err) {
        console.error(err);
        showError('Could not read that spreadsheet: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function loadWorkbook(buffer, fileName) {
    const parsed = MenuParser.parseWorkbook(buffer);
    if (!parsed.days.length) {
      showError('No menu days found. The sheet needs a “Day - Date” row with dates in it.');
      return;
    }

    state.fileName = fileName;
    state.days = parsed.days;
    state.byIso = new Map(parsed.days.map((d) => [d.iso, d]));
    state.current = pickDefaultDate(parsed.days);

    els.dropzone.hidden = true;
    els.picker.hidden = false;
    els.stage.hidden = false;
    els.actions.hidden = false;

    renderChips();
    render();

    const warnings = parsed.warnings.length ? ' · ' + parsed.warnings.join(' · ') : '';
    els.foot.dataset.warnings = warnings;
  }

  function pickDefaultDate(days) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const d of days) if (d.date >= today) return d.iso;
    return days[days.length - 1].iso;
  }

  /* ------------------------------------------------------------- picker */

  function renderChips() {
    els.chips.innerHTML = '';
    state.days.forEach((d) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (d.iso === state.current ? ' is-active' : '');
      b.dataset.iso = d.iso;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', d.iso === state.current ? 'true' : 'false');
      b.title = d.dateLong + ' · week ' + d.weekRange;
      b.innerHTML =
        '<span class="chip-day">' + esc(d.date.toLocaleDateString('en-GB', { weekday: 'short' })) + '</span>' +
        '<span class="chip-num">' + d.date.getDate() + '</span>' +
        '<span class="chip-mon">' + esc(d.date.toLocaleDateString('en-GB', { month: 'short' })) + '</span>';
      b.addEventListener('click', () => select(d.iso));
      els.chips.appendChild(b);
    });

    els.count.textContent = state.days.length + ' days in ' + state.fileName;
    els.dateInput.min = state.days[0].iso;
    els.dateInput.max = state.days[state.days.length - 1].iso;

    syncNav();
    const active = els.chips.querySelector('.chip.is-active');
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }

  function syncNav() {
    const i = state.days.findIndex((d) => d.iso === state.current);
    els.prev.disabled = i <= 0;
    els.next.disabled = i < 0 || i >= state.days.length - 1;
    if (state.byIso.has(state.current)) els.dateInput.value = state.current;
  }

  function select(iso) {
    state.current = iso;
    els.chips.querySelectorAll('.chip').forEach((c) => {
      const on = c.dataset.iso === iso;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    syncNav();
    render();
  }

  function step(delta) {
    const i = state.days.findIndex((d) => d.iso === state.current);
    const j = i + delta;
    if (j < 0 || j >= state.days.length) return;
    select(state.days[j].iso);
  }

  /* -------------------------------------------------------------- render */

  function render() {
    const day = state.byIso.get(state.current);
    els.card.classList.toggle('no-calories', !state.showCalories);

    if (!day) {
      renderEmpty();
      return;
    }

    const meals = day.meals.map(mealHTML).join('');
    const combo = day.combo ? comboHTML(day.combo) : '';

    els.card.innerHTML =
      '<header class="card-head">' +
        '<p class="card-eyebrow">Plaksha University</p>' +
        '<h1 class="card-title">Weekly Mess Menu</h1>' +
        '<p class="card-date">' + esc(day.dateLong) + '</p>' +
        '<p class="card-week">' + esc(day.weekRange) + '</p>' +
      '</header>' +
      '<div class="meal-grid">' + meals + '</div>' +
      combo +
      legendHTML();

    els.foot.textContent =
      'Card for ' + day.iso +
      ' · sheet “' + day.sheet + '” · week ' + day.weekRange +
      ' · generated from ' + state.fileName +
      (els.foot.dataset.warnings || '');
  }

  function renderEmpty() {
    const wanted = state.current;
    const near = state.days
      .slice()
      .sort((a, b) => Math.abs(a.date - new Date(wanted)) - Math.abs(b.date - new Date(wanted)))
      .slice(0, 4);

    els.card.innerHTML =
      '<div class="card-empty">' +
        '<h2>No menu on ' + esc(prettyISO(wanted)) + '</h2>' +
        '<p>The spreadsheet only covers ' + esc(state.days[0].iso) + ' to ' +
          esc(state.days[state.days.length - 1].iso) + '. Pick a date it has:</p>' +
        '<div class="near">' +
          near.map((d) =>
            '<button type="button" class="chip" data-iso="' + d.iso + '">' +
              '<span class="chip-day">' + esc(d.date.toLocaleDateString('en-GB', { weekday: 'short' })) + '</span>' +
              '<span class="chip-num">' + d.date.getDate() + '</span>' +
            '</button>').join('') +
        '</div>' +
      '</div>';

    els.card.querySelectorAll('.chip').forEach((c) =>
      c.addEventListener('click', () => select(c.dataset.iso)));
    els.foot.textContent = 'No menu for ' + wanted + ' · ' + state.days.length + ' days in ' + state.fileName;
  }

  function mealHTML(meal) {
    const dishes = meal.features.concat(meal.tagged).map(dishHTML).join('');
    const also = meal.also
      .filter((d) => d.name)
      .map((d) => esc(d.name))
      .join(' · ');

    return (
      '<article class="meal">' +
        (meal.time ? '<p class="meal-time">' + esc(meal.time) + '</p>' : '') +
        '<h2 class="meal-name">' + esc(meal.title || titleFallback(meal)) + '</h2>' +
        (meal.note ? '<p class="meal-note">' + esc(meal.note) + '</p>' : '') +
        (dishes ? '<ul class="dishes">' + dishes + '</ul>' : '') +
        (also ? '<p class="also"><span class="also-kicker">Also</span>' + also + '</p>' : '') +
        (meal.portion ? '<p class="portion">Portion: ' + esc(meal.portion) + '</p>' : '') +
      '</article>'
    );
  }

  function comboHTML(combo) {
    const items = combo.features.map(dishHTML).join('');
    const veg = combo.prices.filter((p) => p.diet !== 'nonveg');
    const nonveg = combo.prices.filter((p) => p.diet === 'nonveg');
    const parts = [];
    if (veg.length) parts.push('<b>Vegetarian combo ₹' + esc(veg[0].price) + '</b>');
    if (nonveg.length) parts.push('<b>Non-veg combo ₹' + esc(nonveg[0].price) + '</b>');
    const kicker = combo.sub
      ? (/[/-]/.test(combo.sub) ? combo.sub : combo.sub.replace(/\s*bases?\s*/i, ' · Book 4 hrs ahead '))
      : 'Paid · Book 4 hrs ahead';

    return (
      '<section class="combo">' +
        '<div>' +
          '<p class="combo-kicker">' + esc(kicker.trim()) + '</p>' +
          '<h2 class="combo-name">' + esc(combo.title.replace(/^(lunch|dinner|breakfast)\s+/i, '')) + '</h2>' +
        '</div>' +
        (items ? '<ul class="combo-items">' + items + '</ul>' : '') +
        (parts.length
          ? '<p class="combo-prices">' + parts.join(' · ') + '. Reserve at least four hours ahead.</p>'
          : '') +
      '</section>'
    );
  }

  function dishHTML(d) {
    return (
      '<li class="dish">' +
        '<span class="mark mark-' + (d.mark || 'veg') + '"></span>' +
        '<span class="dish-name">' + esc(d.name) + '</span>' +
        (d.cal ? '<span class="dish-kcal">' + esc(formatCal(d.cal)) + '</span>' : '<span class="dish-kcal"></span>') +
        (d.tag ? '<span class="dish-tag">' + esc(d.tag) + '</span>' : '') +
      '</li>'
    );
  }

  function legendHTML() {
    return (
      '<footer class="legend">' +
        '<span class="legend-item"><span class="mark"></span> Green mark veg</span>' +
        '<span class="legend-item"><span class="mark mark-egg"></span> Grey egg</span>' +
        '<span class="legend-item"><span class="mark mark-nonveg"></span> Red non-veg</span>' +
        (state.showCalories ? '<span class="legend-item">Calories per 100 g</span>' : '') +
      '</footer>'
    );
  }

  function titleFallback(meal) {
    return meal.kind ? meal.kind[0].toUpperCase() + meal.kind.slice(1) : 'Menu';
  }

  /* --------------------------------------------------------------- utils */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCal(cal) {
    let s = String(cal).replace(/(\d)\s*kcal/gi, '$1 kcal');
    if (/^\d+(\.\d+)?$/.test(s.trim())) s += ' kcal';
    return s.replace(/\s*,\s*/g, ', ').replace(/\s*\/\s*/g, ' / ');
  }

  function prettyISO(iso) {
    const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /* --------------------------------------------------------------- export */

  async function savePng() {
    if (!window.html2canvas) { showError('Image export needs vendor/html2canvas.min.js.'); return; }
    const btn = els.btnPng;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Rendering…';
    document.documentElement.classList.add('capturing');
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const canvas = await window.html2canvas(els.card, {
        backgroundColor: '#F3EEE4',
        scale: Math.min(2, (window.devicePixelRatio || 1) * 2),
        useCORS: true,
        logging: false,
        /* cloned documents restart the entrance animations and would export
           the card mid-fade; pin every animated block to its final state */
        onclone: (doc) => {
          const s = doc.createElement('style');
          s.textContent =
            '.card-head,.meal,.combo,.legend{animation:none!important;opacity:1!important;transform:none!important}';
          doc.head.appendChild(s);
          doc.documentElement.classList.add('capturing');
        },
      });
      await downloadCanvas(canvas, 'mess-menu-' + state.current + '.png');
    } catch (err) {
      console.error(err);
      showError('Could not render the image: ' + err.message);
    } finally {
      document.documentElement.classList.remove('capturing');
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /* Blob download: data: URLs this large get dropped by several mobile browsers. */
  function downloadCanvas(canvas, fileName) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        resolve();
      }, 'image/png');
    });
  }

  /* ----------------------------------------------------------- listeners */

  els.file.addEventListener('change', (e) => readFile(e.target.files[0]));

  els.sample.addEventListener('click', async () => {
    showError('');
    try {
      const res = await fetch('sample/mess-menu-sample.xlsx');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      loadWorkbook(await res.arrayBuffer(), 'mess-menu-sample.xlsx');
    } catch (err) {
      showError('Sample not reachable (' + err.message + '). Upload the .xlsx manually instead.');
    }
  });

  ['dragenter', 'dragover'].forEach((t) =>
    window.addEventListener(t, (e) => {
      e.preventDefault();
      els.dropzone.classList.add('is-over');
    }));
  ['dragleave', 'drop'].forEach((t) =>
    window.addEventListener(t, (e) => {
      e.preventDefault();
      if (t === 'drop') {
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) readFile(file);
      }
      els.dropzone.classList.remove('is-over');
    }));

  els.dropzone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    els.file.click();
  });
  els.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      els.file.click();
    }
  });

  els.prev.addEventListener('click', () => step(-1));
  els.next.addEventListener('click', () => step(1));

  els.dateInput.addEventListener('change', () => {
    const v = els.dateInput.value;
    if (!v) return;
    state.current = v;
    renderChips();
    render();
  });

  els.btnCalories.addEventListener('click', () => {
    state.showCalories = !state.showCalories;
    els.btnCalories.classList.toggle('is-on', state.showCalories);
    els.btnCalories.setAttribute('aria-pressed', String(state.showCalories));
    render();
  });

  els.btnPrint.addEventListener('click', () => window.print());
  els.btnPng.addEventListener('click', savePng);
  els.btnChange.addEventListener('click', () => {
    els.dropzone.hidden = false;
    els.file.value = '';
    els.file.click();
  });

  window.addEventListener('keydown', (e) => {
    if (els.stage.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });
})();
