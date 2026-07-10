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

- **Web**: https://ptnote3.vercel.app
- **Windows desktop**: Download the latest installer from [GitHub Releases](https://github.com/tone7718-droid/PT-Note-with-ChatGPT/releases/latest).

The desktop app includes a built-in auto-updater that checks
[`releases/latest/download/latest.json`](https://github.com/tone7718-droid/PT-Note-with-ChatGPT/releases/latest/download/latest.json)
and prompts the user when a new signed release is available.

### App Identifier Migration (v0.1.7+)

이 앱의 식별자가 `com.ptclinic.ptnote3` 로 변경되었습니다. 이전 버전은
자매 프로젝트 [PT-Progress-Note](https://github.com/tone7718-droid/PT-Progress-Note)와
같은 식별자(`com.ptclinic.progressnote`)를 사용해 같은 PC 에 두 앱을
설치할 수 없었고, 자동 업데이트가 서로 엉킬 수 있었습니다.

**기존 데스크톱 사용자 마이그레이션 절차** — 식별자가 바뀌면 새 설치가
별도 앱으로 취급되어 로컬 데이터(WebView 저장소)가 자동으로 이어지지
않고, 구버전에는 새 식별자로의 자동 업데이트도 배달되지 않습니다:

1. 기존 앱에서 **데이터 내보내기**로 백업 파일 저장
2. 기존 앱 제거 후 [최신 릴리스](https://github.com/tone7718-droid/PT-Note-with-ChatGPT/releases/latest) 설치
3. 새 앱에서 **데이터 가져오기**로 백업 파일 복원

Android(Capacitor)도 `applicationId` 가 동일하게 변경되어 기존 설치와
별개 앱으로 설치됩니다. 같은 절차(내보내기 → 새 앱 설치 → 가져오기)로
데이터를 옮긴 뒤 이전 앱을 제거하세요.

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
