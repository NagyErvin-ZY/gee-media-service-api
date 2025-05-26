import { Controller, Post, Get, Body, Query, Param, UseInterceptors, BadRequestException, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { UploadClaimService } from './upload-claim.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { ClaimResponseDto } from './dto/claim-response.dto';
import { ImageUploadService } from '../image-upload/services/image-upload.service';
import { VideoUploadService } from '../video-upload/services/video-upload.service';
import { ModerationService } from '../../core/moderation/moderation.service';
import { WithDecodedUserJWT, UserID } from '@gpe/backend-common/dist/auth';

@ApiTags('upload-claim')
@Controller('api/v1')
@ApiBearerAuth()
export class UploadClaimController {
  private readonly logger = new Logger(UploadClaimController.name);

  constructor(
    private readonly uploadClaimService: UploadClaimService,
    private readonly imageUploadService: ImageUploadService,
    private readonly videoUploadService: VideoUploadService,
    private readonly moderationService: ModerationService,
  ) {
    this.logger.log('UploadClaimController initialized');
  }

  @Get('claim')
  @ApiOperation({ summary: 'Create a new upload claim' })
  @ApiResponse({
    status: 200,
    description: 'Claim created successfully',
    type: ClaimResponseDto,
  })
  @WithDecodedUserJWT()
  async createClaim(
    @UserID() userId: string,
    @Query('uploadProfile') uploadProfile: string
  ): Promise<ClaimResponseDto> {
    this.logger.log(`Creating claim for authenticated user ${userId} with profile ${uploadProfile}`);
    
    const createClaimDto: CreateClaimDto = {
      claimRequestorUserId: userId,
      uploadProfile: uploadProfile
    };
    
    const response = await this.uploadClaimService.createClaim(createClaimDto);
    this.logger.log(`Claim created with response: ${JSON.stringify(response)}`);
    return response;
  }

  @Get('status')
  @ApiOperation({ summary: 'Check the status of a claim' })
  @ApiQuery({
    name: 'claimId',
    required: true,
    type: String,
    description: 'The claim ID to check status for',
  })
  @ApiResponse({
    status: 200,
    description: 'Claim status',
    type: ClaimResponseDto,
  })
  async getClaimStatus(@Query('claimId') claimId: string): Promise<ClaimResponseDto> {
    this.logger.log(`Checking status for claim ${claimId}`);
    const claim = await this.uploadClaimService.getClaim(claimId);
    return await this.uploadClaimService.formatClaimResponse(claim);
  }

  @Get('rate-limit-info')
  @ApiOperation({ summary: 'Get information about user\'s rate limits for an upload profile' })
  @ApiQuery({
    name: 'uploadProfile',
    required: true,
    type: String,
    description: 'The upload profile to check rate limits for',
  })
  @ApiResponse({
    status: 200,
    description: 'Rate limit information',
    schema: {
      type: 'object',
      properties: {
        uploadProfile: { type: 'string', example: 'profile_picture' },
        maxUploads: { type: 'number', example: 3 },
        periodDays: { type: 'number', example: 30 },
        remainingUploads: { type: 'number', example: 1 },
        nextResetDate: { type: 'string', example: '2025-06-01T23:59:59.999Z' }
      }
    }
  })
  @WithDecodedUserJWT()
  async getRateLimitInfo(
    @UserID() userId: string,
    @Query('uploadProfile') uploadProfile: string
  ): Promise<any> {
    this.logger.log(`Getting rate limit info for user ${userId} and profile ${uploadProfile}`);
    return this.uploadClaimService.getRateLimitInfo(userId, uploadProfile);
  }
}