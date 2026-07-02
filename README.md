# PT-NOTE

> **Proprietary software for physical therapy progress notes.**
> **All rights reserved. No reuse permitted without explicit written permission.**
> See [LICENSE](./LICENSE) for full terms.

물리치료(도수치료) 환자의 평가 및 치료 내용을 기록하기 위한 데스크톱·웹 애플리케이션.

## Tech Stack

- **Frontend**: Next.js 16 (Turbopack, static export), React 19, TypeScript, Tailwind CSS
- **State**: Zustand
- **Backend (cloud mode)**: Supabase (Auth, Postgres, RLS, Edge Functions)
- **Storage (local mode)**: Browser localStorage via `lib/localDataService.ts`
- **Desktop**: Tauri v2 (Windows MSI/NSIS, macOS, Linux)
- **Mobile**: Capacitor v8 (Android, iOS)
- **Web hosting**: Vercel

## Distribution

- **Web**: https://ptnote.vercel.app
- **Windows desktop**: Download the latest installer from [GitHub Releases](https://github.com/tone7718-droid/PT-Note-with-ChatGPT/releases/latest).

The desktop app includes a built-in auto-updater that checks
[`releases/latest/download/latest.json`](https://github.com/tone7718-droid/PT-Note-with-ChatGPT/releases/latest/download/latest.json)
and prompts the user when a new signed release is available.

## Documentation

- [Tauri release procedure](./docs/tauri-release-guide.md)
- [Code signing guide](./docs/code-signing-guide.md)
- [Supabase setup](./docs/supabase-setup-guide.md)
- [Database schema](./docs/supabase-schema.sql)

## License

This project is **proprietary**. The source code is publicly viewable for
transparency, automatic-update manifest hosting, and personal portfolio
purposes only — public viewability does not grant any license to reuse,
modify, or redistribute. See [LICENSE](./LICENSE) for full terms.

For commercial licensing or partnership inquiries, contact: **tone7718@gmail.com**
