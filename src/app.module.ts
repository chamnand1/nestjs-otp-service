import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OtpModule } from './otp/otp.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

@Module({
  imports: [
    ScheduleModule.forRoot(),  // ต้อง import ก่อน SchedulerModule
    OtpModule,
    SchedulerModule,
  ],
  providers: [
    // Global validation pipe — rejects invalid DTOs before hitting controllers
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    // Global exception filter — uniform error responses
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule { }