# AeN Shift Windows distribution

Release 1 uses a deliberately small Windows installer as the entry point to the existing AeN Shift SaaS. It does not bundle the API, PostgreSQL, credentials, tenant data, source workbooks, or an embedded browser runtime.

## Architecture

- Inno Setup produces a per-user `.exe` installer.
- The installer registers normal Windows uninstall metadata and installs the AeN Shift icon plus release information.
- Start menu and optional desktop shortcuts open the compile-time HTTPS SaaS URL in the user's default browser.
- The existing React/Vite PWA, authentication, `/api` same-origin routing, service worker, and SaaS deployment remain authoritative.
- Version `1.0.0-musubi.1` is visible in the installer metadata, Windows installed-apps list, download page, and installed release information.

## Build on Windows

Install Inno Setup 6, then run from the repository root:

```powershell
ISCC.exe /DSaaSUrl="https://your-approved-aen-shift-host.example" distribution\windows\installer\AeNShift.iss
```

The URL must use HTTPS. Do not pass database URLs, passwords, tokens, private workbook paths, or tenant data. The GitHub Actions workflow performs the same build on a Windows runner and uploads an unpublished distribution artifact for review.

## Release policy

- Release 1 starts with manual updates by a replacement installer. The stable `AppId` enables an in-place upgrade.
- Auto-update is intentionally out of scope until signing, hosting, rollback, and update integrity policy are established.
- Publish the generated site only behind an access gateway or another authenticated, auditable download mechanism.
- Sign the installer before pilot distribution whenever a trusted Windows code-signing identity is available. Never suppress or bypass SmartScreen.

## Windows acceptance checklist

The following require a real Windows 10/11 machine and are not proven by a macOS build:

1. Verify Authenticode signature (or record the expected unsigned SmartScreen experience for the pilot).
2. Install without administrator rights and with administrator policy enabled.
3. Confirm Start menu and optional desktop icons.
4. Launch, reach the production login page over HTTPS, and complete an authorized trial login.
5. Confirm no API/DB secrets or tenant files exist under the install directory.
6. Exit the browser/PWA, uninstall from Windows Settings, and verify shortcuts/files are removed.
7. Reinstall the same version, then test an in-place upgrade with a newer test version.
