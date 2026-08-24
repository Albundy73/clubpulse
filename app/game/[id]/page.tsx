import GameDetail from "@/components/game-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function GamePage({ params }: PageProps) {
  const { id } = await params;
  return <GameDetail gameId={id} />;
}
