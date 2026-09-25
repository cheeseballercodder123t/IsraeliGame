import { notFound, redirect } from "next/navigation";
import { Dashboard } from "@/components/table/Dashboard";
import { LobbyViewPanel } from "@/components/table/LobbyViewPanel";
import { openTable } from "@/server/dashboard";
import { DEV_TICK } from "@/server/game";

export const dynamic = "force-dynamic";

export default async function TablePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await openTable(code);

  if (result.kind === "miss") {
    if (result.miss.reason === "no-table") notFound();
    redirect(`/?code=${encodeURIComponent(code.toUpperCase())}`);
  }

  if (result.kind === "lobby") {
    return <LobbyViewPanel lobby={result.lobby} />;
  }

  return (
    <Dashboard
      code={result.view.state.game.code}
      state={result.view.state}
      meId={result.view.me.id}
      pending={result.view.pending}
      issues={result.view.issues}
      devTick={DEV_TICK}
    />
  );
}
