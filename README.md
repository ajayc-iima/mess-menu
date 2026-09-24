# Plaksha Mess Menu — menu card generator

Drop in the weekly mess menu spreadsheet (`.xlsx`), pick a date, get a printable
menu card for that day — the same layout as the printed/PDF card: breakfast,
lunch, evening refreshment, dinner, plus the paid Healthy Combo and the
veg / egg / non-veg marks.

Everything runs in the browser. No server, no uploads, no tracking — the file
never leaves the machine.

---

## Use it

1. Open the site.
2. Drop the `Weekly Mess Menu … .xlsx` on the upload panel (or click **Choose file**).
3. Pick a date from the chip row (or type one in **Jump to**).
4. **Save as image** → PNG of the card · **Print / PDF** → one A4 page per card.

Arrow keys `←` `→` step through the days. The **Calories** toggle hides the
per-100 g figures.

There is a **Try the sample menu** button that loads
`sample/mess-menu-sample.xlsx`, so you can see the card before uploading
anything.

---

## Host it on GitHub Pages

The whole site is static — a folder of HTML/CSS/JS — so Pages just serves it.

```bash
# 1. put this folder in a repo
git init plaksha-menu-card
cd plaksha-menu-card
git add .
git commit -m "Mess menu card generator"

# 2. push it to GitHub
git remote add origin https://github.com/<you>/plaksha-menu-card.git
git branch -M main
git push -u origin main
```

Then in the GitHub repo:

1. **Settings → Pages**
2. **Source:** *Deploy from a branch*
3. **Branch:** `main`, folder **`/ (root)`** → **Save**

A minute later the site is at `https://<you>.github.io/plaksha-menu-card/`.

> Using a project site under a sub-path? Nothing to configure — every asset is
> referenced relatively, and `.nojekyll` is included so GitHub serves the files
> exactly as they are.

No build step, no dependencies to install: `xlsx.full.min.js` (SheetJS) and
`html2canvas.min.js` are vendored in `vendor/`, so the site also works offline
once loaded. Fonts come from Google Fonts and fall back to system serif/sans
if you are offline.

---

## The spreadsheet format it understands

Written around the mess office's weekly workbook:

| | |
|---|---|
| Row 2 | `Day - Date` in column A, then repeating pairs: **date** column, **calories** column |
| Column A | row label (`Main1`, `Rice`, `Bread`, …), or a section header (`BREAKFAST -- 07:30 AM - 09:30 AM`), or blank (a per-day note, e.g. `Chinese Cuisine`) |
| Each date column | the item for that day |
| The column next to it | calories for that item |
| Sheets | one sheet per week; several sheets in one workbook are merged |

Dates are read from the header row; `=+B2+1` style formulas without a cached
value are resolved as consecutive days. Anything that looks like a date is
picked up, so extra weeks are fine.

The card layout is driven by the row labels:

- **featured dishes** — `Main1`, `Main2` (tagged `SIDE`), `Egg/Morning salad`
  (tagged `MORNING PLATE`), `Dry Veg`, `Gravy Veg/Dal`, `Paneer`, `Non Veg`,
  `Dessert`, `Dinner Combo Meal`, `Main`
- **tagged** — `Beverage/Soup` → `DRINK`, `Salad` → `SALAD`, `Rice` → `RICE`
- **“Also …” line** — `Accompaniment`, `Bread`, `Beverage 1/2`,
  `Assorted Flakes`, `Seasonal Fruit`
- **portion note** — `Portion Size` → *Portion: 2 Pcs.*
- **Healthy Combo** — the section whose title contains `COMBO`; prices are read
  from labels like `Paneer + Salad @ 147/-` and become the
  *Vegetarian combo ₹147 · Non-veg combo ₹189* line.

### Messy data is tolerated

Hand-maintained sheets drift. The parser repairs the usual damage instead of
showing it:

- an item typed into the calorie column (or the other way round) is put back in
  the right place — the calorie column is never treated as authoritative content
- `NA`, `-`, `nil` cells are treated as “not served that day” and dropped
- duplicated cells (`Banana` + `Banana`) collapse to one
- pure numbers are read as calories (`40` → `40 kcal`)
- veg / egg / non-veg marks are guessed from the dish name
  (`Chicken …` → red, `Egg …`/`Omelette` → grey, everything else → green)

---

## Files

```
index.html          the page
styles.css          design + print (A4) styles
parser.js           .xlsx → one menu-card model per date (works in browser & node)
app.js              upload, date picker, rendering, PNG/PDF export
vendor/             SheetJS + html2canvas (vendored, no CDN needed)
sample/             a sample weekly menu to try
.nojekyll           tells GitHub Pages to serve the files as-is
```

### Tweak it

- **Colours** — the palette lives at the top of `styles.css` (`--paper`,
  `--ink`, `--gold`, `--veg`, `--egg`, `--nonveg`).
- **The combo line** *“Reserve at least four hours ahead.”* — `comboHTML()` in
  `app.js`.
- **Row → card mapping** — `classifyRow()` in `parser.js`.
- **Card structure** — `render()` / `mealHTML()` in `app.js`.

### Local check

```bash
python3 -m http.server 8123     # then open http://localhost:8123/
```

(Opening `index.html` straight from disk works too, except the sample button —
browsers block `fetch()` of a local file. Upload the `.xlsx` manually instead.)
