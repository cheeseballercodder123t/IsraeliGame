"use client";

import type { NewspaperRecord } from "@/server/store/types";
import { Modal } from "@/components/ui/primitives";
import { Plate } from "@/components/ui/plates";

/** A hairline with a word set into the middle of it, the way a section head is ruled. */
function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="my-5 flex items-center gap-3 font-mono text-[10px] tracking-[0.3em] uppercase">
      <span className="h-px flex-1 bg-newsink/45" aria-hidden />
      <span>{children}</span>
      <span className="h-px flex-1 bg-newsink/45" aria-hidden />
    </h4>
  );
}

function renderMarkdown(source: string) {
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let table: string[] = [];
  let key = 0;
  // Only the opening paragraph of the body carries the drop cap, and only if a
  // section head has not gone above it first.
  let lead = true;

  const flushTable = () => {
    if (table.length === 0) return;
    const rows = table
      .filter((row) => !/^\|\s*-+/.test(row))
      .map((row) => row.split("|").slice(1, -1).map((cell) => cell.trim()));
    table = [];
    if (rows.length === 0) return;
    const [head, ...body] = rows;
    blocks.push(
      <table key={`t-${key++}`} className="my-4 w-full border-collapse">
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th
                key={index}
                scope="col"
                className="border-b-2 border-double border-newsink/70 pb-1 text-left font-mono text-[9px] tracking-[0.16em] uppercase"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-newsink/20">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`py-1 text-[11px] ${cellIndex === 0 ? "font-slab" : "tabular"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>,
    );
  };

  for (const line of lines) {
    if (line.startsWith("|")) {
      table.push(line);
      continue;
    }
    flushTable();

    if (line.startsWith("### ")) {
      blocks.push(<SectionHead key={`h-${key++}`}>{line.slice(4)}</SectionHead>);
      continue;
    }
    if (line.startsWith("## ")) {
      lead = false;
      blocks.push(
        <h3
          key={`h-${key++}`}
          className="mt-2 mb-2 border-b border-newsink/50 pb-1 font-slab text-[19px] leading-[1.1] font-extrabold uppercase sm:text-[25px]"
        >
          {line.slice(3)}
        </h3>,
      );
      continue;
    }
    const italic = line.match(/^\*(.+)\*$/);
    if (italic) {
      lead = false;
      blocks.push(
        <p
          key={`d-${key++}`}
          className="my-4 border-y border-newsink/40 py-2 text-center font-slab text-[13px] italic"
        >
          {italic[1]}
        </p>,
      );
      continue;
    }
    if (line.trim().length === 0) continue;
    blocks.push(
      <p
        key={`p-${key++}`}
        className={`mb-3 text-justify font-slab text-[12.5px] leading-[1.5] ${
          lead ? "press-lead" : ""
        }`}
      >
        {line}
      </p>,
    );
    lead = false;
  }
  flushTable();
  return blocks;
}

export function NewspaperModal({
  issue,
  open,
  onOpenChange,
}: {
  issue: NewspaperRecord | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  if (!issue) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`The Daily Rag, turn ${issue.turn}`}
      width="max-w-3xl"
      contentClassName="paper-scroll"
      bare
    >
      <div className="bg-news text-newsink">
        <div className="border-b-4 border-double border-newsink/70 px-4 pt-4 pb-2 sm:px-6 sm:pt-5">
          <div className="border-y border-newsink/40 py-0.5">
            <p className="text-center font-mono text-[9px] tracking-[0.4em] uppercase">
              Printed every turn, sold on the corner
            </p>
          </div>
          <h1 className="mt-2 text-center font-slab text-[30px] leading-none font-extrabold tracking-tight sm:text-[42px]">
            The Daily Rag
          </h1>
          <Plate name="rule" scale={2} className="mx-auto mt-2 block" />
          <div className="mt-2 flex items-center justify-between gap-3 border-y border-newsink/40 py-1 font-mono text-[9px] tracking-[0.2em] uppercase">
            <span>Issue {issue.turn}</span>
            <span className="hidden sm:inline">{issue.headline}</span>
            <span>{issue.scandals.length} items of interest</span>
            <span>Price two cents</span>
          </div>
        </div>

        <article className="press px-4 py-4 sm:px-6 sm:py-5">
          {renderMarkdown(issue.contentMarkdown)}
        </article>

        {issue.scandals.length > 0 ? (
          <div className="border-t-2 border-newsink/60 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-newsink/45" aria-hidden />
              <h4 className="font-mono text-[10px] tracking-[0.3em] uppercase">
                Index of the accused
              </h4>
              <span className="h-px flex-1 bg-newsink/45" aria-hidden />
            </div>
            <ul className="mt-3 gap-x-8 sm:columns-2">
              {issue.scandals.map((scandal, index) => (
                <li
                  key={index}
                  className="flex items-baseline justify-between gap-3 border-b border-newsink/20 py-1 break-inside-avoid"
                >
                  <span className="font-slab text-[12px]">{scandal.summary}</span>
                  <span className="font-mono text-[9px] whitespace-nowrap tracking-[0.12em] uppercase opacity-60">
                    {scandal.kind.toLowerCase().replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-newsink/40 bg-news-worn px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] uppercase">
            <Plate name="seal" scale={1} />
            Filed {new Date(issue.createdAt).toLocaleString("en-US")}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="border border-newsink px-3 py-1 font-mono text-[10px] tracking-[0.16em] uppercase hover:bg-newsink hover:text-news"
          >
            Fold it up
          </button>
        </div>
      </div>
    </Modal>
  );
}
