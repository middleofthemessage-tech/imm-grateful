# In the Middle of the [Mess]age

A break for your brain — care tracking, village help, and safety for the messy middle of parenting.

**Live (send this):** https://imm-grateful.vercel.app/

Backup Pages URL: https://middleofthemessage-tech.github.io/imm-grateful/

Use the Vercel link. Cloud accounts, vaults, and the developer dashboard only work there.

## How to send it

Text, email, or post this link:

`https://imm-grateful.vercel.app/`

People tap it, create a parent account, and start using the app. Updates you push to GitHub go live on Vercel automatically.

## Developer dashboard

Sign in like a normal parent with the owner phone number. A **Dev** tab appears only on that account. Other parents never see it.

There you can review live signups, activity, and each household vault.

## Protected storage

Each signed-in person gets a locked vault (profile, tracking, reminders, village). The API only opens a vault for:

- that person, after they sign in
- the developer account

Passwords are hashed (never stored in the clear). Other parents cannot list or open each other’s data.

## Keep data after deploys

Add a Vercel KV store so accounts survive new deploys:

1. Open the project on [vercel.com](https://vercel.com)
2. **Storage → Create → KV** (Upstash Redis)
3. Connect it to the project

That sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Optional email/SMS keys are listed in `.env.example`.

## Repo

https://github.com/middleofthemessage-tech/imm-grateful

## Local

```powershell
npx --yes serve .
```

Cloud APIs need `npx vercel dev` if you want signup/vaults locally.

## Preview

On the welcome screen, **Look around first** opens the app without creating an account. Preview data stays on that device only.
