# Signup email limit

The message "Please wait before requesting another email" was the app's wording for Supabase Auth's `over_email_send_rate_limit` error. It is an email-service limit, not evidence that this particular student already requested an email. The signup form submits once and blocks duplicate submissions while a request is in progress.

Supabase's built-in email provider has a small project-wide quota and is intended for testing. For email-verified public registration, configure custom SMTP and review Authentication rate limits. Official documentation: https://supabase.com/docs/guides/auth/auth-smtp and https://supabase.com/docs/guides/auth/rate-limits.

For this competition's manual stall-verification workflow, an organizer may instead disable inbox confirmation:

1. Open the project's Supabase Dashboard.
2. Open Authentication → Sign In / Providers → Email.
3. Keep the Email provider enabled, turn Confirm email off and save.
4. Retry registration. If an account already exists, sign in instead of creating it again.

Disabling confirmation means email ownership is not verified. It does not approve students: the database still creates a student profile with pending status, and admin approval is required to participate. The existing signup code already handles Supabase returning a session immediately and sends the student to the pending-account screen.

This is a project Auth configuration change; no SQL migration or frontend deployment is required to disable confirmation. The revised frontend error message only clarifies future email-service errors. The agent has not changed the hosted project's Auth configuration.
