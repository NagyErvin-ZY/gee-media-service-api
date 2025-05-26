import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class ClaimBasedVideoUploadDto {
  @ApiProperty({
    description: 'The claim ID for this upload',
    required: true,
    example: '38e7df21-a229-4d3c-b302-29c4a4e4d110',
  })
  @IsNotEmpty()
  @IsString()
  claimId: string;

  @ApiProperty({
    description: 'The original filename of the video',
    required: false,
    example: 'my-video.mp4',
  })
  @IsOptional()
  @IsString()
  originalFilename?: string;
  
  @ApiProperty({
    description: 'Additional parameters for the video upload',
    required: false,
    additionalProperties: true,
  })
  @IsOptional()
  params?: Record<string, any>;
}