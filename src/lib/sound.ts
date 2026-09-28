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

/**
 * The telegraph: a rival's hand has moved on the wire. Two ticks of a key, one
 * higher than the other, and gone. Quiet by design: it is a sound a table
 * hears dozens of times a window, so it has to sit under the bell and the
 * press rather than compete with them.
 */
export function ticker(): void {
  if (!on) return;
  const ctx = audio();
  if (!ctx) return;
  const at = ctx.currentTime;
  for (const [offset, frequency] of [
    [0, 1180],
    [0.07, 1560],
  ] as [number, number][]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(frequency, at + offset);
    gain.gain.setValueAtTime(0.0001, at + offset);
    gain.gain.exponentialRampToValueAtTime(0.06, at + offset + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at + offset);
    osc.stop(at + offset + 0.11);
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

/**
 * The knell: a house has been carried out by the court.
 *
 * Two strikes on the same low bell, the second a little behind the first, so
 * it reads as a tolling rather than as the close of a window. Nothing else at
 * this table sounds like it, because nothing else is this final.
 */
export function knell(): void {
  if (!on) return;
  const ctx = audio();
  if (!ctx) return;
  const at = ctx.currentTime;
  for (const [offset, level] of [
    [0, 0.4],
    [0.85, 0.3],
  ] as [number, number][]) {
    const body = ctx.createOscillator();
    const gain = ctx.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(98, at + offset);
    body.frequency.exponentialRampToValueAtTime(74, at + offset + 1.4);
    gain.gain.setValueAtTime(0.0001, at + offset);
    gain.gain.exponentialRampToValueAtTime(level, at + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 1.5);
    body.connect(gain);
    gain.connect(ctx.destination);
    body.start(at + offset);
    body.stop(at + offset + 1.6);
  }
}

/**
 * The siren: night work has landed somewhere on the board.
 *
 * A wail that rises and falls twice over noise, which is what a works whistle
 * sounds like from three streets away. Deliberately short: it is a warning,
 * not a piece of music.
 */
export function siren(): void {
  if (!on) return;
  const ctx = audio();
  if (!ctx) return;
  const at = ctx.currentTime;

  const wail = ctx.createOscillator();
  const gain = ctx.createGain();
  wail.type = "sawtooth";
  wail.frequency.setValueAtTime(510, at);
  wail.frequency.linearRampToValueAtTime(760, at + 0.42);
  wail.frequency.linearRampToValueAtTime(510, at + 0.86);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.16, at + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.95);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1900, at);
  wail.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  wail.start(at);
  wail.stop(at + 1.0);

  const air = ctx.createBufferSource();
  air.buffer = noiseBuffer(ctx, 0.9);
  const airGain = ctx.createGain();
  airGain.gain.setValueAtTime(0.0001, at);
  airGain.gain.exponentialRampToValueAtTime(0.05, at + 0.06);
  airGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
  air.connect(airGain);
  airGain.connect(ctx.destination);
  air.start(at);
  air.stop(at + 0.95);
}

/**
 * The clang: a pool has broken, or a pact has.
 *
 * Two struck tones a semitone apart that beat against each other and die
 * quickly. That interval is the sound of something being agreed and then not
 * agreed, which is the only thing that needs its own noise here.
 */
export function clang(): void {
  if (!on) return;
  const ctx = audio();
  if (!ctx) return;
  const at = ctx.currentTime;
  for (const [frequency, offset] of [
    [392, 0],
    [415.3, 0.016],
    [587.33, 0.03],
  ] as [number, number][]) {
    const body = ctx.createOscillator();
    const gain = ctx.createGain();
    body.type = "triangle";
    body.frequency.setValueAtTime(frequency, at + offset);
    gain.gain.setValueAtTime(0.0001, at + offset);
    gain.gain.exponentialRampToValueAtTime(0.2, at + offset + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.72);
    body.connect(gain);
    gain.connect(ctx.destination);
    body.start(at + offset);
    body.stop(at + offset + 0.8);
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) channel[index] = Math.random() * 2 - 1;
  return buffer;
}
