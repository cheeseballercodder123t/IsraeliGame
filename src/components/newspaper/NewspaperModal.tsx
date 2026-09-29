"use client";

import type { NewspaperRecord } from "@/server/store/types";
import { Modal } from "@/components/ui/primitives";
import { Plate } from "@/components/ui/plates";

/**
 * The one section the paper does not set out of its own copy. The index of the
 * accused gets a rule, a running number and the seal further down the page, so
 * the body drops it rather than printing the same names twice.
 */
const INDEX_HEAD = "Index of the accused";

/**
 * The copy the body sets, with the parts the front page sets itself taken out:
 * the head, which stands under the nameplate, and the deck, which is ruled in
 * beneath it instead of leading the type.
 */
function bodyCopy(issue: NewspaperRecord): string {
  const deckLine = `*${issue.deck}*`;
  const kept: string[] = [];
  let dropping = false;
  let deck = false;
  for (const line of issue.contentMarkdown.split("\n")) {
    if (line.startsWith("## ")) {
      dropping = false;
      continue;
    }
    if (!deck && line.trim() === deckLine) {
      deck = true;
      continue;
    }
    if (line.startsWith("### ")) dropping = line.slice(4).trim() === INDEX_HEAD;
    if (!dropping) kept.push(line);
  }
  return kept.join("\n");
}

/** A hairline with a word set into the middle of it, the way a section head is ruled. */
function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="my-4 flex items-center gap-3 font-mono text-[10px] tracking-[0.3em] uppercase">
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
  let list: string[] = [];
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

  // A run of dropped type, ruled and numbered the way a paper sets a list of
  // names. Anything the copy marks with a hyphen becomes one of these rather
  // than a paragraph that starts with a stray mark.
  const flushList = () => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`l-${key++}`} className="my-3 border-t border-newsink/40">
        {items.map((item, index) => (
          <li
            key={index}
            className="flex items-baseline gap-2 border-b border-newsink/20 py-1 break-inside-avoid"
          >
            <span className="tabular shrink-0 font-mono text-[9px] opacity-60">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="font-slab text-[11.5px] leading-snug">{item}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const line of lines) {
    if (line.startsWith("|")) {
      flushList();
      table.push(line);
      continue;
    }
    if (line.startsWith("- ")) {
      flushTable();
      list.push(line.slice(2));
      continue;
    }
    flushTable();
    flushList();

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
  flushList();
  return blocks;
}

export function NewspaperModal({
  issue,
  open,
  onOpenChange,
  shelf = [],
  onSelect,
}: {
  issue: NewspaperRecord | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Every edition on the shelf, so the paper can be flipped through in place. */
  shelf?: NewspaperRecord[];
  onSelect?: (issue: NewspaperRecord) => void;
}) {
  if (!issue) return null;

  const filed = new Date(issue.createdAt);
  const edition = String(issue.turn).padStart(2, "0");
  const named =
    issue.scandals.length === 0
      ? "nobody named"
      : issue.scandals.length === 1
        ? "one name in the index"
        : `${issue.scandals.length} names in the index`;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`The Daily Rag, turn ${issue.turn}`}
      width="max-w-4xl"
      contentClassName="paper-scroll"
      bare
    >
      <div className="bg-news text-newsink">
        {/* ------------------------------------------------------- the head */}
        <div className="border-b-4 border-double border-newsink/70 px-4 pt-4 pb-2.5 sm:px-6 sm:pt-5">
          {/* The standing line, trimmed above and below the way a masthead is. */}
          <div className="border-y border-newsink/40 py-0.5">
            <p className="text-center font-mono text-[9px] tracking-[0.34em] uppercase">
              Printed every turn, sold on the corner, read in every smoking room
            </p>
          </div>

          {/*
           * Ears. A front page carries two small standing boxes against its
           * nameplate: where the edition stands on the left, what it costs on
           * the right. They are the first thing folded away on a narrow sheet,
           * because the nameplate is the paper.
           */}
          <div className="mt-2 grid items-stretch gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="hidden flex-col justify-end border-r border-newsink/30 pr-3 text-right sm:flex">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase opacity-70">
                Vol. I, No. {edition}
              </p>
              <p className="mt-1 font-slab text-[11px] leading-tight">
                The paper of record for five chairs and one board
              </p>
            </div>
            <div className="min-w-0 sm:px-5">
              <h1 className="text-center font-slab text-[30px] leading-none font-extrabold tracking-tight sm:text-[42px]">
                The Daily Rag
              </h1>
              <Plate name="rule" scale={2} className="mx-auto mt-2 block" />
            </div>
            <div className="hidden flex-col justify-end border-l border-newsink/30 pl-3 sm:flex">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase opacity-70">
                {filed.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <p className="mt-1 font-slab text-[11px] leading-tight">Price two cents</p>
            </div>
          </div>

          {/*
           * The head and the deck, ruled above and below as one piece: the
           * whole of the front page's opinion of the window that closed.
           */}
          <div className="mt-3 border-t-2 border-newsink/60 pt-2">
            <h2 className="text-center font-slab text-[21px] leading-[1.05] font-extrabold uppercase sm:text-[30px]">
              {issue.headline}
            </h2>
            <p className="mx-auto mt-2 max-w-[48ch] text-center font-slab text-[13px] leading-snug italic sm:text-[14px]">
              {issue.deck}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-0.5 border-y border-newsink/40 py-1 font-mono text-[9px] tracking-[0.2em] uppercase sm:justify-between">
            <span>Issue {issue.turn}</span>
            <span>{named}</span>
            <span>Price two cents</span>
          </div>
        </div>

        {/* -------------------------------------------------------- the type */}
        <article className="press press-columns mx-auto max-w-[74ch] px-4 py-4 sm:px-6 sm:py-5 md:max-w-none">
          {renderMarkdown(bodyCopy(issue))}
        </article>

        {/* ------------------------------------------------------ the index */}
        {issue.scandals.length > 0 ? (
          <div className="border-t-2 border-newsink/60 px-4 py-3 sm:px-6">
            <SectionHead>{INDEX_HEAD}</SectionHead>
            <ul className="gap-x-9 sm:columns-2">
              {issue.scandals.map((scandal, index) => (
                <li
                  key={index}
                  className="flex items-baseline gap-2 border-b border-newsink/20 py-1 break-inside-avoid"
                >
                  <span className="tabular shrink-0 font-mono text-[9px] opacity-60">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-slab text-[12px] leading-snug">{scandal.summary}</span>
                  <span className="leader-ink" aria-hidden />
                  <span className="shrink-0 font-mono text-[9px] whitespace-nowrap tracking-[0.12em] uppercase opacity-60">
                    {scandal.kind.toLowerCase().replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ------------------------------------------------------ the morgue */}
        {shelf.length > 1 && onSelect ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t-2 border-newsink/60 bg-news-worn px-4 py-2.5 sm:px-6">
            <span className="mr-1 font-mono text-[9px] tracking-[0.24em] uppercase opacity-70">
              The morgue
            </span>
            {shelf.map((entry) => {
              const here = entry.turn === issue.turn;
              return (
                <button
                  key={`${entry.turn}-${entry.createdAt}`}
                  type="button"
                  onClick={() => onSelect(entry)}
                  aria-current={here ? "true" : undefined}
                  title={entry.headline}
                  className={`tabular border px-2 py-[2px] font-mono text-[10px] tracking-[0.12em] uppercase ${
                    here
                      ? "border-newsink bg-newsink text-news"
                      : "border-newsink/50 text-newsink hover:border-newsink"
                  }`}
                >
                  t{entry.turn}
                </button>
              );
            })}
            <span className="ml-auto font-mono text-[9px] tracking-[0.16em] uppercase opacity-60">
              {shelf.length} editions kept
            </span>
          </div>
        ) : null}

        {/* -------------------------------------------------------- the foot */}
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-newsink/40 px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] uppercase">
            <Plate name="seal" scale={1} />
            Filed {filed.toLocaleString("en-US")}
          </span>
          <span className="hidden max-w-[44ch] font-slab text-[10px] leading-snug italic opacity-70 lg:block">
            Set in Bitter and Plex Mono, printed on the floor for the houses at the table.
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="border border-newsink px-3 py-1 font-mono text-[10px] tracking-[0.16em] uppercase transition-colors duration-150 hover:bg-newsink hover:text-news active:translate-y-[1px]"
          >
            Fold it up
          </button>
        </div>
      </div>
    </Modal>
  );
}
