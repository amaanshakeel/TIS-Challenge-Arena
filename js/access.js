export function destination(profile) {
  if (profile?.status !== 'approved') return 'account.html';
  if (profile.role === 'admin') return 'admin.html';
  if (profile.role === 'student') return 'student.html';
  return 'account.html';
}

export function accountState(profile) {
  if (!profile) return { title: 'Account information unavailable', message: 'We could not find your participant profile. Try refreshing your status or visit the TIS stall for help.', tone:'error' };
  const states = {
    pending: { title:'Verification pending', message:'Your account is awaiting approval from the TIS administration. Puzzle access becomes available after approval.', tone:'warning' },
    rejected: { title:'Registration not approved', message:'Your registration has been rejected. This account is not approved to participate. Visit the TIS stall if you need clarification.', tone:'error' },
    terminated: { title:'Access restricted', message:'Your competition access has been terminated. Historical participation records are preserved. Visit the TIS stall for assistance.', tone:'error' },
  };
  return states[profile.status] ?? { title:'Access unavailable', message:'Your account is not eligible for competition access. Please visit the TIS stall.', tone:'error' };
}
