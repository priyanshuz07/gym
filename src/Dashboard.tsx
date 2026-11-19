import { useMemo, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarClock, CalendarDays, ChevronDown, CircleAlert, Dumbbell,
  Plus, RefreshCw, UserCheck, UserPlus, Users, UserX } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AppState, Member } from './model';
import { addMonths, daysBetween, formatDate, statusOf } from './model';
import type { MemberAction } from './main';

type Destination = 'dashboard' | 'members' | 'active' | 'expiring' | 'expired' | 'deactivated' | 'reports' | 'plans';
type DashboardProps = {state: AppState; day: string; onNavigate: (page: Destination) => void; onAction: (action: MemberAction) => void};
const series = ['#c9f651', '#8bbb4f', '#58854b', '#435841', '#d9e9a3'];
const number = new Intl.NumberFormat('en-IN');
const monthText = new Intl.DateTimeFormat('en-IN', {month: 'short', timeZone: 'UTC'});
const heroDate = new Intl.DateTimeFormat('en-IN', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'});

function monthlyRows(members: Member[], day: string, months: number) {
  const first = day.slice(0, 7);
  return Array.from({length: months}, (_, index) => {
    const month = addMonths(first + '-01', index + 1 - months);
    const last = index === months - 1 ? day : addMonths(month, 1);
    return {
      month: monthText.format(new Date(month + 'T00:00:00Z')),
      total: members.filter(member => index === months - 1 ? member.createdAt <= last : member.createdAt < last).length,
      renewals: members.reduce((count, member) => count + member.history.filter(event => event.type === 'renewed' && event.date.startsWith(month.slice(0, 7))).length, 0)
    };
  });
}

function Card({label, value, caption, icon, tone, onClick}: {label: string; value: number; caption: ReactNode; icon: ReactNode; tone: string; onClick: () => void}) {
  function tilt(event: MouseEvent<HTMLButtonElement>) {
    const card = event.currentTarget;
    const bounds = card.getBoundingClientRect();
    card.style.setProperty('--x', ((event.clientX - bounds.left) / bounds.width - .5) * 7 + 'deg');
    card.style.setProperty('--y', ((event.clientY - bounds.top) / bounds.height - .5) * -7 + 'deg');
  }

  return <button className={'metric ' + tone} onMouseMove={tilt} onMouseLeave={event => {
    event.currentTarget.style.removeProperty('--x');
    event.currentTarget.style.removeProperty('--y');
  }} onClick={onClick}>
    <span className="metric-icon">{icon}</span>
    <span className="metric-label">{label}</span>
    <strong>{number.format(value)}</strong>
    <span className="metric-caption">{caption}</span>
  </button>;
}

function SectionTitle({title, description, right}: {title: string; description?: string; right?: ReactNode}) {
  return <div className="section-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{right}</div>;
}

function Person({member, index}: {member: Member; index: number}) {
  const initials = member.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join('');
  return <div className="dash-person"><span className={'person-avatar person-' + index % 4}>{initials}</span><div><strong>{member.name}</strong><small>{member.id}</small></div></div>;
}

function DateBadge({days}: {days: number}) {
  const tone = days <= 0 ? 'red' : days <= 2 ? 'orange' : days <= 7 ? 'amber' : 'green';
  return <span className={'date-badge ' + tone}>{days === 0 ? 'Today' : days === 1 ? '1 day left' : days + ' days left'}</span>;
}

export function Dashboard({state, day, onNavigate, onAction}: DashboardProps) {
  const [months, setMonths] = useState(6);
  const [graphMetric, setGraphMetric] = useState<'total' | 'renewals'>('total');
  const statuses = useMemo(() => state.members.map(member => ({member, status: statusOf(member, state.settings.warningDays, day)})), [state.members, state.settings.warningDays, day]);
  const currentMonth = day.slice(0, 7);
  const priorMonth = addMonths(day, -1).slice(0, 7);
  const newMembers = state.members.filter(member => member.createdAt.startsWith(currentMonth)).length;
  const previousMembers = state.members.filter(member => member.createdAt.startsWith(priorMonth)).length;
  const previousTotal = state.members.filter(member => member.createdAt < currentMonth + '-01').length;
  const growth = previousTotal ? ((state.members.length - previousTotal) / previousTotal) * 100 : 0;
  const addedGrowth = previousMembers ? ((newMembers - previousMembers) / previousMembers) * 100 : 0;
  const activeCount = statuses.filter(item => item.status === 'Active').length;
  const expiredCount = statuses.filter(item => item.status === 'Expired').length;
  const deactivatedCount = statuses.filter(item => item.status === 'Deactivated').length;
  const soon = statuses.filter(item => item.status === 'Expiring Soon').map(item => ({...item, days: daysBetween(day, item.member.end)}));
  const sortedSoon = [...soon].sort((a, b) => a.days - b.days);
  const recent = [...state.members].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const stats = monthlyRows(state.members, day, months);
  const planData = state.plans.map((plan, index) => ({
    name: plan.name,
    value: state.members.filter(member => member.planId === plan.id).length,
    color: series[index % series.length]
  })).filter(item => item.value > 0);
  const planName = (id: string) => state.plans.find(plan => plan.id === id)?.name || 'Unavailable';
  const firstName = (state.settings.ownerName || 'Owner').split(/\s+/)[0];
  const monthlyCaption = (value: number, comparable: boolean) => comparable
    ? <><span className={value < 0 ? 'trend down' : 'trend'}>{value < 0 ? <ArrowDownRight size={12}/> : <ArrowUpRight size={12}/>} {Math.abs(value).toFixed(1)}%</span><span>vs last month</span></>
    : 'This month';

  return <div className="dashboard">
    <section className="hero">
      <div className="hero-grid"/>
      <div className="hero-graphic" aria-hidden="true"><img src="/dumbbell.webp" alt="" fetchPriority="high"/></div>
      <div className="hero-orbit" aria-hidden="true"/>
      <div className="hero-content">
        <div className="hero-date"><CalendarDays size={15}/>{heroDate.format(new Date(day + 'T00:00:00Z'))}</div>
        <h1>Welcome back, <span>{firstName}.</span></h1>
        <p>{soon.length ? <>{number.format(soon.length)} memberships expire in the next {state.settings.warningDays} days.</> : 'Your membership and gym activity at a glance.'}</p>
        <div className="hero-actions">
          <button className="btn primary" onClick={() => onAction({type: 'add'})}><Plus size={18}/> Add member</button>
          <button className="btn hero-secondary" onClick={() => onNavigate('members')}><Users size={17}/> View members</button>
        </div>
      </div>
    </section>

    <section className="dash-section" aria-label="Membership overview">
      <SectionTitle title="Membership overview" right={<span className="section live"><i/> Live overview</span>}/>
      <div className="metrics">
        <Card label="Total Members" value={state.members.length} caption={monthlyCaption(growth, previousTotal > 0)} icon={<Users size={19}/>} tone="metric-lime" onClick={() => onNavigate('members')}/>
        <Card label="Active Members" value={activeCount} caption={<><span>{state.members.length ? Math.round(activeCount / state.members.length * 100) : 0}%</span> of all members</>} icon={<UserCheck size={19}/>} tone="metric-green" onClick={() => onNavigate('active')}/>
        <Card label="Expiring Soon" value={soon.length} caption={'Next ' + state.settings.warningDays + ' days'} icon={<CalendarClock size={19}/>} tone="metric-amber" onClick={() => onNavigate('expiring')}/>
        <Card label="Expired Members" value={expiredCount} caption="Past end date" icon={<CircleAlert size={19}/>} tone="metric-red" onClick={() => onNavigate('expired')}/>
        <Card label="Deactivated" value={deactivatedCount} caption="Access paused" icon={<UserX size={19}/>} tone="metric-purple" onClick={() => onNavigate('deactivated')}/>
        <Card label="New This Month" value={newMembers} caption={monthlyCaption(addedGrowth, previousMembers > 0)} icon={<UserPlus size={19}/>} tone="metric-teal" onClick={() => onNavigate('reports')}/>
      </div>
    </section>

    <section className="dashboard-insights" aria-label="Membership analytics">
      <article className="dash-panel activity-panel">
        <SectionTitle title="Membership activity" description="Track how your membership base is changing" right={
          <label className="chart-select"><span className="sr-only">Chart period</span><CalendarDays size={15}/><select value={months} onChange={event => setMonths(Number(event.target.value))}><option value={3}>Last 3 months</option><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option></select><ChevronDown size={14}/></label>
        }/>
        <div className="chart-key" aria-label="Activity metric">
          <button className={graphMetric === 'total' ? 'current' : ''} onClick={() => setGraphMetric('total')} aria-pressed={graphMetric === 'total'}><i/> Total members</button>
          <button className={graphMetric === 'renewals' ? 'current' : ''} onClick={() => setGraphMetric('renewals')} aria-pressed={graphMetric === 'renewals'}><i/> Renewals</button>
        </div>
        <div className="activity-chart" aria-label={graphMetric === 'total' ? 'Monthly total members chart' : 'Monthly renewals chart'}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={stats} margin={{left: 2, right: 18, top: 12, bottom: 1}}>
              <defs><linearGradient id="iron-activity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c8fa4d" stopOpacity={.30}/><stop offset="100%" stopColor="#c8fa4d" stopOpacity={.015}/></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#353b31" strokeDasharray="3 5"/>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#a5aaa0', fontSize: 12}} tickMargin={11}/>
              <YAxis axisLine={false} tickLine={false} width={39} tickCount={5} allowDecimals={false} tick={{fill: '#a5aaa0', fontSize: 12}} tickFormatter={value => value >= 1000 ? (value / 1000) + 'k' : value}/>
              <Tooltip formatter={value => [number.format(Number(value)), graphMetric === 'total' ? 'Members' : 'Renewals']} cursor={{stroke: '#748b4f', strokeDasharray: '4 4'}} contentStyle={{background: '#242923', border: '1px solid #3e4937', borderRadius: 10, color: '#f2f4ee'}}/>
              <Area type="monotone" dataKey={graphMetric} stroke="#c8fa4d" strokeWidth={2.5} fill="url(#iron-activity-fill)" dot={false} activeDot={{r: 5, stroke: '#26321b', strokeWidth: 2, fill: '#c8fa4d'}} animationDuration={650}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>
      <article className="dash-panel plan-panel">
        <SectionTitle title="Plan distribution" description="Members by membership plan"/>
        {planData.length ? <>
          <div className="donut" aria-label="Membership plan distribution chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie data={planData} dataKey="value" nameKey="name" innerRadius={47} outerRadius={67} paddingAngle={4} cornerRadius={4} stroke="none" animationDuration={700}>
                  {planData.map(item => <Cell key={item.name} fill={item.color}/>)}
                </Pie>
                <Tooltip formatter={value => [number.format(Number(value)), 'Members']} contentStyle={{background: '#242923', border: '1px solid #3e4937', borderRadius: 10, color: '#f2f4ee'}}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center"><strong>{number.format(state.members.length)}</strong><small>Members</small></div>
          </div>
          <div className="plan-key">{planData.map(item => <div key={item.name}><i style={{background: item.color}}/><span>{item.name}</span><strong>{Math.round(item.value / state.members.length * 100)}%</strong></div>)}</div>
        </> : <div className="dash-empty"><Dumbbell size={25}/><p>Plan data appears as members join.</p><button className="text-button" onClick={() => onNavigate('plans')}>View plans</button></div>}
      </article>
    </section>

    <section className="dashboard-insights dashboard-lists">
      <article className="dash-panel">
        <SectionTitle title="Memberships ending soon" description={'Next ' + state.settings.warningDays + ' days'} right={<button className="btn btn-small secondary" onClick={() => onNavigate('expiring')}>View all</button>}/>
        <div className="dash-list">{sortedSoon.slice(0, 4).map(({member, days}, index) => <div className="dash-row" key={member.id}>
          <button className="person-button" onClick={() => onAction({type: 'view', memberId: member.id})}><Person member={member} index={index}/></button>
          <span className="dash-row-plan">{planName(member.planId)}</span><DateBadge days={days}/>
        </div>)}
        {!sortedSoon.length && <div className="dash-empty"><CalendarClock size={25}/><p>No memberships are ending soon.</p></div>}</div>
      </article>
      <article className="dash-panel">
        <SectionTitle title="Recently added" description="New members in your gym" right={<button className="btn btn-small secondary" onClick={() => onNavigate('members')}>View all</button>}/>
        <div className="dash-list">{recent.map((member, index) => <div className="dash-row" key={member.id}>
          <button className="person-button" onClick={() => onAction({type: 'view', memberId: member.id})}><Person member={member} index={index}/></button><small>{formatDate(member.createdAt)}</small>
        </div>)}
        {!recent.length && <div className="dash-empty"><Users size={25}/><p>Your first member will appear here.</p><button className="text-button" onClick={() => onAction({type: 'add'})}>Add member</button></div>}</div>
      </article>
    </section>

    <section className="dash-section quick-section">
      <SectionTitle title="Quick actions"/>
      <div className="quick-links">
        <button className="btn secondary" onClick={() => onAction({type: 'add'})}><UserPlus size={17}/> Add member</button>
        <button className="btn secondary" onClick={() => onNavigate('members')}><Users size={17}/> All members</button>
        <button className="btn secondary" onClick={() => onAction({type: 'renew'})}><RefreshCw size={17}/> Renew membership</button>
        <button className="btn secondary" onClick={() => onNavigate('expiring')}><CalendarClock size={17}/> View expiring memberships</button>
      </div>
    </section>
  </div>;
}
