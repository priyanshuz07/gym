import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { CalendarRange, Check, CircleDollarSign, Clock, Dumbbell, Gem, Layers3, LockKeyhole, Plus, RotateCw, Settings as SettingsIcon, Shield, Trash2, UserRound, UsersRound, X, Zap } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, addMonths, daysBetween, formatDate, money, statusOf, today } from './model'
import type { AppState, HistoryEvent, Member, Plan } from './model'
import './secondary.css'

type CommitProps = { state: AppState; onCommit: (next: AppState, message: string) => void | Promise<void> }
type AccountChange = { currentPassword: string; password?: string; email?: string }

const planIcons = [Zap, Layers3, Shield, Gem]
const blankPlan: Plan = { id: '', name: '', months: 1, price: 0, description: '', features: [] }
const chartColors = ['#c8fa4d', '#839bfb', '#70d5ae', '#f3af66', '#c38cee', '#fb92a3']
const gridColor = '#30352e'
const tickProps = { fill: '#a3ab9f', fontSize: 12 }
const tooltipStyle = { background: '#222720', border: '1px solid #3b4636', borderRadius: 9, color: '#f5f6f0' }

function SecondaryHeading({ title, caption, children }: { title: string; caption: string; children?: ReactNode }) {
  return <header className="secondary-heading"><div><h1>{title}</h1><p>{caption}</p></div>{children}</header>
}

function Dialog({ title, text, children, close }: { title: string; text: string; children: ReactNode; close: () => void }) {
  const label = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return <dialog className="secondary-overlay secondary-page" ref={dialogRef} aria-labelledby={label} onCancel={(event) => { event.preventDefault(); close() }} onClick={(event) => { if (event.target === event.currentTarget) close() }}>
    <section className="secondary-panel secondary-dialog">
      <header className="secondary-panel-header">
        <div><h2 id={label}>{title}</h2><p>{text}</p></div>
        <button className="secondary-x" onClick={close} aria-label="Close dialog" type="button"><X size={19} /></button>
      </header>
      {children}
    </section>
  </dialog>
}

function PlanEditor({ plan, busy, close, save }: { plan: Plan; busy: boolean; close: () => void; save: (plan: Plan) => Promise<void> }) {
  const [draft, setDraft] = useState(plan)
  const [features, setFeatures] = useState(plan.features.join('\n'))
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!draft.name.trim()) {
      setError('Enter a plan name.')
      return
    }
    const lines = features.split('\n').map((feature) => feature.trim()).filter(Boolean)
    if (lines.length > 100 || lines.some((line) => line.length > 260)) {
      setError('Enter up to 100 features with 260 characters per line.')
      return
    }
    try {
      await save({ ...draft, name: draft.name.trim(), description: draft.description.trim(), features: lines })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The plan could not be saved.')
    }
  }

  return <Dialog title={plan.id ? 'Edit membership plan' : 'Add membership plan'} text="Set the price, duration, and benefits members receive." close={close}>
    <form onSubmit={submit}>
      <div className="secondary-field-grid">
        <label className="secondary-field wide">Plan name *<input value={draft.name} maxLength={65} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Quarterly" autoFocus /></label>
        <label className="secondary-field">Duration in months *<input type="number" min="1" max="120" step="1" required value={Number.isFinite(draft.months) ? draft.months : ''} onChange={(event) => setDraft({ ...draft, months: event.target.valueAsNumber })} /></label>
        <label className="secondary-field">Price *<input type="number" min="0" max="999999999" step="0.01" required value={Number.isFinite(draft.price) ? draft.price : ''} onChange={(event) => setDraft({ ...draft, price: event.target.valueAsNumber })} /></label>
        <label className="secondary-field wide">Description<textarea maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Who is this plan for?" /></label>
        <label className="secondary-field wide">Plan features<small>Enter one feature per line.</small><textarea maxLength={1600} value={features} onChange={(event) => setFeatures(event.target.value)} placeholder="Unlimited gym access" /></label>
      </div>
      {error && <p className="secondary-form-error" role="alert">{error}</p>}
      <div className="secondary-action-row"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="secondary-button primary" disabled={busy}>{busy ? 'Saving…' : 'Save plan'}</button></div>
    </form>
  </Dialog>
}

export function PlansPage({ state, onCommit }: CommitProps) {
  const [editing, setEditing] = useState<Plan | null>(null)
  const [deleting, setDeleting] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const planInUse = deleting && state.members.some((member) => member.planId === deleting.id || member.history.some((event) => event.planId === deleting.id))

  async function save(plan: Plan) {
    if (state.plans.some((existing) => existing.id !== plan.id && existing.name.toLowerCase() === plan.name.toLowerCase())) throw new Error('A plan with this name already exists.')
    const updated = plan.id ? plan : { ...plan, id: crypto.randomUUID() }
    const plans = plan.id ? state.plans.map((existing) => existing.id === plan.id ? updated : existing) : [...state.plans, updated]
    setBusy(true)
    try {
      await onCommit({ ...state, plans }, plan.id ? 'Membership plan updated.' : 'Membership plan added.')
      setEditing(null)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!deleting || planInUse) return
    const plans = state.plans.filter((plan) => plan.id !== deleting.id)
    const defaultPlanId = state.settings.defaultPlanId === deleting.id ? plans[0]?.id ?? '' : state.settings.defaultPlanId
    setBusy(true)
    try {
      await onCommit({ ...state, plans, settings: { ...state.settings, defaultPlanId } }, 'Membership plan deleted.')
      setDeleting(null)
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'The plan could not be deleted.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="secondary-page">
    <SecondaryHeading title="Membership Plans" caption="Set up the pricing, duration, and benefits available to your members.">
      <button className="secondary-button primary" onClick={() => setEditing(blankPlan)}><Plus size={17} /> Add plan</button>
    </SecondaryHeading>
    <div className="secondary-plan-grid">
      {state.plans.map((plan, index) => {
        const Icon = planIcons[index % planIcons.length]
        return <article key={plan.id} className="secondary-panel secondary-plan">
          <span className="secondary-icon"><Icon /></span>
          <h2>{plan.name}</h2>
          <h3>{money(plan.price, state.settings.currency)} <span>/ {plan.months} {plan.months === 1 ? 'month' : 'months'}</span></h3>
          {plan.description && <p>{plan.description}</p>}
          {plan.features.length > 0 && <ul>{plan.features.map((feature, position) => <li key={`${feature}-${position}`}><Check size={15} /> {feature}</li>)}</ul>}
          <footer><button className="secondary-button" onClick={() => setEditing(plan)}>Edit plan</button><button className="secondary-button secondary-delete" aria-label={`Delete ${plan.name} plan`} onClick={() => { setDeleting(plan); setDeleteError('') }}><Trash2 size={16} /></button></footer>
        </article>
      })}
      {state.plans.length === 0 && <div className="secondary-panel secondary-empty"><span className="secondary-icon"><Layers3 /></span><h2>No membership plans</h2><p>Add a plan to start enrolling members.</p><button className="secondary-button primary" onClick={() => setEditing(blankPlan)}><Plus size={17} /> Add plan</button></div>}
    </div>
    {editing && <PlanEditor plan={editing} busy={busy} close={() => { if (!busy) setEditing(null) }} save={save} />}
    {deleting && <Dialog title={`Delete ${deleting.name}?`} text={planInUse ? 'Member records reference this plan. Those records need it to display their membership history.' : 'This permanently removes the plan from your gym.'} close={() => { if (!busy) setDeleting(null) }}>
      {deleteError && <p className="secondary-form-error" role="alert">{deleteError}</p>}
      <div className="secondary-action-row"><button className="secondary-button" onClick={() => setDeleting(null)}>{planInUse ? 'Close' : 'Cancel'}</button>{!planInUse && <button className="secondary-button danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete plan'}</button>}</div>
    </Dialog>}
  </div>
}

const periods = ['Today', 'This Week', 'This Month', 'Last Month', 'This Year', 'Custom Date Range'] as const
type Period = typeof periods[number]

function reportRange(period: Period, date: string, start: string, end: string): [string, string] {
  const monthStart = `${date.slice(0, 7)}-01`
  switch (period) {
    case 'Today': return [date, date]
    case 'This Week': return [addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7)), date]
    case 'This Month': return [monthStart, date]
    case 'Last Month': return [addMonths(monthStart, -1), addDays(monthStart, -1)]
    case 'This Year': return [`${date.slice(0, 4)}-01-01`, date]
    case 'Custom Date Range': return [start, end]
  }
}

function reportBuckets(start: string, end: string) {
  const span = daysBetween(start, end) + 1
  if (!Number.isFinite(span) || span < 1) return []
  if (span > 60) {
    const months = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1
    const step = Math.max(1, Math.ceil(months / 12))
    const monthLabel = new Intl.DateTimeFormat('en', { month: 'short', year: span > 366 ? '2-digit' : undefined, timeZone: 'UTC' })
    return Array.from({ length: Math.ceil(months / step) }, (_, index) => {
      const month = addMonths(`${start.slice(0, 7)}-01`, index * step)
      const lastDay = addDays(addMonths(month, step), -1)
      return {
        from: month < start ? start : month,
        to: lastDay > end ? end : lastDay,
        date: monthLabel.format(new Date(`${month}T00:00:00Z`)),
      }
    })
  }
  const steps = span <= 14 ? span : Math.min(12, Math.ceil(span / 7))
  const label = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return Array.from({ length: steps }, (_, index) => {
    const from = addDays(start, Math.floor(index * span / steps))
    const to = addDays(start, Math.floor((index + 1) * span / steps) - 1)
    return { from, to, date: label.format(new Date(`${from}T00:00:00Z`)) }
  })
}

function membershipTerms(member: Member): HistoryEvent[] {
  const history = member.history.filter((event) => (event.type === 'created' || event.type === 'renewed') && event.end)
  if (history.length > 0) return [...history].sort((a, b) => (a.start ?? a.date).localeCompare(b.start ?? b.date))
  return [{ type: 'created', date: member.createdAt, planId: member.planId, start: member.start, end: member.end, payment: member.payment, amount: member.amount }]
}

function deactivatedAtDate(member: Member, date: string) {
  const change = member.history.filter((event) => (event.type === 'deactivated' || event.type === 'reactivated') && event.date.slice(0, 10) <= date).at(-1)
  if (change) return change.type === 'deactivated'
  return Boolean(member.deactivatedAt && member.deactivatedAt.slice(0, 10) <= date)
}

function expiryDates(member: Member, terms: HistoryEvent[]) {
  const dates = new Set<string>()
  terms.forEach((term, index) => {
    if (!term.end) return
    const expiry = addDays(term.end, 1)
    const next = terms[index + 1]
    if (next && (next.start ?? next.date).slice(0, 10) <= expiry && next.date.slice(0, 10) <= expiry) return
    if (deactivatedAtDate(member, term.end)) return
    dates.add(expiry)
  })
  for (const event of member.history) {
    if (event.type === 'expired') dates.add(event.end ? addDays(event.end, 1) : event.date.slice(0, 10))
  }
  return Array.from(dates)
}

function membershipAt(member: Member, date: string, currentDate: string, warningDays: number) {
  if (!date || member.createdAt.slice(0, 10) > date) return null
  if (date === currentDate) return { planId: member.planId, active: ['Active', 'Expiring Soon'].includes(statusOf(member, warningDays, date)) }
  const terms = membershipTerms(member).filter((term) => term.date.slice(0, 10) <= date)
  const coverage = terms.filter((term) => term.start && term.end && term.start <= date && date <= term.end).at(-1)
  return { planId: coverage?.planId ?? terms.at(-1)?.planId ?? member.planId, active: Boolean(coverage && !deactivatedAtDate(member, date)) }
}

function MemberActivityChart({ state, start, end }: { state: AppState; start: string; end: string }) {
  const series = useMemo(() => {
    if (!start || !end || start > end) return []
    const members = state.members.map((member) => {
      const terms = membershipTerms(member)
      return { createdAt: member.createdAt.slice(0, 10), terms, expiry: expiryDates(member, terms) }
    })
    return reportBuckets(start, end).map((bucket) => {
      const includes = (date: string) => date.slice(0, 10) >= bucket.from && date.slice(0, 10) <= bucket.to
      const terms = members.flatMap((member) => member.terms.filter((term) => includes(term.date)))
      return {
        date: bucket.date,
        total: members.filter((member) => member.createdAt <= bucket.to).length,
        joined: members.filter((member) => includes(member.createdAt)).length,
        renewals: terms.filter((term) => term.type === 'renewed').length,
        expirations: members.reduce((count, member) => count + member.expiry.filter(includes).length, 0),
        revenue: terms.filter((term) => term.payment === 'Paid').reduce((amount, term) => amount + (term.amount ?? 0), 0),
      }
    })
  }, [end, start, state.members])
  const connected = series.length > 0
  const joined = series.reduce((sum, point) => sum + point.joined, 0)
  const renewals = series.reduce((sum, point) => sum + point.renewals, 0)
  const expirations = series.reduce((sum, point) => sum + point.expirations, 0)
  const revenue = series.reduce((sum, point) => sum + point.revenue, 0)
  const metrics = [{ label: 'New members', value: joined, icon: UsersRound }, { label: 'Renewals', value: renewals, icon: RotateCw }, { label: 'Expirations', value: expirations, icon: Clock }, { label: 'Recorded revenue', value: money(revenue, state.settings.currency), icon: CircleDollarSign }]

  return <>
    <div className="secondary-report-metrics">
      {metrics.map(({ label, value, icon: Icon }) => <article key={label} className="secondary-panel secondary-report-metric">
        <span className="secondary-icon"><Icon /></span>
        <strong>{connected ? value : '—'}</strong>
        <span>{label}</span>
      </article>)}
    </div>
    <div className="secondary-grid">
      <ChartPanel title="Total member growth" caption="Cumulative members by joining date" wide>
        {connected ? <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 6, right: 13, left: -13, bottom: 0 }}>
            <defs>
              <linearGradient id="secondary-growth" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={chartColors[0]} stopOpacity={.32} />
                <stop offset="100%" stopColor={chartColors[0]} stopOpacity={.015} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={gridColor} />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={tickProps} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={tickProps} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: chartColors[0] }} />
            <Area dataKey="total" name="Members" type="monotone" stroke={chartColors[0]} strokeWidth={2.5} fill="url(#secondary-growth)" dot={series.length === 1} />
          </AreaChart>
        </ResponsiveContainer> : <ChartEmpty />}
      </ChartPanel>
      <ChartPanel title="Membership activity" caption="New members, renewals, and expirations" legend={[['New members', chartColors[0]], ['Renewals', chartColors[1]], ['Expirations', chartColors[3]]]}>
        {connected ? <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 6, right: 5, left: -17, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={gridColor} />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={tickProps} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={tickProps} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff0d' }} />
            <Bar dataKey="joined" name="New members" fill={chartColors[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="renewals" name="Renewals" fill={chartColors[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expirations" name="Expirations" fill={chartColors[3]} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer> : <ChartEmpty />}
      </ChartPanel>
      <ChartPanel title="Revenue" caption="Fully paid membership terms recorded during the selected period">
        {connected ? <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 6, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={gridColor} />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={tickProps} />
            <YAxis axisLine={false} tickLine={false} tick={tickProps} tickFormatter={(value) => new Intl.NumberFormat('en', { notation: 'compact' }).format(value)} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff0d' }} formatter={(value) => money(Number(value), state.settings.currency)} />
            <Bar dataKey="revenue" name="Revenue" fill={chartColors[2]} radius={[5, 5, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer> : <ChartEmpty />}
      </ChartPanel>
    </div>
  </>
}

function ChartEmpty({ text = 'Choose a valid date range to view this report.' }: { text?: string }) {
  return <div className="secondary-plot-empty">{text}</div>
}

function ChartPanel({ title, caption, wide = false, legend, children }: { title: string; caption: string; wide?: boolean; legend?: [string, string][]; children: ReactNode }) {
  return <article className={`secondary-panel${wide ? ' secondary-chart-wide' : ''}`}>
    <header className="secondary-panel-header"><div><h2>{title}</h2><p>{caption}</p></div></header>
    <div className="secondary-plot">{children}</div>
    {legend && <div className="secondary-chart-key">{legend.map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div>}
  </article>
}

function DistributionPie({ data, title, caption }: { data: { name: string; value: number; color: string }[]; title: string; caption: string }) {
  const populated = data.filter((item) => item.value > 0)
  return <ChartPanel title={title} caption={caption} legend={data.map((item) => [`${item.name} (${item.value})`, item.color])}>
    {populated.length ? <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={populated} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="77%" paddingAngle={3} stroke="none">
          {populated.map((item) => <Cell key={item.name} fill={item.color} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#f5f6f0' }} />
      </PieChart>
    </ResponsiveContainer> : <ChartEmpty text="No memberships to chart yet." />}
  </ChartPanel>
}

export function ReportsPage({ state }: { state: AppState }) {
  const now = today()
  const [period, setPeriod] = useState<Period>('This Month')
  const [customStart, setCustomStart] = useState(`${now.slice(0, 7)}-01`)
  const [customEnd, setCustomEnd] = useState(now)
  const [start, end] = reportRange(period, now, customStart, customEnd)
  const records = start && end && start <= end && end <= now ? state.members.flatMap((member) => membershipAt(member, end, now, state.settings.warningDays) ?? []) : []
  const activeCount = records.filter(({ active }) => active).length
  const coverage = [{ name: 'Active', value: activeCount, color: chartColors[0] }, { name: 'Inactive or upcoming', value: records.length - activeCount, color: '#586453' }]
  const distribution = state.plans.map((plan, index) => ({ name: plan.name, value: records.filter((member) => member.planId === plan.id).length, color: chartColors[index % chartColors.length] }))
  const snapshot = end ? `Membership records on ${formatDate(end)}` : 'Membership snapshot at the end of the report period'

  return <div className="secondary-page">
    <SecondaryHeading title="Reports & Analytics" caption="Track membership growth, renewals, expirations, and revenue." />
    <div className="secondary-panel secondary-report-filters">
      <span className="secondary-icon"><CalendarRange /></span>
      <label className="secondary-field">Report period<select className="secondary-period" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>{periods.map((option) => <option key={option}>{option}</option>)}</select></label>
      {period === 'Custom Date Range' && <>
        <label className="secondary-field">Start date<input type="date" max={customEnd} value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
        <label className="secondary-field">End date<input type="date" min={customStart} max={now} value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
      </>}
    </div>
    <MemberActivityChart state={state} start={start} end={end <= now ? end : ''} />
    <div className="secondary-grid">
      <DistributionPie data={coverage} title="Active vs. inactive members" caption={snapshot} />
      <DistributionPie data={distribution} title="Membership plan distribution" caption={snapshot} />
    </div>
  </div>
}

function ImageField({ label, value, onChange, onError }: { label: string; value: string; onChange: (value: string) => void; onError: (message: string) => void }) {
  const fieldId = useId()
  return <div className="secondary-image-field">
    {value ? <img src={value} alt={label} /> : <span className="secondary-icon"><UserRound /></span>}
    <div className="secondary-file-picker">
      <input id={fieldId} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 500_000) {
          onError('Choose a PNG, JPEG, or WebP image under 500 KB.')
          return
        }
        const reader = new FileReader()
        reader.onerror = () => onError('This image could not be opened.')
        reader.onload = () => { onError(''); onChange(String(reader.result)) }
        reader.readAsDataURL(file)
      }} />
      <label className="secondary-button" htmlFor={fieldId}>{value ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}</label>
      {value && <button type="button" className="secondary-remove-image" onClick={() => onChange('')}>Remove</button>}
    </div>
  </div>
}

export function SettingsPage({ state, onCommit, onAccount, demo = false }: CommitProps & { onAccount: (data: AccountChange) => Promise<void>; demo?: boolean }) {
  const [draft, setDraft] = useState(state.settings)
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loginEmail, setLoginEmail] = useState(state.settings.ownerEmail)
  const changeLogin = !demo && (draft.ownerEmail.trim().toLowerCase() !== loginEmail || Boolean(password))
  const currencies = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED', 'SGD', 'JPY']

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaved(false)
    if (!draft.gymName.trim() || !draft.ownerName.trim()) {
      setError('Enter both the gym name and owner name.')
      return
    }
    if (draft.phone && !/^\+?(?:[ ().-]*\d){7,15}$/.test(draft.phone.trim())) {
      setError('Enter a valid gym phone number with 7 to 15 digits.')
      return
    }
    if (password !== confirmation) {
      setError('The new password and confirmation must match.')
      return
    }
    const settings = { ...draft, gymName: draft.gymName.trim(), ownerName: draft.ownerName.trim(), ownerEmail: draft.ownerEmail.trim().toLowerCase(), email: draft.email.trim(), phone: draft.phone.trim(), address: draft.address.trim() }
    setBusy(true)
    let accountUpdated = false
    try {
      if (changeLogin) {
        await onAccount({ currentPassword, ...(password ? { password } : {}), ...(settings.ownerEmail !== loginEmail ? { email: settings.ownerEmail } : {}) })
        setLoginEmail(settings.ownerEmail)
        setCurrentPassword('')
        setPassword('')
        setConfirmation('')
        accountUpdated = true
      }
      await onCommit({ ...state, settings }, 'Settings saved.')
      setSaved(true)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Settings could not be saved.'
      setError(accountUpdated ? `Login credentials were updated. ${message}` : message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="secondary-page secondary-settings">
    <SecondaryHeading title="Settings" caption="Manage your gym, membership defaults, and owner account." />
    <form className="secondary-page" onSubmit={submit}>
      <div className="secondary-grid secondary-settings-grid">
        <section className="secondary-panel">
          <div className="secondary-panel-header"><span className="secondary-icon"><Dumbbell /></span><div><h2>Gym information</h2><p>Branding and contact details</p></div></div>
          <div className="secondary-field-grid">
            <ImageField label="Gym logo" value={draft.logo} onChange={(logo) => setDraft((current) => ({ ...current, logo }))} onError={setError} />
            <label className="secondary-field wide">Gym name *<input value={draft.gymName} maxLength={80} required onChange={(event) => setDraft({ ...draft, gymName: event.target.value })} /></label>
            <label className="secondary-field">Phone number<input type="tel" value={draft.phone} maxLength={28} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
            <label className="secondary-field">Gym email<input type="email" value={draft.email} maxLength={254} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
            <label className="secondary-field wide">Address<textarea rows={2} value={draft.address} maxLength={500} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
          </div>
        </section>
        <section className="secondary-panel">
          <div className="secondary-panel-header"><span className="secondary-icon"><SettingsIcon /></span><div><h2>Membership settings</h2><p>Plan defaults and expiry alerts</p></div></div>
          <div className="secondary-field-grid">
            <label className="secondary-field wide">Default membership plan<select value={draft.defaultPlanId} onChange={(event) => setDraft({ ...draft, defaultPlanId: event.target.value })}><option value="">Select when enrolling</option>{state.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
            <label className="secondary-field">Expiry warning days *<input type="number" min="1" max="90" step="1" required value={Number.isFinite(draft.warningDays) ? draft.warningDays : ''} onChange={(event) => setDraft({ ...draft, warningDays: event.target.valueAsNumber })} /></label>
            <label className="secondary-field">Currency<select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })}>{Array.from(new Set([...currencies, draft.currency])).map((currency) => <option key={currency}>{currency}</option>)}</select></label>
            <label className="secondary-check-field"><input type="checkbox" checked={draft.expiryNotifications} onChange={(event) => setDraft({ ...draft, expiryNotifications: event.target.checked })} /> Show membership expiry notifications</label>
          </div>
        </section>
        <section className="secondary-panel">
          <div className="secondary-panel-header"><span className="secondary-icon"><UserRound /></span><div><h2>Owner profile</h2><p>Your name, email, and profile image</p></div></div>
          <div className="secondary-field-grid">
            <ImageField label="Profile image" value={draft.profileImage} onChange={(profileImage) => setDraft((current) => ({ ...current, profileImage }))} onError={setError} />
            <label className="secondary-field">Owner name *<input required value={draft.ownerName} maxLength={100} autoComplete="name" onChange={(event) => setDraft({ ...draft, ownerName: event.target.value })} /></label>
            <label className="secondary-field">Owner email *<input required type="email" value={draft.ownerEmail} maxLength={254} autoComplete="email" onChange={(event) => setDraft({ ...draft, ownerEmail: event.target.value })} /></label>
          </div>
        </section>
        <section className="secondary-panel">
          <div className="secondary-panel-header"><span className="secondary-icon"><LockKeyhole /></span><div><h2>Password</h2><p>{demo ? 'Password changes are available with your gym owner account.' : 'Enter your current password to change your password or login email.'}</p></div></div>
          {!demo && <div className="secondary-field-grid">
            <label className="secondary-field wide">Current password{changeLogin ? ' *' : ''}<input type="password" autoComplete="current-password" required={changeLogin} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
            <label className="secondary-field">New password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <label className="secondary-field">Confirm new password<input type="password" autoComplete="new-password" required={Boolean(password)} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          </div>}
        </section>
      </div>
      {error && <p className="secondary-form-error" role="alert">{error}</p>}
      <div className="secondary-settings-save">
        <button className="secondary-button primary" disabled={busy}>{busy ? 'Saving…' : saved ? <><Check size={17} /> Save changes</> : 'Save changes'}</button>
      </div>
    </form>
  </div>
}
