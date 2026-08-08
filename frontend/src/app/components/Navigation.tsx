import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { LayoutDashboard, Users, FileText, Edit, ScrollText, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getCorrections } from '../../api/client';

const SUPERVISOR_NAV = [
  { to: '/today', label: 'Today', icon: LayoutDashboard, end: true },
  { to: '/workers', label: 'Workers', icon: Users },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/corrections', label: 'Corrections', icon: Edit, showPending: true },
] as const;

const ADMIN_EXTRA = [
  { to: '/audit', label: 'Audit log', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

function NavItem({ to, label, icon: Icon, end, badge }: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  badge?: number;
}) {
  return (
    <NavLink to={to} end={end} className="block">
      {({ isActive }) => (
        <div className="fams-nav-link" data-active={isActive}>
          <Icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.25 : 2} />
          <span>{label}</span>
          {badge != null && badge > 0 && (
            <span className="fams-nav-badge">{badge > 99 ? '99+' : badge}</span>
          )}
        </div>
      )}
    </NavLink>
  );
}

export function Navigation() {
  const { user, isAdmin, logout } = useAuth();
  const location = useLocation();
  const [pendingCorrections, setPendingCorrections] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      getCorrections()
        .then(data => {
          if (active) {
            setPendingCorrections(data.filter(c => c.status === 'pending').length);
          }
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const mobileItems = isAdmin
    ? [
        { to: '/today', label: 'Today', icon: LayoutDashboard, end: true },
        { to: '/workers', label: 'Workers', icon: Users },
        { to: '/reports', label: 'Reports', icon: FileText },
        { to: '/corrections', label: 'Fix', icon: Edit, badge: pendingCorrections },
      ]
    : [
        { to: '/today', label: 'Today', icon: LayoutDashboard, end: true },
        { to: '/workers', label: 'Workers', icon: Users },
        { to: '/reports', label: 'Reports', icon: FileText },
        { to: '/corrections', label: 'Fix', icon: Edit, badge: pendingCorrections },
      ];

  return (
    <>
      <aside className="hidden md:flex fams-sidebar flex-shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-[var(--border)]" data-tour="sidebar-brand">
          <span className="text-[15px] font-semibold text-[var(--text)] tracking-tight">FAMS</span>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto no-scrollbar">
          <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Menu</p>
          {SUPERVISOR_NAV.map(item => (
            <NavItem
              key={item.to}
              {...item}
              badge={'showPending' in item && item.showPending ? pendingCorrections : undefined}
            />
          ))}
          {isAdmin && ADMIN_EXTRA.map(item => <NavItem key={item.to} {...item} />)}
        </nav>

        <div className="p-3 border-t border-[var(--border)]">
          <div className="px-3 py-2 mb-1">
            <p className="text-[13px] font-medium text-[var(--text)] truncate">{user?.name}</p>
            <p className="text-[11px] text-[var(--muted)] capitalize">{user?.role}</p>
          </div>
          <button type="button" onClick={logout} className="fams-nav-link w-full text-[var(--muted)]">
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      <nav className="fams-mobile-nav md:hidden fixed bottom-0 inset-x-0 z-50 bg-[var(--surface)] border-t border-[var(--border)]">
        <div className="flex justify-around py-1">
          {mobileItems.map(item => {
            const isActive = 'end' in item && item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false} className="relative flex flex-col items-center py-2 px-3 min-w-[56px]">
                <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`} strokeWidth={isActive ? 2.25 : 2} />
                <span className={`text-[10px] font-medium ${isActive ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
                  {item.label}
                </span>
                {'badge' in item && item.badge != null && item.badge > 0 && (
                  <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 text-[9px] font-bold leading-4 text-center rounded-full bg-[var(--warning)] text-white">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
