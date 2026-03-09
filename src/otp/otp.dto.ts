import { IsString, IsPhoneNumber, Length, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsPhoneNumber()
  phoneNumber: string;
}

export class VerifyOtpDto {
  @IsPhoneNumber()
  phoneNumber: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  otp: string;

  @IsString()
  sessionId: string;
}

export class OtpResponseDto {
  success: boolean;
  message: string;
  sessionId?: string;
  expiresAt?: Date;
}