# QTRC+ Full-Stack

This package contains:

- `public/` — static QTRC+ frontend for GitHub Pages
- `api/` — Vercel serverless backend for real Groq AI analysis
- `.env.example` — environment-variable template

## IMPORTANT SECURITY

The API key that was pasted into the chat is treated as compromised. Rotate/revoke it in Groq and create a new key. Do NOT put the key in `public/index.html`, GitHub, or any frontend code.

## Deploy backend

Recommended: Vercel.

1. Put the backend files in a private GitHub repository (or deploy the project directly to Vercel).
2. In Vercel Project Settings → Environment Variables, add:
   - `GROQ_API_KEY` = your NEW rotated key
   - `GROQ_MODEL` = `llama-3.3-70b-versatile`
   - `QTRC_SYSTEM_PROMPT` = your private QTRC Instructions
   - `ALLOWED_ORIGINS` = your GitHub Pages URL
3. Deploy.
4. Your backend endpoints will be:
   - `/api/analyze`
   - `/api/brainstorm`

## Deploy frontend

Upload the contents of `public/` to a GitHub Pages repository.

After the backend is deployed, open QTRC+ → Settings and set **QTRC API Backend URL** to your Vercel URL.

The frontend never receives the Groq API key or the private QTRC system prompt.

## Creator name

The product creator is consistently written as **Abdullah Kafabihi**.
