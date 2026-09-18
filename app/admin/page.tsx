import Link from "next/link";
import { Button } from "@/components/ui/button";
import TodayEvents from "@/components/admin/TodayEvents";
import RecentRegistrations from "@/components/admin/RecentRegistrations";
import { Plus, CalendarDays, Users } from "lucide-react";

export default function AdminDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Übersicht über deinen Verein</p>
      </div>

      <TodayEvents />

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/events/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Neues Event erstellen
          </Button>
        </Link>
        <Link href="/admin/events">
          <Button variant="outline">
            <CalendarDays className="w-4 h-4 mr-2" />
            Alle Events anzeigen
          </Button>
        </Link>
        <Link href="/admin/registrations">
          <Button variant="outline">
            <Users className="w-4 h-4 mr-2" />
            Alle Anmeldungen anzeigen
          </Button>
        </Link>
      </div>

      <RecentRegistrations />
    </div>
  );
}
