export type Payment = 'Paid' | 'Pending' | 'Partial'
export type Status = 'Active' | 'Expiring Soon' | 'Expired' | 'Deactivated' | 'Upcoming'

export interface Plan {
  id: string
  name: string
  months: number
  price: number
  description: string
  features: string[]
}

export interface HistoryEvent {
  type: 'created' | 'renewed' | 'expired' | 'deactivated' | 'reactivated'
  date: string
  planId?: string
  start?: string
  end?: string
  amount?: number
  payment?: Payment
  note?: string
}

export interface Member {
  id: string
  name: string
  phone: string
  email: string
  address: string
  dob?: string
  gender?: string
  weight: number
  bloodGroup: string
  emergency?: string
  planId: string
  start: string
  end: string
  amount: number
  payment: Payment
  notes?: string
  createdAt: string
  deactivatedAt?: string
  deactivationReason?: string
  history: HistoryEvent[]
}

export interface Settings {
  gymName: string
  logo: string
  phone: string
  email: string
  address: string
  ownerName: string
  ownerEmail: string
  profileImage: string
  currency: string
  warningDays: number
  expiryNotifications: boolean
  defaultPlanId: string
}

export interface AppState {
  members: Member[]
  plans: Plan[]
  settings: Settings
  readNotifications: string[]
}

export interface Notification {
  id: string
  title: string
  detail: string
  date: string
  kind: 'created' | 'renewed' | 'expired' | 'warning'
}

const DAY = 86_400_000
const gymClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const dateFormats = {
  medium: new Intl.DateTimeFormat('en-IN', {dateStyle: 'medium', timeZone: 'UTC'}),
  long: new Intl.DateTimeFormat('en-IN', {dateStyle: 'long', timeZone: 'UTC'}),
}

export function today(now = new Date()): string {
  const parts = Object.fromEntries(gymClock.formatToParts(now).map(({type, value}) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`)
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function addDays(value: string, days: number): string {
  const date = parseDate(value)
  if (!Number.isFinite(+date) || !Number.isInteger(days)) return ''
  date.setUTCDate(date.getUTCDate() + days)
  return dateKey(date)
}

export function addMonths(value: string, months: number): string {
  const date = parseDate(value)
  if (!Number.isFinite(+date) || !Number.isInteger(months)) return ''

  const originalDay = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months + 1, 0)
  date.setUTCDate(Math.min(originalDay, date.getUTCDate()))
  return dateKey(date)
}

export function daysBetween(start: string, end: string): number {
  return (+parseDate(end) - +parseDate(start)) / DAY
}

export function formatDate(value?: string, style: 'medium' | 'long' = 'medium'): string {
  if (!value) return '—'
  const date = parseDate(value)
  return Number.isFinite(+date) ? dateFormats[style].format(date) : '—'
}

const currencyFormats = new Map<string, Intl.NumberFormat>()

export function money(amount: number, currency = 'INR'): string {
  const code = currency.toUpperCase()
  let format = currencyFormats.get(code)
  if (!format) {
    try {
      format = new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    } catch {
      return money(amount, 'INR')
    }
    currencyFormats.set(code, format)
  }
  return format.format(amount)
}

function hasPriorCoverage(member: Member, date: string): boolean {
  const hasScheduledRenewal = member.history.some(event =>
    event.type === 'renewed' && event.start === member.start && event.end === member.end,
  )
  return hasScheduledRenewal && member.history.some(event =>
    (event.type === 'created' || event.type === 'renewed') &&
    event.start && event.end && event.start <= date && date <= event.end,
  )
}

export function statusOf(member: Member, warningDays = 7, reference = today()): Status {
  if (member.deactivatedAt) return 'Deactivated'
  if (member.end < reference) return 'Expired'
  if (member.start > reference && !hasPriorCoverage(member, reference)) return 'Upcoming'
  return daysBetween(reference, member.end) <= warningDays ? 'Expiring Soon' : 'Active'
}

export function renewalStart(member: Member, date = today()): string {
  return member.end > date ? member.end : date
}

export function historyOf(member: Member, reference = today()): HistoryEvent[] {
  const expiryRecorded = member.history.some(event => event.type === 'expired' && event.end === member.end)
  if (member.end >= reference || expiryRecorded || (member.deactivatedAt && member.deactivatedAt <= member.end)) {
    return member.history
  }

  const event: HistoryEvent = {
    type: 'expired',
    date: member.end,
    planId: member.planId,
    start: member.start,
    end: member.end,
    amount: member.amount,
    payment: member.payment,
  }
  return [...member.history, event].sort((first, second) => first.date.localeCompare(second.date))
}

export function makeEmpty(): AppState {
  return {
    plans: [
      {
        id: 'monthly',
        name: 'Monthly',
        months: 1,
        price: 1000,
        description: 'Flexible access for members building a routine.',
        features: ['Full gym access', 'Fitness assessment', 'Locker access'],
      },
      {
        id: 'quarterly',
        name: 'Quarterly',
        months: 3,
        price: 2500,
        description: 'Three months to build strength and keep your momentum.',
        features: ['Full gym access', 'Group classes', 'One training session'],
      },
      {
        id: 'half-yearly',
        name: 'Half Yearly',
        months: 6,
        price: 4500,
        description: 'Six months of training with regular progress support.',
        features: ['Full gym access', 'Group classes', 'Two training sessions'],
      },
      {
        id: 'yearly',
        name: 'Yearly',
        months: 12,
        price: 8000,
        description: 'A full year of training and the most support.',
        features: ['Full gym access', 'Group classes', 'Quarterly progress reviews'],
      },
    ],
    members: [],
    settings: {
      gymName: 'Ironclad Fitness',
      logo: '',
      phone: '',
      email: '',
      address: '',
      ownerName: 'Alex Morgan',
      ownerEmail: '',
      profileImage: '',
      currency: 'INR',
      warningDays: 7,
      expiryNotifications: true,
      defaultPlanId: 'monthly',
    },
    readNotifications: [],
  }
}

const firstNames = [
  'Aarav', 'Aditi', 'Ananya', 'Anika', 'Arjun', 'Dev', 'Diya', 'Ira',
  'Ishaan', 'Kabir', 'Kavya', 'Kiara', 'Maya', 'Meera', 'Nisha', 'Priya',
  'Rahul', 'Riya', 'Rohan', 'Saanvi', 'Samar', 'Sanaya', 'Tara', 'Vihaan',
]

const lastNames = [
  'Agarwal', 'Bansal', 'Bhat', 'Chatterjee', 'Das', 'Desai', 'Gupta', 'Iyer',
  'Jain', 'Kapoor', 'Khanna', 'Kulkarni', 'Malhotra', 'Mehta', 'Nair', 'Patel',
  'Rao', 'Reddy', 'Shah', 'Sharma', 'Singh', 'Varma',
]

const featuredExpirations = [
  {name: 'Arjun Mehta', days: 1, plan: 1},
  {name: 'Maya Sharma', days: 2, plan: 0},
  {name: 'Rohan Patel', days: 3, plan: 2},
  {name: 'Nisha Kapoor', days: 7, plan: 0},
]

const recentNames = ['Kiara Desai', 'Kabir Malhotra', 'Ananya Rao', 'Vihaan Shah', 'Tara Iyer']
const bloodGroups = ['O+', 'A+', 'B+', 'AB+', 'O−', 'A−', 'B−', 'AB−']

function seedPlan(plans: Plan[], index: number): Plan {
  const position = (index * 37) % 100
  if (position < 39) return plans[0]
  if (position < 67) return plans[1]
  if (position < 87) return plans[2]
  return plans[3]
}

function termEvent(member: Member, type: 'created' | 'renewed', date: string): HistoryEvent {
  return {
    type,
    date,
    planId: member.planId,
    start: member.start,
    end: member.end,
    amount: member.amount,
    payment: member.payment,
  }
}

function seedMember(index: number, plan: Plan, start: string, createdAt = start, named?: string): Member {
  const firstName = firstNames[index % firstNames.length]
  const familyNameIndex = Math.floor(index / firstNames.length) + index * 7
  const lastName = lastNames[familyNameIndex % lastNames.length]
  const name = named ?? `${firstName} ${lastName}`
  const email = `${name.toLowerCase().replaceAll(' ', '.')}.${index + 1}@example.com`
  const member: Member = {
    id: `GYM-${String(index + 1).padStart(4, '0')}`,
    name,
    phone: `+91 90000 ${String(10000 + index)}`,
    email,
    address: 'Mumbai, Maharashtra',
    weight: 54 + (index * 11) % 45,
    bloodGroup: bloodGroups[index % bloodGroups.length],
    planId: plan.id,
    start,
    end: addMonths(start, plan.months),
    amount: plan.price,
    payment: index % 31 === 24 ? 'Pending' : index % 29 === 19 ? 'Partial' : 'Paid',
    createdAt,
    history: [],
  }
  member.history.push(termEvent(member, 'created', createdAt))
  return member
}

function fitSeedTerm(state: AppState, candidate: Plan, end: string): Plan {
  return [candidate, ...state.plans].find(plan => addMonths(addMonths(end, -plan.months), plan.months) === end)
    ?? candidate
}

export function makeSeed(reference = today()): AppState {
  const state = makeEmpty()
  state.settings = {
    ...state.settings,
    phone: '+91 90000 00000',
    email: 'hello@ironclad.example.com',
    address: 'Mumbai, Maharashtra',
    ownerEmail: 'alex@ironclad.example.com',
  }

  const monthStart = `${reference.slice(0, 7)}-01`
  const dayOfMonth = Number(reference.slice(-2))
  const firstActiveMonth = addMonths(monthStart, -8)
  const olderActiveCounts = [66, 78, 94, 111, 123, 142, 155, 189]
  const addActive = (createdAt: string, name?: string) => {
    const index = state.members.length
    const plan = seedPlan(state.plans, index)
    const member = seedMember(index, plan, createdAt, createdAt, name)

    while (daysBetween(reference, member.end) <= state.settings.warningDays) {
      member.start = member.end
      member.end = addMonths(member.start, plan.months)
      const renewalDate = addDays(member.start, -state.settings.warningDays - 1)
      member.history.push(termEvent(member, 'renewed', renewalDate < member.createdAt ? member.createdAt : renewalDate))
    }
    state.members.push(member)
  }

  olderActiveCounts.forEach((count, monthIndex) => {
    const month = addMonths(firstActiveMonth, monthIndex)
    const days = daysBetween(month, addMonths(month, 1))
    for (let offset = 0; offset < count; offset += 1) {
      addActive(addDays(month, (offset * 13 + monthIndex * 3) % days))
    }
  })

  for (let index = 0; index < 128; index += 1) {
    const named = index >= 128 - recentNames.length ? recentNames[index - 128 + recentNames.length] : undefined
    addActive(addDays(monthStart, named ? dayOfMonth - 1 : (index * 7) % dayOfMonth), named)
  }

  for (let offset = 0; offset < 48; offset += 1) {
    const index = state.members.length
    const featured = featuredExpirations[offset]
    const end = addDays(reference, featured?.days ?? ((offset - 4) * 5) % 8)
    const candidate = featured ? state.plans[featured.plan] : seedPlan(state.plans, index)
    const plan = fitSeedTerm(state, candidate, end)
    const member = seedMember(index, plan, addMonths(end, -plan.months), undefined, featured?.name)
    state.members.push(member)
  }

  for (let offset = 0; offset < 96; offset += 1) {
    const index = state.members.length
    const end = addDays(reference, -(offset + 1))
    const plan = fitSeedTerm(state, seedPlan(state.plans, index), end)
    const member = seedMember(index, plan, addMonths(end, -plan.months))
    state.members.push(member)
  }

  for (let offset = 0; offset < 54; offset += 1) {
    const index = state.members.length
    const createdAt = addDays(reference, -(35 + offset * 3))
    const member = seedMember(index, seedPlan(state.plans, index), createdAt)
    member.deactivatedAt = addDays(createdAt, 14 + (offset * 3) % 12)
    member.deactivationReason = ['Relocated', 'Paused training', 'Schedule change'][offset % 3]
    member.history.push({
      type: 'deactivated',
      date: member.deactivatedAt,
      note: member.deactivationReason,
    })
    state.members.push(member)
  }

  return state
}

export function notifications(state: AppState, reference = today()): Notification[] {
  const entries: Notification[] = []
  const since = addDays(reference, -30)
  const warningDays = new Set([state.settings.warningDays, 7, 3, 1, 0])
  for (const member of state.members) {
    for (const event of member.history) {
      if (event.date < since || event.date > reference) continue
      if (event.type !== 'created' && event.type !== 'renewed') continue
      entries.push({
        id: `${member.id}-${event.type}-${event.start ?? event.date}`,
        title: event.type === 'created' ? 'New member added' : 'Membership renewed',
        detail: member.name,
        date: event.date,
        kind: event.type,
      })
    }
    if (!state.settings.expiryNotifications || member.deactivatedAt) continue

    const remaining = daysBetween(reference, member.end)
    if (statusOf(member, state.settings.warningDays, reference) === 'Upcoming') continue
    if (remaining < 0 && member.end >= since) {
      entries.push({
        id: `${member.id}-expired-${member.end}`,
        title: 'Membership expired',
        detail: `${member.name} · ${formatDate(member.end)}`,
        date: addDays(member.end, 1),
        kind: 'expired',
      })
    }
    if (remaining < 0) continue
    for (const warningDay of warningDays) {
      const warningDate = addDays(member.end, -warningDay)
      if (warningDate < since || warningDate < member.createdAt || warningDate > reference) continue
      entries.push({
        id: `${member.id}-warning-${member.end}-${warningDay}`,
        title: warningDay === 0 ? 'Membership expires today'
          : warningDay === 1 ? 'Membership expires tomorrow'
            : `Membership expires in ${warningDay} days`,
        detail: member.name,
        date: warningDate,
        kind: 'warning',
      })
    }
  }
  const priorities = {warning: 0, expired: 1, renewed: 2, created: 3}
  return entries.sort((a, b) => b.date.localeCompare(a.date) || priorities[a.kind] - priorities[b.kind]).slice(0, 40)
}
