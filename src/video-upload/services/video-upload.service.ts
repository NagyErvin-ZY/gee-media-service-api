import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VideoAsset } from '../../shared/schemas/video-asset.schema';
import { VideoProcessorService } from './video-processor.service';
import { UploadClaimService } from '../../upload-claim/upload-claim.service';
import config from '../../config';

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
    originalFilename?: string,
    params?: Record<string, any>
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
      await this.uploadClaimService.updateClaimStatus(claimId, 'processing');
      
      // Create the direct upload via the processor service
      const result = await this.videoProcessorService.createDirectUpload(
        userId,
        profileName,
        originalFilename,
        params,
        claimId
      );
      
      this.logger.log(`Direct upload created successfully: ${result.muxDirectUploadId}`);
      
      // Return the upload information
      return {
        uploadId: result.uploadId,
        url: result.uploadUrl,
        muxDirectUploadId: result.muxDirectUploadId,
        assetId: result.asset._id ? result.asset._id.toString() : undefined,
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
            'failed',
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
      $or: [
        { muxUploadId: uploadId },
        { muxDirectUploadId: uploadId },
        { muxAssetId: uploadId }
      ] 
    }).exec();
    
    if (!asset) {
      throw new NotFoundException(`Upload with ID ${uploadId} not found`);
    }
    
    // If the asset has a claim ID, check if we need to update the claim status
    if (asset.claimId) {
      try {
        // Safely convert claimId to string - fixing TypeScript error
        let claimId: string;
        
        // For Mongoose ObjectId (which has toString method)
        if (asset.claimId && typeof asset.claimId === 'object' && asset.claimId !== null) {
          // Using any type assertion to bypass TypeScript error
          claimId = (asset.claimId as any).toString();
        } else {
          // For string or other types
          claimId = String(asset.claimId);
        }
        
        const claim = await this.uploadClaimService.getClaim(claimId);
        
        // If the claim is still in processing status but the asset is ready, update it
        if (claim.status === 'processing' && asset.status === 'ready') {
          // Get playback URL from the asset's muxInfo
          const playbackUrl = asset.muxInfo?.playbackId 
            ? `https://stream.mux.com/${asset.muxInfo.playbackId}.m3u8` 
            : undefined;
            
          await this.uploadClaimService.updateClaimStatus(
            claimId,
            'uploaded',
            'Video successfully processed and ready for playback',
            playbackUrl,
            undefined,
            {
              assetId: asset._id ? asset._id.toString() : undefined,
              duration: asset.duration,
              status: asset.status,
              thumbnailUrl: asset.thumbnailUrl
            }
          );
        }
        // If the asset has a failed status, update the claim accordingly
        else if (asset.status === 'errored') {
          await this.uploadClaimService.updateClaimStatus(
            claimId,
            'failed',
            'Video processing failed',
            undefined,
            asset.errorMessage || 'Unknown error during video processing'
          );
        }
      } catch (error) {
        this.logger.error(`Error updating claim status for upload ${uploadId}: ${error.message}`, error.stack);
      }
    }
    
    return asset;
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
   * Handle webhook events from Mux
   */
  async handleWebhook(body: any, signature?: string) {
    this.logger.log(`Received webhook of type: ${body.type || 'unknown'}`);
    
    // Process the webhook using the processor service
    const result = await this.videoProcessorService.handleMuxWebhook(body, signature);
    
    if (result) {
      this.logger.log(`Successfully processed webhook: ${body.type}`);
      
      // Check if we need to update claim status for any affected asset
      if (body.type === 'video.asset.ready' || body.type === 'video.asset.errored') {
        const assetId = body.data?.id;
        if (assetId) {
          // Find the asset and update related claim if needed
          const asset = await this.videoAssetModel.findOne({ muxAssetId: assetId }).exec();
          if (asset && asset.claimId) {
            await this.checkUploadStatus(assetId);
          }
        }
      }
    } else {
      this.logger.warn(`Failed to process webhook: ${body.type}`);
    }
    
    return { status: 'received' };
  }
}