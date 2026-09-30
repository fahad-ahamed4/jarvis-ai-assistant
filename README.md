# 🤖 JARVIS — Real-Life AI Assistant (PWA)

> A voice-controlled AI assistant web app inspired by a viral TikTok concept — rebuilt as a **real, working product** with a genuine AI brain (GLM), **Bangla / English / हिंदी** voice support, and a cinematic sci-fi UI.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma)
![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8?logo=pwa)
![License](https://img.shields.io/badge/License-MIT-green)

<p align="center">
  <img src="docs/screenshot-main.png" width="270" alt="JARVIS main screen" />
  <img src="docs/screenshot-boot.png" width="270" alt="JARVIS boot screen" />
  <img src="docs/screenshot-setting.png" width="270" alt="JARVIS settings screen" />
</p>

---

## ✨ Features

- 🎙️ **Voice commands in 3 languages** — Bangla (বাংলা), English & हिंदी are auto-detected per command. No language switch needed; just speak.
- ⚡ **Lightning-fast replies** — the AI brain **streams** its answer sentence-by-sentence and JARVIS starts **speaking while still generating** (~0.6–2 s from command to voice, time/date answered in <100 ms).
- 🧠 **Real AI brain (GLM)** — not canned responses. Every command goes through an LLM that returns strict-JSON actions + a natural reply in your language.
- 🎬 **Real actions, not demos:**
  - 📱 **Open apps** — "instagram kholo" / "facebook kholo" → really opens the app/site
  - 🎵 **Play songs** — "sunflower song chalao" → finds the real song on YouTube & plays it
  - ✅ **Tasks** — add / complete / delete tasks by voice ("ekta task koro", "टास्क जोड़ो")
  - 📰 **News** — "today's headlines" → live web search, speaks real current news
  - 🧠 **Memory** — "মনে রাখো আমার বাসা ঢাকায়" → stored & recallable later
  - 🕒 **Time / date** — answered instantly
- 🗂️ **4 modules** like the original video — **MEMORY · CHAT · SOUL · SETTING** (+ NEWS)
- 🌌 **Particle-sphere orb** — 900-particle 3D canvas orb with IDLE / LISTENING / THINKING / SPEAKING states, themed colors, live mic level.
- 🤖 **Cute anime-style robot buddy** — blinks, floats, looks around and reacts to JARVIS' state.
- 🔊 **Hybrid TTS engine** — premium cloud voice for English/Hindi, device voice for Bangla (browser SpeechSynthesis), with automatic fallback so JARVIS **never goes silent**.
- 🔣 **Voice modes** — `AUTO` (smart routing) / `JARVIS AI` (cloud only) / `DEVICE` (offline) switchable in SETTING, with a built-in mic & voice test panel.
- 💬 **Text input** — type commands in any of the 3 languages (great when the mic is unavailable).
- 📲 **Installable PWA** — install on Android/iOS home screen like a real app.
- ⌨️ **Barge-in** — type a new command while JARVIS is speaking; it stops and obeys instantly.

## 🧠 How it works

```
┌─────────────────────────────  Browser (PWA)  ─────────────────────────────┐
│  VoiceListener (webkitSpeechRecognition: bn-BD / en-US / hi-IN)           │
│  Text input (any language)                                                │
│         │  command                                                        │
│         ▼                                                                 │
│  POST /api/jarvis  ──►  GLM brain (STREAMING, strict-JSON actions)        │
│         │  NDJSON stream: {meta} {r,delta}… {end(reply, action)}          │
│         ▼                                                                 │
│  SentenceSpeaker  ──►  /api/tts (cloud WAV: en="jam", bn="kazi")          │
│        │               └─ fallback: device SpeechSynthesis (offline-safe) │
│         ▼                                                                 │
│  Action executor: open_app · play_song · add_task · complete_task ·       │
│                   delete_task · show_news · save_memory · show_time/date  │
└───────────────────────────────────────────────────────────────────────────┘
        │                        │                    │
        ▼                        ▼                    ▼
   Prisma (SQLite)         Z.AI web_search      YouTube search
   Task/Message/Setting    (live news)          (resolve-song API)
```

**Key files**

| Path | Purpose |
|---|---|
| `src/app/api/jarvis/route.ts` | GLM brain — streaming JSON action protocol, language enforcement, server-side task/memory execution |
| `src/app/api/tts/route.ts` | Cloud TTS → WAV (voice routing + retries) |
| `src/app/api/news/route.ts` | Live headlines via Z.AI `web_search` |
| `src/app/api/resolve-song/route.ts` | YouTube search scraping → real `videoId` (no API key needed) |
| `src/app/api/{tasks,messages,settings}/route.ts` | CRUD for tasks / memory / settings |
| `src/components/jarvis/jarvis-app.tsx` | Main app — voice loop, streaming playback, barge-in, boot screen |
| `src/components/jarvis/orb.tsx` | 900-particle canvas orb (4 states, theme colors) |
| `src/components/jarvis/jarvis-bot.tsx` | The cute robot buddy (SVG, animated) |
| `src/components/jarvis/screens.tsx` | MEMORY / CHAT / SOUL / SETTING modules |
| `src/lib/jarvis/speech.ts` | Hybrid TTS engine, sentence queue, mic tools, audio unlock |
| `prisma/schema.prisma` | Task / Message / Setting models |

## 📋 Requirements

| Requirement | Details |
|---|---|
| **Node.js** | **v20 or newer** (v22 LTS recommended) — *or* Bun ≥ 1.3 |
| **Z.AI API access** | The AI brain / cloud voice / news need a **Z.AI API key** (see step 4) |
| **Browser (voice)** | Chrome, Edge or any Chromium browser (they support `webkitSpeechRecognition`). Firefox & iOS Safari can **type** commands but have no voice recognition |
| **Microphone** | Any working mic (or use text input) |

## ⚡ Installation (full process)

### 1) Clone the repository

```bash
git clone https://github.com/fahad-ahamed4/jarvis-ai-assistant.git
cd jarvis-ai-assistant
```

### 2) Install dependencies

```bash
npm install          # ← with npm (Node 20+)
# or
bun install          # ← with bun
```

### 3) Create the environment file

Copy the example and adjust if needed (default works out of the box):

```bash
cp .env.example .env          # Linux / macOS / Git Bash
# Windows CMD:  copy .env.example .env
# Windows PowerShell:  Copy-Item .env.example .env
```

`.env` content:

```env
DATABASE_URL=file:../db/custom.db
```

> This points Prisma to the SQLite database at `db/custom.db`. A demo database **is already included**, so the app works instantly with sample data. To start fresh, delete `db/custom.db` and run `npm run db:push`.

### 4) Configure the Z.AI API  (`.z-ai-config`)

The AI brain uses the `z-ai-web-dev-sdk`, which reads a config file named `.z-ai-config` (searched in the project folder, then your home directory). Create it in the project root:

```bash
cp .z-ai-config.example .z-ai-config
```

Then open `.z-ai-config` and fill in your own credentials:

```json
{
  "baseUrl": "https://api.z.ai/api/v1",
  "apiKey": "YOUR_ZAI_API_KEY"
}
```

- `baseUrl` — your Z.AI (GLM) API endpoint, including the `/v1` part
- `apiKey` — your Z.AI API key
- ⚠️ **Never commit** your real `.z-ai-config` — it is already git-ignored.

### 5) Set up the database (Prisma)

```bash
npx prisma generate     # generates the Prisma client
npm run db:push         # creates/syncs the SQLite tables
```

### 6) Run it! 🚀

```bash
npm run dev
```

Open **http://localhost:3000**, tap **INITIALIZE**, allow the microphone — and JARVIS is alive.

> **Windows tip:** run the commands from *Git Bash* or *WSL* (the `npm run dev` / `start` scripts use `tee`, which Windows CMD doesn't have). On CMD/PowerShell you can always run: `npx next dev -p 3000`

### 7) Production build (optional)

```bash
npm run build
```

The project uses Next.js `output: "standalone"`, so after building you can run the server directly:

```bash
# with bun (script default):
npm start
# or with plain node:
NODE_ENV=production node .next/standalone/server.js
```

## 📱 Install on your phone (PWA)

JARVIS must be served over **HTTPS** to install as an app (localhost works too for testing).

**Android (Chrome):** open the site → tap **⋮ menu → "Add to Home screen" / "Install app"** → launch JARVIS like a real app.

**iPhone (Safari):** open the site → **Share button → "Add to Home Screen"** → confirm.

Easy HTTPS options:

| Option | How |
|---|---|
| **Vercel** (easiest) | Push to GitHub → import the repo on vercel.com → add a `POSTGRES`-free setup is not needed; just add env var `DATABASE_URL=file:../db/custom.db`. Note: on Vercel the SQLite file is ephemeral — for heavy use deploy on a VPS instead |
| **VPS / home server** | Run the standalone build behind Caddy/Nginx with a domain + HTTPS |
| **Quick test tunnel** | `npx ngrok http 3000` → open the HTTPS URL on your phone |

## 🎤 Voice command examples

| Language | Say this | What happens |
|---|---|---|
| বাংলা | "ইনস্টাগ্রাম খোলো" | Instagram opens |
| বাংলা | "মনে রাখো আমার বাসা ঢাকায়" | Saved to memory |
| Banglish | "sunflower song chalao" | Plays *Sunflower* on YouTube |
| Banglish | "ekta task koro — buy milk" | Task added |
| English | "What's today's news?" | Speaks live headlines |
| English | "Who are you?" | JARVIS introduces itself |
| हिंदी | "एक टास्क जोड़ो — video upload karna hai" | Task added (like the original video) |
| हिंदी | "facebook kholo" | Facebook opens |
| Any | "What time is it?" / "টাইম কত" | Instant answer |

## ⚙️ Settings explained (SETTING screen)

| Setting | What it does |
|---|---|
| **Voice Mode: AUTO** | Smart routing — cloud voice for EN/HI, device voice for Bangla (recommended) |
| **Voice Mode: JARVIS AI** | Always use the premium cloud voice (needs internet + API) |
| **Voice Mode: DEVICE** | Always use the offline device voice (zero API cost, works without internet) |
| **Mic test** | Checks your microphone and shows MIC OK / NO MIC / BLOCKED |
| **Voice test** | Plays a sample in English + Bangla to verify sound |
| **Soul** | Give JARVIS a custom personality (saved permanently) |
| **Orb color / speed / wake word** | Personalize the orb & voice |

## 🌐 Browser compatibility

| Browser | Voice input | Voice output | Text input | Install PWA |
|---|---|---|---|---|
| Chrome (Android/desktop) | ✅ | ✅ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ | ✅ |
| Samsung Internet | ✅ | ✅ | ✅ | ✅ |
| Firefox | ❌ no SpeechRecognition | ✅ | ✅ | ✅ |
| iOS Safari | ❌ (use Chrome on iOS is also limited) | ✅ (after first tap) | ✅ | ✅ via Safari share menu |

> On iOS, Safari does not expose speech recognition to web apps — use **text commands** there. Voice output needs one tap on the screen first (iOS autoplay policy); the INITIALIZE screen handles this automatically.

## 🧯 Troubleshooting

| Problem | Fix |
|---|---|
| **"Microphone blocked" toast** | Chrome → ⋮ → Site settings → Microphone → **Allow** → reload. On iPhone: Settings → Safari → Microphone |
| **JARVIS is silent** | SETTING → run **VOICE TEST**. Try Voice Mode **DEVICE** (works offline). Check device volume / silent switch |
| **Mic turns off after a while** | Chrome auto-stops recognition in long silence — JARVIS auto-restarts it; tap the mic once to re-arm instantly |
| **YouTube player shows sign-in wall** | Only happens on datacenter IPs (VPNs) — on normal phones/WiFi it plays. The **OPEN IN YOUTUBE** button always works |
| **News fails** | The Z.AI API key/connection is needed for live search — check `.z-ai-config` |
| **Port 3000 busy** | `npx next dev -p 3001` |
| **Database errors on fresh install** | `npm run db:push` then reload |
| **Windows `tee` error with npm run dev** | Use Git Bash/WSL, or run `npx next dev` directly |

## 🗂 Project structure

```
jarvis-ai-assistant/
├── src/
│   ├── app/
│   │   ├── api/                 # jarvis (brain) · tts · news · tasks ·
│   │   │                        # messages · settings · resolve-song
│   │   ├── globals.css          # theme, animations, safe-area
│   │   ├── layout.tsx           # fonts, Toaster, metadata
│   │   └── page.tsx
│   ├── components/
│   │   ├── jarvis/              # jarvis-app · orb · jarvis-bot · screens
│   │   └── ui/                  # shadcn/ui components
│   ├── hooks/
│   ├── lib/
│   │   ├── jarvis/              # speech.ts (hybrid TTS engine) · types.ts
│   │   ├── db.ts                # Prisma client
│   │   └── utils.ts
├── prisma/schema.prisma         # Task · Message · Setting
├── db/custom.db                 # ready-made demo database
├── public/                      # PWA manifest + icons
├── docs/                        # screenshots
├── .env.example
├── .z-ai-config.example
└── package.json
```

## 🛠 Tech stack

Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui · Prisma 6 + SQLite · z-ai-web-dev-sdk (GLM) · Web Speech API · Canvas 2D particle engine · PWA

## 🇧🇩 বাংলা ইনস্টল গাইড (সংক্ষেপে)

```bash
# ১) রিপো clone করো
git clone https://github.com/fahad-ahamed4/jarvis-ai-assistant.git
cd jarvis-ai-assistant

# ২) ডিপেন্ডেন্সি ইনস্টল (Node.js 20+ লাগবে)
npm install

# ৩) এনভায়রনমেন্ট ফাইল বানাও
cp .env.example .env

# ৪) Z.AI API কনফিগ বানাও (নিজের apiKey বসাও)
cp .z-ai-config.example .z-ai-config
#   .z-ai-config ফাইলে গিয়ে "apiKey" এর জায়গায় তোমার Z.AI key দাও

# ৫) ডাটাবেস সেটআপ
npx prisma generate
npm run db:push

# ৬) চালাও!
npm run dev
#   → http://localhost:3000 খোলো → INITIALIZE চাপো → মাইক পারমিশন দাও
```

**ফোনে ইনস্টল (PWA):** HTTPS দিয়ে সাইট খুলে Chrome এ **"Add to Home screen"** চাপলেই JARVIS অ্যাপের মতো ইনস্টল হয়ে যাবে।

**ভয়েস কমান্ড:** বাংলা, English বা हिंदी — যেকোনো ভাষায় সরাসরি বলো, JARVIS নিজেই বুঝে নেবে। যেমন: *"ইনস্টাগ্রাম খোলো"*, *"sunflower song chalao"*, *"What's the news?"*

## 📄 License

[MIT](LICENSE) © 2026 fahad-ahamed4

---

*Inspired by a TikTok concept video — rebuilt from scratch as a fully working product. "I am JARVIS, sir. Always at your service."* 🤖
