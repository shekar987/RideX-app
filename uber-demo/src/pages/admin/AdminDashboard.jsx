// AdminDashboard.jsx
// RideX admin portal — Day 1 shell: nav, section routing, logout.
// Stats and tables are wired up in Day 2 (Overview + Drivers) and Day 4 (Rides).

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';

// ── Sidebar nav items ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'overview', label: 'Overview',  icon: '📊' },
  { id: 'drivers',  label: 'Drivers',   icon: '🚗' },
  { id: 'rides',    label: 'Rides',     icon: '🗺️' },
  { id: 'settings', label: 'Settings',  icon: '⚙️' },
];

// ── Skeleton shimmer atom ─────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`bg-gray-800 rounded-xl animate-pulse ${className}`} />;
}

// ── Overview section ──────────────────────────────────────────────────────────
// Stat cards show skeleton shimmer — Day 2 wires up live Firestore queries.
function OverviewSection({ onNavigate }) {
  const statCards = [
    { label: 'Rides Today',       icon: '🗺️', accent: 'text-yellow-400' },
    { label: 'Revenue Today',     icon: '💰', accent: 'text-green-400'  },
    { label: 'Active Drivers',    icon: '🚗', accent: 'text-blue-400'   },
    { label: 'Pending Approvals', icon: '⏳', accent: 'text-orange-400', action: 'drivers' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-2xl mb-1">Overview</h2>
        <p className="text-gray-500 text-sm">Live data wires up in Day 2.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <button
            key={card.label}
            onClick={() => card.action && onNavigate(card.action)}
            className={`bg-gray-900 border border-gray-800 rounded-2xl p-5 text-left transition
              ${card.action ? 'hover:border-gray-600 cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <Skeleton className="h-6 w-10" />
            </div>
            <p className="text-gray-400 text-sm">{card.label}</p>
            {card.action && (
              <p className="text-yellow-400 text-xs mt-1.5 font-semibold">View →</p>
            )}
          </button>
        ))}
      </div>

      {/* Recent activity skeleton */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-bold">Recent Rides</p>
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-800 last:border-0">
              <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
              <Skeleton className="h-4 w-14 flex-shrink-0" />
            </div>
          ))}
        </div>
        <p className="text-gray-600 text-xs text-center mt-4">Live data in Day 2</p>
      </div>

      {/* Platform split info card */}
      <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-2xl p-5">
        <p className="text-yellow-400 font-bold mb-2">Revenue Split</p>
        <div className="flex gap-6">
          <div>
            <p className="text-white font-black text-xl">80%</p>
            <p className="text-gray-400 text-xs">Driver share</p>
          </div>
          <div>
            <p className="text-white font-black text-xl">20%</p>
            <p className="text-gray-400 text-xs">Platform (Amit)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Drivers preview (coming in Day 3) ─────────────────────────────────────────
function DriversSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-2xl mb-1">Drivers</h2>
        <p className="text-gray-500 text-sm">Driver approval and management — built in Day 3.</p>
      </div>

      {/* Preview of what Day 3 will show */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Pending Approval', icon: '⏳', color: 'border-orange-500/30 bg-orange-500/5' },
          { label: 'Active Drivers',   icon: '✅', color: 'border-green-500/30  bg-green-500/5'  },
          { label: 'Rejected',         icon: '❌', color: 'border-red-500/30    bg-red-500/5'    },
        ].map(card => (
          <div key={card.label} className={`border ${card.color} rounded-2xl p-5 text-center`}>
            <p className="text-3xl mb-2">{card.icon}</p>
            <Skeleton className="h-7 w-12 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <p className="text-white font-bold mb-4">Driver Applications</p>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-800 last:border-0">
              <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-20 rounded-xl" />
                <Skeleton className="h-8 w-20 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
        <p className="text-gray-600 text-xs text-center mt-4">Approve / Reject buttons in Day 3</p>
      </div>
    </div>
  );
}

// ── Rides preview (coming in Day 4) ──────────────────────────────────────────
function RidesSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-2xl mb-1">All Rides</h2>
        <p className="text-gray-500 text-sm">Full rides table with filters — built in Day 4.</p>
      </div>

      {/* Filter bar preview */}
      <div className="flex gap-2 flex-wrap">
        {['All', 'Confirmed', 'In Progress', 'Completed', 'Cancelled'].map(f => (
          <div
            key={f}
            className={`px-4 py-2 rounded-full text-sm font-semibold border
              ${f === 'All'
                ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400'
                : 'border-gray-800 text-gray-600'}`}
          >
            {f}
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-bold">Ride History</p>
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-800 last:border-0">
              <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
        <p className="text-gray-600 text-xs text-center mt-4">Live rides data in Day 4</p>
      </div>
    </div>
  );
}

// ── Settings section ──────────────────────────────────────────────────────────
function SettingsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-2xl mb-1">Settings</h2>
        <p className="text-gray-500 text-sm">Platform configuration — built in a future session.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { title: 'Commission Rate',  desc: 'Set platform % per ride',      icon: '💰' },
          { title: 'Surge Pricing',    desc: 'Peak-hour multipliers',         icon: '📈' },
          { title: 'Service Areas',    desc: 'Allowed cities and regions',    icon: '🗺️' },
          { title: 'Notifications',    desc: 'Email and SMS alert settings',  icon: '🔔' },
        ].map(item => (
          <div key={item.title} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 opacity-50 cursor-not-allowed">
            <p className="text-xl mb-2">{item.icon}</p>
            <p className="text-white font-bold text-sm mb-1">{item.title}</p>
            <p className="text-gray-500 text-xs">{item.desc}</p>
          </div>
        ))}
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
  const [adminEmail,    setAdminEmail]    = useState('');

  // Reactive auth — picks up the email even on hard refresh
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) setAdminEmail(user.email || '');
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut(auth);
      navigate('/admin/login');
    } catch (_) {
      setLoggingOut(false);
    }
  };

  const currentNav = NAV_ITEMS.find(n => n.id === activeSection);

  const renderSection = () => {
    switch (activeSection) {
      case 'overview': return <OverviewSection onNavigate={section => setActiveSection(section)} />;
      case 'drivers':  return <DriversSection />;
      case 'rides':    return <RidesSection />;
      case 'settings': return <SettingsSection />;
      default:         return <OverviewSection onNavigate={section => setActiveSection(section)} />;
    }
  };

  return (
    <div className="min-h-screen bg-black flex">

      {/* ── Sidebar ── */}
      <>
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/70 z-20 lg:hidden"
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
                <span className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Admin info + logout */}
          <div className="px-4 py-4 border-t border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-black font-black text-xs">
                  {(adminEmail[0] || 'A').toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-bold truncate">{adminEmail || 'Admin'}</p>
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

      {/* ── Main content ── */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">

        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-10 bg-black border-b border-gray-800 flex items-center justify-between px-4 py-3.5">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white transition"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Show current section name on mobile */}
          <div className="flex items-center gap-2">
            <span className="text-base">{currentNav?.icon}</span>
            <span className="text-white font-black text-base">{currentNav?.label || 'Dashboard'}</span>
          </div>

          <div className="w-6" />
        </header>

        {/* Desktop top bar */}
        <header className="hidden lg:flex items-center justify-between px-8 py-5 border-b border-gray-800">
          <div>
            <h1 className="text-white font-black text-xl">
              {currentNav?.label || 'Dashboard'}
            </h1>
            <p className="text-gray-500 text-sm">RideX Admin Portal</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">{adminEmail}</span>
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Online" />
          </div>
        </header>

        {/* Section content */}
        <main className="flex-1 p-4 lg:p-8 max-w-6xl w-full mx-auto">
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
