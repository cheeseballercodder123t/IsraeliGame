"use client";

import type { ReactNode } from "react";
import type { NewspaperRecord } from "@/server/store/types";
import { Modal } from "@/components/ui/primitives";
import { NewspaperSheet } from "@/components/newspaper/NewspaperSheet";

/**
 * The paper on the desk.
 *
 * The dialog is only the fold around the sheet: the issue itself is set by
 * NewspaperSheet, which the keepsake page prints at its own address, so an
 * edition read at the table and the same edition opened from a link are the
 * same type. The modal owns nothing but the frame, the scroll and the morgue
 * strip that lets a house flip between what the press has already run.
 */
export function NewspaperModal({
  issue,
  open,
  onOpenChange,
  shelf = [],
  onSelect,
  below,
  keepHref,
}: {
  issue: NewspaperRecord | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Every edition on the shelf, so the paper can be flipped through in place. */
  shelf?: NewspaperRecord[];
  onSelect?: (issue: NewspaperRecord) => void;
  /** Extra matter set between the index and the foot, for a keepsake. */
  below?: ReactNode;
  /** The keepsake address for the edition on the desk, offered in the foot. */
  keepHref?: string;
}) {
  if (!issue) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`The Daily Rag, turn ${issue.turn}`}
      width="max-w-4xl"
      contentClassName="paper-scroll"
      bare
    >
      <NewspaperSheet
        issue={issue}
        shelf={shelf}
        onSelect={onSelect}
        onClose={() => onOpenChange(false)}
        below={below}
        keepHref={keepHref}
      />
    </Modal>
  );
}
