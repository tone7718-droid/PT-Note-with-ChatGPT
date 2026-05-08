# Tauri 데스크톱 앱 — 릴리즈 & 자동 업데이트 가이드

## 1. 준비된 것들

- Tauri v2 프로젝트 (`src-tauri/`)
- 업데이터 플러그인 (`@tauri-apps/plugin-updater`, `tauri-plugin-updater`)
- 업데이트 서명 키페어 (`.tauri-keys/pt-updater.key` + `.pub`)
  - **Public key**: `tauri.conf.json`의 `plugins.updater.pubkey`에 이미 내장됨
  - **Private key**: `.tauri-keys/` 폴더 (gitignore 처리됨) — **절대 커밋 금지**
  - **Private key password**: `.tauri-keys/pt-updater.passphrase.txt` (gitignore 처리됨) — **절대 커밋 금지**
- 업데이트 체크 UI (`components/UpdateChecker.tsx`, `app/page.tsx` 등록 완료)
- 업데이트 매니페스트 URL: `https://github.com/zetz1/pt-progress-note/releases/latest/download/latest.json`
  - → GitHub 계정/repo 이름이 다르면 `tauri.conf.json` 수정 필요

---

## 2. 릴리즈 절차 (매번 새 버전 낼 때)

### ① 버전 번호 올리기
두 파일의 `version`을 같은 값으로 맞춘다 (semver):
- `package.json` → `"version": "0.2.0"`
- `src-tauri/tauri.conf.json` → `"version": "0.2.0"`
- `src-tauri/Cargo.toml` → `version = "0.2.0"`

### ② 로컬에서 서명된 빌드 생성

Private key를 환경변수로 전달하며 빌드:

```powershell
# PowerShell (Windows)
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw ".tauri-keys\pt-updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content -Raw ".tauri-keys\pt-updater.passphrase.txt"
npm run tauri:build
```

빌드가 끝나면 다음 경로에 산출물이 생긴다:
```
src-tauri/target/release/bundle/
├── msi/
│   ├── PT Progress Note_0.2.0_x64_en-US.msi
│   └── PT Progress Note_0.2.0_x64_en-US.msi.sig      ← 서명 파일
└── nsis/
    ├── PT Progress Note_0.2.0_x64-setup.exe
    └── PT Progress Note_0.2.0_x64-setup.exe.sig       ← 서명 파일
```

### ③ `latest.json` 매니페스트 작성

업데이터가 이 JSON을 읽어 버전·서명·URL을 확인한다.

```json
{
  "version": "0.2.0",
  "notes": "- 차트 인쇄 레이아웃 개선\n- 통증 점수 아이콘 수정",
  "pub_date": "2026-04-23T10:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<.msi.sig 파일 내용을 그대로 붙여넣기>",
      "url": "https://github.com/zetz1/pt-progress-note/releases/download/v0.2.0/PT.Progress.Note_0.2.0_x64_en-US.msi"
    }
  }
}
```

> `signature` 는 `.msi.sig` 파일의 **내용**을 그대로 복사한다 (파일 경로 아님).
> GitHub URL에 공백이 있으면 `.`으로 자동 치환됨 (`PT Progress Note` → `PT.Progress.Note`).

### ④ GitHub Release 생성

GitHub에서 새 태그로 Release를 만들고 **3개 파일 업로드**:
1. `PT Progress Note_0.2.0_x64_en-US.msi`
2. `PT Progress Note_0.2.0_x64_en-US.msi.sig`
3. `latest.json`

Release 태그: `v0.2.0` (매니페스트 URL의 `latest/download/`는 "latest release"를 자동으로 가리킴).

### ⑤ 검증

- 설치된 이전 버전(v0.1.0) 실행
- 3초 후 우측 하단에 "새 버전 사용 가능" 모달이 떠야 함
- "지금 업데이트" 클릭 → 다운로드 → 자동 재시작 → 새 버전으로 실행되는지 확인

---

## 3. GitHub Actions 자동화 (선택)

수동 빌드가 번거로우면 tag push 시 자동 빌드/릴리즈하는 워크플로를 추가할 수 있다.
대략적인 순서:

1. GitHub repo Settings → Secrets에 다음 등록:
   - `TAURI_SIGNING_PRIVATE_KEY`: `.tauri-keys/pt-updater.key` 파일 전체 내용
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: `.tauri-keys/pt-updater.passphrase.txt` 파일 내용
2. `.github/workflows/release.yml` 에 `tauri-apps/tauri-action@v0` 사용
3. `git tag v0.2.0 && git push --tags` 만 하면 자동 빌드+서명+매니페스트 업로드

필요하면 따로 워크플로 YAML 작성 도와줄 것.

---

## 4. 주의사항

- **Private key 분실 시** 기존 설치본으로 업데이트를 보낼 수 없다 → 사용자가 수동 재설치 필요. 키는 안전한 곳에 백업.
- **첫 릴리즈(v0.1.0)는 업데이트 불가** — 업데이트는 "이미 설치된 버전 → 새 버전"으로 전환되는 기능. 사용자는 `v0.1.0` 설치파일은 수동으로 받아서 설치해야 함.
- **`createUpdaterArtifacts: true`** 설정으로 `.sig` 파일이 빌드 시 자동 생성된다.
