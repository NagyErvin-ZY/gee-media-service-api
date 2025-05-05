import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateClaimDto {
  @ApiProperty({
    description: 'User ID of the person requesting the claim',
    example: 'user123',
  })
  @IsNotEmpty()
  @IsString()
  claimRequestorUserId: string;

  @ApiProperty({
    description: 'Name of the upload profile to use for this claim',
    example: 'profile_picture',
  })
  @IsNotEmpty()
  @IsString()
  uploadProfile: string;
}