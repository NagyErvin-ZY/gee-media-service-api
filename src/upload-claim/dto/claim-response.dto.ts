import { ApiProperty } from '@nestjs/swagger';
import { ClaimStatus } from '../schemas/upload-claim.schema';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class ClaimResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the claim',
    example: 'claim123',
  })
  @IsString()
  @IsNotEmpty()
  claimId: string;

  @ApiProperty({
    description: 'Current status of the claim',
    example: 'pending',
    enum: ['pending', 'processing', 'uploaded', 'failed', 'moderation_rejected'],
  })
  @IsEnum(['pending', 'processing', 'uploaded', 'failed', 'moderation_rejected'])
  status: ClaimStatus;

  @ApiProperty({
    description: 'Message about the claim status',
    example: 'Claim request submitted successfully.',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'Reason for failure or rejection (if applicable)',
    example: 'File size exceeds the limit.',
    required: false,
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({
    description: 'URL to access the uploaded file (if status is uploaded)',
    example: 'https://example.com/uploads/profile_pictures/claim123.jpg',
    required: false,
  })
  @IsUrl()
  @IsOptional()
  fileUrl?: string;

  @ApiProperty({
    description: 'Additional message from moderation (if status is moderation_rejected)',
    example: 'Inappropriate content detected.',
    required: false,
  })
  @IsString()
  @IsOptional()
  moderationMessage?: string;
}