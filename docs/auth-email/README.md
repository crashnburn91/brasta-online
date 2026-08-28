# Brasta authentication email branding

These templates are designed for the Supabase Auth project used by Brasta.

## Recommended sender

- **Sender name:** Brasta
- **Sender email:** `login@brasta.app`
- **Magic Link subject:** `Your Brasta sign-in link`
- **Confirm signup subject:** `Welcome to Brasta — confirm your email`

## Supabase templates

Under **Authentication → Email Templates**:

- **Magic Link:** use `brasta-magic-link.html`
- **Confirm signup:** use `brasta-confirm-signup.html`

The templates use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, so the user-facing authentication link stays on `brasta.app`. They also display Supabase's `{{ .Token }}` six-digit OTP. The Brasta `/auth/confirm` page verifies clicked links with `verifyOtp()`, while the account modal can verify the six-digit code with the requested email address. This lets a player open the email on one device and type the code into the device they actually want to sign in on.

## Custom SMTP with Resend

After adding and verifying `brasta.app` in Resend, configure Supabase under **Project Settings / Authentication → SMTP Settings** using the SMTP credentials shown by Resend.

Recommended identity:

- **From:** `Brasta <login@brasta.app>`
- **Reply-to:** `support@brasta.app` if that mailbox exists; otherwise use `login@brasta.app`

Keep the Supabase email redirect/site URL settings pointed at:

- `https://brasta.app`
- `https://brasta.app/auth/callback`

## Notes

- The email uses table layout and inline CSS for broad email-client compatibility.
- The visual language matches Brasta's dark green and matte-gold branding.
- Keep the token-hash link pointed at `/auth/confirm`; do not switch it back to `{{ .ConfirmationURL }}` unless you intentionally want the email to expose the Supabase Auth domain.
- Once SMTP is enabled, send a real sign-in email and verify SPF/DKIM/DMARC alignment before relying on it for production auth.
