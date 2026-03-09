import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import { OtpRepository } from './otp.repository';
import { OtpResponseDto } from './otp.dto';

// ─── Lockout Tracker ─────────────────────────────────────────────────────────

interface LockoutRecord {
  lockedUntil: Date;
  failCount: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  // Lockout store — replace with Redis in production
  private readonly lockouts = new Map<string, LockoutRecord>();

  // Lockout tiers: after N failures, lock for X minutes
  private readonly LOCKOUT_TIERS = [
    { after: 5, lockMinutes: 5 },
    { after: 10, lockMinutes: 30 },
    { after: 15, lockMinutes: 1440 }, // 24 hours
  ];

  constructor(private readonly otpRepository: OtpRepository) { }

  // ── Request OTP ──────────────────────────────────────────────────────────

  async requestOtp(phoneNumber: string): Promise<OtpResponseDto> {
    this.checkLockout(phoneNumber);

    const otp = this.generateSecureOtp();
    const sessionId = randomUUID();

    const record = await this.otpRepository.save(phoneNumber, otp, sessionId);

    // TODO: replace with real SMS gateway (Twilio, AWS SNS, etc.)
    await this.sendOtp(phoneNumber, otp);

    // NEVER log the OTP itself
    this.logger.log(`OTP requested for ${this.maskPhone(phoneNumber)}, session: ${sessionId}`);

    return {
      success: true,
      message: 'OTP sent successfully',
      sessionId,
      expiresAt: record.expiresAt,
    };
  }

  // ── Verify OTP ───────────────────────────────────────────────────────────

  async verifyOtp(
    phoneNumber: string,
    otp: string,
    sessionId: string,
  ): Promise<OtpResponseDto> {
    this.checkLockout(phoneNumber);

    const result = await this.otpRepository.verify(sessionId, phoneNumber, otp);

    if (!result.valid) {
      return this.handleVerifyFailure(phoneNumber, result.reason!);
    }

    // Reset lockout on success
    this.lockouts.delete(phoneNumber);
    this.logger.log(`OTP verified successfully for ${this.maskPhone(phoneNumber)}`);

    return {
      success: true,
      message: 'OTP verified successfully',
    };
  }

  // ── Generate cryptographically secure 6-digit OTP ────────────────────────

  private generateSecureOtp(): string {
    // randomInt(min, max) is cryptographically secure (uses CSPRNG)
    const otp = randomInt(0, 1_000_000);
    return otp.toString().padStart(6, '0');
  }

  // ── Lockout check ────────────────────────────────────────────────────────

  private checkLockout(phoneNumber: string): void {
    const lockout = this.lockouts.get(phoneNumber);
    if (!lockout) return;

    if (new Date() < lockout.lockedUntil) {
      const remainingMs = lockout.lockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60_000);
      throw new BadRequestException(
        `Account temporarily locked. Try again in ${remainingMin} minute(s).`,
      );
    }
  }

  // ── Handle verify failure with progressive lockout ───────────────────────

  private handleVerifyFailure(
    phoneNumber: string,
    reason: string,
  ): OtpResponseDto {
    // Generic message — never reveal exact reason to client
    const genericMessage = 'Invalid or expired OTP';

    if (reason === 'not_found' || reason === 'expired') {
      return { success: false, message: genericMessage };
    }

    if (reason === 'phone_mismatch') {
      this.logger.warn(`Phone mismatch attack attempt on ${this.maskPhone(phoneNumber)}`);
      return { success: false, message: genericMessage };
    }

    // Track failures for lockout
    const existing = this.lockouts.get(phoneNumber) ?? { lockedUntil: new Date(0), failCount: 0 };
    const failCount = existing.failCount + 1;

    const tier = [...this.LOCKOUT_TIERS]
      .reverse()
      .find((t) => failCount >= t.after);

    if (tier) {
      const lockedUntil = new Date(Date.now() + tier.lockMinutes * 60_000);
      this.lockouts.set(phoneNumber, { lockedUntil, failCount });
      this.logger.warn(
        `Lockout applied to ${this.maskPhone(phoneNumber)}: ${tier.lockMinutes}min (${failCount} failures)`,
      );
    } else {
      this.lockouts.set(phoneNumber, { lockedUntil: new Date(0), failCount });
    }

    return { success: false, message: genericMessage };
  }

  // ── SMS Gateway (stub) ───────────────────────────────────────────────────

  private async sendOtp(phoneNumber: string, otp: string): Promise<void> {
    // Replace with real provider, e.g.:
    // await this.twilioClient.messages.create({ to: phoneNumber, body: `Your OTP: ${otp}` })
    this.logger.debug(`[STUB] Sending OTP to ${this.maskPhone(phoneNumber)}`);
  }

  // ── Mask phone for safe logging ──────────────────────────────────────────

  private maskPhone(phone: string): string {
    return phone.replace(/(\+?\d{2,3})\d+(\d{4})/, '$1****$2');
  }
}