'use client';

// ============================================
// Sidebar Navigation
// Dark sidebar with nav links, branding, and user info
// ============================================
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Settings,
  LogOut,
  Mountain,
  Menu,
  X,
  TrendingUp,
  Factory,
  Inbox,
  Sun,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

// Navigation items
const navItems = [
  { href: '/today',          label: 'Today',        icon: Sun },
  { href: '/inbox',          label: 'Inbox',        icon: Inbox },
  { href: '/suppliers',     label: 'Suppliers',    icon: Factory },
  { href: '/marketing',     label: 'Marketing',    icon: TrendingUp },
  { href: '/dashboard',      label: 'Calendar',     icon: LayoutDashboard },
  { href: '/settings',      label: 'Settings',     icon: Settings },
];

interface SidebarProps {
  userEmail: string;
}

export default function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [inboxCount, setInboxCount]   = useState(0);

  useEffect(() => {
    async function fetchInboxCount() {
      try {
        const res  = await fetch('/api/inbox?status=pending');
        const json = await res.json();
        if (json.pendingCount !== undefined) setInboxCount(json.pendingCount);
      } catch { /* silent */ }
    }
    fetchInboxCount();
    const interval = setInterval(fetchInboxCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const sidebarContent = (
    <>
      {/* Branding */}
      <div className="p-6">
        <div className="flex items-center gap-2">
          <Mountain className="h-7 w-7 text-indigo-400" />
          <div>
            <h1 className="text-lg font-bold text-white">Everest Calendar</h1>
            <p className="text-xs text-slate-400">by Everest Labs</p>
          </div>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.href === '/inbox' && inboxCount > 0 && (
                <span className="text-xs font-bold bg-indigo-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                  {inboxCount}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      {/* User info and sign out */}
      <div className="p-4 border-t border-slate-700">
        <p className="text-xs text-slate-400 truncate mb-2">{userEmail}</p>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors w-full px-2 py-1.5 rounded-lg hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-slate-900 text-white p-2 rounded-lg"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop: always visible, mobile: slides in */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 bg-slate-900 flex flex-col z-40 transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
