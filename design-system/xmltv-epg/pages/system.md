# System pages (Users, Roles, RADIUS servers, My account)

Overrides `../MASTER.md` only where stated.

- **User type indicator** (`UserTypeIndicator`, `.type-indicator` +
  `.type-dot.is-local|.is-remote`): a 9px dot followed by the text "Local" or
  "Remote". Local uses `--success` (green), remote uses `--warning-strong`
  (orange). It is the first column of the Users table and appears in the
  user form's type cards (`.radio-cards`) and on My account. Never shown
  without its text label.
- **Permission matrix** (`.permission-matrix`): sections as rows, Full / Read /
  Edit / Delete / Import / Export as centered checkbox columns with a header
  checkbox that sets the column for every section. Same normalization as the
  backend: Full checks everything, any action checks Read, unchecking Read
  clears the row. The built-in Administrator role shows the matrix disabled.
  The role dialog uses the large (880px) size.
- **Secrets** (RADIUS shared secret) are write-only: the form field is empty
  on edit with the hint "A secret is stored and never shown. Leave empty to
  keep it."; the table shows a "Secret stored" badge.
- **2FA enrollment** shows the QR code (`.qr-code`, dark-on-light in both
  themes), the manual key in `.secret-text` grouped in blocks of four, and a
  6-digit `.code-input` (`inputmode="numeric"`, `autocomplete="one-time-code"`).
- Users, Roles and RADIUS tables have no bulk selection (few records, and
  each action is security-sensitive and confirmed individually).
