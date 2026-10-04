"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/admin/actions/auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  ExternalLink,
  LogOut,
  Menu,
  X,
  FileText,
  ClipboardCheck,
  MessageSquare,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navSections = [
  {
    title: "ALLGEMEIN",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "EVENTS",
    items: [
      { href: "/admin/events", label: "Events", icon: CalendarDays },
      { href: "/admin/templates", label: "Vorlagen", icon: FileText },
      { href: "/admin/registrations", label: "Anmeldungen", icon: Users },
      { href: "/admin/teilnehmer", label: "Teilnehmer", icon: UserCheck },
      { href: "/admin/checkin", label: "Check-In", icon: ClipboardCheck },
    ],
  },
  {
    title: "VERWALTUNG",
    items: [
      { href: "/admin/finanzen", label: "Finanzen", icon: BarChart3 },
      { href: "/admin/contact", label: "Anfragen", icon: MessageSquare },
      { href: "/admin/helfer", label: "Helfer", icon: UserCheck },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: (collapsed: boolean) => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  const nav = (
    <>
      <div className={cn("p-6 border-b border-gray-800 flex justify-between", collapsed && "px-4")}>
        {!collapsed && (
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-white">Admin</h2>
            <p className="text-xs text-gray-400">Allsport Freunde 2026</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onToggle(!collapsed)}
          className="text-white hover:bg-gray-800 hidden lg:flex"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </Button>
      </div>

      <nav className={cn("flex-1 min-h-0 overflow-y-auto p-4", collapsed && "p-2")}>
        {navSections.map((section, index) => (
          <div key={section.title} className={cn(index > 0 && "mt-6 pt-4 border-t border-gray-800")}>            
            {!collapsed && (
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 mb-2">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    collapsed && "justify-center px-2",
                    isActive(item.href)
                      ? "bg-green-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {!collapsed && item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}

        <div className="border-t border-gray-800 my-4" />

        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors",
            collapsed && "justify-center px-2"
          )}
        >
          <ExternalLink className="w-5 h-5" />
          {!collapsed && "Zur Webseite"}
        </a>

        <form action={logout}>
          <button
            type="submit"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors w-full cursor-pointer",
              collapsed && "justify-center px-2"
            )}
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && "Abmelden"}
          </button>
        </form>
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <h2 className="text-white font-bold">Admin</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(!open)}
          className="text-white hover:bg-gray-800"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "lg:hidden fixed top-16 left-0 bottom-0 z-40 w-64 bg-gray-900 flex flex-col transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {nav}
      </aside>

      {/* Desktop sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col bg-gray-900 transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}>
        {nav}
      </aside>
    </>
  );
}
