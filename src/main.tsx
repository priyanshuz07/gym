import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import {
  Activity, Bell, CalendarDays, CalendarClock, ChartNoAxesCombined, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleAlert, CircleCheck, CreditCard, Dumbbell, LayoutGrid, Menu,
  PanelLeftClose, PanelLeftOpen, Plus, Search, Settings as SettingsIcon, UserCheck,
  Users, UserX, X
} from 'lucide-react';
import type { AppState } from './model';
import { formatDate, makeSeed, notifications, today } from './model';
import { Dashboard } from './Dashboard';
import { MemberModal, MemberProfilePage, MembersPage } from './Members';
import { PlansPage, ReportsPage, SettingsPage } from './Secondary';
import './app.css';

type MembersView = 'members' | 'active' | 'expiring' | 'expired' | 'deactivated';
type Page = 'dashboard' | MembersView | 'plans' | 'reports' | 'settings' | 'profile';
export type MemberAction = {type: 'add' | 'edit' | 'view' | 'renew' | 'deactivate' | 'reactivate' | 'delete'; memberId?: string};
type Route = {page: Page; id?: string};
type Toast = {text: string; error: boolean};
const demo = true;
const demoDataKey = 'ironclad-demo-v1';
const SidebarNavigation = [
  {label: 'Overview', links: [{id: 'dashboard', label: 'Dashboard', icon: LayoutGrid}]},
  {label: 'Memberships', links: [
    {id: 'members', label: 'All Members', icon: Users},
    {id: 'active', label: 'Active Members', icon: UserCheck},
    {id: 'expiring', label: 'Expiring Soon', icon: CalendarClock},
    {id: 'expired', label: 'Expired Members', icon: CircleAlert},
    {id: 'deactivated', label: 'Deactivated', icon: UserX},
    {id: 'plans', label: 'Membership Plans', icon: CreditCard}
  ]},
  {label: 'Management', links: [
    {id: 'reports', label: 'Reports', icon: ChartNoAxesCombined},
    {id: 'settings', label: 'Settings', icon: SettingsIcon}
  ]}
] as const;

function routeNow(): Route {
  const [page, id] = location.hash.slice(1).split('/');
  if (page === 'profile' && id) {
    try {return {page, id: decodeURIComponent(id)};} catch {return {page: 'members'};}
  }
  const link = SidebarNavigation.flatMap(group => [...group.links]).find(link => link.id === page);
  return {page: link?.id ?? 'dashboard'};
}

function demoState(): AppState {
  try {
    const previous = localStorage.getItem(demoDataKey);
    if (previous) return JSON.parse(previous) as AppState;
  } catch { /* Start with the sample workspace when storage is unavailable. */ }
  return makeSeed();
}

function initialName(name: string) {
  return name.trim().split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase() || 'GF';
}

function Brand({logo, name}: {logo?: string; name?: string}) {
  const custom = name && name !== 'Ironclad Fitness';
  return <div className="brand">
    {logo ? <img src={logo} alt="" className="brand-image" /> : <span className="brand-mark"><Dumbbell size={23} strokeWidth={2.6}/></span>}
    <div className="brand-words"><strong>{custom ? name : 'IRONCLAD'}{!custom && <em>.</em>}</strong><span>{custom ? 'GYM MANAGEMENT' : 'FITNESS MANAGEMENT'}</span></div>
  </div>;
}

function App() {
  const [state, setState] = useState<AppState>(() => demoState());
  const [route, setRoute] = useState<Route>(routeNow);
  const [action, setAction] = useState<MemberAction | null>(null);
  const [previous, setPrevious] = useState<MembersView | 'dashboard'>('members');
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [bell, setBell] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [renewPicker, setRenewPicker] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [renderDay, setRenderDay] = useState(today);
  const reduceMotion = useReducedMotion();
  const toastTimer = useRef<number | undefined>(undefined);
  const notify = useCallback((text: string, error = false) => {
    setToast({text, error});
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);
  const navigate = useCallback((page: Page, id?: string) => {
    const hash = '#' + page + (id ? '/' + encodeURIComponent(id) : '');
    if (location.hash !== hash) location.hash = hash;
    setMobile(false);
    setBell(false);
    setSearchOpen(false);
  }, []);

  useEffect(() => {
    const handleRoute = () => {
      setRoute(routeNow());
      setAction(null);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', handleRoute);
    const clock = window.setInterval(() => setRenderDay(today()), 30_000);
    return () => {
      window.removeEventListener('hashchange', handleRoute);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(open => !open);
      }
      if (event.key === 'Escape') {
        setBell(false);
        setMobile(false);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const commit = useCallback(async (next: AppState, message: string) => {
    setState(next);
    try {
      localStorage.setItem(demoDataKey, JSON.stringify(next));
      if (message) notify(message);
    } catch {
      notify('Changes are available for this session but could not be saved in this browser.', true);
    }
  }, [notify]);

  async function updateAccount(_data: {currentPassword: string; password?: string; email?: string}) {
    return;
  }

  const allAlerts = useMemo(() => notifications(state), [state, renderDay]);
  const unread = allAlerts.filter(alert => !state.readNotifications.includes(alert.id)).length;
  const visibleName = SidebarNavigation.flatMap(group => [...group.links]).find(link => link.id === route.page)?.label || 'Member Profile';

  function memberAction(next: MemberAction) {
    if (next.type === 'view' && next.memberId) {
      if (route.page !== 'profile' && !['plans', 'reports', 'settings'].includes(route.page)) setPrevious(route.page as MembersView | 'dashboard');
      setAction(null);
      navigate('profile', next.memberId);
    } else if (next.type === 'renew' && !next.memberId) {
      setRenewPicker(true);
    } else setAction(next);
  }

  const owner = state.settings.ownerName || 'Gym Owner';

  return <div className={'app-shell' + (collapsed ? ' collapsed' : '')}>
    {mobile && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside className={'sidebar' + (mobile ? ' sidebar-open' : '')}>
      <a className="brand-link" href="#dashboard" title={state.settings.gymName} onClick={() => setMobile(false)}><Brand logo={state.settings.logo} name={state.settings.gymName}/></a>
      <nav aria-label="Main navigation" className="nav">
        <LayoutGroup>{SidebarNavigation.map(group => <div className="nav-group" key={group.label}>
          <div className="nav-label">{group.label}</div>
          {group.links.map(({id, label, icon: Icon}) => {
            const selected = route.page === id || (route.page === 'profile' && id === 'members');
            return <a className={'nav-link' + (selected ? ' selected' : '')} title={label} href={'#' + id} key={id}
              aria-current={selected ? 'page' : undefined} onClick={() => setMobile(false)}>
              {selected && <motion.span className="nav-highlight" layoutId={reduceMotion ? undefined : 'nav-highlight'} />}
              <Icon size={18} strokeWidth={1.8}/><span>{label}</span>{selected && <span className="nav-active-pill"/>}
            </a>;
          })}
        </div>)}</LayoutGroup>
      </nav>
      <div className="sidebar-footer">
        {demo && <div className="demo-label"><span/> Sample workspace</div>}
        <div className="owner-card">
          <button className="owner-button" onClick={() => navigate('settings')} title="Owner settings">
            {state.settings.profileImage ? <img className="owner-avatar" src={state.settings.profileImage} alt=""/> : <span className="owner-avatar">{initialName(owner)}</span>}
            <span className="owner-details"><strong>{owner}</strong><small>Gym Owner</small></span>
          </button>
        </div>
      </div>
    </aside>

    <div className="app-body">
      <header className="topbar">
        <div className="topbar-title">
          <button className="icon-button sidebar-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}
          </button>
          <button className="icon-button mobile-toggle" onClick={() => setMobile(!mobile)} aria-expanded={mobile} aria-label="Open navigation"><Menu size={22}/></button>
          <span className="topbar-divider"/>
          <span className="topbar-context">Workspace</span><ChevronRight size={14} className="topbar-context"/><strong>{visibleName}</strong>
        </div>
        <div className="topbar-tools">
          <button className="global-search" onClick={() => setSearchOpen(true)} aria-label="Search members"><Search size={17}/><span>Search members</span><kbd>⌘ K</kbd></button>
          <div className="notification-wrap">
            <button className={'icon-button bell-button' + (bell ? ' opened' : '')} aria-label={unread ? 'Notifications, ' + unread + ' unread' : 'Notifications'} aria-expanded={bell} onClick={() => setBell(!bell)}>
              <Bell size={20} strokeWidth={1.8}/>{unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
            </button>
            {bell && <>
              <button className="notification-scrim" aria-label="Close notifications" onClick={() => setBell(false)}/>
              <div className="notification-panel">
                <div className="notification-head"><div><strong>Notifications</strong><small>{unread ? unread + ' unread' : 'You’re all caught up'}</small></div>{unread > 0 && <button className="text-button" onClick={() => void commit({...state, readNotifications: [...new Set([...state.readNotifications, ...allAlerts.map(alert => alert.id)])]}, '').catch(() => {})}>Mark all read</button>}</div>
                <div className="notification-list">{allAlerts.length ? allAlerts.map(alert => <div className="notification-row" key={alert.id}><span className={'notification-icon kind-' + alert.kind}>{alert.kind === 'warning' || alert.kind === 'expired' ? <CalendarClock size={17}/> : <Activity size={17}/>}</span><div><strong>{alert.title}</strong><p>{alert.detail}</p><small>{formatDate(alert.date)}</small></div>{!state.readNotifications.includes(alert.id) && <i />}</div>) : <p className="notification-empty">New alerts will appear here.</p>}</div>
              </div>
            </>}
          </div>
          <button className="topbar-avatar" aria-label="Owner settings" onClick={() => navigate('settings')}>{state.settings.profileImage ? <img src={state.settings.profileImage} alt=""/> : initialName(owner)}<ChevronDown size={12}/></button>
        </div>
      </header>

      <main className="app-main" id="main-content">
        <motion.div key={route.page + (route.id || '')} initial={reduceMotion ? false : {opacity: 0, y: 6}} animate={{opacity: 1, y: 0}} transition={{duration: .22}}>
          {route.page === 'dashboard' ? <Dashboard state={state} day={renderDay} onNavigate={navigate} onAction={memberAction}/> :
            route.page === 'plans' ? <PlansPage state={state} onCommit={commit}/> :
            route.page === 'reports' ? <ReportsPage state={state}/> :
            route.page === 'settings' ? <SettingsPage state={state} onCommit={commit} onAccount={updateAccount} demo={demo}/> :
            route.page === 'profile' && route.id ? <MemberProfilePage state={state} memberId={route.id} onBack={() => navigate(previous)} onAction={memberAction}/> :
            <MembersPage state={state} view={route.page as MembersView} onAction={memberAction}/>}
        </motion.div>
      </main>
    </div>

    <AnimatePresence>{toast && <motion.div className={'toast' + (toast.error ? ' error' : '')} role={toast.error ? 'alert' : 'status'} initial={{opacity: 0, y: 12}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: 8}}>{toast.error ? <CircleAlert size={20}/> : <CircleCheck size={20}/>}<span>{toast.text}</span><button className="icon-button" onClick={() => setToast(null)} aria-label="Dismiss message"><X size={16}/></button></motion.div>}</AnimatePresence>
    {action && <MemberModal state={state} action={action} onAction={memberAction} onClose={() => setAction(null)} onCommit={commit}/>}
    {(searchOpen || renewPicker) && <MemberSearch state={state} renew={renewPicker} onClose={() => {setSearchOpen(false); setRenewPicker(false);}} onSelect={member => {
      setSearchOpen(false);
      setRenewPicker(false);
      memberAction({type: renewPicker ? 'renew' : 'view', memberId: member});
    }}/>}
  </div>;
}

function MemberSearch({state, renew, onClose, onSelect}: {state: AppState; renew: boolean; onClose: () => void; onSelect: (id: string) => void}) {
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const matches = state.members.filter(member => (!renew || !member.deactivatedAt) && [member.id, member.name, member.email, member.phone]
    .some(value => value.toLowerCase().includes(query.trim().toLowerCase()))).slice(0, 8);
  return <dialog className="command-dialog" ref={dialog} onCancel={event => {event.preventDefault(); onClose();}} onClick={event => {if (event.target === dialog.current) onClose();}} aria-label={renew ? 'Choose a member to renew' : 'Search members'}>
    <div className="command-content">
      <div className="command-title"><strong>{renew ? 'Renew a membership' : 'Search members'}</strong><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20}/></button></div>
      <label className="command-input"><Search size={18}/><input autoFocus aria-label="Find a member" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, phone, email, or member ID" onKeyDown={event => {if (event.key === 'Enter' && matches[0]) onSelect(matches[0].id);}}/></label>
      <div className="command-results">
        {matches.map(member => <button key={member.id} onClick={() => onSelect(member.id)}><span className="mini-avatar">{initialName(member.name)}</span><span><strong>{member.name}</strong><small>{member.id} · {member.email}</small></span><ChevronRight size={16}/></button>)}
        {!matches.length && <p>No matching members.</p>}
      </div>
    </div>
  </dialog>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
