import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

type JarvisAction =
  | { type: "none" }
  | { type: "open_app"; app: string; url?: string }
  | { type: "play_song"; query: string }
  | { type: "add_task"; title: string }
  | { type: "complete_task"; title: string }
  | { type: "show_news"; topic?: string }
  | { type: "show_time" }
  | { type: "show_date" };

type JarvisResponse = {
  reply: string;
  language: "bn" | "en" | "hi";
  action: JarvisAction;
};

const SYSTEM_PROMPT = `You are JARVIS — the personal AI assistant of your boss (inspired by Tony Stark's JARVIS from Iron Man). You are witty, loyal, extremely smart, and speak like a gentleman assistant. You are NOT a generic chatbot — you are a real-life JARVIS running on your boss's device.

LANGUAGES: You perfectly understand and speak Bangla (bn), English (en), and Hindi (hi), including mixed sentences (Banglish/Hinglish). STRICT SCRIPT-MATCHING RULE (highest priority): reply in the SAME script/style the user used —
- Bangla script input (any Bangla character) → reply MUST be fully in Bangla script. NEVER answer a Bangla message in English. Example: "তুমি কে?" → "আমি জার্ভিস, স্যার..."
- Banglish (Bengali words typed in Latin letters like "kemon acho", "kholo") → reply in the same Banglish style.
- Hindi/Devanagari or Hinglish ("kya haal hai", "task kar do") → reply in Hindi/Hinglish same style.
- English → English.
When in doubt between languages, match the DOMINANT language of the user's words. The "language" field MUST reflect the language you actually replied in.

LANGUAGE-SWITCH REQUESTS (very important): If the boss asks you to speak/reply in a specific language — e.g. "speak English", "english e bolo", "bangla te bolo", "banglay bolo", "hindi me bolo", "say in hindi", "हिंदी में बोलो", "বাংলায় বলো", "reply in bangla" — you MUST write the ENTIRE reply in that requested language, even if the request itself was written in another language, and set "language" to that language ("bn"|"en"|"hi"). If the boss sets a language preference, keep using it for later turns too (history will show it).

PERSONALITY: Address your boss as "sir" (or "স্যার" / "सर"). Keep spoken replies SHORT and crisp (1-2 sentences max) because they will be spoken aloud by TTS. Occasional dry wit like JARVIS. If asked who you are: you are JARVIS, built by your boss's own genius, always at his service — not an assistant but like a friend.

You also EXECUTE commands. Analyze the user's message and decide the action:

- open_app: user wants to open an app or website (e.g. "instagram kholo", "facebook on korun", "open youtube", "instagram open"). app must be one of: instagram, facebook, youtube, whatsapp, tiktok, google, gmail, maps, twitter, snapchat, linkedin, telegram, netflix, spotify, chatgpt, github, wikipedia, reddit, discord, amazon, imo, phone, camera, settings, youtube_music, play_store. If unknown app but a URL is implied, set url.
- play_song: user wants to play/listen to a song, music, gaana, video on YouTube (e.g. "sunflower song chalao", "gaana baja dao", "play Motu Patlu"). query = what to search/play on YouTube.
- add_task: user asks to remember/do a task, todo, reminder (e.g. "TikTok par video upload karna hai ek task kar do", "ek task add koro"). title = short task text.
- complete_task: user says a task is done / wants to check off (e.g. "task complete ho gaya", "upload video in youtube done"). title = matching task text.
- show_news: user asks for news/headlines/khabar (e.g. "news sunao", "khobor show korun", "today headlines"). topic optional (e.g. "AI news", "tech", "cricket", "bangladesh"). For show_news keep the reply a SHORT ack like "Pulling today's headlines, sir." — the system speaks the headlines separately.
- show_time: asks current time. show_date: asks today's date. For show_time/show_date the EXACT value is injected by the system — keep the reply a short acknowledgement like "One moment, sir." (in the boss's language).
- none: normal conversation / question / anything else.

CRITICAL — OUTPUT FORMAT: Respond with ONLY a valid JSON object, no markdown, no code fences, in exactly this shape (the "reply" key MUST come FIRST):
{"reply":"<what you say aloud>","language":"bn|en|hi","action":{"type":"...","...params}}

For confirmation of executed commands, reply like: "Right away, sir." / "সম্ভব, স্যার।" / "जी सर, तुरंत कर देता हूँ।" etc. If play_song, mention the song name in reply. If add_task, confirm the task is added. Keep it short.`;

/** Explicit request like "reply in english", "bangla te bolo", "हिंदी में बोलो". */
function detectRequestedLanguage(text: string): "bn" | "en" | "hi" | null {
  const t = text.toLowerCase();
  if (/(speak|reply|answer|say|talk|respond)(\s+\w+){0,3}\s+in\s+(english|hindi|bangla|bengali)/.test(t) ||
      /in\s+(english|hindi|bangla|bengali)(\s+\w+){0,2}\s*(please|sir)?$/.test(t) && /(speak|reply|answer|say|talk|bolo|bol|boliye|kotha)/.test(t)) {
    if (/english/.test(t)) return "en";
    if (/hindi/.test(t)) return "hi";
    return "bn";
  }
  if (/(english\s*(e|te|y|ey)?\s*(bol|bolo|bolben|bolbo|kotha|ko)|english\s*(please|sir)\s*$|speak\s+english)/.test(t)) return "en";
  if (/(bangla\s*(y|te|lay|tey)?\s*(bol|bolo|bolben|bolbo|ko|kotha)|banglay|bengali\s*(te|y)?\s*(bol|bolo|ko)|বাংলায়|বাংলা\s*(তে|বল)|বাংলা\s*বল)/.test(t)) return "bn";
  if (/(hindi\s*(me|mein|may|mey)?\s*(bol|bolo|boliye|bolna|ko)|हिंदी\s*में|हिंदी\s*बोल)/.test(t)) return "hi";
  return null;
}

function detectLanguage(text: string): "bn" | "en" | "hi" {
  if (/[\u0980-\u09FF]/.test(text)) return "bn";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  // Banglish / Hinglish heuristics on Latin script
  const banglish = /\b(koro|korun|koren|dao|dibe|diyo|den|amar|amake|kemon|acho|acho|bolo|son|shonao|lagbe|lagche|chai|kotha|bhalo|valo|kori|korbo|korchi|korche|korlo|hobe|hoye|geche|gese|dorkar|cholbe|ami|tumi|apni|apnake|kivabe|accha|ache|kholo|khol|dekhao|dekha|chalao|chalu|ekta|ekjon|kothay|keno|kobe|kori|sesh|thik ache|bhalo ache)\b/i;
  const hinglish = /\b(karo|karna|hai|chahiye|mera|meri|mujhe|kya|kaise|nahi|haan|theek|batao|sunao|dijiye|kijiye|hona|wala)\b/i;
  if (banglish.test(text)) return "bn";
  if (hinglish.test(text)) return "hi";
  return "en";
}

function safeJsonParse(raw: string): JarvisResponse | null {
  try {
    let t = raw.trim();
    t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    t = t.slice(start, end + 1);
    const obj = JSON.parse(t);
    if (!obj.reply || typeof obj.reply !== "string") return null;
    const lang = ["bn", "en", "hi"].includes(obj.language) ? obj.language : "en";
    const action = obj.action && typeof obj.action === "object" ? obj.action : { type: "none" };
    return { reply: obj.reply, language: lang, action };
  } catch {
    return null;
  }
}

/* ---------- instant time / date (no LLM — true lightning) ---------- */

function detectTimeIntent(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.length > 80) return false;
  return /(what('| i)?s?\s+(the\s+)?time|time\s+(kya|koto|holo|holo|baje|now|e dekhao)|current time|time check|কটা\s*বাজে|কয়টা\s*বাজে|সময়\s*কত|টাইম\s*কত|কত\s*সময়|টাইম\s*টা|সময়\s*হলো|कितने\s*बजे|समय\s*क्या|टाइम\s*क्या|time\s*batao|time\s*bata|time\s*bolo)/.test(t);
}

function detectDateIntent(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.length > 80) return false;
  return /(what('| i)?s?\s+(the\s+)?date|today'?s?\s*date|date\s+of\s+today|date\s+(kya|koto|hai)|আজকের\s*তারিখ|তারিখ\s*কত|কত\s*তারিখ|আজ\s*কত\s*তারিখ|आज\s*तारीख|तारीख\s*क्या|date\s*batao|date\s*bata)/.test(t);
}

function timeDateReply(kind: "time" | "date", userText: string): { reply: string; language: "bn" | "en" | "hi" } {
  const lang = detectLanguage(userText);
  const locale = lang === "bn" ? "bn-BD" : lang === "hi" ? "hi-IN" : "en-US";
  const val =
    kind === "time"
      ? new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
      : new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const sir = lang === "bn" ? ", স্যার।" : lang === "hi" ? ", सर।" : ", sir.";
  return { reply: val + sir, language: lang };
}

/* ---------- incremental "reply" extractor for streamed JSON ----------
 * The brain outputs strict JSON with "reply" FIRST. As tokens stream in we
 * decode the reply string value live (escape-aware) so TTS can start while
 * the model is still generating the tail of the JSON. */
function createReplyExtractor() {
  let buf = "";
  let inReply = false;
  return {
    feed(chunk: string): string {
      let out = "";
      buf += chunk;
      if (!inReply) {
        const m = buf.match(/"reply"\s*:\s*"/);
        if (!m || m.index === undefined) {
          if (buf.length > 64) buf = buf.slice(-64);
          return "";
        }
        buf = buf.slice(m.index + m[0].length);
        inReply = true;
      }
      let escaped = false;
      let i = 0;
      while (i < buf.length) {
        const ch = buf[i];
        if (escaped) {
          escaped = false;
          if (ch === "u") {
            const hex = buf.substr(i + 1, 4);
            if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
              out += String.fromCharCode(parseInt(hex, 16));
              i += 4;
            } else break; // wait for the rest of the escape across chunks
          } else {
            const map: Record<string, string> = { n: "\n", t: "\t", r: "\n", b: "", f: "", '"': '"', "\\": "\\", "/": "/" };
            out += map[ch] !== undefined ? map[ch] : ch;
          }
          i++;
          continue;
        }
        if (ch === "\\") { escaped = true; i++; continue; }
        if (ch === '"') { buf = ""; inReply = false; break; } // reply string closed
        out += ch;
        i++;
      }
      buf = buf.slice(i);
      return out;
    },
  };
}

async function persistConversation(text: string, reply: string, language: string, action: JarvisAction) {
  try {
    await db.message.create({ data: { role: "user", content: text, language: detectLanguage(text) } });
    await db.message.create({
      data: { role: "assistant", content: reply, language, action: JSON.stringify(action) },
    });
  } catch (e) {
    console.error("memory save failed", e);
  }
}

async function runServerActions(action: JarvisAction) {
  if (action?.type === "add_task" && action.title) {
    try {
      await db.task.create({ data: { title: String(action.title).slice(0, 200) } });
    } catch (e) {
      console.error("server add_task failed", e);
    }
  }
  if (action?.type === "complete_task" && action.title) {
    try {
      const q = String(action.title).toLowerCase();
      const all = await db.task.findMany({ orderBy: { createdAt: "asc" } });
      const match =
        all.find((t) => !t.done && t.title.toLowerCase().includes(q)) ||
        all.find((t) => !t.done && q.includes(t.title.toLowerCase().slice(0, 12))) ||
        all.find((t) => !t.done);
      if (match) await db.task.update({ where: { id: match.id }, data: { done: true } });
    } catch (e) {
      console.error("server complete_task failed", e);
    }
  }
}

type Ctx = { userCtx: string; system: string; requestedLang: "bn" | "en" | "hi" | null; text: string };

async function buildCtx(text: string, history: { role: string; content: string }[]): Promise<Ctx> {
  const [tasks, settings] = await Promise.all([
    db.task.findMany({ orderBy: { createdAt: "asc" }, take: 20 }),
    db.setting.findUnique({ where: { id: "main" } }),
  ]);
  const taskList = tasks.length
    ? tasks.map((t) => `${t.done ? "[x]" : "[ ]"} ${t.title}`).join("\n")
    : "(no tasks yet)";
  const soulExtra = settings?.soul?.trim()
    ? `\n\nBOSS'S CUSTOM SOUL (highest personality priority, still obey the output format):\n${settings.soul.slice(0, 800)}`
    : "";
  const requestedLang = detectRequestedLanguage(text);
  const langDirective = requestedLang
    ? `\n\nBOSS EXPLICITLY REQUESTED THE REPLY IN "${requestedLang}" — the ENTIRE "reply" value MUST be written in ${requestedLang === "bn" ? "Bangla script" : requestedLang === "hi" ? "Hindi (Devanagari)" : "English"}, and "language" MUST be "${requestedLang}".`
    : "";
  const userCtx = `BOSS SAID: "${text}"${langDirective}

CURRENT TASKS:
${taskList}

Current date: ${new Date().toISOString().slice(0, 10)} (weekday: ${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()]})

Now respond with the JSON object only.`;
  return {
    userCtx,
    system: SYSTEM_PROMPT + soulExtra,
    requestedLang,
    text,
  };
}

function brainMessages(ctx: Ctx, history: { role: string; content: string }[], attempt: number) {
  return [
    { role: "system" as const, content: ctx.system },
    ...history.slice(-8).map((h) => ({
      role: h.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(h.content).slice(0, 1500),
    })),
    { role: "user" as const, content: attempt === 0 ? ctx.userCtx : ctx.userCtx + "\n\nREMINDER: output ONLY the raw JSON object. No other text." },
  ];
}

const TRANSLATE_LABELS: Record<"bn" | "en" | "hi", string> = {
  bn: "Translate the assistant's reply into natural Bangla script (বাংলা), keeping the polite 'স্যার' tone. Output ONLY the translated sentence.",
  hi: "Translate the assistant's reply into natural Hindi (Devanagari), keeping the polite 'सर' tone. Output ONLY the translated sentence.",
  en: "Translate the assistant's reply into natural English, keeping the polite 'sir' tone. Output ONLY the translated sentence.",
};

function fallbackReply(text: string): JarvisResponse {
  const lang = detectLanguage(text);
  const fallback: Record<string, string> = {
    en: "I'm afraid my circuits glitched for a moment, sir. Could you repeat that?",
    bn: "মাফ করবেন স্যার, একটু সমস্যা হচ্ছিল। আবার বলবেন?",
    hi: "माफ़ कीजिए सर, एक क्षण तकनीकी समस्या थी। दोबारा बताइए?",
  };
  return { reply: fallback[lang], language: lang, action: { type: "none" } };
}

/* ================= STREAMING MODE (lightning speed) =================
 * NDJSON lines to the client:
 *  {"t":"meta","language":"bn"}                      — early language hint
 *  {"t":"r","d":"<decoded reply delta>"}             — speak-as-generated
 *  {"t":"fix","reply":"...","language":"bn"}         — rare language correction
 *  {"t":"end","reply":..,"language":..,"action":..,"replaceReply":..} */
async function handleStream(ctx: Ctx, history: { role: string; content: string }[]): Promise<Response> {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: Record<string, unknown>) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {
          /* client gone */
        }
      };
      try {
        // 1) instant time / date — zero LLM, true lightning for the most common quick ask
        const timeIntent = detectTimeIntent(ctx.text);
        const dateIntent = !timeIntent && detectDateIntent(ctx.text);
        if (timeIntent || dateIntent) {
          const r = timeDateReply(timeIntent ? "time" : "date", ctx.text);
          await persistConversation(ctx.text, r.reply, r.language, { type: "none" });
          send({ t: "end", reply: r.reply, language: r.language, action: { type: "none" } });
          controller.close();
          return;
        }

        // 2) stream the brain's JSON and emit reply deltas live
        const zai = await ZAI.create();
        send({ t: "meta", language: ctx.requestedLang || detectLanguage(ctx.text) });

        let raw = "";
        let spokenSoFar = "";
        const extract = createReplyExtractor();
        const emit = (chunk: string) => {
          raw += chunk;
          const out = extract.feed(chunk);
          if (out) {
            spokenSoFar += out;
            send({ t: "r", d: out });
          }
        };

        const result = await zai.chat.completions.create({
          messages: brainMessages(ctx, history, 0),
          thinking: { type: "disabled" },
          max_tokens: 500,
          stream: true,
        });

        if (result && typeof (result as ReadableStream).getReader === "function") {
          const reader = (result as ReadableStream<Uint8Array>).getReader();
          const dec = new TextDecoder();
          let sse = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            sse += dec.decode(value, { stream: true });
            const lines = sse.split("\n");
            sse = lines.pop() || "";
            for (const line of lines) {
              const l = line.trim();
              if (!l) continue;
              const payload = l.startsWith("data:") ? l.slice(5).trim() : l;
              if (!payload || payload === "[DONE]") continue;
              try {
                const j = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
                };
                emit(j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.message?.content ?? "");
              } catch {
                /* ignore keep-alive / non-JSON lines */
              }
            }
          }
        } else {
          const content =
            (result as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || "";
          emit(content);
        }

        // 3) finalize: parse full JSON; fall back to what was already spoken
        let parsed = safeJsonParse(raw);
        if (!parsed) {
          const reply = spokenSoFar.trim();
          parsed = reply
            ? { reply, language: detectLanguage(reply), action: { type: "none" } }
            : fallbackReply(ctx.text);
        }

        // 4) language enforcement — rare translate fix, client swaps pending speech
        const userScriptLang = detectLanguage(ctx.text);
        const targetLang = ctx.requestedLang || (userScriptLang !== "en" ? userScriptLang : null);
        if (targetLang && parsed.language !== targetLang) {
          try {
            const fix = await zai.chat.completions.create({
              messages: [
                { role: "system", content: TRANSLATE_LABELS[targetLang] },
                { role: "user", content: parsed.reply },
              ],
              thinking: { type: "disabled" },
              max_tokens: 200,
            });
            const translated = fix?.choices?.[0]?.message?.content?.trim();
            if (translated) {
              parsed.reply = translated;
              parsed.language = targetLang;
              send({ t: "fix", reply: translated, language: targetLang });
            }
          } catch {
            /* keep original */
          }
        }

        // 5) time/date chosen by the model → inject the REAL value, keep the ack
        let replaceReply: string | undefined;
        if (parsed.action?.type === "show_time" || parsed.action?.type === "show_date") {
          const r = timeDateReply(parsed.action.type === "show_time" ? "time" : "date", ctx.text);
          replaceReply = r.reply;
          parsed.language = r.language;
          parsed.action = { type: "none" };
        }

        // 6) server-side DB actions + memory, then final event
        await runServerActions(parsed.action);
        await persistConversation(ctx.text, parsed.reply, parsed.language, parsed.action);
        send({
          t: "end",
          reply: parsed.reply,
          language: parsed.language,
          action: parsed.action,
          ...(replaceReply ? { replaceReply } : {}),
        });
        controller.close();
      } catch (e) {
        console.error("jarvis stream error:", e);
        const fb = fallbackReply(ctx.text);
        send({ t: "end", reply: fb.reply, language: fb.language, action: { type: "none" } });
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/* ================= NON-STREAMING MODE (compat fallback) ================= */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = (body?.text || "").toString().slice(0, 2000).trim();
    const history: { role: string; content: string }[] = Array.isArray(body?.history)
      ? body.history.slice(-10)
      : [];
    if (!text) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const ctx = await buildCtx(text, history);

    if (body?.stream === true) {
      return handleStream(ctx, history);
    }

    const zai = await ZAI.create();
    let parsed: JarvisResponse | null = null;
    let lastErr = "";

    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const completion = await zai.chat.completions.create({
          messages: brainMessages(ctx, history, attempt),
          thinking: { type: "disabled" },
          max_tokens: 500,
        });
        const raw = completion.choices[0]?.message?.content || "";
        parsed = safeJsonParse(raw);
        if (!parsed) lastErr = raw.slice(0, 300);
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }

    if (!parsed) {
      parsed = fallbackReply(text);
      console.error("jarvis brain parse fail:", lastErr);
    }

    // Language enforcement: requested language wins, then script-match rule.
    const userScriptLang = detectLanguage(text);
    const targetLang = ctx.requestedLang || (userScriptLang !== "en" ? userScriptLang : null);
    if (targetLang && parsed.language !== targetLang) {
      try {
        const fix = await zai.chat.completions.create({
          messages: [
            { role: "system", content: TRANSLATE_LABELS[targetLang] },
            { role: "user", content: parsed.reply },
          ],
          thinking: { type: "disabled" },
          max_tokens: 200,
        });
        const translated = fix?.choices?.[0]?.message?.content?.trim();
        if (translated) {
          parsed.reply = translated;
          parsed.language = targetLang;
        }
      } catch {
        /* keep original */
      }
    }

    await runServerActions(parsed.action);
    await persistConversation(text, parsed.reply, parsed.language, parsed.action);
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("jarvis route error:", e);
    return NextResponse.json(
      { reply: "System fault, sir. Restarting protocols advised.", language: "en", action: { type: "none" } },
      { status: 200 }
    );
  }
}
