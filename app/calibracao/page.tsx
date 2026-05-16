-- ============================================================
-- LIDER 360 v2 — BLOCO 8: Tabelas pra Calibração Trimestral
-- ============================================================

-- TABELA 1: ima_manual (sobrescreve IMA automático)
CREATE TABLE IF NOT EXISTS ima_manual (
  id bigserial PRIMARY KEY,
  id_groot text NOT NULL,
  nome text,
  processo text,
  quarter_ref text NOT NULL,  -- ex: '2026-Q1', '2026-Q2'
  valor_ima integer NOT NULL,
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE (id_groot, quarter_ref)
);

ALTER TABLE ima_manual DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ima_manual_quarter ON ima_manual(quarter_ref);
CREATE INDEX IF NOT EXISTS idx_ima_manual_id_groot ON ima_manual(id_groot);

-- TABELA 2: como_manual (sobrescreve COMO automático)
CREATE TABLE IF NOT EXISTS como_manual (
  id bigserial PRIMARY KEY,
  id_groot text NOT NULL,
  nome text,
  processo text,
  quarter_ref text NOT NULL,
  nota_como text NOT NULL,  -- 'Supera' | 'Alinhado' | 'Abaixo'
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE (id_groot, quarter_ref)
);

ALTER TABLE como_manual DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_como_manual_quarter ON como_manual(quarter_ref);
CREATE INDEX IF NOT EXISTS idx_como_manual_id_groot ON como_manual(id_groot);

-- Verificação
SELECT 'ima_manual' as tabela, COUNT(*) as registros FROM ima_manual
UNION ALL
SELECT 'como_manual', COUNT(*) FROM como_manual;
