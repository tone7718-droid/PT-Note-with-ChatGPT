"use client";
import { useState } from "react";
import { setupInitialMaster } from "@/lib/localDataService";
import { useAuthStore } from "@/store/useAuthStore";
export default function InitialSetup({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="setup-title" className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6">
    <h2 id="setup-title" className="text-xl font-bold mb-3">최초 관리자 설정</h2>
    <p className="text-sm mb-4">이 기기의 관리자 ID는 master입니다. 직접 정한 비밀번호로 시작합니다.</p>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try {
        if (password !== confirm) throw new Error("비밀번호 확인이 일치하지 않습니다.");
        await setupInitialMaster(name, password);
        await useAuthStore.getState().signIn("master", password);
        onDone();
      } catch (err) { setError((err as Error).message); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm">관리자 이름<input required value={name} onChange={e => setName(e.target.value)} className="block w-full p-3 border rounded-lg dark:bg-slate-800" /></label>
        <label className="block text-sm">비밀번호(8자 이상)<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} className="block w-full p-3 border rounded-lg dark:bg-slate-800" /></label>
        <label className="block text-sm">비밀번호 확인<input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} className="block w-full p-3 border rounded-lg dark:bg-slate-800" /></label>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <button className="w-full p-3 bg-blue-600 text-white rounded-lg">{busy ? "설정 중…" : "관리자 설정 완료"}</button>
      </fieldset>
    </form>
  </section></div>;
}
