-- CreateTable: group_elimination_entries (Faz 7.4.1-A)
-- Yıl + firma çifti + hesap kodu bazlı eliminasyon kayıtları.
-- GroupElimination (group_eliminations) soft-deprecated — Faz 7.4.1-E'de migrate edilecek.

CREATE TABLE "group_elimination_entries" (
    "id"              TEXT NOT NULL,
    "groupId"         TEXT NOT NULL,
    "year"            INTEGER NOT NULL,
    "period"          TEXT NOT NULL,
    "fromEntityId"    TEXT NOT NULL,
    "fromAccountCode" TEXT NOT NULL,
    "toEntityId"      TEXT NOT NULL,
    "toAccountCode"   TEXT NOT NULL,
    "amount"          DECIMAL(20,2) NOT NULL,
    "description"     TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_elimination_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: composite unique
-- Aynı grup × yıl × dönem × firma çifti × hesap kodu çifti → tek kayıt
CREATE UNIQUE INDEX "group_elimination_entries_unique_key"
    ON "group_elimination_entries"(
        "groupId", "year", "period",
        "fromEntityId", "fromAccountCode",
        "toEntityId",   "toAccountCode"
    );

-- CreateIndex: hızlı arama (groupId, year, period)
CREATE INDEX "group_elimination_entries_groupId_year_period_idx"
    ON "group_elimination_entries"("groupId", "year", "period");

-- AddForeignKey: groupId → groups (CASCADE — grup silinince entries de silinir)
ALTER TABLE "group_elimination_entries"
    ADD CONSTRAINT "group_elimination_entries_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: fromEntityId → entities (RESTRICT — entity silinmeden entry silinmeli)
ALTER TABLE "group_elimination_entries"
    ADD CONSTRAINT "group_elimination_entries_fromEntityId_fkey"
    FOREIGN KEY ("fromEntityId") REFERENCES "entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: toEntityId → entities (RESTRICT)
ALTER TABLE "group_elimination_entries"
    ADD CONSTRAINT "group_elimination_entries_toEntityId_fkey"
    FOREIGN KEY ("toEntityId") REFERENCES "entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
