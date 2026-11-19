import { isValidEmail } from './credentials.mjs';

const paymentValues = ['Paid', 'Pending', 'Partial'];
const historyTypes = ['created', 'renewed', 'expired', 'deactivated', 'reactivated'];
const bloodGroups = /^(?:A|B|AB|O)[+−-]$|^Unknown$/;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function string(value, limit, optional = false) {
  return (optional && (value === undefined || value === ''))
    || (typeof value === 'string' && value.trim().length > 0 && value.length <= limit);
}

function blankable(value, limit) {
  return typeof value === 'string' && value.length <= limit;
}

function identifier(value, optional = false) {
  return string(value, 160, optional)
    && (optional && !value || /^[a-zA-Z0-9_-]+$/.test(value));
}

function phone(value, optional = false) {
  return (optional && (value === undefined || value === ''))
    || (typeof value === 'string' && /^[+\d\s().-]+$/.test(value)
      && value.length <= 40 && /^\d{7,15}$/.test(value.replace(/\D/g, '')));
}

function calendarDate(value, optional = false) {
  if (optional && (value === undefined || value === '')) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function timestamp(value, optional = false) {
  if (optional && (value === undefined || value === '')) return true;
  if (calendarDate(value)) return true;
  return typeof value === 'string' && value.length <= 35
    && calendarDate(value.slice(0, 10))
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function amount(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
}

function fields(value, keys) {
  return record(value) && Object.keys(value).every((key) => keys.includes(key));
}

function validatePlan(plan) {
  if (!fields(plan, ['id', 'name', 'months', 'price', 'description', 'features'])) return 'A plan has invalid fields.';
  if (!identifier(plan.id) || !string(plan.name, 120)) return 'Every plan needs a valid ID and name.';
  if (!Number.isInteger(plan.months) || plan.months < 1 || plan.months > 120) {
    return 'Membership plans must last between 1 and 120 months.';
  }
  if (!amount(plan.price)) return 'Enter a valid plan price.';
  if (!blankable(plan.description, 3000) || !Array.isArray(plan.features)
    || plan.features.length > 100 || !plan.features.every((feature) => string(feature, 260))) {
    return 'Check the plan description and features.';
  }
  return null;
}

function validHistory(event) {
  return fields(event, ['type', 'date', 'planId', 'start', 'end', 'amount', 'payment', 'note'])
    && historyTypes.includes(event.type)
    && timestamp(event.date)
    && identifier(event.planId, true)
    && calendarDate(event.start, true)
    && calendarDate(event.end, true)
    && (!event.start || !event.end || event.end >= event.start)
    && (event.amount === undefined || amount(event.amount))
    && (event.payment === undefined || paymentValues.includes(event.payment))
    && string(event.note, 3000, true);
}

function validateMember(member) {
  if (!fields(member, [
    'id', 'name', 'phone', 'email', 'address', 'dob', 'gender', 'weight',
    'bloodGroup', 'emergency', 'planId', 'start', 'end', 'amount', 'payment',
    'notes', 'createdAt', 'deactivatedAt', 'deactivationReason', 'history',
  ])) return 'A member has invalid fields.';
  if (!identifier(member.id) || !string(member.name, 150)) return 'Every member needs a valid ID and full name.';
  const memberLabel = member.name + ': ';
  if (!phone(member.phone) || !phone(member.emergency, true)) {
    return memberLabel + 'Enter phone numbers with 7–15 digits.';
  }
  if (!isValidEmail(member.email) || !string(member.address, 1000)) {
    return memberLabel + 'Enter an email address and mailing address.';
  }
  if (!calendarDate(member.dob, true) || !string(member.gender, 100, true)
    || !Number.isFinite(member.weight) || member.weight <= 0 || member.weight > 1500
    || typeof member.bloodGroup !== 'string' || !bloodGroups.test(member.bloodGroup)) {
    return memberLabel + 'Check the personal and health details.';
  }
  if (!identifier(member.planId) || !calendarDate(member.start)
    || !calendarDate(member.end) || member.end < member.start) {
    return memberLabel + 'Choose a plan and valid membership dates.';
  }
  if (!amount(member.amount) || !paymentValues.includes(member.payment)) {
    return memberLabel + 'Enter a valid amount and payment status.';
  }
  if (!timestamp(member.createdAt) || !timestamp(member.deactivatedAt, true)
    || !string(member.notes, 3000, true) || !string(member.deactivationReason, 1000, true)) {
    return memberLabel + 'Check the member notes and dates.';
  }
  if (!Array.isArray(member.history) || member.history.length > 5000 || !member.history.every(validHistory)) {
    return memberLabel + 'The membership history is invalid.';
  }
  return null;
}

function image(value) {
  return blankable(value, 2_000_000) && (
    value === '' || /^data:image\/(?:jpeg|png|webp|avif|gif);base64,[a-zA-Z0-9+/=]+$/.test(value)
    || /^https:\/\/[^\s]+$/.test(value)
  );
}

function validateSettings(settings) {
  if (!fields(settings, [
    'gymName', 'logo', 'phone', 'email', 'address', 'ownerName', 'ownerEmail', 'profileImage',
    'currency', 'warningDays', 'expiryNotifications', 'defaultPlanId',
  ])) return 'The gym settings have invalid fields.';
  if (!string(settings.gymName, 150) || !blankable(settings.ownerName, 150)
    || !blankable(settings.address, 1000)) return 'Check the gym name, owner name, and address.';
  if (typeof settings.phone !== 'string' || !phone(settings.phone, true)
    || (settings.email !== '' && !isValidEmail(settings.email))
    || (settings.ownerEmail !== '' && !isValidEmail(settings.ownerEmail))) {
    return 'Check the contact phone number and email addresses.';
  }
  if (!image(settings.logo) || !image(settings.profileImage)) {
    return 'Choose a supported image under 1.5 MB.';
  }
  if (!blankable(settings.currency, 5) || !/^[A-Z]{3}$/.test(settings.currency)
    || !Number.isInteger(settings.warningDays) || settings.warningDays < 1 || settings.warningDays > 365
    || typeof settings.expiryNotifications !== 'boolean' || typeof settings.defaultPlanId !== 'string'
    || !identifier(settings.defaultPlanId, true)) {
    return 'Check the currency, expiry warning days, and default plan.';
  }
  return null;
}

export function validateState(state) {
  if (!fields(state, ['members', 'plans', 'settings', 'readNotifications'])
    || !Array.isArray(state.members) || !Array.isArray(state.plans) || !Array.isArray(state.readNotifications)) {
    return 'The submitted gym records have an invalid format.';
  }
  if (state.members.length > 10000 || state.plans.length > 1000 || state.readNotifications.length > 50000) {
    return 'The gym records are too large to save.';
  }

  const planIds = new Set();
  for (const plan of state.plans) {
    const problem = validatePlan(plan);
    if (problem) return problem;
    if (planIds.has(plan.id)) return 'Membership plan IDs must be unique.';
    planIds.add(plan.id);
  }

  const memberIds = new Set();
  for (const member of state.members) {
    const problem = validateMember(member);
    if (problem) return problem;
    if (memberIds.has(member.id)) return 'Member IDs must be unique.';
    memberIds.add(member.id);
  }

  if (!state.readNotifications.every((value) => string(value, 400))) {
    return 'The notification records are invalid.';
  }
  return validateSettings(state.settings);
}
