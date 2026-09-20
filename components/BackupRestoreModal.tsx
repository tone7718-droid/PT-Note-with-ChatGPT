"use client";
import { useState } from "react";
import { useNoteStore } from "@/store/useNoteStore";
import { Modal } from "@/components/ui/Modal";

export default function BackupRestoreModal({ onClose }: { onClose: () => void }) {
  const restore = useNoteStore(s => s.restoreAutoBackup);
  const [initial] = useState(() => {
    try { return { backups: useNoteStore.getState().getAutoBackups(), error: "" }; }
    catch (err) { return { backups: [], error: (err as Error).message }; }
  });
  const [selected, setSelected] = useState("");
  const [error, setError] = useState(initial.error);
  const [busy, setBusy] = useState(false);
  const restoreSelected = async () => {
    setBusy(true); setError("");
    try {
      const result = await restore(selected);
      alert(`복원 완료: 노트 ${result.notesCount}건으로 되돌렸습니다. 복원 직전 상태도 자동 백업에 남아 있습니다.`);
      onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <Modal size="sm">
    <section role="dialog" aria-modal="true" aria-labelledby="restore-title">
      <h2 id="restore-title" className="text-xl font-bold mb-4">자동 백업 복원</h2>
      <p className="text-sm mb-4">현재 노트 전체가 선택한 시점의 내용으로 교체됩니다. 치료사 계정과 비밀번호는 유지됩니다. 복원 직전 상태도 자동 백업합니다.</p>
      <label htmlFor="restore-snapshot" className="text-sm">복원할 시점</label>
      <select id="restore-snapshot" value={selected} onChange={e => setSelected(e.target.value)} disabled={busy} className="w-full p-3 border rounded-xl dark:bg-slate-800">
        <option value="">백업 선택</option>
        {initial.backups.map(b => <option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleString("ko-KR")} · {b.notesCount}건</option>)}
      </select>
      {!initial.backups.length && <p className="my-3 text-sm">저장된 자동 백업이 없습니다.</p>}
      {error && <p role="alert" className="my-3 text-red-600">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button disabled={busy} onClick={onClose} className="flex-1 p-3 rounded-xl border">취소</button>
        <button disabled={busy || !selected} onClick={restoreSelected} className="flex-1 p-3 rounded-xl bg-blue-600 text-white disabled:opacity-50">{busy ? "복원 중…" : "전체 노트 복원"}</button>
      </div>
    </section>
  </Modal>;
}
