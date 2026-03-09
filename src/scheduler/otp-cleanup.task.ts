import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OtpRepository } from '../otp/otp.repository';

@Injectable()
export class OtpCleanupTask {
  private readonly logger = new Logger(OtpCleanupTask.name);

  constructor(private readonly otpRepository: OtpRepository) { }

  // Run every 5 minutes to remove expired OTP records
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCleanup(): Promise<void> {
    const removed = await this.otpRepository.cleanupExpired();
    if (removed > 0) {
      this.logger.log(`Cleaned up ${removed} expired OTP record(s)`);
    }
  }
}