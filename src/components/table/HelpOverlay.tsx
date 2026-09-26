"use client";

import { TABLE_KEYBINDS } from "@/components/table/keybinds";
import { startTour } from "@/components/tour/Tour";
import { Button, Modal } from "@/components/ui/primitives";

/**
 * The card on the wall beside every desk, drawn over the table.
 *
 * The list itself lives in `keybinds.ts` so it can be read and tested without a
 * browser; this file is only the sheet of paper it is printed on.
 */

export function HelpOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="The director's card">
      <p className="mb-3 text-[11px] text-dim">
        Every room is one key away, so a hand that knows the card never has to leave it for the
        mouse.
      </p>
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {TABLE_KEYBINDS.map((bind) => (
          <li key={bind.keys} className="flex items-baseline gap-3 border-b border-rule/40 py-1">
            <kbd className="tabular min-w-6 border border-edge bg-pit px-1.5 py-[1px] text-center text-[11px] text-brass uppercase">
              {bind.keys}
            </kbd>
            <span className="text-[11px] text-dim">{bind.label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-3">
        <Button
          tone="brass"
          onClick={() => {
            onOpenChange(false);
            startTour("full");
          }}
        >
          Walk the room again
        </Button>
        <p className="text-[10px] text-faint">
          The walk-around rings each panel in turn and can be left at any step.
        </p>
      </div>
    </Modal>
  );
}
