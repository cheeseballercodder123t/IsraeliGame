"use client";

import { useSyncExternalStore } from "react";

/**
 * The noise the table makes, and the switch for it.
 *
 * Nothing here is loaded from a file: the bell is a struck set of partials and
 * the press is a low thud with a scrape of noise over it, both built on the
 * spot. That keeps the table silent until a director asks for sound, and then
 * it costs nothing to hear. Sound is off until the switch is turned on, and the
 * choice is remembered per browser. The audio context is only built on that
 * first click, which is also the gesture a browser wants before it will play
 * anything at all.
 */

const STORAGE_KEY = "conglomerate:sound";

let on = false;
let context: AudioContext | null = null;
const subscribers = new Set<() => void>();

function stored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

on = stored();

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Whether this browser has asked the table to make a noise. */
export function soundOn(): boolean {
  return on;
}

export function setSoundOn(next: boolean): void {
  on = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  } catch {
    // A browser with no storage still gets the noise; it just forgets.
  }
  // Turning it on is a click, so it is the right moment to wake the context.
  if (next) audio();
  for (const callback of subscribers) callback();
}

export function toggleSound(): void {
  setSoundOn(!on);
}

/** Reads the switch in a component without tripping over hydration. */
export function useSound(): boolean {
  return useSyncExternalStore(subscribe, soundOn, () => false);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === "suspended") void context.resume();
  return context;
}

/** The window closing: a brass bell struck once, hum ringing out last. */
export function bell(): void {
  if (!on) return;
  const ctx = audio();
  if (!ctx) return;
  const at = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, at);
  master.gain.exponentialRampToValueAtTime(0.45, at + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, at + 1.7);
  master.connect(ctx.destination);

  // A bell is not a chord: the partials sit above the fundamental at uneven
  // intervals and die at different speeds, and the strike is gone first.
  const partials: [number, number, number][] = [
    [587.33, 0.5, 1.6],
    [880.0, 0.32, 1.1],
    [1174.66, 0.22, 0.8],
    [1760.0, 0.14, 0.55],
    [2637.02, 0.2, 0.09],
  ];
  for (const [frequency, level, ring] of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + ring);
    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + ring + 0.05);
  }
}

/** The paper arriving: the press comes down, then the sheet slides out. */
export function thump(): void {
  if (!on) return;
  const ctx = audio();
  if (!ctx) return;
  const at = ctx.currentTime;

  const body = ctx.createOscillator();
  const gain = ctx.createGain();
  body.type = "triangle";
  body.frequency.setValueAtTime(180, at);
  body.frequency.exponentialRampToValueAtTime(54, at + 0.1);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.4, at + 0.007);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
  body.connect(gain);
  gain.connect(ctx.destination);
  body.start(at);
  body.stop(at + 0.3);

  const scrape = ctx.createBufferSource();
  scrape.buffer = noiseBuffer(ctx, 0.18);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1400, at);
  filter.Q.setValueAtTime(0.8, at);
  const scrapeGain = ctx.createGain();
  scrapeGain.gain.setValueAtTime(0.0001, at);
  scrapeGain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
  scrapeGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  scrape.connect(filter);
  filter.connect(scrapeGain);
  scrapeGain.connect(ctx.destination);
  scrape.start(at);
  scrape.stop(at + 0.2);
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) channel[index] = Math.random() * 2 - 1;
  return buffer;
}
