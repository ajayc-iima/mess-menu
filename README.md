# Plaksha Mess Menu — daily menu card

Opens straight to today's mess menu: breakfast, lunch, evening refreshment,
dinner, plus the paid Healthy Combo and the veg / egg / non-veg marks — laid out
as a printable card. There is nothing to upload; the site reads the menu
spreadsheet that lives in this repo.

Everything runs in the browser. No server, no tracking.

---

## Use it

1. Open the site — today's card is shown automatically (if today isn't in the
   spreadsheet, the next day it covers is shown, or the last one).
2. Pick another date from the chip row (or type one in **Jump to**).
3. **Save as image** → PNG of the card · **Print / PDF** → one A4 page per card.

Arrow keys `←` `→` step through the days. The **Calories** toggle hides the
per-100 g figures.

---

## Update the menu (the only thing you need to do each week)

The site loads **`sample/mess-menu-sample.xlsx`** every time it opens.

1. On GitHub, open the `sample/` folder.
2. **Add file → Upload files**, and upload the new workbook **with the same file
   name** (`mess-menu-sample.xlsx`) — GitHub replaces the old one — then **Commit**.
3. GitHub Pages redeploys in about a minute; reload the site and the new dates
   are there.

Want next week's menu visible early? Put it on an extra sheet of the same
workbook (one sheet per week) — all sheets are merged, and each date becomes its
own card.

The file name is set by `MENU_URL` at the top of `app.js` if you ever want to
change it.

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

> Using a project site under a sub-path? Nothing to configure — every asset
> (including the menu spreadsheet) is referenced relatively.

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
app.js              loads the menu, date picker, rendering, PNG/PDF export
vendor/             SheetJS + html2canvas (vendored, no CDN needed)
sample/             the menu spreadsheet the site reads — update it here
```

### Tweak it

- **Colours** — the palette lives at the top of `styles.css` (`--paper`,
  `--ink`, `--gold`, `--veg`, `--egg`, `--nonveg`).
- **Which spreadsheet is loaded** — `MENU_URL` at the top of `app.js`.
- **The combo line** *“Reserve at least four hours ahead.”* — `comboHTML()` in
  `app.js`.
- **Row → card mapping** — `classifyRow()` in `parser.js`.
- **Card structure** — `render()` / `mealHTML()` in `app.js`.

### Local check

```bash
python3 -m http.server 8123     # then open http://localhost:8123/
```

(Don't open `index.html` straight from disk — browsers block `fetch()` of a
local file, so the menu can't load. Use the local server above or the published
site.)
