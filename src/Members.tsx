import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft, ChevronRight, CirclePause, CirclePlay, Eye, ListFilter,
  MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2, UserRound, UsersRound, X,
} from "lucide-react";
import {
  addMonths, daysBetween, formatDate, historyOf, money, renewalStart, statusOf, today,
  type AppState, type HistoryEvent, type Member, type Payment, type Plan, type Status,
} from "./model";
import "./members.css";

export type MemberView = "members" | "active" | "expiring" | "expired" | "deactivated";
export type MemberAction = {
  type: "add" | "edit" | "view" | "renew" | "deactivate" | "reactivate" | "delete";
  memberId?: string;
};

type OpenAction = (action: MemberAction) => void;

const viewDetails: Record<MemberView, { title: string; description: string }> = {
  members: { title: "Members", description: "Search and manage all of your gym’s members." },
  active: { title: "Active Members", description: "Members with current gym access, including memberships ending soon." },
  expiring: { title: "Memberships Expiring Soon", description: "Review upcoming expiry dates and renew memberships before access ends." },
  expired: { title: "Expired Members", description: "Review past memberships and bring members back with a renewal." },
  deactivated: { title: "Deactivated Members", description: "Review deactivated records and restore access when needed." },
};

const statusClasses: Record<Status, string> = {
  Active: "active",
  "Expiring Soon": "expiring",
  Expired: "expired",
  Deactivated: "deactivated",
  Upcoming: "upcoming",
};

const paymentOptions: Payment[] = ["Paid", "Pending", "Partial"];
const statuses: Status[] = ["Active", "Expiring Soon", "Expired", "Deactivated", "Upcoming"];
const pageSize = 10;

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function planName(plans: Plan[], id: string) {
  return plans.find((plan) => plan.id === id)?.name ?? "Plan unavailable";
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return <span className={`member-avatar${large ? " member-avatar--large" : ""}`} aria-hidden="true">{initials(name)}</span>;
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`member-status member-status--${statusClasses[status]}`}>{status}</span>;
}

type FilterState = {
  query: string;
  status: string;
  plan: string;
  payment: string;
  joinedFrom: string;
  joinedTo: string;
  startsFrom: string;
  startsTo: string;
  endsFrom: string;
  endsTo: string;
  sort: string;
};

const emptyFilters: FilterState = {
  query: "", status: "", plan: "", payment: "", joinedFrom: "", joinedTo: "",
  startsFrom: "", startsTo: "", endsFrom: "", endsTo: "", sort: "recent",
};

function filterMembers(state: AppState, view: MemberView, filter: FilterState) {
  const query = filter.query.trim().toLowerCase();
  const queryDigits = query.replace(/\D/g, "");
  const isPhoneQuery = queryDigits.length >= 3 && /^[+()0-9 .-]+$/.test(query);
  const reference = today();
  const result = state.members.filter((member) => {
    const status = statusOf(member, state.settings.warningDays, reference);
    const joined = member.createdAt.slice(0, 10);
    if (view === "active" && status !== "Active" && status !== "Expiring Soon") return false;
    if (view === "expiring" && status !== "Expiring Soon") return false;
    if (view === "expired" && status !== "Expired") return false;
    if (view === "deactivated" && status !== "Deactivated") return false;
    if (filter.status && status !== filter.status) return false;
    if (filter.plan && member.planId !== filter.plan) return false;
    if (filter.payment && member.payment !== filter.payment) return false;
    if (filter.joinedFrom && joined < filter.joinedFrom) return false;
    if (filter.joinedTo && joined > filter.joinedTo) return false;
    if (filter.startsFrom && member.start < filter.startsFrom) return false;
    if (filter.startsTo && member.start > filter.startsTo) return false;
    if (filter.endsFrom && member.end < filter.endsFrom) return false;
    if (filter.endsTo && member.end > filter.endsTo) return false;
    return !query || [member.name, member.email, member.phone, member.id]
      .some((value) => value.toLowerCase().includes(query))
      || (isPhoneQuery && member.phone.replace(/\D/g, "").includes(queryDigits));
  });

  switch (filter.sort) {
    case "name": return result.sort((a, b) => a.name.localeCompare(b.name));
    case "ending": return result.sort((a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name));
    case "endingLatest": return result.sort((a, b) => b.end.localeCompare(a.end) || a.name.localeCompare(b.name));
    case "oldest": return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name));
    default: return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function arrivalDate(value: string | undefined) {
  return value ? formatDate(value.slice(0, 10)) : "—";
}

function Field({ children, label, required = false, wide = false }: {
  children: ReactNode; label: string; required?: boolean; wide?: boolean;
}) {
  return <label className={`member-field${wide ? " member-field-wide" : ""}`}>
    {label}{required && <strong aria-hidden="true">*</strong>}{children}
  </label>;
}

function DetailGrid({ values }: { values: [string, ReactNode][] }) {
  return <dl className="member-details-grid">
    {values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}
  </dl>;
}

function RowActions({ member, onAction }: { member: Member; onAction: OpenAction }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector("button")?.focus();
    const closeOnOutside = (event: globalThis.MouseEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) {
        setPosition(null);
      }
    };
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      setPosition(null);
    };
    document.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("resize", closeOnScroll);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("resize", closeOnScroll);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [position]);

  function openMenu(event: MouseEvent<HTMLButtonElement>) {
    if (position) {
      setPosition(null);
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const top = box.bottom + 189 <= window.innerHeight ? box.bottom + 4 : Math.max(6, box.top - 189);
    setPosition({ top, left: Math.max(6, box.right - 195) });
  }

  function select(type: MemberAction["type"]) {
    setPosition(null);
    trigger.current?.focus();
    onAction({ type, memberId: member.id });
  }

  return <div className="member-row-actions">
    <button className="member-btn member-btn--icon member-btn--quiet" title="View profile" aria-label={`View profile for ${member.name}`} onClick={() => select("view")}><Eye size={16} /></button>
    <button className="member-btn member-btn--icon member-btn--quiet" title="Member actions" aria-label={`More actions for ${member.name}`} aria-expanded={Boolean(position)} aria-controls={position ? id : undefined} ref={trigger} onClick={openMenu}><MoreHorizontal size={18} /></button>
    {position && createPortal(<div className="member-area">
      <div id={id} className="member-menu" style={position} ref={menu} onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)
          && !trigger.current?.contains(event.relatedTarget)) setPosition(null);
      }} onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setPosition(null);
          trigger.current?.focus();
        }
      }}>
        <button className="member-btn" onClick={() => select("view")}><Eye size={15} /> View profile</button>
        <button className="member-btn" onClick={() => select("edit")}><Pencil size={15} /> Edit member</button>
        {member.deactivatedAt
          ? <button className="member-btn" onClick={() => select("reactivate")}><CirclePlay size={15} /> Reactivate</button>
          : <>
            <button className="member-btn" onClick={() => select("renew")}><RefreshCw size={15} /> Renew membership</button>
            <button className="member-btn" onClick={() => select("deactivate")}><CirclePause size={15} /> Deactivate</button>
          </>}
        <button className="member-btn" onClick={() => select("delete")}><Trash2 size={15} /> Delete permanently</button>
      </div>
    </div>, document.body)}
  </div>;
}

function daysLabel(days: number) {
  if (days === 0) return "Expires today";
  return days === 1 ? "1 day remaining" : `${days} days remaining`;
}

function countdownStyle(days: number) {
  if (days === 0) return "today";
  if (days <= 2) return "urgent";
  if (days <= 7) return "warning";
  return "active";
}

function ExpiryCards({ members, plans, onAction }: { members: Member[]; plans: Plan[]; onAction: OpenAction }) {
  const reference = today();
  const groups = new Map<number, Member[]>();
  for (const member of members) {
    const days = daysBetween(reference, member.end);
    groups.set(days, [...(groups.get(days) ?? []), member]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([days, group]) => (
    <section className="member-expiry-group" key={days}>
      <h2>{daysLabel(days)}</h2>
      <div className="member-expiry-grid">
        {group.map((member) => <article className="member-surface member-expiry-card" key={member.id}>
          <div className="member-expiry-card-header">
            <div className="member-name">
              <Avatar name={member.name} />
              <button className="member-name-btn" onClick={() => onAction({ type: "view", memberId: member.id })}>{member.name}</button>
            </div>
            <span className={`member-status member-status--${countdownStyle(days)}`}>{daysLabel(days)}</span>
          </div>
          <DetailGrid values={[
            ["Phone", member.phone],
            ["Membership plan", planName(plans, member.planId)],
            ["Expiry date", arrivalDate(member.end)],
          ]} />
          <div className="member-card-actions">
            <button className="member-btn member-btn--primary" onClick={() => onAction({ type: "renew", memberId: member.id })}><RefreshCw size={14} /> Renew</button>
            <button className="member-btn" onClick={() => onAction({ type: "view", memberId: member.id })}>Profile</button>
            <button className="member-btn member-btn--icon" title="Deactivate member" aria-label={`Deactivate ${member.name}`} onClick={() => onAction({ type: "deactivate", memberId: member.id })}><CirclePause size={16} /></button>
          </div>
        </article>)}
      </div>
    </section>
  ));
}

function MemberTable({ state, members, view, onAction }: {
  state: AppState; members: Member[]; view: MemberView; onAction: OpenAction;
}) {
  const reference = today();
  const expired = view === "expired";
  const deactivated = view === "deactivated";
  return <div className="member-table-scroll">
    <table className="member-table">
      <thead><tr>
        <th scope="col">Member ID</th><th scope="col">Name</th><th scope="col">Phone</th><th scope="col">Email</th>
        <th scope="col">{expired || deactivated ? "Previous plan" : "Plan"}</th><th scope="col">Start date</th><th scope="col">End date</th>
        {expired && <th scope="col">Days since expiry</th>}
        {deactivated && <><th scope="col">Deactivated on</th><th scope="col">Reason</th></>}
        <th scope="col">Status</th><th scope="col">Actions</th>
      </tr></thead>
      <tbody>{members.map((member) => <tr key={member.id}>
        <td data-label="Member ID">{member.id}</td>
        <td data-label="Name" className="member-table-name"><span className="member-name"><Avatar name={member.name} />
          <button className="member-name-btn" onClick={() => onAction({ type: "view", memberId: member.id })}>{member.name}</button>
        </span></td>
        <td data-label="Phone">{member.phone}</td><td data-label="Email">{member.email}</td>
        <td data-label={expired || deactivated ? "Previous plan" : "Plan"}>{planName(state.plans, member.planId)}</td>
        <td data-label="Start date">{arrivalDate(member.start)}</td><td data-label="End date">{arrivalDate(member.end)}</td>
        {expired && <td data-label="Days since expiry">{daysBetween(member.end, reference)}</td>}
        {deactivated && <><td data-label="Deactivated on">{arrivalDate(member.deactivatedAt)}</td><td data-label="Reason" className="member-table-reason">{member.deactivationReason || "—"}</td></>}
        <td data-label="Status" className="member-table-status"><StatusBadge status={statusOf(member, state.settings.warningDays, reference)} /></td>
        <td data-label="Actions" className="member-table-actions"><RowActions member={member} onAction={onAction} /></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export function MembersPage({ state, view, onAction }: { state: AppState; view: MemberView; onAction: OpenAction }) {
  return <MemberDirectory key={view} state={state} view={view} onAction={onAction} />;
}

function MemberDirectory({ state, view, onAction }: { state: AppState; view: MemberView; onAction: OpenAction }) {
  const defaultSort = view === "expiring" || view === "active" ? "ending" : view === "expired" ? "endingLatest" : "recent";
  const defaults = { ...emptyFilters, sort: defaultSort };
  const [filters, setFilters] = useState<FilterState>(defaults);
  const [advanced, setAdvanced] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const filterId = useId();
  const { title, description } = viewDetails[view];
  const expiring = view === "expiring";
  const results = filterMembers(state, view, filters);
  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  const page = Math.min(currentPage, pages);
  const startIndex = (page - 1) * pageSize;
  const visible = results.slice(startIndex, startIndex + pageSize);
  const filtered = Object.keys(filters).some((key) => filters[key as keyof FilterState] !== defaults[key as keyof FilterState]);
  function setFilter(key: keyof FilterState, value: string) {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setCurrentPage(1);
  }
  function clearFilters() {
    setFilters(defaults);
    setCurrentPage(1);
  }
  const pagination = results.length > 0 && <div className="member-pagination">
    <span>{startIndex + 1}–{startIndex + visible.length} of {results.length} members</span>
    <div>
      <button className="member-btn member-btn--icon" aria-label="Previous page" onClick={() => setCurrentPage(page - 1)} disabled={page === 1}><ChevronLeft size={17} /></button>
      <span aria-label={`Page ${page} of ${pages}`}>{page} / {pages}</span>
      <button className="member-btn member-btn--icon" aria-label="Next page" onClick={() => setCurrentPage(page + 1)} disabled={page === pages}><ChevronRight size={17} /></button>
    </div>
  </div>;

  return <section className="member-area">
    <header className="member-heading">
      <div><h1>{title}</h1><p>{description}</p></div>
      <button className="member-btn member-btn--primary" onClick={() => onAction({ type: "add" })}><Plus size={17} /> Add Member</button>
    </header>
    <div className="member-surface">
      <div className="member-toolbar">
        <div className="member-search"><Search size={17} /><input className="member-input" type="search" aria-label="Search members" placeholder="Search name, phone, email or ID" value={filters.query} onChange={(event) => setFilter("query", event.target.value)} /></div>
        {view === "members" && <select className="member-input" aria-label="Membership status" value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
          <option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}
        </select>}
        <select className="member-input" aria-label="Membership plan" value={filters.plan} onChange={(event) => setFilter("plan", event.target.value)}>
          <option value="">All plans</option>{state.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
        <select className="member-input" aria-label="Sort members" value={filters.sort} onChange={(event) => setFilter("sort", event.target.value)}>
          <option value="recent">Newest first</option><option value="oldest">Oldest first</option>
          <option value="ending">Ending earliest</option><option value="endingLatest">Ending latest</option><option value="name">Name A–Z</option>
        </select>
        <button className="member-btn" type="button" aria-expanded={advanced} aria-controls={advanced ? filterId : undefined} onClick={() => setAdvanced(!advanced)}><ListFilter size={16} /> Filters</button>
        {filtered && <button className="member-btn member-btn--quiet" type="button" onClick={clearFilters}>Clear filters</button>}
      </div>
      {advanced && <div className="member-filter-grid" id={filterId}>
        <Field label="Payment status"><select className="member-input" value={filters.payment} onChange={(event) => setFilter("payment", event.target.value)}><option value="">All payments</option>{paymentOptions.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Joined from"><input className="member-input" type="date" value={filters.joinedFrom} max={filters.joinedTo || undefined} onChange={(event) => setFilter("joinedFrom", event.target.value)} /></Field>
        <Field label="Joined through"><input className="member-input" type="date" value={filters.joinedTo} min={filters.joinedFrom || undefined} onChange={(event) => setFilter("joinedTo", event.target.value)} /></Field>
        <Field label="Start date from"><input className="member-input" type="date" value={filters.startsFrom} max={filters.startsTo || undefined} onChange={(event) => setFilter("startsFrom", event.target.value)} /></Field>
        <Field label="Start date through"><input className="member-input" type="date" value={filters.startsTo} min={filters.startsFrom || undefined} onChange={(event) => setFilter("startsTo", event.target.value)} /></Field>
        <Field label="End date from"><input className="member-input" type="date" value={filters.endsFrom} max={filters.endsTo || undefined} onChange={(event) => setFilter("endsFrom", event.target.value)} /></Field>
        <Field label="End date through"><input className="member-input" type="date" value={filters.endsTo} min={filters.endsFrom || undefined} onChange={(event) => setFilter("endsTo", event.target.value)} /></Field>
      </div>}
      {visible.length ? <>
        {!expiring && <MemberTable state={state} members={visible} view={view} onAction={onAction} />}
        {pagination}
      </> : <div className="member-empty">
        <UsersRound size={29} strokeWidth={1.5} />
        <strong>{filtered ? "No matching members" : "No members to display"}</strong>
        <p>{filtered ? "Try a different search or adjust your filters." : view === "members" ? "Add your first member to start tracking memberships." : "Members will appear here when their membership reaches this status."}</p>
        {filtered && <button className="member-btn" onClick={clearFilters}>Clear filters</button>}
        {!filtered && view === "members" && <button className="member-btn member-btn--primary" onClick={() => onAction({ type: "add" })}><Plus size={16} /> Add Member</button>}
      </div>}
    </div>
    {expiring && visible.length > 0 && <ExpiryCards members={visible} plans={state.plans} onAction={onAction} />}
  </section>;
}

const timelineLabels: Record<HistoryEvent["type"], string> = {
  created: "Membership created",
  renewed: "Membership renewed",
  expired: "Membership expired",
  deactivated: "Membership deactivated",
  reactivated: "Membership reactivated",
};

function ProfilePanels({ member, state }: { member: Member; state: AppState }) {
  const { currency, warningDays } = state.settings;
  const timeline = [...historyOf(member)].reverse().sort((a, b) => b.date.localeCompare(a.date));
  return <div className="member-profile-grid">
    <section className="member-surface member-profile-panel">
      <h2>Personal details</h2>
      <DetailGrid values={[
        ["Full name", member.name], ["Member ID", member.id], ["Phone", member.phone],
        ["Email", member.email], ["Address", member.address], ["Date of birth", arrivalDate(member.dob)],
        ["Gender", member.gender], ["Weight", `${member.weight} kg`], ["Blood group", member.bloodGroup],
        ["Emergency contact", member.emergency],
      ]} />
    </section>
    <section className="member-surface member-profile-panel">
      <h2>Membership details</h2>
      <DetailGrid values={[
        ["Current plan", planName(state.plans, member.planId)],
        ["Membership status", <StatusBadge status={statusOf(member, warningDays)} />],
        ["Start date", arrivalDate(member.start)], ["End date", arrivalDate(member.end)],
        ["Membership amount", money(member.amount, currency)], ["Payment status", member.payment],
        ["Notes", member.notes],
        ...(member.deactivatedAt ? [
          ["Deactivated on", arrivalDate(member.deactivatedAt)],
          ["Deactivation reason", member.deactivationReason],
        ] as [string, ReactNode][] : []),
      ]} />
    </section>
    <section className="member-surface member-profile-panel member-profile-timeline">
      <h2>Membership history</h2>
      {timeline.length ? <ol className="member-timeline">
        {timeline.map((event, index) => <li key={`${event.type}-${event.date}-${index}`}>
          <strong>{timelineLabels[event.type]}</strong>
          <time dateTime={event.date}>{arrivalDate(event.date)}</time>
          {event.planId && <p>{[
            planName(state.plans, event.planId),
            event.start && event.end ? `${arrivalDate(event.start)} – ${arrivalDate(event.end)}` : "",
            event.amount == null ? "" : money(event.amount, currency),
            event.payment,
          ].filter(Boolean).join(" · ")}</p>}
          {event.note && <p>{event.note}</p>}
        </li>)}
      </ol> : <p className="member-dialog-lead">No membership history has been recorded.</p>}
    </section>
  </div>;
}

export function MemberProfilePage({ state, memberId, onBack, onAction }: {
  state: AppState; memberId: string; onBack: () => void; onAction: OpenAction;
}) {
  const member = state.members.find((profile) => profile.id === memberId);
  return <section className="member-area">
    <div className="member-profile-topbar">
      <button className="member-btn member-btn--quiet" onClick={onBack}><ChevronLeft size={16} /> Back to members</button>
    </div>
    {member ? <>
      <header className="member-heading member-profile-heading">
        <div className="member-name"><Avatar name={member.name} large /><div>
          <h1>{member.name}</h1><p>{member.id} · Joined {arrivalDate(member.createdAt)}</p>
        </div></div>
        <div className="member-profile-actions">
          <button className="member-btn" onClick={() => onAction({ type: "edit", memberId })}><Pencil size={16} /> Edit member</button>
          <button className="member-btn member-btn--primary" onClick={() => onAction({ type: member.deactivatedAt ? "reactivate" : "renew", memberId })}>
            {member.deactivatedAt ? <><CirclePlay size={16} /> Reactivate</> : <><RefreshCw size={16} /> Renew membership</>}
          </button>
          <RowActions member={member} onAction={onAction} />
        </div>
      </header>
      <ProfilePanels member={member} state={state} />
    </> : <div className="member-surface member-empty"><UserRound size={25} /><strong>Member not found</strong><p>This record is no longer available.</p></div>}
  </section>;
}

type Commit = (nextState: AppState, message: string) => void | Promise<void>;
type ModalProps = { state: AppState; action: MemberAction; onAction: OpenAction; onClose: () => void; onCommit: Commit };

function ModalFrame({ title, subtitle, pending, small = false, onClose, onSubmit, children, footer }: {
  title: string; subtitle?: string; pending: boolean; small?: boolean; onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode; footer: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const frame = useRef<HTMLFormElement>(null);
  const latest = useRef({ pending, onClose });
  latest.current = { pending, onClose };

  useEffect(() => {
    const previous = document.activeElement;
    const usedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = frame.current;
    (root?.querySelector<HTMLElement>("[data-initial-focus]") ?? root)?.focus();
    function manageKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!latest.current.pending) latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...(root?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex='0']") ?? [])]
        .filter((item) => item.getClientRects().length > 0);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", manageKeys, true);
    return () => {
      document.body.style.overflow = usedOverflow;
      document.removeEventListener("keydown", manageKeys, true);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return createPortal(<div className="member-area member-dialog-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !pending) onClose();
  }}>
    <form className={`member-dialog${small ? " member-dialog--small" : ""}`} ref={frame} tabIndex={-1}
      role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitle ? descriptionId : undefined}
      aria-busy={pending} onSubmit={onSubmit}>
      <div className="member-dialog-head">
        <div><h2 id={titleId}>{title}</h2>{subtitle && <p id={descriptionId} className="member-dialog-lead">{subtitle}</p>}</div>
        <button className="member-btn member-btn--quiet member-btn--icon" type="button" aria-label="Close dialog" onClick={onClose} disabled={pending}><X size={19} /></button>
      </div>
      <div className="member-dialog-body">{children}</div>
      <div className="member-dialog-foot">{footer}</div>
    </form>
  </div>, document.body);
}


function validPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^\+?[0-9(][0-9(). -]*$/.test(value) && digits.length >= 7 && digits.length <= 15;
}

function planLabel(months: number) {
  return `${months} ${months === 1 ? "month" : "months"}`;
}

function termEnd(start: string, plan: Plan | undefined) {
  const end = plan ? addMonths(start, plan.months) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : "";
}

function PreviewDates({ selectedPlan, start, end }: { selectedPlan?: Plan; start: string; end: string }) {
  return <div className="member-date-preview" aria-live="polite">
    <div>Membership duration<strong>{selectedPlan ? planLabel(selectedPlan.months) : "—"}</strong></div>
    <div>Start date<strong>{formatDate(start, "long")}</strong></div>
    <div>End date<strong>{formatDate(end, "long")}</strong></div>
  </div>;
}

function PaymentSelect({ value, onChange }: { value: Payment; onChange: (payment: Payment) => void }) {
  return <select className="member-input" required value={value} onChange={(event) => onChange(event.target.value as Payment)}>
    {paymentOptions.map((payment) => <option key={payment}>{payment}</option>)}
  </select>;
}

function PlanSelect({ plans, value, onChange }: { plans: Plan[]; value: string; onChange: (id: string) => void }) {
  return <select className="member-input" required value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Select a membership plan</option>
    {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {planLabel(plan.months)}</option>)}
  </select>;
}

function useCommitWithFeedback(onCommit: Commit, onClose: () => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function save(nextState: AppState, message: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      await onCommit(nextState, message);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your changes. Please try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return { pending, error, setError, save };
}

function ModalActions({ pending, onClose, label, danger = false, disabled = false }: {
  pending: boolean; onClose: () => void; label: string; danger?: boolean; disabled?: boolean;
}) {
  return <>
    <button className="member-btn" type="button" onClick={onClose} disabled={pending}>Cancel</button>
    <button className={`member-btn ${danger ? "member-btn--danger" : "member-btn--primary"}`} type="submit" disabled={pending || disabled}>{pending ? "Saving…" : label}</button>
  </>;
}

function newMemberId(members: Member[]) {
  const existing = new Set(members.map((member) => member.id));
  let id = "";
  do {
    id = `IC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  } while (existing.has(id));
  return id;
}

function replaceMember(state: AppState, member: Member): AppState {
  return { ...state, members: state.members.map((entry) => entry.id === member.id ? member : entry) };
}

function reviseCurrentHistory(previous: Member, period: Pick<Member, "planId" | "start" | "end" | "amount" | "payment">) {
  const history = [...previous.history];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const event = history[index];
    if ((event.type === "created" || event.type === "renewed") && event.start === previous.start && event.end === previous.end) {
      history[index] = { ...event, ...period };
      break;
    }
  }
  return history;
}

const bloodGroups = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−", "Unknown"];

function MemberForm({ state, member, onClose, onCommit }: {
  state: AppState; member?: Member; onClose: () => void; onCommit: Commit;
}) {
  const defaultPlan = state.plans.find((entry) => entry.id === state.settings.defaultPlanId) ?? state.plans[0];
  const [planId, setPlanId] = useState(member?.planId ?? defaultPlan?.id ?? "");
  const [start, setStart] = useState(member?.start ?? today());
  const [payment, setPayment] = useState<Payment>(member?.payment ?? "Paid");
  const [amount, setAmount] = useState(String(member?.amount ?? defaultPlan?.price ?? ""));
  const { pending, error, setError, save } = useCommitWithFeedback(onCommit, onClose);
  const plan = state.plans.find((entry) => entry.id === planId);
  const end = member?.planId === planId && member?.start === start ? member.end : termEnd(start, plan);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan || !start || !end) {
      setError("Choose a membership plan and a valid start date.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const read = (field: string) => String(data.get(field) ?? "").trim();
    const phone = read("phone");
    const emergency = read("emergency");
    if (!validPhone(phone) || (emergency && !validPhone(emergency))) {
      setError("Enter a phone number with 7–15 digits, with an optional country code.");
      return;
    }
    const weight = Number(read("weight"));
    const total = Number(amount);
    if (read("name").length < 2 || read("address").length < 2 || !Number.isFinite(weight)
      || weight <= 0 || !Number.isFinite(total) || total < 0) {
      setError("Enter a full name, address, positive weight, and valid membership amount.");
      return;
    }
    const period = { planId, start, end, amount: total, payment };
    const createdAt = member?.createdAt ?? today();
    const nextMember: Member = {
      ...member,
      id: member?.id ?? newMemberId(state.members),
      name: read("name"), phone, email: read("email").toLowerCase(), address: read("address"),
      dob: read("dob") || undefined, gender: read("gender") || undefined,
      weight, bloodGroup: read("bloodGroup"), emergency: emergency || undefined,
      notes: read("notes") || undefined, ...period, createdAt,
      history: member ? reviseCurrentHistory(member, period) : [{ type: "created", date: createdAt, ...period }],
    };
    const nextState = member ? replaceMember(state, nextMember) : { ...state, members: [nextMember, ...state.members] };
    void save(nextState, member ? "Member details updated." : "New member added.");
  }

  return <ModalFrame title={member ? "Edit member" : "Add new member"} subtitle={member?.name ?? "Enter personal details and choose a membership plan."}
    onClose={onClose} pending={pending} onSubmit={submit}
    footer={<ModalActions onClose={onClose} pending={pending} label={member ? "Save changes" : "Add member"} disabled={!plan} />}>
    <fieldset className="member-form-grid" disabled={pending}>
      <legend>Personal information</legend>
      <Field label="Full name" required><input data-initial-focus name="name" className="member-input" defaultValue={member?.name} autoComplete="name" required minLength={2} maxLength={100} placeholder="Full name" /></Field>
      <Field label="Phone number" required><input name="phone" className="member-input" defaultValue={member?.phone} type="tel" autoComplete="tel" required maxLength={32} placeholder="+91 98765 43210" /></Field>
      <Field label="Email address" required><input name="email" className="member-input" defaultValue={member?.email} type="email" autoComplete="email" required maxLength={160} placeholder="name@example.com" /></Field>
      <Field label="Address" required><input name="address" className="member-input" defaultValue={member?.address} autoComplete="street-address" required minLength={2} maxLength={320} placeholder="Street, city and postal code" /></Field>
      <Field label="Date of birth"><input name="dob" className="member-input" defaultValue={member?.dob} type="date" min="1900-01-01" max={today()} /></Field>
      <Field label="Gender"><select name="gender" className="member-input" defaultValue={member?.gender ?? ""}>
        <option value="">Select gender</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Other</option><option>Prefer not to say</option>
        {member?.gender && !["Female", "Male", "Non-binary", "Other", "Prefer not to say"].includes(member.gender) && <option>{member.gender}</option>}
      </select></Field>
      <Field label="Weight (kg)" required><input name="weight" className="member-input" defaultValue={member?.weight} type="number" step="any" min="0.01" max="1500" required placeholder="70" /></Field>
      <Field label="Blood group" required><select name="bloodGroup" className="member-input" defaultValue={member?.bloodGroup ?? ""} required>
        <option value="">Select blood group</option>
        {bloodGroups.map((group) => <option key={group} value={group.replace("−", "-")}>{group}</option>)}
        {member?.bloodGroup && !bloodGroups.some((group) => group.replace("−", "-") === member.bloodGroup) && <option>{member.bloodGroup}</option>}
      </select></Field>
      <Field label="Emergency contact"><input name="emergency" className="member-input" defaultValue={member?.emergency} type="tel" maxLength={32} placeholder="+91 98765 43210" /></Field>
    </fieldset>
    <fieldset className="member-form-grid" disabled={pending}>
      <legend>Membership information</legend>
      <Field label="Membership plan" required wide><PlanSelect plans={state.plans} value={planId} onChange={(id) => {
        setPlanId(id);
        setAmount(String(state.plans.find((entry) => entry.id === id)?.price ?? ""));
      }} /></Field>
      {!state.plans.length && <p className="member-dialog-error member-field-wide">Create a plan in Membership Plans before adding a member.</p>}
      <Field label="Start date" required><input className="member-input" type="date" required min="1900-01-01" max="9999-12-31" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
      <Field label="End date"><input className="member-input" type="date" value={end} readOnly /></Field>
      <Field label={`Amount (${state.settings.currency})`} required><input className="member-input" type="number" min="0" max="1000000000" step=".01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
      <Field label="Payment status" required><PaymentSelect value={payment} onChange={setPayment} /></Field>
      <Field label="Notes" wide><textarea className="member-input" name="notes" maxLength={1000} defaultValue={member?.notes} placeholder="Add a note about this membership" /></Field>
    </fieldset>
    <PreviewDates selectedPlan={plan} start={start} end={end} />
    {error && <p className="member-dialog-error" role="alert">{error}</p>}
  </ModalFrame>;
}

function RenewalForm({ state, member, onClose, onCommit }: {
  state: AppState; member: Member; onClose: () => void; onCommit: Commit;
}) {
  const suggested = state.plans.find((plan) => plan.id === member.planId)
    ?? state.plans.find((plan) => plan.id === state.settings.defaultPlanId)
    ?? state.plans[0];
  const [planId, setPlanId] = useState(suggested?.id ?? "");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(String(suggested?.price ?? ""));
  const [payment, setPayment] = useState<Payment>("Paid");
  const { pending, error, setError, save } = useCommitWithFeedback(onCommit, onClose);
  const plan = state.plans.find((entry) => entry.id === planId);
  const start = date ? renewalStart(member, date) : "";
  const end = termEnd(start, plan);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const total = Number(amount);
    if (!plan || !date || !end || total < 0 || !Number.isFinite(total)) {
      setError("Choose a plan, a valid renewal date, and a membership amount.");
      return;
    }
    const membership = { planId, start, end, amount: total, payment };
    const history = [...historyOf(member, date), { type: "renewed" as const, date, ...membership }];
    void save(replaceMember(state, { ...member, ...membership, history }), "Membership renewed.");
  }

  return <ModalFrame title="Renew membership" subtitle={`Extend gym access for ${member.name}.`} pending={pending} onClose={onClose} onSubmit={submit}
    footer={<ModalActions onClose={onClose} pending={pending} label="Renew membership" disabled={!plan} />}>
    <div className="member-renew-current">
      <DetailGrid values={[
        ["Member", member.name], ["Member ID", member.id], ["Previous plan", planName(state.plans, member.planId)],
        ["Previous end date", arrivalDate(member.end)],
      ]} />
    </div>
    <fieldset className="member-form-grid" disabled={pending}>
      <legend>New membership</legend>
      <Field label="New membership plan" required wide><PlanSelect plans={state.plans} value={planId} onChange={(id) => {
        setPlanId(id);
        setAmount(String(state.plans.find((entry) => entry.id === id)?.price ?? ""));
      }} /></Field>
      <Field label="Renewal date" required><input className="member-input" data-initial-focus type="date" required min={member.createdAt.slice(0, 10)} max="9999-12-31" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      <Field label={`Amount (${state.settings.currency})`} required><input className="member-input" type="number" min="0" max="1000000000" step=".01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
      <Field label="Payment status" required><PaymentSelect value={payment} onChange={setPayment} /></Field>
    </fieldset>
    <PreviewDates selectedPlan={plan} start={start} end={end} />
    {error && <p className="member-dialog-error" role="alert">{error}</p>}
  </ModalFrame>;
}

const confirmations = {
  deactivate: {
    title: "Deactivate member",
    description: (name: string) => `Remove gym access for ${name}. Their profile and membership history will be preserved.`,
    message: "Member deactivated.",
  },
  reactivate: {
    title: "Reactivate member",
    description: (name: string) => `Restore ${name} to the membership directory. Access will follow their current membership dates.`,
    message: "Member reactivated.",
  },
  delete: {
    title: "Permanently delete member",
    description: (name: string) => `Permanently remove ${name} and their membership history. This action can’t be undone.`,
    message: "Member permanently deleted.",
  },
};

function ConfirmationForm({ state, member, type, onClose, onCommit }: {
  state: AppState; member: Member; type: keyof typeof confirmations; onClose: () => void; onCommit: Commit;
}) {
  const { pending, error, save } = useCommitWithFeedback(onCommit, onClose);
  const { title, description, message } = confirmations[type];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (type === "delete") {
      void save({ ...state, members: state.members.filter((entry) => entry.id !== member.id) }, message);
      return;
    }

    const date = today();
    if (type === "deactivate") {
      const rawReason = new FormData(event.currentTarget).get("reason");
      const note = typeof rawReason === "string" ? rawReason.trim() : "";
      const history = [...historyOf(member), { type: "deactivated" as const, date, note: note || undefined }];
      void save(replaceMember(state, { ...member, deactivatedAt: date, deactivationReason: note || undefined, history }), message);
      return;
    }

    const history = [...historyOf(member), { type: "reactivated" as const, date }];
    void save(replaceMember(state, { ...member, deactivatedAt: undefined, deactivationReason: undefined, history }), message);
  }

  return <ModalFrame title={title} small pending={pending} onClose={onClose} onSubmit={submit}
    footer={<ModalActions onClose={onClose} pending={pending} danger={type !== "reactivate"} label={type === "delete" ? "Permanently delete" : title} />}>
    <p className="member-confirm-copy">{description(member.name)}</p>
    {type === "deactivate" && <Field label="Reason for deactivation (optional)"><textarea className="member-input" name="reason" maxLength={500} placeholder="Add a reason to the membership history" disabled={pending} /></Field>}
    {error && <p className="member-dialog-error" role="alert">{error}</p>}
  </ModalFrame>;
}

export function MemberModal({ state, action, onAction, onClose, onCommit }: ModalProps) {
  const member = state.members.find((entry) => entry.id === action.memberId);
  if (action.type === "add") return <MemberForm key="add" state={state} onClose={onClose} onCommit={onCommit} />;
  if (!member) return <ModalFrame title="Member not found" subtitle="This record is no longer available." small
    pending={false} onClose={onClose} onSubmit={(event) => event.preventDefault()}
    footer={<button className="member-btn" type="button" onClick={onClose}>Close</button>}><UserRound size={24} /></ModalFrame>;
  switch (action.type) {
    case "edit": return <MemberForm key={member.id} member={member} state={state} onClose={onClose} onCommit={onCommit} />;
    case "renew": return member.deactivatedAt
      ? <ModalFrame title="Member is deactivated" subtitle="Reactivate their profile to renew their membership." small
        pending={false} onClose={onClose} onSubmit={(event) => event.preventDefault()}
        footer={<button className="member-btn" type="button" onClick={() => onAction({ type: "reactivate", memberId: member.id })}><CirclePlay size={16} /> Reactivate</button>}><UserRound size={24} /></ModalFrame>
      : <RenewalForm key={member.id} member={member} state={state} onClose={onClose} onCommit={onCommit} />;
    case "deactivate":
    case "reactivate":
    case "delete":
      return <ConfirmationForm key={`${action.type}-${member.id}`} type={action.type} member={member} state={state} onClose={onClose} onCommit={onCommit} />;
    case "view":
      return <ModalFrame key={member.id} title={member.name} subtitle={member.id} pending={false}
        onClose={onClose} onSubmit={(event) => event.preventDefault()}
        footer={<><button className="member-btn" type="button" onClick={onClose}>Close</button><button className="member-btn member-btn--primary" type="button" onClick={() => onAction({ type: "edit", memberId: member.id })}><Pencil size={16} /> Edit member</button></>}>
        <ProfilePanels member={member} state={state} />
      </ModalFrame>;
  }
}
