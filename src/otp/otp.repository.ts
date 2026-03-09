import { Injectable, Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface OtpRecord {
  hashedOtp: string;
  phoneNumber: string;
  sessionId: string;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
}

// ─── Repository ───────────────────────────────────────────────────────────────
// NOTE: Uses in-memory Map for demo. Replace with Redis in production:
//   await this.redis.set(key, JSON.stringify(record), 'PX', ttlMs);

@Injectable()
export class OtpRepository {
  private readonly logger = new Logger(OtpRepository.name);
  private readonly store = new Map<string, OtpRecord>();
  private readonly OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_ATTEMPTS = 5;

  // ── Hash OTP with SHA-256 (store hash, never plaintext) ──────────────────

  private hashOtp(otp: string, sessionId: string): string {
    // HMAC-style: hash(otp + sessionId) to bind OTP to session
    return createHash('sha256')
      .update(`${otp}:${sessionId}`)
      .digest('hex');
  }

  // ── Save OTP record ──────────────────────────────────────────────────────

  async save(phoneNumber: string, otp: string, sessionId: string): Promise<OtpRecord> {
    // Invalidate any existing OTP for this phone number first
    await this.invalidateByPhone(phoneNumber);

    const now = new Date();
    const record: OtpRecord = {
      hashedOtp: this.hashOtp(otp, sessionId),
      phoneNumber,
      sessionId,
      attempts: 0,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.OTP_TTL_MS),
    };

    this.store.set(sessionId, record);
    this.logger.log(`OTP saved for phone: ${this.maskPhone(phoneNumber)}, session: ${sessionId}`);
    return record;
  }

  // ── Find record by sessionId ─────────────────────────────────────────────

  async findBySession(sessionId: string): Promise<OtpRecord | null> {
    const record = this.store.get(sessionId);
    if (!record) return null;

    // Auto-expire check
    if (new Date() > record.expiresAt) {
      this.store.delete(sessionId);
      this.logger.log(`OTP expired and removed for session: ${sessionId}`);
      return null;
    }

    return record;
  }

  // ── Verify OTP using constant-time comparison ────────────────────────────
  // Prevents timing attacks by always taking the same time regardless of match

  async verify(sessionId: string, phoneNumber: string, otp: string): Promise<{
    valid: boolean;
    reason?: 'not_found' | 'expired' | 'phone_mismatch' | 'max_attempts' | 'invalid_otp';
  }> {
    const record = await this.findBySession(sessionId);

    if (!record) {
      return { valid: false, reason: 'not_found' };
    }

    if (record.phoneNumber !== phoneNumber) {
      this.logger.warn(`Phone mismatch for session: ${sessionId}`);
      return { valid: false, reason: 'phone_mismatch' };
    }

    if (record.attempts >= this.MAX_ATTEMPTS) {
      await this.delete(sessionId);
      return { valid: false, reason: 'max_attempts' };
    }

    // Increment attempt BEFORE checking (prevent race condition)
    record.attempts += 1;
    this.store.set(sessionId, record);

    // Constant-time comparison to prevent timing attacks
    const expectedHash = Buffer.from(this.hashOtp(otp, sessionId));
    const actualHash = Buffer.from(record.hashedOtp);

    let isMatch = false;
    if (expectedHash.length === actualHash.length) {
      isMatch = timingSafeEqual(expectedHash, actualHash);
    }

    if (!isMatch) {
      this.logger.warn(
        `Invalid OTP attempt ${record.attempts}/${this.MAX_ATTEMPTS} for session: ${sessionId}`,
      );
      return { valid: false, reason: 'invalid_otp' };
    }

    // ✅ Valid — delete immediately (one-time use)
    await this.delete(sessionId);
    return { valid: true };
  }

  // ── Delete OTP record ────────────────────────────────────────────────────

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  // ── Invalidate all OTPs for a phone number ───────────────────────────────

  async invalidateByPhone(phoneNumber: string): Promise<void> {
    for (const [sessionId, record] of this.store.entries()) {
      if (record.phoneNumber === phoneNumber) {
        this.store.delete(sessionId);
      }
    }
  }

  // ── Cleanup expired records (run via cron) ───────────────────────────────

  async cleanupExpired(): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const [sessionId, record] of this.store.entries()) {
      if (now > record.expiresAt) {
        this.store.delete(sessionId);
        count++;
      }
    }
    return count;
  }

  // ── Mask phone number for safe logging ──────────────────────────────────

  private maskPhone(phone: string): string {
    return phone.replace(/(\+?\d{2,3})\d+(\d{4})/, '$1****$2');
  }
}