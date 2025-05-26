import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ClaimBasedUploadDto {
  @ApiProperty({
    description: 'The claim ID for this upload',
    required: true,
    example: '38e7df21-a229-4d3c-b302-29c4a4e4d110',
  })
  @IsNotEmpty()
  @IsString()
  claimId: string;
}