/* JARVIS Voice Engine — client side (v3, hardened)
 *
 * SpeechRecognition wrapper (Chrome/Edge/Android Chrome/Samsung/iOS Safari 14.5+)
 * with bn-BD / en-US / hi-IN, auto-restart with backoff (mic never silently dies).
 *
 * Hybrid TTS (proven by server tests):
 *  - Cloud AI voice "jam"  → English only (bn/hi text garbles it)
 *  - Cloud AI voice "kazi" → Bangla (used when voiceMode = "cloud")
 *  - Device speechSynthesis → Bangla + Hindi (+ English fallback), hardened:
 *      voice cache + voiceschanged, chunking (Chrome 15s bug), start-watchdog,
 *      duration watchdog that CANCELS leftovers (prevents mic self-hearing loop),
 *      iOS/Safari unlock support.
 *  - NEVER hangs: every path resolves with a hard cap; failures fall back
 *    device-wards (cloud → device), so JARVIS never goes fully silent.
 */

export type RecogLang = "bn-BD" | "en-US" | "hi-IN";
export type VoiceMode = "auto" | "cloud" | "device";
export type SpeakLang = "bn" | "en" | "hi";

/* ---------- minimal SpeechRecognition typings ---------- */
type SRResultItem = { transcript: string; confidence: number };
type SRResult = { isFinal: boolean; length: number; [i: number]: SRResultItem };
type SREvent = { resultIndex: number; results: { length: number; [i: number]: SRResult } };
type SRErrorEvent = { error: string; message?: string };

type SRInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SRCtor = new () => SRInstance;

function getCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRCtor;
    webkitSpeechRecognition?: SRCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechSupported(): boolean {
  return getCtor() !== null;
}

/* True on iPhone/iPad (incl. iPadOS masquerading as Mac) */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (/Mac/.test(navigator.platform || "") && "ontouchend" in document)
  );
}

export class VoiceListener {
  private recog: SRInstance | null = null;
  private active = false;
  private lang: RecogLang = "bn-BD";
  private onResult: (text: string, isFinal: boolean) => void = () => {};
  private onEnd: () => void = () => {};
  private onError: (err: string) => void = () => {};
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private hardFails = 0;

  setLang(lang: RecogLang) {
    this.lang = lang;
    if (this.recog) this.recog.lang = lang;
  }

  getLang() {
    return this.lang;
  }

  isActive() {
    return this.active;
  }

  configure(opts: {
    onResult: (text: string, isFinal: boolean) => void;
    onEnd?: () => void;
    onError?: (err: string) => void;
  }) {
    this.onResult = opts.onResult;
    this.onEnd = opts.onEnd || (() => {});
    this.onError = opts.onError || (() => {});
  }

  start(continuous = true) {
    if (this.active) return true; // already running — never double-start
    this.stop();
    const Ctor = getCtor();
    if (!Ctor) {
      this.onError("unsupported");
      return false;
    }
    const recog = new Ctor();
    recog.lang = this.lang;
    recog.continuous = continuous;
    recog.interimResults = true;
    recog.maxAlternatives = 1;

    recog.onresult = (event: SREvent) => {
      this.attempts = 0; // healthy — reset backoff
      this.hardFails = 0;
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (final.trim()) this.onResult(final.trim(), true);
      else if (interim.trim()) this.onResult(interim.trim(), false);
    };

    recog.onerror = (e: SRErrorEvent) => {
      const err = String(e?.error || "error");
      if (err === "no-speech" || err === "aborted") return; // benign — onend restarts
      // hard failures: mic genuinely missing/forbidden — count and give up after 3
      if (err === "audio-capture" || err === "not-allowed" || err === "service-not-allowed") {
        this.hardFails++;
        this.onError(err);
        if (this.hardFails >= 3) {
          this.active = false;
          this.onError("mic-unavailable");
          this.onEnd();
        }
        return;
      }
      this.onError(err);
    };

    recog.onend = () => {
      // Chrome auto-stops periodically / mobile networks drop — restart with backoff
      if (this.active) {
        const delay = Math.min(4000, 300 * Math.pow(2, this.attempts++));
        this.restartTimer = setTimeout(() => {
          if (!this.active) return;
          try {
            recog.start();
          } catch {
            // InvalidStateError etc. — try once more after a real pause
            this.restartTimer = setTimeout(() => {
              if (!this.active) return;
              try {
                recog.start();
              } catch {
                this.active = false;
                this.onEnd();
              }
            }, 1200);
          }
        }, delay);
      } else {
        this.onEnd();
      }
    };

    try {
      recog.start();
      this.recog = recog;
      this.active = true;
      this.attempts = 0;
      return true;
    } catch {
      this.active = false;
      this.hardFails++;
      if (this.hardFails >= 3) this.onError("mic-unavailable");
      else this.onError("start-failed");
      return false;
    }
  }

  stop() {
    this.active = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recog) {
      const r = this.recog;
      this.recog = null;
      try {
        r.onend = null;
        r.onresult = null;
        r.onerror = null;
        r.stop();
      } catch {
        try {
          r.abort();
        } catch {
          /* noop */
        }
      }
    }
  }
}

/* ---------- device voice registry (fixes empty getVoices()) ---------- */

let voicesCache: SpeechSynthesisVoice[] = [];
let voicesHooked = false;

function hookVoices() {
  if (voicesHooked || typeof window === "undefined" || !window.speechSynthesis) return;
  voicesHooked = true;
  const refresh = () => {
    voicesCache = window.speechSynthesis.getVoices() || [];
  };
  refresh();
  // Chrome/Android loads voices async — must listen for this event
  try {
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
  } catch {
    window.speechSynthesis.onvoiceschanged = refresh;
  }
  // Some engines populate late without the event
  setTimeout(refresh, 300);
  setTimeout(refresh, 1500);
}

function pickDeviceVoice(lang: SpeakLang): SpeechSynthesisVoice | null {
  hookVoices();
  const vs = voicesCache.length ? voicesCache : window.speechSynthesis?.getVoices?.() || [];
  if (!vs.length) return null;
  const by = (p: (v: SpeechSynthesisVoice) => boolean) => vs.find(p) || null;
  if (lang === "bn") {
    return (
      by((v) => v.lang?.toLowerCase().startsWith("bn")) ||
      by((v) => /bangla|bengali/i.test(v.name)) ||
      by((v) => v.lang?.toLowerCase().startsWith("hi")) || // Hindi voice reads Bangla decently
      by((v) => /^(en)?in/i.test(v.lang || "")) || // any Indian voice as last resort
      null
    );
  }
  if (lang === "hi") {
    return (
      by((v) => v.lang?.toLowerCase().startsWith("hi")) ||
      by((v) => v.lang?.toLowerCase().startsWith("bn")) ||
      null
    );
  }
  // English — prefer a British gentleman like jam, else any clear en voice
  return (
    by((v) => /en-GB/i.test(v.lang) && /male|daniel|arthur|oliver/i.test(v.name)) ||
    by((v) => /Google UK English Male/i.test(v.name)) ||
    by((v) => /en-GB/i.test(v.lang)) ||
    by((v) => /en-US/i.test(v.lang)) ||
    by((v) => v.lang?.toLowerCase().startsWith("en")) ||
    null
  );
}

/** Status report for the SETTINGS screen. */
export function deviceVoiceStatus(): { total: number; bn: boolean; hi: boolean; en: boolean } {
  hookVoices();
  const vs = window.speechSynthesis?.getVoices?.() || [];
  const has = (p: (v: SpeechSynthesisVoice) => boolean) => vs.some(p);
  return {
    total: vs.length,
    bn: has((v) => v.lang?.toLowerCase().startsWith("bn")) || has((v) => /bangla|bengali/i.test(v.name)) || has((v) => v.lang?.toLowerCase().startsWith("hi")),
    hi: has((v) => v.lang?.toLowerCase().startsWith("hi")),
    en: has((v) => v.lang?.toLowerCase().startsWith("en")),
  };
}

/* ---------- audio unlock (iOS/Safari autoplay policy) ---------- */

let audioUnlocked = false;

/** Call ONCE inside a real user gesture (INITIALIZE tap). Unlocks HTMLAudio,
 *  AudioContext and speechSynthesis for the whole session on iOS/Safari. */
export async function unlockAudioPlayback(): Promise<void> {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      const ctx = new AC();
      if (ctx.state === "suspended") await ctx.resume();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 300);
    }
  } catch {
    /* noop */
  }
  // speechSynthesis warm-up: iOS needs at least one speak() inside a gesture
  try {
    hookVoices();
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* noop */
  }
}

/* ---------- Hybrid TTS ---------- */

let currentAudio: HTMLAudioElement | null = null;
let speakGeneration = 0;

export function stopSpeaking() {
  speakGeneration++;
  if (currentAudio) {
    const a = currentAudio;
    currentAudio = null;
    try {
      a.pause();
      a.src = "";
    } catch {
      /* noop */
    }
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Split long text into utterance-sized chunks (Chrome stops >~15s utterances). */
function splitForSpeech(text: string, max = 170): string[] {
  if (text.length <= max) return [text];
  const parts = text.match(/[^.!?।,;]+[.!?।,;]*/g) || [text];
  const chunks: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length <= max) cur += p;
    else {
      if (cur.trim()) chunks.push(cur.trim());
      if (p.length > max) {
        for (let i = 0; i < p.length; i += max) chunks.push(p.slice(i, i + max));
        cur = "";
      } else cur = p;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length ? chunks : [text.slice(0, max)];
}

/** Device (browser) speech — always works offline, all languages. */
function speakWithDevice(
  text: string,
  language: SpeakLang,
  speed: number,
  volume: number,
  gen: number
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
    hookVoices();
    const synth = window.speechSynthesis;
    const rate = clamp(speed || 1, 0.5, 2);
    const chunks = splitForSpeech(text);
    let idx = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      // cancel leftovers so the mic never hears JARVIS's tail (self-hearing loop)
      try {
        if (speakGeneration === gen) synth.cancel();
      } catch {
        /* noop */
      }
      resolve();
    };

    const speakNext = () => {
      if (settled || speakGeneration !== gen) return finish();
      if (idx >= chunks.length) return finish();
      const chunk = chunks[idx++];
      const u = new SpeechSynthesisUtterance(chunk);
      const v = pickDeviceVoice(language);
      if (v) u.voice = v;
      u.lang =
        v?.lang ||
        (language === "bn" ? "bn-BD" : language === "hi" ? "hi-IN" : "en-US");
      u.rate = rate;
      u.volume = clamp(volume ?? 1, 0, 1);
      u.pitch = 1;

      let chunkDone = false;
      const timers: ReturnType<typeof setTimeout>[] = [];
      const clearTimers = () => {
        timers.forEach(clearTimeout);
        timers.length = 0;
      };
      const advance = () => {
        if (chunkDone || settled) return;
        chunkDone = true;
        clearTimers();
        speakNext();
      };

      u.onend = advance;
      u.onerror = advance;
      u.onstart = () => {
        // started speaking — the 3.5s start-watchdog can stand down
        const t = timers[0];
        if (t) clearTimeout(t);
      };

      try {
        try {
          if (synth.paused) synth.resume(); // Chrome quirk
        } catch {
          /* noop */
        }
        synth.speak(u);
      } catch {
        return finish();
      }

      // start-watchdog: engine silently refused (no voice / blocked) → skip chunk
      timers.push(
        setTimeout(() => {
          if (!chunkDone) {
            try {
              synth.cancel();
            } catch {
              /* noop */
            }
            advance();
          }
        }, 3500)
      );

      // duration watchdog — never hangs, kills stuck engines
      const perChar = language === "en" ? 95 : 135;
      const cap = Math.max(9000, (chunk.length * perChar) / rate) + 9000;
      timers.push(setTimeout(() => {
        if (!chunkDone) {
          try {
            synth.cancel();
          } catch {
            /* noop */
          }
          advance();
        }
      }, cap));
    };

    // absolute cap for the whole utterance set
    const totalCap = Math.min(
      120000,
      chunks.length * Math.max(9000, (text.length * (language === "en" ? 95 : 135)) / rate) + 15000
    );
    setTimeout(finish, totalCap);

    speakNext();
  });
}

/** Play a cloud-TTS blob. Resolves on end; REJECTS if playback is blocked/failed
 *  so the caller can fall back to the device voice. */
function playCloudBlob(blob: Blob, volume: number, gen: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.src = url;
    audio.volume = clamp(volume ?? 1, 0, 1);
    audio.setAttribute("playsinline", "");
    currentAudio = audio;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(playCap);
      if (currentAudio === audio) currentAudio = null;
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* noop */
      }
      resolve();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(playCap);
      if (currentAudio === audio) currentAudio = null;
      try {
        audio.pause();
        URL.revokeObjectURL(url);
      } catch {
        /* noop */
      }
      reject(new Error("playback-blocked"));
    };

    audio.onended = () => {
      if (speakGeneration === gen) finish();
      else finish();
    };
    audio.onerror = fail;
    const playCap = setTimeout(fail, 5000); // blocked play() often never errors
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(fail);
  });
}

/** Speak text aloud. NEVER throws, NEVER hangs, NEVER goes fully silent:
 *  cloud (when allowed) → device fallback → resolve. */
export function speak(
  text: string,
  language: SpeakLang,
  speed = 1.0,
  volume = 1.0,
  mode: VoiceMode = "auto"
): Promise<void> {
  stopSpeaking();
  const gen = speakGeneration;
  const clean = String(text || "").trim();
  if (!clean) return Promise.resolve();

  const wantsCloud = mode === "cloud" || (mode === "auto" && language === "en");
  // Cloud garbles Hindi text (tested) — always device for hi.
  const canCloud = wantsCloud && typeof navigator !== "undefined" && navigator.onLine && language !== "hi";

  if (!canCloud) return speakWithDevice(clean, language, speed, volume, gen);

  const ctrl = new AbortController();
  const abortT = setTimeout(() => ctrl.abort(), 15000); // slow cloud → device fast

  return fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: clean, speed, lang: language }),
    signal: ctrl.signal,
  })
    .then((r) => {
      if (!r.ok) throw new Error("tts http " + r.status);
      return r.blob();
    })
    .then((blob) => {
      clearTimeout(abortT);
      return playCloudBlob(blob, volume, gen);
    })
    .catch(() => {
      clearTimeout(abortT);
      // cloud unavailable/blocked → device voice (never silent)
      return speakWithDevice(clean, language, speed, volume, gen);
    });
}

/** Fetch a cloud-TTS blob. Resolves null on any failure (caller falls back to device). */
export function fetchTTSBlob(text: string, language: SpeakLang, speed: number): Promise<Blob | null> {
  const ctrl = new AbortController();
  const abortT = setTimeout(() => ctrl.abort(), 15000); // slow cloud → device fast
  return fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speed, lang: language }),
    signal: ctrl.signal,
  })
    .then((r) => {
      if (!r.ok) throw new Error("tts http " + r.status);
      return r.blob();
    })
    .then((blob) => {
      clearTimeout(abortT);
      return blob;
    })
    .catch(() => {
      clearTimeout(abortT);
      return null;
    });
}

/** Split text into natural sentences (Bangla ।, Devanagari ।, Latin .!?…). */
function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?।॥…\n]+[.!?।॥…]*/g) || [text];
  const out = raw.map((s) => s.trim()).filter(Boolean);
  return out.length ? out : [text.trim()];
}

/* ---------- Lightning speaker: sentence-by-sentence streaming TTS ----------
 * Feed sentences as they arrive from the streaming brain. The next sentence's
 * cloud audio is prefetched WHILE the current one plays, so speech never has
 * a gap. Every path falls back to the device voice — never silent. */
export class SentenceSpeaker {
  private queue: { text: string; lang: SpeakLang }[] = [];
  private pumping = false;
  private done = false;
  private finishRes: (() => void) | null = null;
  private gen = 0;
  private epoch = 0;
  private prefetchText = "";
  private prefetchP: Promise<Blob | null> | null = null;
  started = false;
  onStart: (() => void) | null = null; // first sentence began playing

  constructor(
    private speed = 1,
    private volume = 1,
    private mode: VoiceMode = "auto"
  ) {
    this.gen = speakGeneration;
  }

  push(text: string, lang: SpeakLang) {
    const clean = String(text || "").trim();
    if (!clean) return;
    for (const part of splitSentences(clean)) this.queue.push({ text: part, lang });
    void this.pump();
  }

  /** Discard everything (incl. current playback) and speak new text instead. */
  replace(text: string, lang: SpeakLang) {
    this.epoch++;
    this.queue = [];
    this.prefetchP = null;
    stopSpeaking(); // bumps global generation → current play aborts
    this.gen = speakGeneration;
    this.push(text, lang);
  }

  /** Drop everything immediately (STOP / error). */
  abort() {
    this.epoch++;
    this.queue = [];
    this.prefetchP = null;
    this.done = true;
    stopSpeaking();
    this.gen = speakGeneration;
    this.settleFinish();
  }

  /** Resolves when every queued sentence has finished playing. */
  finish(): Promise<void> {
    this.done = true;
    if (!this.pumping) {
      if (!this.queue.length) return Promise.resolve();
      void this.pump();
    }
    return new Promise((res) => {
      this.finishRes = res;
    });
  }

  private settleFinish() {
    if (this.done && !this.queue.length && this.finishRes) {
      const r = this.finishRes;
      this.finishRes = null;
      r();
    }
  }

  private wantsCloudFor(lang: SpeakLang): boolean {
    const wantsCloud = this.mode === "cloud" || (this.mode === "auto" && lang === "en");
    return wantsCloud && typeof navigator !== "undefined" && navigator.onLine && lang !== "hi";
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        if (speakGeneration !== this.gen) {
          // user pressed STOP → drop the rest
          this.queue = [];
          break;
        }
        const ep = this.epoch;
        const next = this.queue.shift();
        if (!next) break;
        if (!this.started) {
          this.started = true;
          try {
            this.onStart?.();
          } catch {
            /* noop */
          }
        }
        this.startPrefetch();
        await this.playOne(next.text, next.lang, ep);
        if (ep !== this.epoch) break; // replaced mid-play — new pump owns the queue
      }
    } finally {
      this.pumping = false;
      this.settleFinish();
    }
  }

  private startPrefetch() {
    if (this.prefetchP) return;
    const nx = this.queue[0];
    if (!nx || !this.wantsCloudFor(nx.lang)) return;
    this.prefetchText = nx.text;
    this.prefetchP = fetchTTSBlob(nx.text, nx.lang, this.speed);
  }

  private async playOne(text: string, lang: SpeakLang, ep: number) {
    if (!this.wantsCloudFor(lang)) {
      await speakWithDevice(text, lang, this.speed, this.volume, this.gen);
      return;
    }
    let blobP: Promise<Blob | null>;
    if (this.prefetchP && this.prefetchText === text) {
      blobP = this.prefetchP;
      this.prefetchP = null;
    } else {
      blobP = fetchTTSBlob(text, lang, this.speed);
    }
    const blob = await blobP;
    if (ep !== this.epoch || speakGeneration !== this.gen) return;
    if (!blob) {
      await speakWithDevice(text, lang, this.speed, this.volume, this.gen);
      return;
    }
    try {
      await playCloudBlob(blob, this.volume, this.gen);
    } catch {
      await speakWithDevice(text, lang, this.speed, this.volume, this.gen);
    }
  }
}

/* ---------- Language helpers ---------- */

export function mapLangToRecog(lang: "auto" | "bn" | "en" | "hi"): RecogLang {
  if (lang === "en") return "en-US";
  if (lang === "hi") return "hi-IN";
  return "bn-BD"; // bn + auto default (boss's main language)
}

export function detectScriptLang(text: string): "bn" | "en" | "hi" {
  if (/[\u0980-\u09FF]/.test(text)) return "bn";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  const banglish =
    /\b(koro|korun|koren|dao|dibe|diyo|den|amar|amake|kemon|acho|bolo|son|shonao|lagbe|lagche|chai|kotha|bhalo|valo|kori|korbo|korchi|korche|korlo|hobe|hoye|geche|gese|dorkar|cholbe|ami|tumi|apni|apnake|kivabe|accha|ache|kholo|khol|dekhao|dekha|chalao|chalu|ekta|ekjon|kothay|keno|kobe|sesh)\b/i;
  if (banglish.test(text)) return "bn";
  return "en";
}

/* ---------- Live microphone level (proves the mic is really connected) ---------- */

export class MicLevelMeter {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private raf = 0;
  private running = false;

  isRunning() {
    return this.running;
  }

  async start(onLevel: (v: number) => void): Promise<boolean> {
    this.stop();
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const AC =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      if (this.ctx.state === "suspended") {
        try {
          await this.ctx.resume();
        } catch {
          /* noop */
        }
      }
      const src = this.ctx.createMediaStreamSource(this.stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      this.running = true;
      const loop = () => {
        if (!this.running || !this.ctx) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length) / 255;
        onLevel(clamp(rms * 3.4, 0, 1));
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    try {
      this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* noop */
    }
    this.stream = null;
  }
}
