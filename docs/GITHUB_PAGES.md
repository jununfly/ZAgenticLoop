# Enable GitHub Pages

1. Repo **Settings** → **Pages**
2. **Source**: Deploy from branch `main`
3. **Folder**: `/docs`
4. Save — showcase at `https://jununfly.github.io/ZAgenticLoop/`

GitHub Pages serves the `/docs` folder. Keep a valid homepage in this directory
before relying on the site root URL.

The root `README.md` and `LOOP.md` describe how this reference dogfoods its own patterns via `.github/workflows/audit.yml` + `validate-patterns.yml`.

First deploy may take 1–2 minutes. After enabling, the daily scheduled audit workflow keeps the published site aligned with the reference's loop readiness score.

**Pro tip**: run `node tools/zj-loop-audit/dist/cli.js . --suggest` locally and improve the score over time — the workflows will reflect it.
