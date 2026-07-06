import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, Briefcase, Sparkles, Plus, Search, Bell,
  TrendingUp, Clock, CheckCircle, ChevronRight, ArrowRight,
  FileText, Copy, Download, Star, MapPin, MoreHorizontal,
  Target, Zap, UserCircle, Upload, X, AlertTriangle, CheckCircle2,
} from "lucide-react";

type Status = "wishlist" | "applied" | "interview" | "offer" | "rejected";
type View = "dashboard" | "applications" | "generate" | "profile";

interface Job {
  id: string;
  company: string;
  role: string;
  location: string;
  salary: string;
  status: Status;
  date: string;
  tags: string[];
  starred: boolean;
}

const JOBS: Job[] = [
  { id: "1", company: "Stripe", role: "Senior Frontend Engineer", location: "San Francisco, CA", salary: "$180–220k", status: "interview", date: "Jun 18", tags: ["React", "TypeScript"], starred: true },
  { id: "2", company: "Linear", role: "Product Designer", location: "Remote", salary: "$140–165k", status: "interview", date: "Jun 17", tags: ["Figma", "Systems"], starred: false },
  { id: "3", company: "Vercel", role: "Staff Engineer", location: "Remote", salary: "$200–240k", status: "applied", date: "Jun 12", tags: ["Next.js", "Infra"], starred: true },
  { id: "4", company: "Figma", role: "Design Engineer", location: "San Francisco, CA", salary: "$190–230k", status: "offer", date: "Jun 8", tags: ["React", "WebGL"], starred: true },
  { id: "5", company: "Notion", role: "Frontend Engineer", location: "New York, NY", salary: "$160–190k", status: "rejected", date: "Jun 5", tags: ["React", "Electron"], starred: false },
  { id: "6", company: "Anthropic", role: "Product Engineer", location: "San Francisco, CA", salary: "$200–260k", status: "applied", date: "Jun 14", tags: ["AI/ML", "React"], starred: true },
  { id: "7", company: "Arc", role: "Senior Engineer", location: "New York, NY", salary: "$170–200k", status: "wishlist", date: "Jun 20", tags: ["Swift", "WebKit"], starred: false },
  { id: "8", company: "Loom", role: "Frontend Lead", location: "Remote", salary: "$175–210k", status: "applied", date: "Jun 10", tags: ["React", "Video"], starred: false },
  { id: "9", company: "Raycast", role: "Product Engineer", location: "Remote", salary: "$155–185k", status: "wishlist", date: "Jun 21", tags: ["React", "Electron"], starred: false },
];

const STATUS_CFG: Record<Status, { label: string; color: string; bg: string; dot: string; border: string }> = {
  wishlist:  { label: "Wishlist",  color: "text-slate-500 dark:text-slate-400",   bg: "bg-slate-100 dark:bg-slate-800/60",   dot: "bg-slate-400",   border: "border-slate-200 dark:border-slate-700" },
  applied:   { label: "Applied",   color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-900/40",     dot: "bg-blue-500",    border: "border-blue-100 dark:border-blue-800" },
  interview: { label: "Interview", color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-900/40",   dot: "bg-amber-400",   border: "border-amber-100 dark:border-amber-800" },
  offer:     { label: "Offer",     color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/40", dot: "bg-emerald-500", border: "border-emerald-100 dark:border-emerald-800" },
  rejected:  { label: "Rejected",  color: "text-rose-500 dark:text-rose-400",    bg: "bg-rose-50 dark:bg-rose-900/40",     dot: "bg-rose-400",    border: "border-rose-100 dark:border-rose-800" },
};

const LOGO_BG: Record<string, string> = {
  Stripe:    "bg-[#6772E5] text-white",
  Linear:    "bg-[#5E6AD2] text-white",
  Vercel:    "bg-black text-white",
  Figma:     "bg-[#1E1E2E] text-[#FF7262]",
  Notion:    "bg-black text-white",
  Anthropic: "bg-[#CC785C] text-white",
  Arc:       "bg-gradient-to-br from-violet-500 to-pink-500 text-white",
  Loom:      "bg-[#625DF5] text-white",
  Raycast:   "bg-[#FF6363] text-white",
};

const SAMPLE_RESUME = `ALEX MORGAN
alex.morgan@email.com  ·  (415) 555-0142  ·  linkedin.com/in/alexmorgan  ·  github.com/alexmorgan

SUMMARY

Senior Frontend Engineer with 7 years building high-performance web applications at scale.
Specialized in React, TypeScript, and design systems. Previously at Airbnb and Dropbox, shipping
features used by millions. Known for bridging the gap between design and engineering.

EXPERIENCE

Senior Software Engineer — Airbnb                                          2021 – 2024
· Led redesign of search results page, improving conversion rate by 18%
· Built and maintained design system (React + Storybook) used by 60+ engineers
· Collaborated directly with design org on pixel-perfect implementations
· Mentored 4 junior engineers; 3 subsequently promoted

Software Engineer — Dropbox                                                2019 – 2021
· Delivered real-time collaboration features for Dropbox Paper via WebSockets
· Reduced bundle size by 34% through code splitting and lazy loading
· Owned Dropbox.com marketing pages — shipped 12 experiments in 18 months

Frontend Engineer — Hired.com                                              2017 – 2019
· Built candidate-facing dashboard from scratch using React and Redux
· Integrated third-party ATS APIs for seamless recruiter workflows

SKILLS

React · TypeScript · Next.js · Node.js · GraphQL · Figma · PostgreSQL · AWS · Storybook

EDUCATION

B.S. Computer Science — UC Berkeley, 2017`;

const SAMPLE_COVER = `Dear Hiring Manager,

I'm writing to express my strong interest in the Senior Frontend Engineer role at Stripe. After
years of building products that demand both technical precision and user-facing craft, the
opportunity to work on infrastructure that powers internet commerce is genuinely exciting.

At Airbnb, I led the frontend rebuild of our search experience — a project requiring close
collaboration with design, data science, and product to ship something that felt inevitable rather
than assembled. I know the bar Stripe sets for its products, and I want to meet that bar.

What draws me specifically to this role is the intersection of complex technical problems and the
kind of polished UI that Stripe is known for. The Stripe Dashboard is, by any measure, one of the
best-designed developer tools on the internet. I'd love to contribute to that legacy.

A few things that feel especially relevant:

· I've spent the last three years building and scaling design systems — I understand component
  contracts, token architecture, and the discipline it takes to keep a system coherent as teams grow.

· I care deeply about performance. Bundle budgets, Core Web Vitals, perceived latency — these
  aren't afterthoughts in my work, they're first-class concerns.

· I collaborate well across disciplines. Some of my best work has come from sitting directly with
  designers and PMs, iterating in real time rather than handing off.

I'd welcome the chance to talk about how my background maps to what your team is building.

Best,
Alex Morgan`;

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [jobs] = useState<Job[]>(JOBS);
  const [jdText, setJdText] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genTab, setGenTab] = useState<"resume" | "cover">("resume");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [workAuth, setWorkAuth] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const handleGenerate = () => {
    if (!jdText.trim() || !company.trim() || !role.trim()) return;
    setGenerating(true);
    setTimeout(() => { setGenerating(false); setGenerated(true); }, 2000);
  };

  const filteredJobs = jobs.filter(j => {
    const matchStatus = filterStatus === "all" || j.status === filterStatus;
    const matchSearch = j.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.role.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts = (Object.keys(STATUS_CFG) as Status[]).reduce((acc, s) => {
    acc[s] = jobs.filter(j => j.status === s).length;
    return acc;
  }, {} as Record<Status, number>);

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
              Jobflow
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
            {(["applied", "interview", "offer"] as Status[]).map(s => (
              <div key={s} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_CFG[s].dot}`} />
                  <span className="text-[12px] text-muted-foreground">{STATUS_CFG[s].label}</span>
                </div>
                <span className="text-[13px] font-bold text-foreground tracking-tight" style={{ fontFamily: "var(--font-stat)" }}>{counts[s]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* User */}
        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-[11px] font-semibold text-foreground flex-shrink-0">
              AM
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-foreground truncate">Alex Morgan</div>
              <div className="text-[10px] text-muted-foreground truncate">alex@email.com</div>
            </div>
          </div>
        </div>
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
              {view === "applications" && `${jobs.length} tracked positions`}
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
          {view === "dashboard" && <DashboardView jobs={jobs} counts={counts} setView={setView} />}
          {view === "applications" && (
            <ApplicationsView
              jobs={filteredJobs}
              allJobs={jobs}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              counts={counts}
            />
          )}
          {view === "generate" && (
            <GenerateView
              jdText={jdText}
              setJdText={setJdText}
              company={company}
              setCompany={setCompany}
              role={role}
              setRole={setRole}
              generated={generated}
              generating={generating}
              handleGenerate={handleGenerate}
              genTab={genTab}
              setGenTab={setGenTab}
              setGenerated={setGenerated}
              hasResume={!!resumeFile}
              goToProfile={() => setView("profile")}
            />
          )}
          {view === "profile" && (
            <ProfileView
              resumeFile={resumeFile}
              setResumeFile={setResumeFile}
              workAuth={workAuth}
              setWorkAuth={setWorkAuth}
              saved={profileSaved}
              setSaved={setProfileSaved}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function DashboardView({ jobs, counts, setView }: { jobs: Job[]; counts: Record<Status, number>; setView: (v: View) => void }) {
  const stats = [
    { label: "Total Tracked", value: jobs.length, sub: "+3 this week", icon: Briefcase },
    { label: "Response Rate", value: "42%", sub: "+6 pts vs last month", icon: TrendingUp },
    { label: "Interviews", value: counts.interview, sub: "2 scheduled this week", icon: Clock },
    { label: "Offers", value: counts.offer, sub: "1 pending decision", icon: CheckCircle },
  ];

  const recent = [...jobs].slice(0, 6);

  const pipelineData = (["applied", "interview", "offer", "rejected"] as Status[]).map(s => ({
    status: s,
    count: counts[s],
    pct: jobs.length ? Math.round((counts[s] / jobs.length) * 100) : 0,
  }));

  return (
    <div className="p-6 space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="bg-card border border-border rounded-lg px-4 py-4 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium" style={{ fontFamily: "var(--font-mono)" }}>
                {label}
              </span>
              <Icon size={13} className="text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div className="text-[32px] font-extrabold text-foreground leading-none mb-2 tracking-tight" style={{ fontFamily: "var(--font-stat)" }}>
              {value}
            </div>
            <div className="text-[11px] text-emerald-600">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Pipeline breakdown */}
        <div className="col-span-2 bg-card border border-border rounded-lg p-4">
          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-4" style={{ fontFamily: "var(--font-mono)" }}>
            Pipeline breakdown
          </p>
          <div className="space-y-3">
            {pipelineData.map(({ status, count, pct }) => (
              <div key={status}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_CFG[status].dot}`} />
                    <span className="text-[12px] text-foreground">{STATUS_CFG[status].label}</span>
                  </div>
                  <span className="text-[12px] font-bold text-muted-foreground tracking-tight" style={{ fontFamily: "var(--font-stat)" }}>
                    {count} <span className="font-normal opacity-60">· {pct}%</span>
                  </span>
                </div>
                <div className="h-[3px] bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${STATUS_CFG[status].dot}`}
                    style={{ width: `${pct}%`, transition: "width 0.6s ease" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent applications */}
        <div className="col-span-3 bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium" style={{ fontFamily: "var(--font-mono)" }}>
              Recent applications
            </p>
            <button
              onClick={() => setView("applications")}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              View all <ArrowRight size={11} />
            </button>
          </div>
          <div className="space-y-1">
            {recent.map(job => (
              <div key={job.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0 group cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded transition-colors">
                <LogoBadge company={job.company} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-foreground truncate">{job.role}</span>
                    {job.starred && <Star size={9} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{job.company}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusBadge status={job.status} />
                  <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>{job.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA banner */}
      <div
        onClick={() => setView("generate")}
        className="bg-foreground rounded-lg px-6 py-5 flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity"
      >
        <div>
          <div className="text-[15px] font-semibold text-background mb-1" style={{ fontFamily: "var(--font-display)" }}>
            Generate tailored resume &amp; cover letter
          </div>
          <p className="text-[12px] text-background/50">
            Paste a job description and get matched documents in under 5 seconds.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-background/10 hover:bg-background/20 transition-colors rounded-md px-4 py-2.5 flex-shrink-0">
          <Zap size={13} className="text-background" />
          <span className="text-[12px] font-medium text-background">Try it now</span>
          <ChevronRight size={13} className="text-background/70" />
        </div>
      </div>
    </div>
  );
}

// ─── Applications ─────────────────────────────────────────────────────────────

function ApplicationsView({
  jobs, allJobs, filterStatus, setFilterStatus, searchQuery, setSearchQuery, counts,
}: {
  jobs: Job[]; allJobs: Job[]; filterStatus: Status | "all";
  setFilterStatus: (s: Status | "all") => void;
  searchQuery: string; setSearchQuery: (s: string) => void;
  counts: Record<Status, number>;
}) {
  return (
    <div className="p-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative max-w-[280px] w-full">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search companies or roles…"
            className="w-full pl-8 pr-3 h-8 text-[12px] bg-card border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-0.5 bg-card border border-border p-0.5 rounded-md">
          {(["all", "wishlist", "applied", "interview", "offer", "rejected"] as (Status | "all")[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 h-6 text-[10px] rounded transition-colors whitespace-nowrap ${
                filterStatus === s
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {s === "all" ? `All (${allJobs.length})` : `${STATUS_CFG[s].label} (${counts[s]})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border">
              {["Company", "Role", "Location", "Salary", "Status", "Date", ""].map(h => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground font-normal bg-muted/30"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <LogoBadge company={job.company} size="sm" />
                    <div className="flex items-center gap-1">
                      <span className="text-[13px] font-medium text-foreground">{job.company}</span>
                      {job.starred && <Star size={9} className="text-amber-400 fill-amber-400" />}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[13px] text-foreground">{job.role}</span>
                  <div className="flex gap-1 mt-1">
                    {job.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                    <MapPin size={10} strokeWidth={1.5} />
                    {job.location}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[12px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                    {job.salary}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-4 py-3">
                  <span className="text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                    {job.date}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100">
                    <MoreHorizontal size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Generate ─────────────────────────────────────────────────────────────────

function GenerateView({
  jdText, setJdText, company, setCompany, role, setRole,
  generated, generating, handleGenerate, genTab, setGenTab, setGenerated,
  hasResume, goToProfile,
}: {
  jdText: string; setJdText: (s: string) => void;
  company: string; setCompany: (s: string) => void;
  role: string; setRole: (s: string) => void;
  generated: boolean; generating: boolean;
  handleGenerate: () => void;
  genTab: "resume" | "cover"; setGenTab: (t: "resume" | "cover") => void;
  setGenerated: (b: boolean) => void;
  hasResume: boolean;
  goToProfile: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = genTab === "resume" ? SAMPLE_RESUME : SAMPLE_COVER;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleReset = () => {
    setGenerated(false);
    setJdText("");
    setCompany("");
    setRole("");
  };

  const canGenerate = jdText.trim() && company.trim() && role.trim();
  const slug = company && role
    ? `${role.toLowerCase().replace(/\s+/g, "_")}_${company.toLowerCase().replace(/\s+/g, "_")}`
    : "document";

  return (
    <div className="h-full flex flex-col">
      {/* No-resume banner */}
      {!hasResume && (
        <div className="flex items-center gap-3 px-5 py-3 bg-amber-950/60 border-b border-amber-800/50 flex-shrink-0">
          <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
          <p className="text-[12px] text-amber-300 flex-1">
            Upload your resume in Profile before generating documents.
          </p>
          <button
            onClick={goToProfile}
            className="text-[11px] font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors whitespace-nowrap"
          >
            Go to Profile →
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
      {/* Left: input panel */}
      <div className="w-[400px] flex-shrink-0 border-r border-border flex flex-col bg-card">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-1" style={{ fontFamily: "var(--font-mono)" }}>
            New Application
          </p>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Fill in the role details and paste the full JD — we'll tailor your documents to match.
          </p>
        </div>

        {/* Company + Role fields */}
        <div className="px-4 pt-4 space-y-3">
          <div>
            <label className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-1.5" style={{ fontFamily: "var(--font-mono)" }}>
              Company
            </label>
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="e.g. Stripe"
              className="w-full px-3 h-9 text-[13px] bg-muted/40 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <div>
            <label className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-1.5" style={{ fontFamily: "var(--font-mono)" }}>
              Role
            </label>
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="e.g. Senior Frontend Engineer"
              className="w-full px-3 h-9 text-[13px] bg-muted/40 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <div>
            <label className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-1.5" style={{ fontFamily: "var(--font-mono)" }}>
              Job Description
            </label>
          </div>
        </div>

        <div className="flex-1 px-4 pb-4 min-h-0">
          <textarea
            value={jdText}
            onChange={e => setJdText(e.target.value)}
            placeholder={"We're looking for an engineer to join our growth team...\n\nRequirements:\n• 5+ years of React experience\n• Strong TypeScript skills\n• Experience with design systems\n• Passion for developer tooling"}
            className="w-full h-full resize-none text-[12px] bg-muted/40 border border-border rounded-md p-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring leading-relaxed"
            style={{ fontFamily: "var(--font-mono)" }}
          />
        </div>

        <div className="p-4 border-t border-border space-y-2">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || generating}
            className="w-full flex items-center justify-center gap-2 h-9 bg-foreground text-background text-[13px] font-medium rounded-md hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
          >
            {generating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-background/25 border-t-background rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles size={13} />
                Generate Documents
              </>
            )}
          </button>
          {generated && (
            <button
              onClick={handleReset}
              className="w-full h-8 text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors hover:bg-muted"
            >
              Start over
            </button>
          )}
          {!generated && (
            <p className="text-[10px] text-muted-foreground text-center" style={{ fontFamily: "var(--font-mono)" }}>
              Tailored to match your profile + this JD
            </p>
          )}
        </div>
      </div>

      {/* Right: output panel */}
      <div className="flex-1 min-w-0 flex flex-col bg-background">
        {!generated && !generating ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-10">
            <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center mb-4">
              <FileText size={18} className="text-muted-foreground" strokeWidth={1.5} />
            </div>
            <p className="text-[14px] font-semibold text-foreground mb-2" style={{ fontFamily: "var(--font-display)" }}>
              No documents generated yet
            </p>
            <p className="text-[12px] text-muted-foreground max-w-xs leading-relaxed">
              Paste a job description on the left and click Generate. We'll produce a tailored resume and cover letter in seconds.
            </p>
          </div>
        ) : generating ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-10">
            <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center mb-4">
              <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
            </div>
            <p className="text-[14px] font-semibold text-foreground mb-2" style={{ fontFamily: "var(--font-display)" }}>
              Generating your documents…
            </p>
            <p className="text-[12px] text-muted-foreground">
              Analyzing the JD and matching to your experience profile.
            </p>
          </div>
        ) : (
          <>
            {/* Tabs + actions */}
            <div className="flex items-center justify-between h-12 px-5 border-b border-border bg-card flex-shrink-0">
              <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-md">
                {(["resume", "cover"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setGenTab(t)}
                    className={`px-4 h-7 text-[11px] rounded transition-colors whitespace-nowrap ${
                      genTab === t
                        ? "bg-card text-foreground font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {t === "resume" ? "Resume" : "Cover Letter"}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 h-7 text-[11px] text-muted-foreground bg-muted hover:bg-border rounded-md transition-colors"
                >
                  <Copy size={11} />
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button className="flex items-center gap-1.5 px-3 h-7 text-[11px] text-muted-foreground bg-muted hover:bg-border rounded-md transition-colors">
                  <Download size={11} />
                  Export PDF
                </button>
              </div>
            </div>

            {/* Document preview */}
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-[680px] mx-auto bg-white border border-border rounded-lg shadow-sm">
                {/* Doc header bar */}
                <div className="border-b border-border px-6 py-3 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                    {genTab === "resume" ? `resume_alex_morgan_${slug}.pdf` : `cover_letter_alex_morgan_${slug}.pdf`}
                  </span>
                  <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100" style={{ fontFamily: "var(--font-mono)" }}>
                    Tailored · 94% match
                  </span>
                </div>
                <div className="p-8">
                  <pre
                    className="text-[11.5px] text-foreground whitespace-pre-wrap leading-[1.7]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {genTab === "resume" ? SAMPLE_RESUME : SAMPLE_COVER}
                  </pre>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────

const WORK_AUTH_OPTIONS = [
  { value: "citizen", label: "Permanent Resident / Citizen" },
  { value: "opt_cpt", label: "OPT / CPT" },
  { value: "h1b", label: "Needs H-1B Sponsorship" },
];

function ProfileView({
  resumeFile, setResumeFile, workAuth, setWorkAuth, saved, setSaved,
}: {
  resumeFile: File | null; setResumeFile: (f: File | null) => void;
  workAuth: string; setWorkAuth: (s: string) => void;
  saved: boolean; setSaved: (b: boolean) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      setResumeFile(file);
      setSaved(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setResumeFile(file);
      setSaved(false);
    }
    e.target.value = "";
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const canSave = !!resumeFile && !!workAuth;

  return (
    <div className="p-6 max-w-[600px]">
      <div className="space-y-5">

        {/* Resume upload */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium" style={{ fontFamily: "var(--font-mono)" }}>
              Resume
            </p>
          </div>
          <div className="p-5">
            {resumeFile ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/40 border border-border rounded-md">
                <FileText size={15} className="text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{resumeFile.name}</p>
                  <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                    {(resumeFile.size / 1024).toFixed(0)} KB · PDF
                  </p>
                </div>
                <button
                  onClick={() => { setResumeFile(null); setSaved(false); }}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 px-6 py-10 border-2 border-dashed rounded-md cursor-pointer transition-colors ${
                  dragging
                    ? "border-foreground/40 bg-muted/60"
                    : "border-border hover:border-foreground/25 hover:bg-muted/30"
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <Upload size={15} className="text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-medium text-foreground mb-0.5">
                    {dragging ? "Drop to upload" : "Drag & drop your resume"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    or <span className="text-foreground underline underline-offset-2">browse files</span> · PDF only
                  </p>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Work authorization */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium" style={{ fontFamily: "var(--font-mono)" }}>
              Work Authorization
            </p>
          </div>
          <div className="p-5">
            <select
              value={workAuth}
              onChange={e => { setWorkAuth(e.target.value); setSaved(false); }}
              className="w-full px-3 h-9 text-[13px] bg-muted/40 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground appearance-none cursor-pointer"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
            >
              <option value="" disabled>Select status…</option>
              {WORK_AUTH_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {workAuth && (
              <p className="text-[11px] text-muted-foreground mt-2" style={{ fontFamily: "var(--font-mono)" }}>
                {workAuth === "citizen" && "No sponsorship required. Eligible to work anywhere in the US."}
                {workAuth === "opt_cpt" && "Currently authorized via OPT/CPT. May require future sponsorship."}
                {workAuth === "h1b" && "Will need employer H-1B sponsorship to work in the US."}
              </p>
            )}
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-2 px-5 h-9 bg-foreground text-background text-[13px] font-medium rounded-md hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
          >
            Save Profile
          </button>
          {saved && (
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 size={13} />
              <span className="text-[12px]">Saved</span>
            </div>
          )}
          {!canSave && (
            <p className="text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
              {!resumeFile ? "Upload a resume to continue" : "Select work authorization status"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function LogoBadge({ company, size = "sm" }: { company: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[11px]";
  const cls = LOGO_BG[company] ?? "bg-secondary text-secondary-foreground";
  return (
    <div className={`${dim} ${cls} rounded flex-shrink-0 flex items-center justify-center font-bold`}>
      {company[0]}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const { label, color, bg, dot, border } = STATUS_CFG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[9px] px-2 py-0.5 rounded-full border ${bg} ${color} ${border}`}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <span className={`w-1 h-1 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  );
}
