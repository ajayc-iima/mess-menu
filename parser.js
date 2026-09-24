/*
 * parser.js — turns the Weekly Mess Menu .xlsx into one menu-card model per date.
 *
 * Sheet layout this understands (the mess office format):
 *   row 2        : "Day - Date" in col A, then repeating pairs [date | "Calories in Kcal …"]
 *   col A        : row label ("Main1", "Rice", "Bread", …) or a section header
 *                  ("BREAKFAST -- 07:30 AM - 09:30 AM") or blank (a per-day note row)
 *   date columns : item for that day
 *   next column  : calories for that item
 *
 * The data is hand-maintained and occasionally shifted (item sitting in the calorie
 * column or vice-versa), so every cell pair is classified rather than trusted.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MenuParser = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const XLSX_LIB =
    (typeof globalThis !== 'undefined' && globalThis.XLSX) ||
    (typeof require === 'function' ? require('./vendor/xlsx.full.min.js') : null);

  const HEADER_CAL_RE = /calorie|kcal/i;
  const CAL_RE = /k\s?cal|\bcalories?\b/i;
  const PURE_NUM_RE = /^\d+(\.\d+)?$/;
  const DAY_DATE_RE = /day\s*[-–—]?\s*date/i;
  const NA_RE = /^(na|n\/a|-|—|nil|none)$/i;

  const MEAL_ORDER = ['breakfast', 'lunch', 'evening', 'dinner', 'combo', 'other'];

  /* ---------------------------------------------------------------- utils */

  function text(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function isCalorie(s) {
    if (!s) return false;
    return CAL_RE.test(s) || PURE_NUM_RE.test(s);
  }

  function isBlank(s) {
    return !s || NA_RE.test(s);
  }

  function addDays(date, n) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function isoDate(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /* Excel serial → JS date (1900 system, with the classic leap-year bug). */
  function serialToDate(n) {
    if (n < 20000 || n > 80000) return null;
    return new Date(Math.round((n - 25569) * 86400000));
  }

  function toDate(v) {
    if (v instanceof Date && !isNaN(v)) return v;
    if (typeof v === 'number') return serialToDate(v);
    if (typeof v === 'string') {
      const s = v.trim();
      let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
      m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
      if (m) {
        const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
        return new Date(y, +m[2] - 1, +m[1]);
      }
    }
    return null;
  }

  /* ------------------------------------------------- item / calorie repair */

  /* Returns { item, cal } for a day's cell pair.
   * The calorie column is never authoritative content: anything in it that
   * isn't a calorie is either a duplicated cell or an item that spilled over
   * from the neighbouring day — so it is only used when the item cell is
   * empty/NA and the calorie cell is holding the real item. */
  function splitItemCal(a, b) {
    a = text(a);
    b = text(b);
    const aCal = isCalorie(a);
    const bCal = isCalorie(b);
    const aHas = a && !NA_RE.test(a);

    let item = '';
    let cal = '';

    if (aHas && !aCal) item = a;
    else if (!aHas && b && !bCal) item = b;

    if (a && aCal) cal = a;
    if (b && bCal) cal = cal ? cal + ' · ' + b : b;

    return { item: item.trim(), cal: cal.trim() };
  }

  function dietMark(s) {
    const t = (s || '').toLowerCase();
    if (/\b(chicken|mutton|lamb|fish|prawn|shrimp|meat|pork|beef|non ?veg)\b/.test(t)) return 'nonveg';
    if (/\b(egg|omelette?|bhurji)\b/.test(t)) return 'egg';
    return 'veg';
  }

  /* ------------------------------------------------------- row/section map */

  function sectionKind(title) {
    const t = title.toLowerCase();
    if (/combo/.test(t)) return 'combo';
    if (/breakfast/.test(t)) return 'breakfast';
    if (/lunch|brunch/.test(t)) return 'lunch';
    if (/evening|refreshment|snack|tea/.test(t)) return 'evening';
    if (/dinner|supper/.test(t)) return 'dinner';
    return 'other';
  }

  /* Where does a row belong on the card? */
  function classifyRow(label, kind) {
    const l = label.toLowerCase().trim();

    if (kind === 'combo') {
      const price = label.match(/[@≥]?\s*₹?\s*(\d{2,4})\s*\/?\s*-?/);
      const at = label.indexOf('@');
      if (at > -1) {
        const p = label.slice(at).match(/(\d{2,4})/);
        return {
          role: 'feature',
          price: p ? p[1] : '',
          diet: /chicken|non ?veg|egg|mutton|fish|prawn/.test(l) ? 'nonveg' : 'veg',
        };
      }
      if (/salad/.test(l)) return { role: 'feature', tag: 'SALAD' };
      return { role: 'feature' };
    }

    if (/^portion/.test(l)) return { role: 'note' };
    if (/accompaniment/.test(l)) return { role: 'also' };
    if (/^bread/.test(l)) return { role: 'also' };
    if (/beverage\s*[12]\b/.test(l)) return { role: 'also' };
    if (/assorted|flakes|cereal/.test(l)) return { role: 'also' };
    if (/seasonal/.test(l)) return { role: 'also' };
    if (/^main\s*1/.test(l)) return { role: 'feature', rank: 1 };
    if (/egg|morning/.test(l)) return { role: 'feature', tag: 'MORNING PLATE', rank: 2 };
    if (/beverage|soup|drink|chaas|tang/.test(l)) return { role: 'tagged', tag: 'DRINK' };
    if (/salad/.test(l)) return { role: 'tagged', tag: 'SALAD' };
    if (/^rice/.test(l)) return { role: 'tagged', tag: 'RICE' };
    if (/^main\s*2/.test(l)) return { role: 'feature', tag: 'SIDE', rank: 3 };
    return { role: 'feature', rank: 0 };
  }

  function parseHeader(label) {
    const parts = label.split(/\s*--\s*/);
    const title = (parts[0] || label).trim();
    let sub = (parts[1] || '').trim().replace(/^\(|\)$/g, '');
    sub = sub.replace(/\s*-\s*/g, ' – ');
    return { title, sub, kind: sectionKind(title) };
  }

  function titleCase(s) {
    return s.toLowerCase().replace(/(^|[\s(\-–—/])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }

  /* ----------------------------------------------------------- sheet parse */

  function parseSheet(ws, sheetName) {
    const grid = XLSX_LIB.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    if (!grid.length) return null;

    let headerRow = -1;
    for (let r = 0; r < Math.min(grid.length, 12); r++) {
      const row = grid[r] || [];
      for (let c = 0; c < row.length; c++) {
        if (DAY_DATE_RE.test(text(row[c]))) { headerRow = r; break; }
      }
      if (headerRow > -1) break;
    }
    if (headerRow < 0) return null;

    const head = grid[headerRow] || [];
    const width = grid.reduce((m, row) => Math.max(m, (row || []).length), 0);

    /* Date columns are the columns sitting immediately before a calorie label.
       (Falls back to any header cell that resolves to a date.) */
    const dateCols = [];
    for (let c = 1; c < Math.max(head.length, width); c++) {
      if (HEADER_CAL_RE.test(text(head[c]))) {
        if (dateCols.indexOf(c - 1) < 0 && c - 1 > 0) dateCols.push(c - 1);
      }
    }
    for (let c = 1; c < head.length; c++) {
      if (toDate(head[c]) && dateCols.indexOf(c) < 0) dateCols.push(c);
    }
    dateCols.sort((x, y) => x - y);
    if (!dateCols.length) return null;

    /* Dates: resolved from the header where possible, else the run continues
       day by day (=+B2+1 style formulas without a cached value). */
    const dates = [];
    for (let i = 0; i < dateCols.length; i++) {
      let d = toDate(head[dateCols[i]]);
      if (!d && i > 0 && dates[i - 1]) d = addDays(dates[i - 1], 1);
      dates[i] = d;
    }
    for (let i = 1; i < dates.length; i++) {
      if (!dates[i] && dates[i - 1]) dates[i] = addDays(dates[i - 1], 1);
    }
    for (let i = dates.length - 2; i >= 0; i--) {
      if (!dates[i] && dates[i + 1]) dates[i] = addDays(dates[i + 1], -1);
    }
    if (dates.some((d) => !d)) return null;

    const sections = [];
    let cur = null;

    for (let r = headerRow + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const label = text(row[0]);
      const cells = dateCols.map((c) => splitItemCal(row[c], row[c + 1]));
      /* rawAny keeps "NA" rows as item rows — only fully empty rows are
         section headers, otherwise an all-NA row would start a new section. */
      const rawAny = dateCols.some((c) => text(row[c]) || text(row[c + 1]));
      if (!label && !rawAny) continue;

      if (label && !rawAny) {
        const head2 = parseHeader(label);
        cur = {
          kind: head2.kind,
          title: head2.title,
          sub: head2.sub,
          rows: [],
          notes: cells.map(() => []),
        };
        sections.push(cur);
        continue;
      }

      if (!label && rawAny) {
        if (!cur) continue;
        cells.forEach((p, i) => { if (p.item) cur.notes[i].push(p.item); });
        continue;
      }

      if (!cur) {
        cur = { kind: 'other', title: '', sub: '', rows: [], notes: cells.map(() => []) };
        sections.push(cur);
      }
      cur.rows.push({ label: label, cells: cells, role: classifyRow(label, cur.kind) });
    }

    /* Build one card model per day column. */
    const first = dates[0];
    const last = dates[dates.length - 1];
    const weekRange = fmtRange(first, last);

    return dates.map((date, i) => {
      const day = {
        iso: isoDate(date),
        date: date,
        dateLong: fmtLong(date),
        weekRange: weekRange,
        sheet: sheetName,
        meals: [],
        combo: null,
      };

      sections.forEach((sec) => {
        const features = [];
        const tagged = [];
        const also = [];
        const prices = [];
        let portion = '';

        sec.rows.forEach((row) => {
          const cell = row.cells[i] || { item: '', cal: '' };
          if (!cell.item || isBlank(cell.item)) return;

          const dish = {
            name: cell.item,
            cal: cell.cal,
            tag: row.role.tag || (row.role.role === 'feature' ? tagFromLabel(row.label) : ''),
            rank: row.role.rank || 0,
            mark: dietMark(cell.item + ' ' + row.label),
          };

          if (row.role.role === 'note') {
            portion = cell.item.replace(/^portion\s*:?\s*/i, '');
            return;
          }
          if (row.role.role === 'also') { also.push(dish); return; }
          if (row.role.role === 'tagged') { tagged.push(dish); return; }

          if (row.role.price) {
            dish.price = row.role.price;
            dish.diet = row.role.diet;
            prices.push(dish);
          }
          features.push(dish);
        });

        const note = (sec.notes[i] || []).join(' · ');
        features.sort((x, y) => x.rank - y.rank);
        features.concat(tagged).forEach((d) => { delete d.rank; });

        const block = {
          kind: sec.kind,
          title: titleCase(sec.title),
          sub: sec.sub,
          time: sec.sub,
          note: note,
          features: features,
          tagged: tagged,
          also: also,
          portion: portion,
          prices: prices,
        };

        if (sec.kind === 'combo') day.combo = block;
        else day.meals.push(block);
      });

      day.meals.sort((a, b) => MEAL_ORDER.indexOf(a.kind) - MEAL_ORDER.indexOf(b.kind));
      return day;
    });
  }

  function tagFromLabel(label) {
    const l = label.toLowerCase();
    if (/^main\s*2/.test(l)) return 'SIDE';
    if (/egg|morning/.test(l)) return 'MORNING PLATE';
    return '';
  }

  function fmtLong(d) {
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
    const day = d.getDate();
    const month = d.toLocaleDateString('en-GB', { month: 'long' });
    return weekday + ', ' + day + ' ' + month;
  }

  function fmtRange(a, b) {
    const mon = (d) => d.toLocaleDateString('en-GB', { month: 'short' });
    if (isoDate(a) === isoDate(b)) return a.getDate() + ' ' + mon(a);
    if (a.getMonth() === b.getMonth()) return a.getDate() + ' – ' + b.getDate() + ' ' + mon(a);
    return a.getDate() + ' ' + mon(a) + ' – ' + b.getDate() + ' ' + mon(b);
  }

  /* ------------------------------------------------------------ workbook */

  function parseWorkbook(buffer) {
    if (!XLSX_LIB) throw new Error('SheetJS (vendor/xlsx.full.min.js) failed to load.');
    const wb = XLSX_LIB.read(buffer, { type: 'array', cellDates: true, cellNF: true });

    const byDate = new Map();
    const warnings = [];

    wb.SheetNames.forEach((name) => {
      let days = null;
      try {
        days = parseSheet(wb.Sheets[name], name);
      } catch (err) {
        warnings.push('Sheet “' + name + '” could not be read: ' + err.message);
        return;
      }
      if (!days) {
        warnings.push('Sheet “' + name + '” has no “Day - Date” row — skipped.');
        return;
      }
      days.forEach((d) => {
        const key = d.iso;
        if (!byDate.has(key) || byDate.get(key).meals.length < d.meals.length) byDate.set(key, d);
      });
    });

    const days = Array.from(byDate.values()).sort((a, b) => a.date - b.date);
    return {
      days: days,
      warnings: warnings,
      sheetNames: wb.SheetNames.slice(),
    };
  }

  return {
    parseWorkbook: parseWorkbook,
    parseSheet: parseSheet,
    splitItemCal: splitItemCal,
    classifyRow: classifyRow,
    dietMark: dietMark,
    isoDate: isoDate,
  };
});
