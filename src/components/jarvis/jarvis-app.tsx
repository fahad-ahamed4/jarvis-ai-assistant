"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Bot, Mic, Square, Send, Newspaper, X, ExternalLink, RefreshCw, Power, Radio, Cpu, Play,
} from "lucide-react";
import Orb from "./orb";
import JarvisBot from "./jarvis-bot";
import JarvisScreen from "./screens";
import {
  VoiceListener, speechSupported, isIOS, speak, stopSpeaking, mapLangToRecog, detectScriptLang,
  unlockAudioPlayback, MicLevelMeter, SentenceSpeaker, type SpeakLang,
} from "@/lib/jarvis/speech";
import {
  APPS, type Headline, type JarvisAction, type JarvisReply, type OrbState, type Settings,
} from "@/lib/jarvis/types";

/* ---------- tiny UI beep (no assets) ---------- */
function blip(kind: "on" | "off" | "ack") {
  try {
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    const freqs = kind === "on" ? [880, 1240] : kind === "off" ? [520, 340] : [740, 980, 1320];
    o.frequency.setValueAtTime(freqs[0], now);
    freqs.slice(1).forEach((f, i) => o.frequency.setValueAtTime(f, now + 0.09 * (i + 1)));
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12 * freqs.length);
    o.start(now);
    o.stop(now + 0.14 * freqs.length);
    setTimeout(() => ctx.close(), 700);
  } catch {
    /* noop */
  }
}

/* wake-word pattern shared by final + lightning-interim paths */
const WAKE_RE = /(jarvis|jervis|jervus|জার্ভিস|জারভিস|जार्विस)/i;
const WAKE_STRIP_RE = /^(hey |hi |ok |okay )?(jarvis|জার্ভিস|জারভিস|জার্ভিস|जार्विस)[,!.]?\s*/i;

const WIRES = [
  { id: "memory", color: "#22d3ee", d: "M 35 16.5 C 56 16.5, 54 25, 30 31.5" },
  { id: "chat", color: "#fb923c", d: "M 35 23 C 54 23, 54 29.5, 29.5 36" },
  { id: "soul", color: "#94a3b8", d: "M 35 30 C 52 30, 52 35.5, 29 40.5" },
  { id: "setting", color: "#4ade80", d: "M 35 37 C 50 37, 50 42, 28.5 45" },
];

const MENU = [
  { key: "memory", label: "MEMORY", icon: Cpu, color: "text-cyan-300", border: "border-cyan-400/50", glow: "shadow-[0_0_12px_rgba(34,211,238,0.35)]" },
  { key: "chat", label: "CHAT", icon: Bot, color: "text-orange-300", border: "border-orange-400/50", glow: "shadow-[0_0_12px_rgba(251,146,60,0.35)]" },
  { key: "soul", label: "SOUL", icon: Radio, color: "text-slate-200", border: "border-slate-300/40", glow: "shadow-[0_0_12px_rgba(148,163,184,0.3)]" },
  { key: "setting", label: "SETTING", icon: RefreshCw, color: "text-emerald-300", border: "border-emerald-400/50", glow: "shadow-[0_0_12px_rgba(74,222,128,0.35)]" },
] as const;

type MenuKey = (typeof MENU)[number]["key"];

export default function JarvisApp() {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [screen, setScreen] = useState<MenuKey | null>(null);
  const [input, setInput] = useState("");
  const [song, setSong] = useState<{ videoId: string; title: string } | null>(null);
  const [booted, setBooted] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [pendingLink, setPendingLink] = useState<{ label: string; url: string } | null>(null);
  const [srSupported, setSrSupported] = useState(true);
  const [settings, setSettings] = useState<Settings>({
    id: "main", soul: "", speed: 1.0, orbColor: "green", lang: "auto", wakeWord: false, volume: 1.0, voiceMode: "auto",
  });

  const listenerRef = useRef<VoiceListener | null>(null);
  const micMeterRef = useRef<MicLevelMeter | null>(null);
  const micBarRef = useRef<HTMLDivElement | null>(null);
  const levelRef = useRef(0); // live mic level → orb (no re-render)
  const busyRef = useRef(false);
  const busyWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convActiveRef = useRef(false); // continuous conversation until STOP
  const wakeModeRef = useRef(false);
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const netToastAtRef = useRef(0);
  const permToastAtRef = useRef(0);
  const orbStateRef = useRef<OrbState>("idle");
  orbStateRef.current = orbState;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const handleCommandRef = useRef<(text: string) => Promise<void>>(async () => {});
  const handleCommandTextRef = useRef("");
  const startListeningRef = useRef<() => void>(() => {});
  const interimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cmdGenRef = useRef(0); // command generation — superseded commands never clean up
  const activeAbortRef = useRef<AbortController | null>(null);
  const activeSpeakerRef = useRef<SentenceSpeaker | null>(null);

  /* ---------- data loaders ---------- */
  const loadHeadlines = useCallback(async (topic?: string) => {
    setNewsLoading(true);
    try {
      const r = await fetch(`/api/news${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`);
      const d = await r.json();
      setHeadlines(d.headlines || []);
      return (d.headlines || []) as Headline[];
    } catch {
      return [];
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/settings");
        const d = await r.json();
        if (d.settings) setSettings((prev) => ({ ...prev, ...d.settings }));
      } catch {
        /* noop */
      }
      setBooted(true);
    })();
    setSrSupported(speechSupported());
  }, []);

  /* resume the mic when the app becomes visible again (iOS/Android kill it in background) */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && convActiveRef.current && !busyRef.current && speechSupported()) {
        setTimeout(() => startListeningRef.current(), 600);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /* ---------- mic helpers ---------- */
  const stopMicMeter = () => {
    micMeterRef.current?.stop();
    levelRef.current = 0;
    if (micBarRef.current) micBarRef.current.style.width = "0%";
  };

  const startMicMeter = () => {
    if (isIOS()) return; // iOS: getUserMedia conflicts with SpeechRecognition — state animation only
    if (!micMeterRef.current) micMeterRef.current = new MicLevelMeter();
    micMeterRef.current.start((v) => {
      levelRef.current = v;
      if (micBarRef.current) micBarRef.current.style.width = `${Math.round(v * 100)}%`;
    });
  };

  /* ---------- boot greeting (like the video) — speaks on first user gesture ---------- */
  const initialize = useCallback(() => {
    setInitialized(true);
    blip("on");
    // Unlock audio INSIDE this tap (iOS autoplay policy) — idempotent
    unlockAudioPlayback().then(() => {
      setTimeout(() => {
        setOrbState("speaking");
        speak(
          "System online. Hello sir, I am JARVIS, your personal AI assistant. How may I help you today?",
          "en",
          settingsRef.current.speed,
          settingsRef.current.volume,
          settingsRef.current.voiceMode
        ).then(() => {
          setOrbState((s) => (s === "speaking" ? "idle" : s));
          // start always-listening like the real JARVIS (mic permission already granted by the tap)
          if (speechSupported()) {
            convActiveRef.current = true;
            startListeningRef.current();
          }
        });
      }, 500);
    });
  }, []);

  /* ---------- action executor ---------- */
  const executeAction = useCallback(async (action: JarvisAction, replyOverride: (r: string) => void) => {
    switch (action.type) {
      case "open_app": {
        const key = (action.app || "").toLowerCase().replace(/[\s-]/g, "_");
        const target = APPS[key] || (action.url ? { url: action.url, label: action.app } : null);
        if (target) {
          toast.success(`Opening ${target.label}`, { icon: "🚀" });
          blip("ack");
          setPendingLink({ label: target.label, url: target.url });
          // attempt direct open; if popup-blocked (mobile async), the action chip appears
          const win = window.open(target.url, "_blank", "noopener");
          if (!win) toast(`Tap “OPEN ${target.label.toUpperCase()}” below, sir`, { icon: "👆", duration: 5000 });
        } else {
          toast.error(`Unknown app: ${action.app}`);
        }
        break;
      }
      case "play_song": {
        toast.success(`Playing: ${action.query}`, { icon: "🎵" });
        blip("ack");
        const q = action.query;
        const fallbackOpen = () =>
          window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, "_blank", "noopener");
        fetch(`/api/resolve-song?q=${encodeURIComponent(q)}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.videoId) setSong({ videoId: d.videoId, title: d.title || q });
            else fallbackOpen();
          })
          .catch(fallbackOpen);
        break;
      }
      case "add_task": {
        toast.success(`Task added: ${action.title}`);
        window.dispatchEvent(new CustomEvent("jarvis-refresh-tasks"));
        break;
      }
      case "complete_task": {
        toast.success(`Task completed: ${action.title}`);
        window.dispatchEvent(new CustomEvent("jarvis-refresh-tasks"));
        break;
      }
      case "show_news": {
        const hs = await loadHeadlines(action.topic);
        if (hs.length) {
          const spoken = hs.slice(0, 3).map((h, i) => `${i + 1}. ${h.title}`).join(". ");
          replyOverride(spoken);
        }
        break;
      }
      case "show_time": {
        const lang = detectScriptLang(handleCommandTextRef.current || "");
        const locale = lang === "bn" ? "bn-BD" : lang === "hi" ? "hi-IN" : "en-US";
        const now = new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
        replyOverride(now);
        break;
      }
      case "show_date": {
        const lang = detectScriptLang(handleCommandTextRef.current || "");
        const locale = lang === "bn" ? "bn-BD" : lang === "hi" ? "hi-IN" : "en-US";
        const today = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        replyOverride(today);
        break;
      }
      default:
        break;
    }
  }, [loadHeadlines]);

  /* ---------- core command pipeline (LIGHTNING: streaming brain + sentence TTS) ---------- */
  const handleCommand = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || busyRef.current) return;
      busyRef.current = true;
      const gen = ++cmdGenRef.current;
      handleCommandTextRef.current = clean;
      setLastHeard(clean);
      if (interimTimerRef.current) {
        clearTimeout(interimTimerRef.current);
        interimTimerRef.current = null;
      }
      listenerRef.current?.stop();
      stopMicMeter();
      setOrbState("thinking");

      // watchdog: even if something wedges, JARVIS recovers in 45s
      if (busyWatchRef.current) clearTimeout(busyWatchRef.current);
      busyWatchRef.current = setTimeout(() => {
        if (!busyRef.current) return;
        busyRef.current = false;
        setOrbState((s) => (s === "thinking" || s === "speaking" ? "idle" : s));
        if (convActiveRef.current) setTimeout(() => startListeningRef.current(), 400);
      }, 45000);

      const s0 = settingsRef.current;
      const speaker = new SentenceSpeaker(s0.speed, s0.volume, s0.voiceMode);
      activeSpeakerRef.current = speaker;
      speaker.onStart = () => {
        // first sentence is playing — flip the orb instantly
        setOrbState((st) => (st === "thinking" || st === "idle" ? "speaking" : st));
        blip("ack");
      };
      let lang: SpeakLang = detectScriptLang(clean);
      let spokeAny = false;
      let newsSpeak: string | null = null;

      /* speak complete sentences as they stream in; keep the tail pending */
      let pending = "";
      const feedReply = (chunk: string) => {
        pending += chunk;
        for (;;) {
          const m = pending.match(/^[\s\S]*?[.!?।॥…](\s|$)/);
          if (!m) break;
          const sentence = m[0].trim();
          pending = pending.slice(m[0].length);
          if (sentence) {
            spokeAny = true;
            speaker.push(sentence, lang);
          }
        }
      };
      const flushPending = () => {
        const tail = pending.trim();
        pending = "";
        if (tail) {
          spokeAny = true;
          speaker.push(tail, lang);
        }
      };

      try {
        const ctrl = new AbortController();
        const killT = setTimeout(() => ctrl.abort(), 45000);
        const r = await fetch("/api/jarvis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: clean, history: historyRef.current.slice(-8), stream: true }),
          signal: ctrl.signal,
        });
        clearTimeout(killT);
        activeAbortRef.current = ctrl;
        if (!r.ok || !r.body) throw new Error("brain http " + r.status);

        type EndEvt = { reply: string; language: SpeakLang; action: JarvisAction; replaceReply?: string };
        let finalEvt: EndEvt | null = null;
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const l = line.trim();
            if (!l) continue;
            let evt: { t?: string; d?: string; reply?: string; language?: string; action?: JarvisAction; replaceReply?: string };
            try {
              evt = JSON.parse(l);
            } catch {
              continue;
            }
            if (evt.t === "meta" && (evt.language === "bn" || evt.language === "en" || evt.language === "hi")) {
              lang = evt.language;
            } else if (evt.t === "r" && evt.d) {
              feedReply(String(evt.d));
            } else if (evt.t === "fix" && evt.reply) {
              // brain answered in the wrong language — server translated: swap pending speech
              lang = evt.language === "bn" || evt.language === "en" || evt.language === "hi" ? evt.language : lang;
              pending = "";
              speaker.replace(String(evt.reply), lang);
              spokeAny = true;
            } else if (evt.t === "end") {
              if (evt.language === "bn" || evt.language === "en" || evt.language === "hi") lang = evt.language;
              flushPending();
              finalEvt = {
                reply: String(evt.reply || ""),
                language: lang,
                action: evt.action || { type: "none" },
                replaceReply: evt.replaceReply ? String(evt.replaceReply) : undefined,
              };
            }
          }
        }
        if (!finalEvt) {
          flushPending();
          finalEvt = { reply: "", language: lang, action: { type: "none" } };
        }
        // stream produced nothing speakable → speak the final reply as-is
        if (!spokeAny && finalEvt.reply) speaker.push(finalEvt.reply, lang);

        historyRef.current.push({ role: "user", content: clean });
        historyRef.current.push({ role: "assistant", content: finalEvt.reply });
        if (historyRef.current.length > 12) historyRef.current = historyRef.current.slice(-12);

        // client-side actions (open app, song, news fetch, toasts)
        await executeAction(finalEvt.action, (spokenNews) => {
          newsSpeak = spokenNews;
        });
        if (newsSpeak) speaker.push(newsSpeak, lang); // ack already spoken — headlines follow
        if (finalEvt.replaceReply) speaker.push(finalEvt.replaceReply, lang); // real time/date after the ack

        // adapt recognition language to what boss actually speaks (auto-detect)
        if (settingsRef.current.lang === "auto" && listenerRef.current) {
          const want = mapLangToRecog(lang);
          if (listenerRef.current.getLang() !== want) listenerRef.current.setLang(want);
        }
      } catch {
        speaker.abort();
        if (gen === cmdGenRef.current) {
          setOrbState((s) => (s === "thinking" || s === "speaking" ? "idle" : s));
          try {
            const fl = detectScriptLang(clean);
            const msg =
              fl === "bn"
                ? "কানেকশনে সমস্যা হচ্ছিল স্যার, আবার বলুন।"
                : fl === "hi"
                  ? "कनेक्शन में समस्या थी सर, फिर बताइए।"
                  : "Connection hiccup, sir. Please say that again.";
            await speak(msg, fl, settingsRef.current.speed, settingsRef.current.volume, "device");
          } catch {
            /* noop */
          }
        }
      } finally {
        try {
          await speaker.finish();
        } catch {
          /* noop */
        }
        if (gen === cmdGenRef.current) {
          busyRef.current = false;
          if (busyWatchRef.current) clearTimeout(busyWatchRef.current);
          if (convActiveRef.current) {
            setTimeout(() => startListeningRef.current(), 350);
          } else {
            setOrbState((s) => (s === "speaking" ? "idle" : s));
          }
        }
      }
    },
    [executeAction]
  );
  handleCommandRef.current = handleCommand;

  /* ---------- listening control ---------- */
  const startListening = useCallback(() => {
    if (!speechSupported()) return; // banner informs the user; typing still works
    if (!listenerRef.current) {
      listenerRef.current = new VoiceListener();
      listenerRef.current.configure({
        onResult: (text, isFinal) => {
          if (busyRef.current) return;
          if (isFinal) {
            if (interimTimerRef.current) {
              clearTimeout(interimTimerRef.current);
              interimTimerRef.current = null;
            }
            if (wakeModeRef.current && orbStateRef.current === "idle") {
              const wake = /(jarvis|jervis|jervus|জার্ভিস|জারভিস|जार्विस)/i.test(text);
              if (!wake) return;
              const cmd = text.replace(/^(hey |hi |ok |okay )?(jarvis|জার্ভিস|জারভিস|जार्विस)[,!.]?\s*/i, "").trim();
              if (cmd.length > 2) {
                wakeModeRef.current = false;
                handleCommandRef.current(cmd);
              } else {
                blip("on");
                setOrbState("listening");
                convActiveRef.current = true;
              }
              return;
            }
            const t = text.trim();
            if (t.length > 1) handleCommandRef.current(t);
          } else {
            // LIGHTNING: boss paused ~1.2s mid-listen → treat the stable interim
            // as the command instead of waiting for Chrome's slow final result
            if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
            const t = text.trim();
            if (t.length >= 4 && t.split(/\s+/).length >= 2) {
              interimTimerRef.current = setTimeout(() => {
                interimTimerRef.current = null;
                if (busyRef.current) return;
                let cmd = t;
                if (wakeModeRef.current && orbStateRef.current === "idle") {
                  if (!WAKE_RE.test(cmd)) return;
                  wakeModeRef.current = false;
                  cmd = cmd.replace(WAKE_STRIP_RE, "").trim();
                  if (cmd.length <= 2) return;
                }
                if (cmd.length >= 4) handleCommandRef.current(cmd);
              }, 1200);
            }
          }
        },
        onError: (err) => {
          if (err === "not-allowed" || err === "service-not-allowed") {
            stopMicMeter();
            const now = Date.now();
            if (now - permToastAtRef.current > 15000) {
              permToastAtRef.current = now;
              toast.error("Microphone blocked. Chrome (⋮) → Site settings → Microphone → Allow — or type below.", { duration: 6000 });
            }
            convActiveRef.current = false;
            setOrbState("idle");
          } else if (err === "mic-unavailable") {
            stopMicMeter();
            toast.error("No working microphone, sir. TEST MICROPHONE in SETTING — or type commands below.", { duration: 6000 });
            convActiveRef.current = false;
            setOrbState("idle");
          } else if (err === "audio-capture") {
            stopMicMeter();
          } else if (err === "network") {
            // mobile Chrome drops recognition sockets often — we auto-restart; inform at most once/30s
            const now = Date.now();
            if (now - netToastAtRef.current > 30000) {
              netToastAtRef.current = now;
              toast("Reconnecting microphone…", { icon: "🎙️", duration: 2500 });
            }
          }
        },
      });
    }
    const s = settingsRef.current;
    listenerRef.current.setLang(mapLangToRecog(s.lang));
    const ok = listenerRef.current.start(true);
    if (ok) {
      wakeModeRef.current = orbStateRef.current === "idle" && s.wakeWord;
      setOrbState("listening");
      startMicMeter();
    } else {
      setOrbState((st) => (st === "listening" ? "idle" : st));
      toast.error("Mic could not start — tap the mic button again, sir.", { duration: 4000 });
    }
  }, []);
  startListeningRef.current = startListening;

  const stopAll = useCallback(() => {
    convActiveRef.current = false;
    wakeModeRef.current = false;
    listenerRef.current?.stop();
    stopMicMeter();
    stopSpeaking();
    setOrbState("idle");
    blip("off");
  }, []);

  const micClick = () => {
    unlockAudioPlayback(); // gesture-scoped, idempotent — keeps iOS audio alive
    if (orbState === "listening" || orbState === "speaking" || orbState === "thinking") stopAll();
    else {
      convActiveRef.current = true;
      startListening();
    }
  };

  /* ---------- text input (typed commands always barge in — lightning) ---------- */
  const sendText = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = input.trim();
    if (!t) return;
    setInput("");
    convActiveRef.current = false;
    if (busyRef.current) {
      // supersede whatever is running — the boss typed a new order
      cmdGenRef.current++;
      activeAbortRef.current?.abort();
      activeAbortRef.current = null;
      activeSpeakerRef.current?.abort();
      activeSpeakerRef.current = null;
      busyRef.current = false;
      if (busyWatchRef.current) clearTimeout(busyWatchRef.current);
    }
    handleCommand(t);
  };

  /* ---------- boot overlay ---------- */
  if (!booted || !initialized) {
    return (
      <div className="min-h-dvh w-full bg-black flex justify-center">
        <div
          className="relative w-full max-w-md h-dvh overflow-hidden flex flex-col items-center justify-center"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 40%, rgba(4,44,34,0.95) 0%, rgba(2,20,16,0.97) 45%, #010604 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(16,185,129,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.18) 1px, transparent 1px)",
              backgroundSize: "34px 34px",
            }}
          />
          <div className="relative z-10 flex flex-col items-center gap-7 px-6">
            <div className="relative h-44 w-44 flex items-center justify-center">
              <span className="absolute inset-0 rounded-full border border-emerald-400/40 animate-ping [animation-duration:2.2s]" />
              <Orb state="idle" label={false} />
            </div>
            <div className="text-center">
              <h1
                className="text-2xl tracking-[0.45em] text-emerald-200 font-semibold"
                style={{ fontFamily: "var(--font-orbitron), sans-serif" }}
              >
                JARVIS
              </h1>
              <p className="mt-2 text-[11px] tracking-[0.3em] text-emerald-400/60">
                JUST A RATHER VERY INTELLIGENT SYSTEM
              </p>
            </div>
            <button
              onClick={initialize}
              disabled={!booted}
              className="rounded-full border border-emerald-300/60 bg-emerald-500/15 px-10 py-3.5 text-[12px] font-bold tracking-[0.35em] text-emerald-100 shadow-[0_0_25px_rgba(16,185,129,0.4)] active:scale-95 transition disabled:opacity-40"
            >
              {booted ? "INITIALIZE" : "LOADING…"}
            </button>
            <p className="max-w-xs text-center text-[10px] leading-relaxed text-emerald-100/35">
              Tap to wake JARVIS. Mic permission চাইলে allow করুন — তারপর বাংলা/English/हिंदी যা খুশি বলুন।
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full bg-black flex justify-center">
      <div
        className="relative w-full max-w-md h-dvh overflow-hidden flex flex-col"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 30%, rgba(4,44,34,0.9) 0%, rgba(2,20,16,0.95) 45%, #010604 100%)",
        }}
      >
        {/* scanline / grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(16,185,129,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.18) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
            maskImage: "radial-gradient(90% 70% at 50% 35%, black 30%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(90% 70% at 50% 35%, black 30%, transparent 100%)",
          }}
        />

        {/* top bar */}
        <header className="relative z-20 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-1">
          <button
            aria-label="System status"
            onClick={() => toast("All systems operational, sir.", { icon: "🛰️" })}
            className="h-9 w-9 rounded-full border border-emerald-400/30 flex items-center justify-center text-emerald-300/80 hover:bg-emerald-400/10"
          >
            <Power className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            <h1
              className="text-emerald-200/90 tracking-[0.3em] text-sm font-semibold"
              style={{ fontFamily: "var(--font-orbitron), sans-serif" }}
            >
              JARVIS
            </h1>
          </div>
          <div className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center shadow-[0_0_14px_rgba(16,185,129,0.6)]">
            <Bot className="h-5 w-5 text-black" />
          </div>
        </header>

        {/* main stage */}
        <main className="relative z-10 flex-1 flex flex-col px-3">
          <div className="relative flex-1 min-h-0">
            {/* wires svg */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full z-0 pointer-events-none"
              fill="none"
            >
              {WIRES.map((w) => (
                <g key={w.id}>
                  <path d={w.d} stroke={w.color} strokeOpacity="0.22" strokeWidth="4.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path
                    d={w.d}
                    stroke={w.color}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeDasharray="6 10"
                    className="jarvis-wire-flow"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle cx={w.d.split(" ").slice(-2)[0]} cy={w.d.split(" ").slice(-2)[1].split(" ")[0]} r="1.4" fill={w.color} />
                </g>
              ))}
            </svg>

            {/* orb + cute JARVIS avatar — bot sits at the orb's BASE (core stays fully visible) */}
            <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[74%] max-w-[340px] aspect-square z-10">
              <Orb state={orbState} color={settings.orbColor} levelRef={levelRef} />
              <div className="absolute inset-0 pointer-events-none z-[2]">
                <div className="absolute bottom-[11%] left-1/2 h-[46%] w-[46%] -translate-x-1/2">
                  <JarvisBot state={orbState} color={settings.orbColor} />
                </div>
              </div>
            </div>

            {/* LED dot right */}
            <div className="absolute right-[8%] top-[16%] z-20 h-3 w-3 rounded-full bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.8)]" />

            {/* menu pills (left) */}
            <nav aria-label="JARVIS modules" className="absolute left-2 top-[12%] z-20 flex flex-col gap-2.5">
              {MENU.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setScreen(m.key)}
                  className={`flex items-center gap-2 rounded-full border ${m.border} ${m.glow} bg-black/55 backdrop-blur-sm pl-2.5 pr-4 py-1.5 active:scale-95 transition`}
                >
                  <m.icon className={`h-3.5 w-3.5 ${m.color}`} />
                  <span className={`text-[10px] font-bold tracking-[0.18em] ${m.color}`}>{m.label}</span>
                </button>
              ))}
              {/* news pill (cards hidden by request — news still one tap away) */}
              <button
                onClick={() => {
                  setNewsOpen(true);
                  if (!headlines.length && !newsLoading) loadHeadlines(); // auto-fetch on first open
                }}
                className="flex items-center gap-2 rounded-full border border-sky-400/50 shadow-[0_0_12px_rgba(56,189,248,0.35)] bg-black/55 backdrop-blur-sm pl-2.5 pr-4 py-1.5 active:scale-95 transition"
              >
                <Newspaper className="h-3.5 w-3.5 text-sky-300" />
                <span className="text-[10px] font-bold tracking-[0.18em] text-sky-300">NEWS</span>
              </button>
            </nav>

            {/* STOP + MIC controls */}
            <div className="absolute left-1/2 -translate-x-1/2 top-[74%] z-20 flex items-center gap-3">
              <button
                onClick={stopAll}
                className="flex items-center gap-2 rounded-full border border-red-500/60 bg-red-950/60 px-4 py-1.5 text-red-300 shadow-[0_0_14px_rgba(239,68,68,0.35)] active:scale-95 transition"
                aria-label="Stop JARVIS"
              >
                <Square className="h-3 w-3 fill-red-400 text-red-400" />
                <span className="text-[11px] font-bold tracking-[0.25em]">STOP</span>
              </button>
              <button
                onClick={micClick}
                aria-label={orbState === "idle" ? "Start listening" : "Stop listening"}
                className={`h-9 w-9 rounded-full border flex items-center justify-center active:scale-95 transition ${
                  orbState === "listening"
                    ? "border-amber-300/70 bg-amber-400/20 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.5)]"
                    : "border-emerald-400/60 bg-emerald-500/15 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.45)]"
                }`}
              >
                <Mic className="h-4 w-4" />
              </button>
            </div>

            {/* last heard caption */}
            {lastHeard && (
              <div className="absolute left-1/2 -translate-x-1/2 top-[83%] z-20 max-w-[92%] truncate text-center text-[11px] text-emerald-200/70">
                “{lastHeard}”
              </div>
            )}

            {/* live mic level bar — proof the mic is really connected */}
            <div className="absolute left-1/2 -translate-x-1/2 top-[88%] z-20 w-40">
              <div className={`h-1 w-full overflow-hidden rounded-full bg-emerald-950/80 ${orbState === "listening" ? "opacity-100" : "opacity-25"}`}>
                <div ref={micBarRef} className="jarvis-micbar h-full w-0 rounded-full" />
              </div>
              <p className={`mt-1 text-center text-[8.5px] tracking-[0.3em] ${orbState === "listening" ? "text-amber-300/80" : "text-emerald-100/30"}`}>
                {orbState === "listening" ? "● MIC LIVE" : "MIC STANDBY"}
              </p>
            </div>
          </div>

          {/* browser capability notice (Firefox / very old browsers) */}
          {!srSupported && (
            <div className="relative z-20 mx-1 mt-1 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
              <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
              <p className="text-[10px] leading-relaxed text-amber-200/90">
                Voice input needs <b>Chrome / Edge / Samsung Internet</b> (or iOS 14.5+ Safari). You can still{" "}
                <b>type</b> commands below — everything else works here, sir.
              </p>
            </div>
          )}

          {/* pending action chip */}
          {pendingLink && (
            <div className="relative z-20 mt-1 flex justify-center px-1">
              <a
                href={pendingLink.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPendingLink(null)}
                className="flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/20 px-5 py-2 text-[11px] font-bold tracking-[0.2em] text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.45)] active:scale-95 transition"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                OPEN {pendingLink.label.toUpperCase()}
              </a>
            </div>
          )}

          {/* command input */}
          <form onSubmit={sendText} className="relative z-20 flex items-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 px-1">
            <div className="flex flex-1 items-center gap-2 rounded-full border border-emerald-400/30 bg-black/60 px-4 py-2 backdrop-blur-sm focus-within:border-emerald-300/60">
              <Mic className="h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a command, sir… (Bangla / English / हिंदी)"
                className="w-full bg-transparent text-[12px] text-emerald-100 placeholder:text-emerald-100/30 outline-none"
              />
            </div>
            <button
              type="submit"
              aria-label="Send command"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-black shadow-[0_0_14px_rgba(16,185,129,0.55)] active:scale-95"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </main>

        {/* news sheet */}
        {newsOpen && (
          <div className="absolute inset-0 z-40 flex flex-col bg-[#01110c]/97 backdrop-blur-md">
            <div className="flex items-center justify-between px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
              <button onClick={() => setNewsOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/30 text-emerald-300" aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="text-[13px] font-bold tracking-[0.25em] text-emerald-200" style={{ fontFamily: "var(--font-orbitron), sans-serif" }}>
                TODAY HEADLINES
              </h2>
              <button onClick={() => loadHeadlines()} className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/30 text-emerald-300" aria-label="Refresh news">
                <RefreshCw className={`h-4 w-4 ${newsLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="flex-1 space-y-2.5 overflow-y-auto px-4 pb-6 jarvis-scroll">
              {headlines.length === 0 && !newsLoading && <p className="pt-10 text-center text-xs text-emerald-100/40">No headlines yet, sir.</p>}
              {newsLoading && <p className="pt-10 text-center text-xs text-emerald-100/50">Scanning the network…</p>}
              {headlines.map((h, i) => (
                <a
                  key={i}
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-emerald-400/20 bg-black/40 p-3.5 hover:border-emerald-300/50 transition"
                >
                  <p className="text-[13px] font-semibold leading-snug text-emerald-50">{h.title}</p>
                  {h.snippet && <p className="mt-1 line-clamp-2 text-[11px] text-emerald-100/60">{h.snippet}</p>}
                  <p className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-300/60">
                    <ExternalLink className="h-3 w-3" /> {h.source} {h.date ? `• ${h.date}` : ""}
                  </p>
                </a>
              ))}
            </div>
            <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <button
                onClick={async () => {
                  const hs = headlines.length ? headlines : await loadHeadlines();
                  if (!hs.length) return;
                  const spoken = hs.slice(0, 4).map((h, i) => `${i + 1}. ${h.title}`).join(". ");
                  setOrbState("speaking");
                  await speak(spoken, "en", settings.speed, settings.volume, settings.voiceMode);
                  setOrbState("idle");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500/90 py-2.5 text-[12px] font-bold text-black active:scale-95"
              >
                <Play className="h-4 w-4" /> SPEAK HEADLINES
              </button>
            </div>
          </div>
        )}

        {/* youtube player overlay */}
        {song && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/95 p-4">
            <button onClick={() => setSong(null)} className="absolute right-4 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-red-400/40 text-red-300" aria-label="Close player">
              <X className="h-4 w-4" />
            </button>
            <p className="mb-3 text-[11px] tracking-[0.3em] text-emerald-300/80">♪ NOW PLAYING</p>
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-emerald-400/30 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
              <iframe
                title="JARVIS music player"
                className="aspect-video w-full"
                src={`https://www.youtube.com/embed/${song.videoId}?autoplay=1&rel=0`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="mt-3 max-w-xs truncate text-center text-xs text-emerald-100/70">{song.title}</p>
            <a
              href={`https://www.youtube.com/watch?v=${song.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center gap-1.5 rounded-full border border-emerald-400/40 px-4 py-1.5 text-[11px] text-emerald-200"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in YouTube
            </a>
          </div>
        )}

        {/* module screens */}
        <JarvisScreen
          screen={screen}
          onClose={() => setScreen(null)}
          settings={settings}
          onSettings={(s) => setSettings(s)}
          onCommand={(c) => {
            setScreen(null);
            convActiveRef.current = false;
            handleCommand(c);
          }}
          speakText={async (text, lang) => {
            setOrbState("speaking");
            await speak(text, lang, settingsRef.current.speed, settingsRef.current.volume, settingsRef.current.voiceMode);
            setOrbState((s) => (s === "speaking" ? "idle" : s));
          }}
        />
      </div>
    </div>
  );
}
