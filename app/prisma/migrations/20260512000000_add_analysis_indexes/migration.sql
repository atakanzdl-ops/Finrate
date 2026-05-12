-- AddIndex: analyses.userId (performans — full table scan önleme)
CREATE INDEX "analyses_userId_idx" ON "analyses"("userId");

-- AddIndex: analyses.entityId (performans — entity bazlı analiz sorguları)
CREATE INDEX "analyses_entityId_idx" ON "analyses"("entityId");
