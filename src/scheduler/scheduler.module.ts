import { Module } from '@nestjs/common';
import { OtpModule } from 'src/otp/otp.module';
import { OtpCleanupTask } from './otp-cleanup.task';

@Module({
  imports: [OtpModule],
  providers: [OtpCleanupTask],
})
export class SchedulerModule { }