import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "@/pages/LoginPage";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import { LandingPage } from "@/pages/LandingPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ApplicationsPage } from "@/pages/ApplicationsPage";
import { GeneratePage } from "@/pages/GeneratePage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useApplications } from "@/hooks/useApplications";
import { STATUS_CONFIG as REAL_STATUS_CONFIG } from "@/lib/statusConfig";
import { getUser } from "@/lib/auth";

import {
  LayoutDashboard, Briefcase, Sparkles, Plus, Bell,
  Target, UserCircle,
} from "lucide-react";

const queryClient = new QueryClient()

type View = "dashboard" | "applications" | "generate" | "profile";



export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function AppShell() {
  const [view, setView] = useState<View>("dashboard");
  const user = getUser();

  const { data: realApps } = useApplications();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const appList = realApps ?? [];
  const sidebarCounts = {
    applied: appList.filter(a => a.status === "applied").length,
    phone_screen: appList.filter(a => a.status === "phone_screen").length,
    offer: appList.filter(a => a.status === "offer").length,
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden" style={{ fontFamily: "var(--font-body)" }}>
      {/* Sidebar */}
      <aside className="w-[232px] flex-shrink-0 bg-card border-r border-border flex flex-col">
        {/* Brand */}
        <div className="px-5 h-14 flex items-center border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-foreground rounded-md flex items-center justify-center">
              <Target size={14} className="text-background" strokeWidth={2} />
            </div>
            <span className="text-[15px] font-semibold text-foreground tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Tailr
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pt-4 space-y-0.5">
          <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground px-3 mb-2" style={{ fontFamily: "var(--font-mono)" }}>
            Navigation
          </p>
          {([
            { id: "dashboard" as View, label: "Dashboard", icon: LayoutDashboard },
            { id: "applications" as View, label: "Applications", icon: Briefcase },
            { id: "generate" as View, label: "Generate Docs", icon: Sparkles },
            { id: "profile" as View, label: "Profile", icon: UserCircle },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] transition-colors ${
                view === id
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon size={14} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>

        {/* Pipeline mini */}
        <div className="px-5 py-4 border-t border-border">
          <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-3" style={{ fontFamily: "var(--font-mono)" }}>
            Pipeline
          </p>
          <div className="space-y-2">
            {(["applied", "phone_screen", "offer"] as const).map(s => (
              <div key={s} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${REAL_STATUS_CONFIG[s].dot}`} />
                  <span className="text-[12px] text-muted-foreground">{REAL_STATUS_CONFIG[s].label}</span>
                </div>
                <span className="text-[13px] font-bold text-foreground tracking-tight" style={{ fontFamily: "var(--font-stat)" }}>
                  {sidebarCounts[s]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* User */}
        <button
          onClick={() => setView("profile")}
          className="px-4 py-4 border-t border-border w-full text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-[11px] font-semibold text-foreground flex-shrink-0">
              {user?.name ? user.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) : '?'}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-foreground truncate">{user?.name ?? '—'}</div>
              <div className="text-[10px] text-muted-foreground truncate">{user?.email ?? ''}</div>
            </div>
          </div>
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card flex-shrink-0">
          <div>
            <h1 className="text-[15px] font-semibold text-foreground leading-tight" style={{ fontFamily: "var(--font-display)" }}>
              {view === "dashboard" && "Overview"}
              {view === "applications" && "Applications"}
              {view === "generate" && "Generate Documents"}
              {view === "profile" && "Profile"}
            </h1>
            <p className="text-[10px] text-muted-foreground mt-0" style={{ fontFamily: "var(--font-mono)" }}>
              {view === "dashboard" && "Week of June 17, 2026"}
              {view === "applications" && `${appList.length} tracked position${appList.length !== 1 ? 's' : ''}`}
              {view === "generate" && "Paste a JD to generate tailored docs"}
              {view === "profile" && "Resume & work authorization settings"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Bell size={14} strokeWidth={1.75} />
            </button>
<button
              onClick={() => setView("generate")}
              className="flex items-center gap-1.5 px-3 h-8 bg-foreground text-background text-[12px] font-medium rounded-md hover:opacity-85 transition-opacity"
            >
              <Plus size={13} strokeWidth={2} />
              Add Job
            </button>
          </div>
        </header>

        {/* Views */}
        <div className="flex-1 overflow-auto">
          {view === "dashboard" && <DashboardPage onNavigate={setView} />}
          {view === "applications" && <ApplicationsPage onNavigate={setView} />}
          {view === "generate" && <GeneratePage onNavigate={setView} />}
          {view === "profile" && <ProfilePage />}
        </div>
      </main>
    </div>
  );
}

