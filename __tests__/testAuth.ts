import { hashPassword } from "@/lib/hashUtils";
import { signIn } from "@/lib/localDataService";
/** Simulate an existing installation for backward-compatibility tests, not new-app setup. */
export async function seedLegacyAdmin() {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem("pt_local_therapists", JSON.stringify([{ uid: "master-default", id: "master", name: "마스터", role: "master", resigned: false, passwordHash: await hashPassword("0000") }]));
  await signIn("master", "0000");
}
export async function addTransferTarget(uid = "to", id = "PT-002", name = "새 담당자") {
  const records = JSON.parse(localStorage.getItem("pt_local_therapists")!);
  records.push({ uid, id, name, role: "therapist", resigned: false, passwordHash: await hashPassword("test-password") });
  localStorage.setItem("pt_local_therapists", JSON.stringify(records));
}
