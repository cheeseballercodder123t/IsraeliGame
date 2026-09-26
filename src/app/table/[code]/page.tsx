import { notFound, redirect } from "next/navigation";
import { Dashboard } from "@/components/table/Dashboard";
import { LobbyViewPanel } from "@/components/table/LobbyViewPanel";
import { SpectatorView } from "@/components/table/SpectatorView";
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

  // Every chair is taken: the rail reads the same snapshot, without a seat.
  if (result.kind === "spectate") {
    return (
      <SpectatorView
        code={result.view.code}
        state={result.view.state}
        issues={result.view.issues}
      />
    );
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
