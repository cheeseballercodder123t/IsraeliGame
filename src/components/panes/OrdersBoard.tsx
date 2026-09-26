"use client";

import type { QueuedOrder } from "@/domain/types";
import { Button, Empty, Panel } from "@/components/ui/primitives";
import { orderLabel } from "@/lib/labels";

export function OrdersBoard({
  orders,
  onCancel,
}: {
  orders: QueuedOrder[];
  onCancel: (orderId: string) => void;
}) {
  return (
    <Panel
      title="This turn's desk"
      aside={`${orders.length} order${orders.length === 1 ? "" : "s"} queued`}
    >
      {orders.length === 0 ? (
        <Empty>
          Nothing queued. Orders sit here until the window closes, and you can pull any of them
          back until then.
        </Empty>
      ) : (
        <ul className="border border-rule">
          {orders.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 border-b border-rule/50 px-2 py-1.5 last:border-b-0"
            >
              <span className="text-[11px] text-dim">
                <span className="text-faint">{item.order.type.toLowerCase().replace(/_/g, " ")}</span>{" "}
                {orderLabel(item.order)}
              </span>
              <Button tone="quiet" onClick={() => onCancel(item.id)}>
                Pull
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
