import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OtpService } from './otp.service';
import { RequestOtpDto, VerifyOtpDto, OtpResponseDto } from './otp.dto';

@Controller('otp')
@UseGuards(ThrottlerGuard)
export class OtpController {
  constructor(private readonly otpService: OtpService) { }

  // ── POST /otp/request ────────────────────────────────────────────────────
  // Throttle: max 3 requests/min, 10 requests/hour (from ThrottlerModule config)

  @Post('request')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() dto: RequestOtpDto): Promise<OtpResponseDto> {
    return this.otpService.requestOtp(dto.phoneNumber);
  }

  // ── POST /otp/verify ─────────────────────────────────────────────────────
  // Tighter throttle for verify: prevent brute-force at HTTP layer too

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<OtpResponseDto> {
    return this.otpService.verifyOtp(dto.phoneNumber, dto.otp, dto.sessionId);
  }
}