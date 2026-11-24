# Wordwise

Wordwise reads the vocabulary in the supplied Google Sheet directly and groups it into five-word study days. The app reads the `Word`, `Meaning`, and `Phrase 1` through `Phrase 5` columns from tab `335883043`.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The sheet must allow viewer access to anyone with its link.

## Enable writing back to Google Sheets

Google's public visualization endpoint is read-only. The included `google-apps-script/Code.gs` is the write bridge:

1. In the sheet, open **Extensions → Apps Script** and paste in `Code.gs`.
2. Replace `REPLACE_WITH_A_LONG_RANDOM_SECRET` with a private random token.
3. Deploy it as a **Web app** that executes as your Google account. The sheet owner must authorize it. Copy the deployed `/exec` URL.
4. Set `GOOGLE_APPS_SCRIPT_URL` to that URL and `GOOGLE_APPS_SCRIPT_TOKEN` to the same token in the Next.js server environment. See `.env.example`.
5. Restart the app. Editing a word or marking it done will then write the meaning, example sentences, and status back to the sheet. The bridge adds a `Status` column in H when first used.

Keep the URL and token in server-side environment variables; do not put them in client code. The app stores a local copy of edits and progress in the browser until the write bridge is connected.
