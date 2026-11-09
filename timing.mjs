import { performance } from "node:perf_hooks";

export function startTiming() {
  const t0 = performance.now();
  const steps = [];
  let last = t0;
  return {
    mark(name) {
      const now = performance.now();
      steps.push({ step: name, ms: Math.round(now - last) });
      last = now;
    },
    finish(extraStep) {
      if (extraStep) {
        const now = performance.now();
        steps.push({ step: extraStep, ms: Math.round(now - last) });
      }
      const totalMs = Math.round(performance.now() - t0);
      return { totalMs, steps };
    },
  };
}

export function logTiming(route, timing, meta = {}) {
  if (process.env.WPPT_LAB_LOG === "0") return;
  const steps = timing.steps.map((s) => `${s.step}=${s.ms}ms`).join(" ");
  console.log(`[wppt-lab] ${route} total=${timing.totalMs}ms ${steps}`, meta);
}
