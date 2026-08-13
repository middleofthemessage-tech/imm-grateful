# Put IMM on the Apple App Store and Google Play

The website is already live. This folder is set up so the **same code** becomes a phone app with Capacitor (a WebView wrapper). The app opens https://imm-grateful.vercel.app/, so store users get the same accounts, database, and updates you publish on Vercel.

You do **not** rewrite the app in Swift or Kotlin.

## What you need

| Store | Computer | Accounts | Cost |
|---|---|---|---|
| Google Play | Windows is fine | [Google Play Console](https://play.google.com/console) | $25 one-time |
| Apple App Store | A **Mac** (or a rented Mac in the cloud) | [Apple Developer](https://developer.apple.com) | $99 / year |
| Both | Node.js LTS from [nodejs.org](https://nodejs.org) | — | Free |

Also install:

- **Android Studio** (Play): https://developer.android.com/studio
- **Xcode** from the Mac App Store (Apple only)

## One-time setup on your computer

Open PowerShell in this project folder (`mom-hacking-site`).

```powershell
npm install
npx cap add android
```

On a Mac, also run:

```bash
npx cap add ios
```

Then:

```powershell
npx cap sync
```

That creates `android/` and (on a Mac) `ios/`. Keep those folders. You only add them once.

## Microphone (voice commands)

The Speak button uses the phone mic. After the first `cap add`, add these permission lines.

### Android

Open `android/app/src/main/AndroidManifest.xml` and inside `<manifest>` add:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

### iOS

Open `ios/App/App/Info.plist` and add:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>IMM uses the microphone so you can speak commands on any page.</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>IMM listens for care and navigation commands when you tap Speak.</string>
```

Then run `npx cap sync` again.

## Google Play (step by step)

1. Create a Play Console account and pay the $25 fee.
2. Create an app. Name: **In the Middle of the [Mess]age** (or **IMM Grateful** if the brackets are a problem).
3. On your PC: `npx cap sync` then `npx cap open android`.
4. In Android Studio, wait for Gradle to finish.
5. **Build → Generate Signed App Bundle / APK → Android App Bundle**.
6. Create a keystore the first time. Save the password somewhere safe. If you lose it, you cannot update the app.
7. Upload the `.aab` in Play Console → Production (or Internal testing first).
8. Fill store listing: short description, full description, screenshots (phone + 7-inch/10-inch if asked), privacy policy URL.
9. Privacy policy: you can publish a simple page or a Google Doc that says IMM stores account and care data for the signed-in parent, and the owner can review vaults.
10. Content rating questionnaire: choose the parenting / lifestyle category.
11. Submit. Review is often 1–7 days.

Use **Internal testing** first so you can install it on your own phone before the public listing.

## Apple App Store (step by step)

1. Enroll in the Apple Developer Program ($99/year).
2. On a Mac: `npx cap sync` then `npx cap open ios`.
3. In Xcode, select the **App** target → **Signing & Capabilities**.
4. Choose your Team. Set the bundle ID to `app.immgrateful.mobile` (must match `capacitor.config.json`).
5. Plug in an iPhone or pick a simulator, press Run once to confirm it launches.
6. **Product → Archive**, then **Distribute App → App Store Connect**.
7. In [App Store Connect](https://appstoreconnect.apple.com), create the app, add screenshots (iPhone 6.7" and 6.1" at least), description, and privacy nutrition labels (account, care logs, email/phone).
8. Submit for review. First review can take several days.

Apple may ask why it is a wrapped website. Answer: it is a care app with signed-in accounts, a private household vault, Villager clock-in, and on-device voice commands. The live URL keeps safety recalls current.

If you do not own a Mac, use a cloud Mac (MacStadium, MacinCloud) or a service like Codemagic / Ionic Appflow to archive and upload.

## After you change the website

Push to GitHub as you already do. Vercel updates https://imm-grateful.vercel.app/. The store apps load that URL, so **most updates do not need a new store submission**.

Submit a new store version only when you change native settings (app name, permissions, splash, icon) or Apple/Google require a binary update.

## Icons

Replace the default Capacitor icon with `logo-main.jpg` / `clipart/app.jpg`:

- Android: `android/app/src/main/res/mipmap-*`
- iOS: Xcode → App → AppIcon

You can generate the sizes with [Capacitor Assets](https://capacitorjs.com/docs/guides/splash-screens-and-icons) later.

## Voice commands (already in the app)

Tap **Speak** on any page (or **Voice Log** on Track). Examples:

- “go home”, “go track”, “updates”, “me”
- “open village”, “settings”, “inbox”, “calendar”
- “clock in”, “clock out”
- “sign in”, “create account”, “look around”
- “dirty diaper”, “bottle 4 ounces”, “nap”, “tummy time”
- “help”

Chrome, Edge, and the store WebView support this. Safari on iPhone needs mic permission.

## If something fails

- Blank Android screen: confirm https://imm-grateful.vercel.app/ opens in the phone browser.
- No voice: check mic permissions in phone Settings for IMM.
- iOS build errors: open Xcode, set a Development Team, and use a unique bundle ID if `app.immgrateful.mobile` is taken.
