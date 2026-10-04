import ParticipantList from "@/components/admin/ParticipantList";
import { getAllParticipants } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ParticipantsPage() {
  const participants = await getAllParticipants();
  return <ParticipantList participants={participants} />;
}
