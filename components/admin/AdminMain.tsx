export default function AdminMain({ children }: { children: React.ReactNode; collapsed: boolean }) {
  return (
    <main className="flex-1 pt-14 lg:pt-0 min-h-screen overflow-x-auto">
      <div className="p-4 md:p-8">{children}</div>
    </main>
  );
}
