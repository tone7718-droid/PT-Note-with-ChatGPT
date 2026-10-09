-- ============================================================
-- 물리치료 Progress Note - Supabase 데이터베이스 스키마
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- ============================================================

-- ── 1. therapists 테이블 ──
CREATE TABLE therapists (
  uid TEXT PRIMARY KEY,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  login_id TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'therapist' CHECK (role IN ('therapist', 'master')),
  resigned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_therapists_login_id ON therapists(login_id) WHERE login_id IS NOT NULL AND resigned = FALSE;
CREATE INDEX idx_therapists_auth_user_id ON therapists(auth_user_id);

-- ── 2. progress_notes 테이블 ──
CREATE TABLE progress_notes (
  id TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  patient_name TEXT NOT NULL,
  chart_no TEXT DEFAULT '',
  birth_date TEXT DEFAULT '',
  gender TEXT DEFAULT '',
  diagnosis TEXT NOT NULL,
  pmh TEXT DEFAULT '',
  pain_score INTEGER CHECK (pain_score IS NULL OR (pain_score >= 0 AND pain_score <= 10)),
  pain_areas TEXT[] DEFAULT '{}',
  chief_complaint TEXT DEFAULT '',
  rom JSONB DEFAULT '[]',
  postural TEXT DEFAULT '',
  palpation TEXT DEFAULT '',
  special_test TEXT DEFAULT '',
  treatment TEXT DEFAULT '',
  home_exercise TEXT DEFAULT '',
  note_date TEXT DEFAULT '',
  therapist_snapshot JSONB,
  therapist_uid TEXT REFERENCES therapists(uid),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_therapist_uid ON progress_notes(therapist_uid);
CREATE INDEX idx_notes_saved_at ON progress_notes(saved_at DESC);
CREATE INDEX idx_notes_patient_name ON progress_notes(patient_name);

-- ── 3. updated_at 자동 갱신 트리거 ──
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER therapists_updated_at
  BEFORE UPDATE ON therapists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER progress_notes_updated_at
  BEFORE UPDATE ON progress_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 4. Row Level Security (RLS) ──

-- therapists 테이블 RLS
ALTER TABLE therapists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "therapists_select_authenticated"
  ON therapists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "therapists_insert_master"
  ON therapists FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM therapists t
      WHERE t.auth_user_id = auth.uid() AND t.role = 'master'
    )
  );

CREATE POLICY "therapists_update_self"
  ON therapists FOR UPDATE
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM therapists t
      WHERE t.auth_user_id = auth.uid() AND t.role = 'master'
    )
  )
  WITH CHECK (
    auth_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM therapists t
      WHERE t.auth_user_id = auth.uid() AND t.role = 'master'
    )
  );

-- 위 정책은 본인 행 수정을 허용하므로, 일반 치료사가 자기 role 을 'master' 로
-- 바꾸는 권한 상승을 트리거로 막는다. uid·auth_user_id·role·resigned 는 master 만
-- 바꿀 수 있다. auth.uid() 가 없는 service role(Edge Function)·SQL Editor 는 통과.
CREATE OR REPLACE FUNCTION guard_therapist_privileged_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF (NEW.uid, NEW.auth_user_id, NEW.role, NEW.resigned)
     IS DISTINCT FROM (OLD.uid, OLD.auth_user_id, OLD.role, OLD.resigned)
     AND NOT EXISTS (
       SELECT 1 FROM therapists
       WHERE auth_user_id = auth.uid() AND role = 'master'
     ) THEN
    RAISE EXCEPTION 'Only master can change uid, auth_user_id, role or resigned';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER therapists_guard_privileged_columns
  BEFORE UPDATE ON therapists
  FOR EACH ROW EXECUTE FUNCTION guard_therapist_privileged_columns();

CREATE POLICY "therapists_delete_master"
  ON therapists FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM therapists t
      WHERE t.auth_user_id = auth.uid() AND t.role = 'master'
    )
  );

-- progress_notes 테이블 RLS
ALTER TABLE progress_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select_own_or_master"
  ON progress_notes FOR SELECT
  TO authenticated
  USING (
    therapist_uid IN (
      SELECT uid FROM therapists WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM therapists t
      WHERE t.auth_user_id = auth.uid() AND t.role = 'master'
    )
    OR therapist_uid IS NULL
  );

CREATE POLICY "notes_insert_own_or_master"
  ON progress_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    therapist_uid IN (
      SELECT uid FROM therapists WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM therapists t
      WHERE t.auth_user_id = auth.uid() AND t.role = 'master'
    )
  );

CREATE POLICY "notes_update_own_or_master"
  ON progress_notes FOR UPDATE
  TO authenticated
  USING (
    therapist_uid IN (
      SELECT uid FROM therapists WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM therapists t
      WHERE t.auth_user_id = auth.uid() AND t.role = 'master'
    )
  );

CREATE POLICY "notes_delete_own_or_master"
  ON progress_notes FOR DELETE
  TO authenticated
  USING (
    therapist_uid IN (
      SELECT uid FROM therapists WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM therapists t
      WHERE t.auth_user_id = auth.uid() AND t.role = 'master'
    )
  );

-- ── 5. 노트 이관 RPC 함수 (master 전용) ──
CREATE OR REPLACE FUNCTION transfer_notes(
  from_uid TEXT,
  to_uid TEXT,
  to_name TEXT,
  to_login_id TEXT
)
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM therapists WHERE auth_user_id = auth.uid() AND role = 'master'
  ) THEN
    RAISE EXCEPTION 'Only master can transfer notes';
  END IF;

  UPDATE progress_notes
  SET
    therapist_uid = to_uid,
    therapist_snapshot = jsonb_build_object(
      'uid', to_uid,
      'id', to_login_id,
      'name', to_name,
      'role', 'therapist'
    ),
    updated_at = NOW()
  WHERE therapist_uid = from_uid;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
