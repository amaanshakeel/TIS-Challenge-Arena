export const PENDING_MESSAGE = 'Your registration has been received. Please visit the TIS stall for verification and further information.';

export function validateRegistration(data, semesters) {
  const values = {};
  for (const field of ['full_name','email','registration_number','department','semester']) values[field] = String(data[field] ?? '').trim();
  values.email = values.email.toLowerCase();
  values.password = String(data.password ?? '');
  const errors = {};
  for (const [field, label, min, max] of [['full_name','full name',2,100],['registration_number','registration number',1,50],['department','department',2,100]]) {
    if (values[field].length < min || values[field].length > max || /[\x00-\x1f\x7f]/.test(values[field])) errors[field] = `Enter a ${label} between ${min} and ${max} characters.`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254) errors.email = 'Enter a valid email address.';
  if (values.password.length < 12 || values.password.length > 128) errors.password = 'Use a password between 12 and 128 characters.';
  if (values.password !== data.confirm_password) errors.confirm_password = 'Your passwords do not match.';
  if (!semesters.map(String).includes(values.semester)) errors.semester = 'Choose a valid semester.';
  values.semester = Number(values.semester);
  return { values, errors };
}

export function authErrorMessage(error, context = 'general') {
  const messages = {
    invalid_credentials: 'The email or password is incorrect. Please try again.',
    email_not_confirmed: 'Please confirm your email using the link in your inbox before signing in.',
    user_already_exists: 'An account may already use this email. Please sign in or check your confirmation email.',
    email_exists: 'An account may already use this email. Please sign in or check your confirmation email.',
    weak_password: 'Choose a stronger password of at least 12 characters.',
    over_request_rate_limit: 'Too many requests. Please wait a moment before trying again.',
    over_email_send_rate_limit: 'Please wait before requesting another email.',
    signup_disabled: 'Registration is temporarily unavailable. Please visit the TIS stall.',
    validation_failed: 'Check your information and try again.',
    session_not_found: 'Your session has expired. Please sign in again.',
    configuration: 'Online sign-in is not configured yet. Please visit the TIS stall for assistance.',
    client_load: 'We could not load the sign-in service. Check your connection and reload this page.',
  };
  if (messages[error?.code]) return messages[error.code];
  if (context === 'register') return 'Registration could not be completed. Check your information. If your registration number is already registered, sign in or visit the TIS stall.';
  return 'We could not complete that request. Check your connection and try again.';
}
