// In-process pub/sub hub for multi-device sync (SSE).
// Works with the Next.js standalone (long-lived Node) server.
// NOTE: this bus lives in the server process memory — perfect for
// standalone/VPS deployment (the recommended way to run JARVIS).

export type BusSubscriber = {
  deviceId: string;
  send: (event: string, data: unknown) => void;
};

type Bus = {
  subs: Set<BusSubscriber>;
};

const g = globalThis as unknown as { __jarvisDeviceBus?: Bus };

export function bus(): Bus {
  if (!g.__jarvisDeviceBus) {
    g.__jarvisDeviceBus = { subs: new Set<BusSubscriber>() };
  }
  return g.__jarvisDeviceBus;
}

export function subscribe(sub: BusSubscriber): () => void {
  const b = bus();
  b.subs.add(sub);
  return () => {
    b.subs.delete(sub);
  };
}

export function emitTo(deviceId: string, event: string, data: unknown): number {
  let n = 0;
  for (const s of bus().subs) {
    if (s.deviceId === deviceId) {
      try {
        s.send(event, data);
        n++;
      } catch {
        bus().subs.delete(s);
      }
    }
  }
  return n;
}

export function broadcast(event: string, data: unknown, exceptId?: string): void {
  for (const s of [...bus().subs]) {
    if (exceptId && s.deviceId === exceptId) continue;
    try {
      s.send(event, data);
    } catch {
      bus().subs.delete(s);
    }
  }
}
