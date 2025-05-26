import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VideoAsset } from '../../../shared/schemas/video-asset.schema';
import { VideoProcessorService } from './video-processor.service';
import { UploadClaimService } from '../../upload-claim/upload-claim.service';
import config from '../../../config';
import { ClaimStatus } from 'src/backend-for-frontend/upload-claim/schemas/upload-claim.schema';

@Injectable()
export class VideoUploadService {
  private readonly logger = new Logger(VideoUploadService.name);

  constructor(
    @InjectModel(VideoAsset.name) private videoAssetModel: Model<VideoAsset>,
    private readonly videoProcessorService: VideoProcessorService,
    private readonly uploadClaimService: UploadClaimService
  ) {
    this.logger.log('VideoUploadService initialized');
  }

  /**
   * Create a direct upload URL for videos using a claim
   * @param userId The user ID
   * @param claimId The claim ID for this upload
   * @param originalFilename Optional original filename
   * @param params Optional additional parameters
   * @returns The direct upload URL and related information
   */
  async createDirectUploadWithClaim(
    userId: string,
    claimId: string,
    originalFilename?: string
  ) {
    this.logger.log(`Creating claim-based direct upload: userId=${userId}, claimId=${claimId}`);

    // Validate the claim and get profile information
    try {
      const claim = await this.uploadClaimService.validateClaimForUpload(claimId);

      // Check if the user ID matches the claim requestor - fix string comparison issues
      if (String(claim.claimRequestorUserId).trim() !== String(userId).trim()) {
        const errorMsg = `User ${userId} is not authorized to use claim ${claimId}`;
        this.logger.warn(errorMsg);
        throw new ForbiddenException(errorMsg);
      }

      // Get the profile name from the claim
      const profileName = claim.uploadProfile;

      // Get profile configuration
      const profile = config.videoProfiles.find(p => p.name === profileName);
      if (!profile) {
        const errorMsg = `Video profile ${profileName} not found`;
        this.logger.warn(errorMsg);
        throw new BadRequestException(errorMsg);
      }

      this.logger.log(`Using video profile ${profileName} for upload`);

      // Update claim status to processing
      await this.uploadClaimService.updateClaimStatus(claimId,ClaimStatus.PROCESSING) ;

      // Create the direct upload via the processor service
      const result = await this.videoProcessorService.createDirectUpload(
        userId,
        profileName,
        originalFilename,
        claimId
      );

      this.logger.log(`Direct upload created successfully: ${result.muxDirectUploadId}`);

      // Return the upload information
      return {
        uploadId: result.uploadId,
        url: result.uploadUrl,
        muxDirectUploadId: result.muxDirectUploadId,
        id: `video-${(result.asset as any)._id.toString()}`,
        profileName,
        maxSizeBytes: profile.maxSizeBytes,
        maxDurationSeconds: profile.maxDurationSeconds,
        allowedFormats: profile.allowedFormats,
      };

    } catch (error) {
      this.logger.error(`Error creating direct upload with claim: ${error.message}`, error.stack);

      // If there was an error, update the claim status to failed
      if (claimId) {
        try {
          await this.uploadClaimService.updateClaimStatus(
            claimId,
            ClaimStatus.FAILED,
            'Error creating video upload',
            undefined,
            error.message
          );
        } catch (updateError) {
          this.logger.error(`Failed to update claim status: ${updateError.message}`, updateError.stack);
        }
      }

      // Re-throw the original error
      throw error;
    }
  }

  /**
   * Check the status of a video upload
   */
  async checkUploadStatus(uploadId: string) {
    this.logger.log(`Checking status of upload ${uploadId}`);

    const asset = await this.videoAssetModel.findOne({
      passTroughUploadID: uploadId
    }).exec();

    return asset?.status || 'unknown';
  }

  /**
   * Get a specific video asset by ID
   */
  async getVideoAsset(assetId: string) {
    this.logger.log(`Getting video asset ${assetId}`);

    const asset = await this.videoAssetModel.findById(assetId).exec();

    if (!asset) {
      throw new NotFoundException(`Video asset with ID ${assetId} not found`);
    }

    return asset;
  }

  /**
   * Get a video asset by ID, but only if the user is the owner
   * @param assetId The ID of the video asset to retrieve
   * @param userId The ID of the user making the request
   * @returns The full video asset details if the user is the owner
   */
  async getVideoAssetForOwner(assetId: string, userId: string) {
    this.logger.log(`Getting video asset ${assetId} for owner ${userId}`);

    const asset = await this.videoAssetModel.findById(assetId).exec();

    if (!asset) {
      throw new NotFoundException(`Video asset with ID ${assetId} not found`);
    }

    // Check if the user is the owner of this asset
    if (String(asset.userId) !== String(userId)) {
      this.logger.warn(`User ${userId} attempted to access video asset ${assetId} but is not the owner`);
      throw new ForbiddenException(`User is not authorized to access this video asset`);
    }

    // Return the complete asset with all raw data
    return asset;
  }

}