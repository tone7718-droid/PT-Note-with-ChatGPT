# Release Automation Guide

## GitHub Secrets

Add these in GitHub repository Settings → Secrets and variables → Actions.

### Windows Desktop Auto-Updater

- `TAURI_SIGNING_PRIVATE_KEY`: the full contents of `.tauri-keys/pt-updater.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password used when the updater key was generated

The local private key file is:

```text
C:\Users\zetz1\OneDrive\Desktop\Progress Note with ChatGPT\pt-progress-note\.tauri-keys\pt-updater.key
```

The password cannot be recovered from the key file. If the password is lost, generate a new updater key pair and ship one manual reinstall before automatic updates can resume.

### Android Release Signing

- `ANDROID_KEYSTORE_BASE64`: base64 text of the upload keystore
- `ANDROID_KEY_ALIAS`: upload key alias
- `ANDROID_KEYSTORE_PASSWORD`: keystore password
- `ANDROID_KEY_PASSWORD`: key password

Create the base64 value on Windows:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\upload-keystore.jks")) | Set-Content android-keystore-base64.txt
```

## Release Commands

Windows desktop release:

```powershell
git tag v0.1.7
git push origin v0.1.7
```

Android AAB build:

```powershell
git tag android-v0.1.7
git push origin android-v0.1.7
```

## What Users See

The installed Windows app checks the latest GitHub Release updater JSON on startup. If a newer signed release exists, the bottom-right update panel appears and the user can update inside the app without downloading the setup file manually.
