"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-rule bg-steel ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-rule bg-plate px-3 py-1.5">
        <h2 className="text-[10px] tracking-[0.22em] text-dim uppercase">{title}</h2>
        {aside ? <div className="text-[10px] text-faint">{aside}</div> : null}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function KeyValue({
  label,
  value,
  tone = "ink",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "ink" | "brass" | "rust" | "bile" | "dim";
  hint?: string;
}) {
  const tones: Record<string, string> = {
    ink: "text-ink",
    brass: "text-brass",
    rust: "text-rust",
    bile: "text-bile",
    dim: "text-dim",
  };
  const body = (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule/60 py-1 last:border-b-0">
      <span className="text-[11px] text-faint">{label}</span>
      <span className={`tabular text-[12px] ${tones[tone]}`}>{value}</span>
    </div>
  );
  if (!hint) return body;
  return <Hint text={hint}>{body}</Hint>;
}

export function Meter({
  label,
  value,
  max = 100,
  tone = "brass",
  readout,
}: {
  label: string;
  value: number;
  max?: number;
  tone?: "brass" | "rust" | "bile" | "verdigris" | "blood";
  readout?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fills: Record<string, string> = {
    brass: "bg-brass",
    rust: "bg-rust",
    bile: "bg-bile",
    verdigris: "bg-verdigris",
    blood: "bg-blood",
  };
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] tracking-[0.14em] text-faint uppercase">{label}</span>
        <span className="tabular text-[11px] text-dim">{readout ?? value.toFixed(0)}</span>
      </div>
      <div className="mt-1 h-[3px] w-full bg-tar">
        <div className={`h-full ${fills[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  tone = "steel",
  type = "button",
  full,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "steel" | "brass" | "rust" | "blood" | "quiet";
  type?: "button" | "submit";
  full?: boolean;
  title?: string;
}) {
  const tones: Record<string, string> = {
    steel: "border-edge bg-plate text-ink hover:bg-tar",
    brass: "border-brass bg-brass text-void hover:bg-hazard",
    rust: "border-rust bg-rust text-ink hover:bg-blood",
    blood: "border-blood bg-blood text-ink hover:bg-rust",
    quiet: "border-rule bg-transparent text-dim hover:text-ink hover:border-edge",
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`border px-2.5 py-1 text-[11px] tracking-[0.08em] uppercase disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block py-1">
      <span className="mb-1 block text-[10px] tracking-[0.14em] text-faint uppercase">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <input
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="tabular w-full border border-rule bg-pit px-2 py-1 text-[12px] text-ink placeholder:text-faint"
    />
  );
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(event) => {
        const next = Number(event.target.value);
        onChange(Number.isFinite(next) ? next : 0);
      }}
      className="tabular w-full border border-rule bg-pit px-2 py-1 text-[12px] text-ink"
    />
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max: number;
  step?: number;
}) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full"
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function Chooser({
  value,
  onChange,
  options,
  placeholder = "Select",
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger className="flex w-full items-center justify-between border border-rule bg-pit px-2 py-1 text-[12px] text-ink disabled:opacity-40">
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <svg width="8" height="6" viewBox="0 0 8 6" aria-hidden>
            <path d="M0 0h8L4 6z" fill="currentColor" className="text-faint" />
          </svg>
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={2}
          className="z-50 max-h-72 border border-edge bg-pit"
        >
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="flex cursor-default items-center px-2 py-1 text-[12px] text-dim data-[highlighted]:bg-plate data-[highlighted]:text-ink"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function TabSet({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: string; label: string; badge?: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Tabs.Root value={value} onValueChange={onChange}>
      <Tabs.List className="flex border-b border-rule bg-plate">
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.value}
            value={tab.value}
            className="-mb-px border-b border-transparent px-2.5 py-1.5 text-[10px] tracking-[0.16em] text-faint uppercase data-[state=active]:border-brass data-[state=active]:text-ink"
          >
            {tab.label}
            {tab.badge ? <span className="ml-1.5 text-brass">{tab.badge}</span> : null}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  children,
  width = "max-w-2xl",
  bare,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  children: ReactNode;
  width?: string;
  bare?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-void/85" />
        <Dialog.Content
          className={`fixed top-1/2 left-1/2 z-50 w-[92vw] ${width} max-h-[88vh] -translate-x-1/2 -translate-y-1/2 overflow-auto border border-edge bg-steel`}
        >
          {bare ? null : (
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-plate px-3 py-2">
              <Dialog.Title className="text-[11px] tracking-[0.2em] text-ink uppercase">
                {title}
              </Dialog.Title>
              <Dialog.Close className="border border-rule px-2 py-0.5 text-[10px] text-dim uppercase hover:text-ink">
                Close
              </Dialog.Close>
            </header>
          )}
          <div className={bare ? "" : "p-3"}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Hint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={220}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div className="cursor-help">{children}</div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={4}
            className="z-[60] max-w-64 border border-edge bg-pit px-2 py-1 text-[11px] text-dim"
          >
            {text}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "warn" | "bad"; children: ReactNode }) {
  const tones = {
    ok: "border-verdigris text-verdigris",
    warn: "border-hazard text-hazard",
    bad: "border-blood text-blood",
  };
  return (
    <div className={`border px-2 py-1 text-[11px] ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-[11px] text-faint">{children}</p>;
}
