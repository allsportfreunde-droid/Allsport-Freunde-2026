"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, Users, X } from "lucide-react";
import StatusBadge from "@/components/status/StatusBadge";
import { Input } from "@/components/ui/input";
import type { ParticipantListItem, RegistrationStatus } from "@/lib/types";

const statusLabels: Record<RegistrationStatus, string> = {
  pending: "Ausstehend",
  approved: "Bestätigt",
  rejected: "Abgelehnt",
  cancelled: "Storniert",
};

function formatDate(date: string) {
  if (!date) return "–";
  return new Intl.DateTimeFormat("de-DE").format(new Date(`${date}T00:00:00`));
}

function capitalizationScore(name: string) {
  if (!name || name[0] === name[0].toLocaleLowerCase("de")) return 0;
  return name.slice(1) === name.slice(1).toLocaleLowerCase("de") ? 2 : 1;
}

function badgeForCheckIns(count: number) {
  if (count >= 10) {
    return { label: "Stammgast", className: "bg-purple-100 text-purple-800" };
  }
  if (count >= 3) {
    return { label: "Aktiv", className: "bg-green-100 text-green-800" };
  }
  if (count >= 1) {
    return { label: "Einsteiger", className: "bg-blue-100 text-blue-800" };
  }
  return { label: "Neu", className: "bg-gray-100 text-gray-700" };
}

function matchesSearch(
  participant: ParticipantListItem,
  badge: string,
  query: string,
) {
  const terms = query.toLocaleLowerCase("de").trim().split(/\s+/);
  const fields = [
    participant.first_name,
    participant.last_name,
    `${participant.first_name} ${participant.last_name}`,
    `${participant.last_name} ${participant.first_name}`,
    badge,
    ...participant.events.flatMap((event) => [
      event.email,
      event.phone,
      event.event_title,
      event.event_date,
      event.event_date ? formatDate(event.event_date) : null,
      statusLabels[event.status],
      event.checked_in_at ? "Eingecheckt" : "Nicht eingecheckt",
      event.is_child ? "Kind" : "Erwachsen",
    ]),
  ]
    .filter((field): field is string => Boolean(field))
    .map((field) => field.toLocaleLowerCase("de"));

  return terms.every((term) => {
    const digits = term.replace(/\D/g, "");
    return fields.some(
      (field) =>
        field.includes(term) ||
        (digits.length >= 2 && field.replace(/\D/g, "").includes(digits)),
    );
  });
}

export default function ParticipantList({
  participants,
}: {
  participants: ParticipantListItem[];
}) {
  const [search, setSearch] = useState("");
  const registrationCount = participants.reduce(
    (sum, participant) => sum + participant.count,
    0,
  );
  const lastNameGroups = useMemo(() => {
    const byLastName = new Map<
      string,
      {
        lastName: string;
        people: Map<string, (typeof participants)[number]>;
      }
    >();
    for (const participant of participants) {
      const lastNameKey = participant.last_name.toLocaleLowerCase("de");
      let group = byLastName.get(lastNameKey);
      if (!group) {
        group = {
          lastName: participant.last_name,
          people: new Map(),
        };
        byLastName.set(lastNameKey, group);
      } else if (
        capitalizationScore(participant.last_name) >
        capitalizationScore(group.lastName)
      ) {
        group.lastName = participant.last_name;
      }

      const firstNameKey = participant.first_name.toLocaleLowerCase("de");
      const existing = group.people.get(firstNameKey);
      if (existing) {
        existing.count += participant.count;
        existing.events.push(...participant.events);
        if (
          capitalizationScore(participant.first_name) >
          capitalizationScore(existing.first_name)
        ) {
          existing.first_name = participant.first_name;
        }
      } else {
        group.people.set(firstNameKey, {
          ...participant,
          events: [...participant.events],
        });
      }
    }
    return Array.from(byLastName.values())
      .map((group) => ({
        lastName: group.lastName,
        people: Array.from(group.people.values())
          .map((person) => {
            const checkInCount = person.events.filter(
              (event) => event.checked_in_at,
            ).length;
            return {
              ...person,
              checkInCount,
              badge: badgeForCheckIns(checkInCount),
              events: person.events.sort((a, b) =>
                b.event_date.localeCompare(a.event_date),
              ),
            };
          })
          .sort((a, b) =>
            a.first_name.localeCompare(b.first_name, "de", {
              sensitivity: "base",
            }),
          ),
      }))
      .sort((a, b) =>
        a.lastName.localeCompare(b.lastName, "de", { sensitivity: "base" }),
      );
  }, [participants]);
  const personCount = lastNameGroups.reduce(
    (sum, group) => sum + group.people.length,
    0,
  );
  const trimmedSearch = search.trim();
  const visibleGroups = useMemo(
    () =>
      trimmedSearch
        ? lastNameGroups
            .map((group) => ({
              ...group,
              people: group.people.filter((person) =>
                matchesSearch(person, person.badge.label, trimmedSearch),
              ),
            }))
            .filter((group) => group.people.length > 0)
        : lastNameGroups,
    [lastNameGroups, trimmedSearch],
  );
  const visiblePersonCount = visibleGroups.reduce(
    (sum, group) => sum + group.people.length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 shrink-0 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teilnehmer</h1>
          <p className="mt-1 text-sm text-gray-500">
            {personCount} Personen · {registrationCount} Anmeldungen
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Abzeichen basieren auf tatsächlichen Check-ins.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="participant-search" className="sr-only">
          Teilnehmer suchen
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="participant-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, E-Mail, Telefon, Event oder Status suchen…"
            className="bg-white pl-10 pr-10"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Suche löschen"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {trimmedSearch && (
          <p className="text-sm text-gray-500" role="status">
            {visiblePersonCount} von {personCount} Personen gefunden
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {participants.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-gray-500">
            Noch keine Teilnehmer vorhanden.
          </p>
        ) : visibleGroups.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-gray-500">
            Keine Teilnehmer für „{trimmedSearch}“ gefunden.
          </p>
        ) : (
          <div aria-label="Teilnehmerliste">
            <div className="divide-y divide-gray-200">
              {visibleGroups.map(({ lastName, people }) => (
                <details
                  key={lastName}
                  open={Boolean(trimmedSearch)}
                  className="group/lastname"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 bg-green-50 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-green-100 sm:px-6 [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="h-4 w-4 shrink-0 text-green-700 transition-transform group-open/lastname:rotate-180" />
                    <span>{lastName}</span>
                    <span className="font-normal text-gray-500">
                      ({people.length}{" "}
                      {people.length === 1 ? "Person" : "Personen"})
                    </span>
                  </summary>
                  <div className="grid grid-cols-[1fr_auto] border-y border-gray-200 bg-gray-50 pl-12 pr-4 sm:pl-14 sm:pr-6">
                    <span className="py-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Vorname
                    </span>
                    <span className="py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                      Anmeldungen
                    </span>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {people.map((participant) => (
                      <details
                        key={JSON.stringify([
                          participant.first_name,
                          participant.last_name,
                        ])}
                        className="group/person"
                      >
                        <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-gray-50 sm:px-6 [&::-webkit-details-marker]:hidden">
                          <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open/person:rotate-180" />
                          <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900">
                            {participant.first_name}
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${participant.badge.className}`}
                              title={`${participant.checkInCount} ${participant.checkInCount === 1 ? "Check-in" : "Check-ins"}`}
                            >
                              {participant.badge.label}
                            </span>
                          </span>
                          <span className="text-right text-sm tabular-nums text-gray-700">
                            {participant.count}
                          </span>
                        </summary>

                        <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:px-6 sm:pl-14">
                          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                            <table className="w-full min-w-[64rem]">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                                    Event
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                                    Datum
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                                    Status
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                                    Check-in
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                                    Art
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                                    E-Mail
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                                    Telefon
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {participant.events.map((event) => (
                                  <tr key={event.person_id}>
                                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                                      {event.event_title}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                                      {formatDate(event.event_date)}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <StatusBadge status={event.status} />
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span
                                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                          event.checked_in_at
                                            ? "bg-green-100 text-green-800"
                                            : "bg-gray-100 text-gray-600"
                                        }`}
                                      >
                                        {event.checked_in_at
                                          ? "Eingecheckt"
                                          : "Nicht eingecheckt"}
                                      </span>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                                      {event.is_child ? "Kind" : "Erwachsen"}
                                    </td>
                                    <td className="px-4 py-2.5 text-sm text-gray-600">
                                      {event.email ? (
                                        <a
                                          href={`mailto:${event.email}`}
                                          className="hover:text-green-700 hover:underline"
                                        >
                                          {event.email}
                                        </a>
                                      ) : (
                                        "–"
                                      )}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                                      {event.phone ? (
                                        <a
                                          href={`tel:${event.phone}`}
                                          className="hover:text-green-700 hover:underline"
                                        >
                                          {event.phone}
                                        </a>
                                      ) : (
                                        "–"
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
