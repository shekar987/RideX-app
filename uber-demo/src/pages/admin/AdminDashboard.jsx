// AdminDashboard.jsx
// RideX admin portal — Day 1 shell: nav, section routing, logout.
// Stats and tables are added in Day 2 (Drivers) and Day 4 (Rides).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';

// ── Sidebar nav items ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'overview', label: 'Overview',       icon: '📊' },
  { id: 'drivers',  label: 'Drivers',        icon: '🚗' },
  { id: 'rides',    label: 'Rides',          icon: '🗺️' },
  { id: 'settings', label: 'Settings',       icon: '⚙️' },
];

// ── Placeholder card shown while a section is not yet built ───────────────────
function ComingSoon({ section }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-5xl mb-4">🚧</p>
        <p className="text-white font-black text-xl mb-1">{section} — Coming Soon</p>
        <p className="text-gray-500 text-sm">This section is being built in the next session.</p>
      </div>
    </div>
  );
}

// ── Overview section (placeholder — Day 2 adds live stats) ───────────────────
function OverviewSection() {
  const statCards = [
    { label: 'Total Rides Today', value: '—', icon: '🗺️', color: 'text-yellow-400' },
    { label: 'Revenue Today',     value: '—', icon: '💰', color: 'text-green-400'  },
    { label: 'Active Drivers',    value: '—', icon: '🚗', color: 'text-blue-400'   },
    { label: 'Pending Approvals', value: '—', icon: '⏳', color: 'text-orange-400' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-2xl mb-1">Overview</h2>
        <p className="text-gray-500 text-sm">Live stats will appear here in Day 2.</p>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <span className={`${card.color} font-black text-2xl`}>{card.value}</span>
            </div>
            <p className="text-gray-400 text-sm">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Recent activity placeholder */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <p className="text-white font-bold mb-4">Recent Activity</p>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0">
              <div className="w-8 h-8 bg-gray-800 rounded-full animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-800 rounded-full w-2/3 animate-pulse" />
                <div className="h-2.5 bg-gray-800 rounded-full w-1/3 animate-pulse" />
              </div>
              <div className="h-3 bg-gray-800 rounded-full w-16 animate-pulse" />
            </div>
          ))}
        </div>
        <p className="text-gray-600 text-xs text-center mt-4">Live data in Day 2</p>
      </div>
    </div>
  );
}

// ── Main dashboard component ──────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [loggingOut,    setLoggingOut]    = useState(false);

  const adminEmail = auth.currentUser?.email || 'Admin';

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut(auth);
      navigate('/admin/login');
    } catch (_) {
      setLoggingOut(false);
    }
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'overview': return <OverviewSection />;
      case 'drivers':  return <ComingSoon section="Drivers" />;
      case 'rides':    return <ComingSoon section="Rides"   />;
      case 'settings': return <ComingSoon section="Settings" />;
      default:         return <OverviewSection />;
    }
  };

  return (
    <div className="min-h-screen bg-black flex">

      {/* ── Sidebar (desktop: fixed left; mobile: overlay) ── */}
      <>
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside className={`
          fixed top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-30 flex flex-col
          transform transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}>
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800">
            <div className="w-9 h-9 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-black font-black text-base">R</span>
            </div>
            <div>
              <p className="text-white font-black text-base leading-tight">RideX</p>
              <p className="text-yellow-400 text-xs font-bold">Admin Portal</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveSection(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition
                  ${activeSection === item.id
                    ? 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Admin info + logout */}
          <div className="px-4 py-4 border-t border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-black font-black text-xs">A</span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-bold truncate">{adminEmail}</p>
                <p className="text-gray-500 text-xs">Administrator</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full py-2.5 border border-red-500/40 text-red-400 text-sm font-bold rounded-xl hover:bg-red-500/10 transition disabled:opacity-60"
            >
              {loggingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        </aside>
      </>

      {/* ── Main content area ── */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">

        {/* Top bar (mobile only — shows hamburger + section title) */}
        <header className="lg:hidden flex items-center justify-between px-4 py-4 border-b border-gray-800 bg-black sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white transition"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center">
              <span className="text-black font-black text-xs">R</span>
            </div>
            <span className="text-white font-black text-base">RideX Admin</span>
          </div>
          <div className="w-6" />
        </header>

        {/* Desktop page header */}
        <header className="hidden lg:flex items-center justify-between px-8 py-5 border-b border-gray-800">
          <div>
            <h1 className="text-white font-black text-xl capitalize">
              {NAV_ITEMS.find(n => n.id === activeSection)?.label || 'Dashboard'}
            </h1>
            <p className="text-gray-500 text-sm">RideX Admin Portal</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">{adminEmail}</span>
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          </div>
        </header>

        {/* Section content */}
        <main className="flex-1 p-4 lg:p-8">
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
