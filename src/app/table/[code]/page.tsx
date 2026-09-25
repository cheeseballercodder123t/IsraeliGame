import { notFound, redirect } from "next/navigation";
import { Dashboard } from "@/components/table/Dashboard";
import { openTable } from "@/server/dashboard";
import { DEV_TICK } from "@/server/game";

export const dynamic = "force-dynamic";

export default async function TablePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await openTable(code);

  if (!result.ok) {
    if (result.miss.reason === "no-table") notFound();
    redirect(`/?code=${encodeURIComponent(code.toUpperCase())}`);
  }

  const { state, me, pending, issues } = result.view;

  return (
    <Dashboard
      code={state.game.code}
      state={state}
      meId={me.id}
      pending={pending}
      issues={issues}
      devTick={DEV_TICK}
    />
  );
}
