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

1. Open https://imm-grateful.vercel.app/
2. If you do not have an account yet, tap **Create Parent Account** and use phone **(770) 316-8593**
3. If you already created that account, tap **Sign in** and use that phone plus your password
4. After the loading screen, tap **Dev** in the bottom bar

Other parents never see that tab.

Owner texts go to **+1 770-316-8593** when the app updates and when someone new creates an account. Add Twilio keys in Vercel for reliable SMS (free Textbelt is one text per day).

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
