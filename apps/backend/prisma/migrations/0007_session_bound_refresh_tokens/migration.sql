-- Bind refresh tokens to the session that issued them so revoking a session
-- (or signing out everywhere) actually invalidates its refresh-token chain.
ALTER TABLE "RefreshToken" ADD COLUMN "sessionId" TEXT;

CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");

ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invitation tokens are bearer secrets; store only their SHA-256 digest.
-- Pending invitations keep working: the application hashes the presented
-- token before lookup, and the existing raw tokens are hashed in place here.
-- (Raw tokens and digests are both 64 hex chars, so this must run exactly
-- once — which Prisma Migrate guarantees.)
UPDATE "Invitation"
SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "status" = 'PENDING';
