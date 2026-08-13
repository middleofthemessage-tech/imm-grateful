# In the Middle of the [Mess]age

A break for your brain — care tracking, village help, and safety for the messy middle of parenting.

This is a static site. Open `index.html` locally, or deploy the folder to Netlify, Vercel, or GitHub Pages.

## Repo

https://github.com/middleofthemessage-tech/imm-grateful

## Local

No build step. Serve the folder or open `index.html` in a browser.

```powershell
npx --yes serve .
```

## Deploy

Push `main` to GitHub, then publish the folder:

- **Netlify:** `npx netlify-cli deploy --prod --dir .` (site id is already in `.netlify/state.json`)
- **Vercel:** `npx vercel --prod --yes`
- **GitHub Pages:** enable Pages (GitHub Actions) so `.github/workflows/pages.yml` can publish

Accounts and logs stay in the browser (`localStorage`). There is no backend yet.

## Preview

On the welcome screen, **Look around first** opens the app without creating an account.
