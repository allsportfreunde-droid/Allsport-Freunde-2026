"use client";

import { useState, useEffect, useMemo } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import StatusBadge from "@/components/status/StatusBadge";
import ChildBadge from "@/components/ChildBadge";
import { Loader2, Search, CheckCircle2, User } from "lucide-react";
import type { EventPerson } from "@/lib/types";

interface PersonsTableProps {
  eventId: number;
}

export default function PersonsTable({ eventId }: PersonsTableProps) {
  const { toast } = useToast();
  const [persons, setPersons] = useState<EventPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");

  const fetchPersons = () => {
    setLoading(true);
    fetch(`/api/admin/events/${eventId}/persons`)
      .then((r) => r.json())
      .then(setPersons)
      .catch(() => toast("Personen konnten nicht geladen werden.", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPersons(); }, [eventId]);

  const filtered = useMemo(() => {
    return persons.filter((p) => {
      if (statusFilter !== "alle" && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.first_name.toLowerCase().includes(q) &&
          !p.last_name.toLowerCase().includes(q) &&
          !(p.email?.toLowerCase().includes(q) ?? false)
        ) return false;
      }
      return true;
    });
  }, [persons, search, statusFilter]);

  const formatDateTime = (d: string | null) => {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Name oder E-Mail suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-40">
          <option value="alle">Alle Status</option>
          <option value="pending">Ausstehend</option>
          <option value="approved">Bestätigt</option>
          <option value="rejected">Abgelehnt</option>
          <option value="cancelled">Storniert</option>
        </Select>
        <Button variant="outline" onClick={fetchPersons} size="sm">
          Aktualisieren
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">Keine Personen gefunden.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">E-Mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Eingecheckt</TableHead>
                  <TableHead className="hidden md:table-cell">Anmeldung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow
                    key={p.person_id}
                    className={p.cancelled_at ? "opacity-50" : ""}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <div>
                          <span className="font-medium">
                            {p.first_name} {p.last_name}
                          </span>
                          {p.is_child && <ChildBadge className="ml-1" />}
                          {p.is_walk_in && (
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 leading-none">
                              Walk-in
                            </span>
                          )}
                          {p.cancelled_at && (
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 leading-none">
                              Storniert
                            </span>
                          )}
                          <span className="block md:hidden text-xs text-gray-500">{p.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-gray-600">
                      {p.email ?? "–"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">
                      {p.checked_in_at ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {formatDateTime(p.checked_in_at)}
                        </span>
                      ) : (
                        <span className="text-gray-400">–</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-gray-500">
                      #{p.registration_id}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card stack */}
          <div className="sm:hidden space-y-3">
            {filtered.map((p) => (
              <div
                key={p.person_id}
                className={`bg-white border border-gray-200 rounded-lg p-4 shadow-sm ${p.cancelled_at ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm">
                      {p.first_name} {p.last_name}
                      {p.is_child && <ChildBadge className="ml-1" />}
                      {p.is_walk_in && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 leading-none">
                          Walk-in
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{p.email ?? "–"}</p>
                    {p.checked_in_at && (
                      <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {formatDateTime(p.checked_in_at)}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-sm text-muted-foreground">
        {filtered.length} Person{filtered.length !== 1 ? "en" : ""}
      </p>
    </div>
  );
}
