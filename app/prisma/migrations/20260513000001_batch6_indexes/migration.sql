-- Faz 7.5.6: Composite DB index genişletme (Batch 6)

-- Group: userId + createdAt (list sorguları hızlanır)
CREATE INDEX IF NOT EXISTS "groups_userId_createdAt_idx"
  ON "groups" ("userId", "createdAt");

-- TenzilatEntry: groupId + year + period + isActive
-- (/api/groups/[id]/consolidate tenzilat sorgusu)
CREATE INDEX IF NOT EXISTS "tenzilat_entries_groupId_year_period_isActive_idx"
  ON "tenzilat_entries" ("groupId", "year", "period", "isActive");

-- TenzilatEntry: userId + deletedAt + createdAt
-- (/api/tenzilat GET list sorgusu)
CREATE INDEX IF NOT EXISTS "tenzilat_entries_userId_deletedAt_createdAt_idx"
  ON "tenzilat_entries" ("userId", "deletedAt", "createdAt");

-- Analysis: userId + mode + reportedAt
-- (/api/raporlar ve rapor bazlı filtreleme)
CREATE INDEX IF NOT EXISTS "analyses_userId_mode_reportedAt_idx"
  ON "analyses" ("userId", "mode", "reportedAt");
