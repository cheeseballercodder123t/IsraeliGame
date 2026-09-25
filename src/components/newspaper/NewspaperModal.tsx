"use client";

import type { NewspaperRecord } from "@/server/store/types";
import { Modal } from "@/components/ui/primitives";
import { Plate } from "@/components/ui/plates";

function renderMarkdown(source: string) {
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let table: string[] = [];
  let key = 0;

  const flushTable = () => {
    if (table.length === 0) return;
    const rows = table
      .filter((row) => !/^\|\s*-+/.test(row))
      .map((row) => row.split("|").slice(1, -1).map((cell) => cell.trim()));
    table = [];
    if (rows.length === 0) return;
    const [head, ...body] = rows;
    blocks.push(
      <table key={`t-${key++}`} className="my-3 w-full border-collapse">
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th
                key={index}
                className="border-b border-newsink/50 pb-1 text-left font-mono text-[9px] tracking-[0.14em] uppercase"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-newsink/20 py-1 text-[11px]">
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
      blocks.push(
        <h4 key={`h-${key++}`} className="mt-5 mb-1 font-mono text-[10px] tracking-[0.24em] uppercase">
          {line.slice(4)}
        </h4>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(
        <h3 key={`h-${key++}`} className="mb-2 font-slab text-[24px] leading-[1.1] font-extrabold uppercase">
          {line.slice(3)}
        </h3>,
      );
      continue;
    }
    const italic = line.match(/^\*(.+)\*$/);
    if (italic) {
      blocks.push(
        <p key={`d-${key++}`} className="mb-3 border-b border-newsink/30 pb-2 font-slab text-[13px] italic">
          {italic[1]}
        </p>,
      );
      continue;
    }
    if (line.trim().length === 0) continue;
    blocks.push(
      <p key={`p-${key++}`} className="mb-3 text-justify font-slab text-[12.5px] leading-[1.5]">
        {line}
      </p>,
    );
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
    <Modal open={open} onOpenChange={onOpenChange} title={`The Daily Rag, turn ${issue.turn}`} width="max-w-3xl" bare>
      <div className="bg-news text-newsink">
        <div className="border-b-4 border-double border-newsink/70 px-6 pt-5 pb-2 text-center">
          <p className="font-mono text-[9px] tracking-[0.4em] uppercase">
            Printed every turn, sold on the corner
          </p>
          <h1 className="font-slab text-[40px] leading-none font-extrabold tracking-tight">
            The Daily Rag
          </h1>
          <Plate name="rule" scale={2} className="mx-auto mt-1.5 block" />
          <div className="mt-2 flex items-center justify-between border-y border-newsink/40 py-1 font-mono text-[9px] tracking-[0.2em] uppercase">
            <span>Issue {issue.turn}</span>
            <span>{issue.scandals.length} items of interest</span>
            <span>Price two cents</span>
          </div>
        </div>

        <article className="px-6 py-5">{renderMarkdown(issue.contentMarkdown)}</article>

        {issue.scandals.length > 0 ? (
          <div className="border-t-2 border-newsink/60 px-6 py-4">
            <h4 className="mb-2 font-mono text-[10px] tracking-[0.24em] uppercase">
              Index of the accused
            </h4>
            <ul className="space-y-1">
              {issue.scandals.map((scandal, index) => (
                <li key={index} className="flex items-baseline justify-between gap-3">
                  <span className="font-slab text-[12px]">{scandal.summary}</span>
                  <span className="font-mono text-[10px] whitespace-nowrap opacity-60">
                    {scandal.kind.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t border-newsink/40 px-6 py-3">
          <span className="flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] uppercase">
            <Plate name="seal" scale={1} />
            Filed {new Date(issue.createdAt).toLocaleString("en-US")}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="border border-newsink px-3 py-1 font-mono text-[10px] tracking-[0.14em] uppercase"
          >
            Fold it up
          </button>
        </div>
      </div>
    </Modal>
  );
}
