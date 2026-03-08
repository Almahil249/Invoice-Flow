import { Outlet } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
