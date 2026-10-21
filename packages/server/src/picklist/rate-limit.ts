const PRUNE_ABOVE = 10_000;

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

function prune(now: number) {
    for (let [key, w] of windows) {
        if (w.resetAt <= now) windows.delete(key);
    }
}

export function hitCount(key: string, now = Date.now()): number {
    let w = windows.get(key);
    return w && w.resetAt > now ? w.count : 0;
}

export function recordHit(key: string, windowMs: number, now = Date.now()): number {
    if (windows.size > PRUNE_ABOVE) prune(now);
    let w = windows.get(key);
    if (!w || w.resetAt <= now) {
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
    }
    w.count += 1;
    return w.count;
}
