// Supabase Edge Function: create-therapist
//
// ⚠️ 현재 미사용 — 앱은 로컬 모드(lib/localDataService.ts)로 운영 중이며
// 치료사 등록은 localDataService.createTherapist 가 처리함.
// 클라우드 모드 복귀 시를 대비해 보존.
//
// Master 계정만 호출 가능. 새 치료사의 Auth 사용자 + therapists 테이블 레코드를 생성.
//
// 배포: supabase functions deploy create-therapist
// 필요한 환경변수 (Supabase Dashboard > Edge Functions > Secrets):
//   SUPABASE_SERVICE_ROLE_KEY (자동 제공됨)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 호출자 인증 확인 — Authorization 헤더에서 JWT 추출
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "인증이 필요합니다. (no auth header)" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "인증이 필요합니다. (empty jwt)" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin 클라이언트 생성 (service role — auth.getUser(jwt) 및 이후 DB 작업에 공용 사용)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 호출자 사용자 조회 — JWT를 명시적으로 전달
    const { data: { user: callerUser }, error: getUserError } = await adminClient.auth.getUser(jwt);
    if (getUserError || !callerUser) {
      return new Response(
        JSON.stringify({ error: `인증 실패: ${getUserError?.message ?? "user not found"}` }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 호출자가 master인지 확인 (service role로 직접 조회 — RLS 우회)
    const { data: callerTherapist, error: therapistLookupError } = await adminClient
      .from("therapists")
      .select("role")
      .eq("auth_user_id", callerUser.id)
      .single();

    if (therapistLookupError || !callerTherapist || callerTherapist.role !== "master") {
      return new Response(
        JSON.stringify({
          error: `마스터 권한이 필요합니다. ${therapistLookupError?.message ?? ""}`.trim(),
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 요청 바디 파싱
    const { loginId, name, password } = await req.json();
    if (!loginId || !name || !password) {
      return new Response(JSON.stringify({ error: "loginId, name, password가 필요합니다." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ID 중복 확인
    const { data: existing } = await adminClient
      .from("therapists")
      .select("uid")
      .eq("login_id", loginId)
      .eq("resigned", false)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "이미 사용 중인 ID입니다." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth 사용자 생성
    const email = `${loginId.toLowerCase().replace(/\s+/g, "-")}@pt-clinic.internal`;
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return new Response(JSON.stringify({ error: `Auth 사용자 생성 실패: ${authError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // therapists 테이블에 레코드 삽입
    const uid = `T-${Date.now()}`;
    const { data: therapist, error: insertError } = await adminClient
      .from("therapists")
      .insert({
        uid,
        auth_user_id: authData.user.id,
        login_id: loginId,
        name,
        role: "therapist",
        resigned: false,
      })
      .select()
      .single();

    if (insertError) {
      // rollback: auth 사용자 삭제
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return new Response(JSON.stringify({ error: `치료사 레코드 생성 실패: ${insertError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ therapist }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
