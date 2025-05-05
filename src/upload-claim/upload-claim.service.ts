import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { UploadClaim, ClaimStatus, UserUploadStats } from './schemas/upload-claim.schema';
import { CreateClaimDto } from './dto/create-claim.dto';
import { ClaimResponseDto } from './dto/claim-response.dto';
import config from '../config';
import { UploadProfile } from '../config/types';

@Injectable()
export class UploadClaimService {
  private readonly logger = new Logger(UploadClaimService.name);

  constructor(
    @InjectModel(UploadClaim.name) private uploadClaimModel: Model<UploadClaim>,
    @InjectModel(UserUploadStats.name) private userUploadStatsModel: Model<UserUploadStats>,
  ) {
    this.logger.log('UploadClaimService initialized');
  }

  /**
   * Checks if a user has reached their rate limit for a specific upload profile
   * @param userId The user ID to check
   * @param profileName The upload profile name
   * @returns Promise<boolean> True if user has reached their limit, false otherwise
   */
  async hasReachedRateLimit(userId: string, profileName: string): Promise<boolean> {
    this.logger.log(`Checking rate limit for user ${userId} and profile ${profileName}`);
    
    const uploadProfile = this.getUploadProfile(profileName);
    if (!uploadProfile || !uploadProfile.rateLimit) {
      // If no rate limit is configured, default to no limit
      return false;
    }
    
    const { maxUploads, periodDays } = uploadProfile.rateLimit;
    
    // Calculate the cutoff date for the rate limit period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - periodDays);
    
    // Get or create user stats
    let userStats = await this.userUploadStatsModel.findOne({ 
      userId, 
      profileName 
    }).exec();
    
    if (!userStats) {
      // If no stats found, user hasn't uploaded anything yet
      return false;
    }
    
    // Filter upload dates to only include those within the rate limit period
    const recentUploads = userStats.uploadDates.filter(date => date > cutoffDate);
    
    this.logger.log(`User ${userId} has ${recentUploads.length}/${maxUploads} uploads for ${profileName} in the last ${periodDays} days`);
    
    // Check if user has reached their limit
    return recentUploads.length >= maxUploads;
  }

  /**
   * Tracks a successful upload for a user
   * @param userId The user ID
   * @param profileName The upload profile name
   * @returns Promise<void>
   */
  async trackSuccessfulUpload(userId: string, profileName: string): Promise<void> {
    this.logger.log(`Tracking successful upload for user ${userId} and profile ${profileName}`);
    
    // Get or create user stats
    let userStats = await this.userUploadStatsModel.findOne({ 
      userId, 
      profileName 
    }).exec();
    
    if (!userStats) {
      userStats = new this.userUploadStatsModel({
        userId,
        profileName,
        uploadDates: [],
      });
    }
    
    // Add current date to upload dates
    userStats.uploadDates.push(new Date());
    
    await userStats.save();
    this.logger.log(`Successfully tracked upload for user ${userId} and profile ${profileName}`);
  }

  /**
   * Creates a new upload claim for a user
   * @param createClaimDto The claim creation data
   * @returns Promise with the created claim
   */
  async createClaim(createClaimDto: CreateClaimDto): Promise<ClaimResponseDto> {
    this.logger.log(`Creating new claim for user ${createClaimDto.claimRequestorUserId} with profile ${createClaimDto.uploadProfile}`);
    
    // Validate upload profile
    const uploadProfile = this.getUploadProfile(createClaimDto.uploadProfile);
    if (!uploadProfile) {
      const errorMsg = `Upload profile '${createClaimDto.uploadProfile}' not found`;
      this.logger.warn(errorMsg);
      throw new BadRequestException(errorMsg);
    }

    // Check rate limits if configured for this profile
    if (uploadProfile.rateLimit) {
      const hasReachedLimit = await this.hasReachedRateLimit(
        createClaimDto.claimRequestorUserId,
        createClaimDto.uploadProfile
      );
      
      if (hasReachedLimit) {
        const { maxUploads, periodDays } = uploadProfile.rateLimit;
        const errorMsg = `Rate limit reached: You can only upload ${maxUploads} ${createClaimDto.uploadProfile}s in a ${periodDays}-day period`;
        this.logger.warn(`User ${createClaimDto.claimRequestorUserId} has reached rate limit for ${createClaimDto.uploadProfile}`);
        throw new ForbiddenException(errorMsg);
      }
    }

    // Create new claim with a UUID
    const claimId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Claims expire after 24 hours
    
    const newClaim = new this.uploadClaimModel({
      claimId,
      claimRequestorUserId: createClaimDto.claimRequestorUserId,
      uploadProfile: createClaimDto.uploadProfile,
      status: 'pending' as ClaimStatus,
      expiresAt,
    });

    await newClaim.save();
    this.logger.log(`Claim created successfully: ${claimId}`);

    return {
      claimId,
      status: 'pending',
      message: 'Claim request submitted successfully.',
    };
  }

  /**
   * Updates the status of a claim
   * @param claimId The ID of the claim to update
   * @param status The new status
   * @param reason Optional reason for the status change
   * @param fileUrl Optional URL to the uploaded file
   * @param moderationMessage Optional message from moderation
   * @param fileMetadata Optional metadata about the uploaded file
   * @returns Promise with the updated claim
   */
  async updateClaimStatus(
    claimId: string, 
    status: ClaimStatus, 
    reason?: string,
    fileUrl?: string,
    moderationMessage?: string,
    fileMetadata?: any
  ): Promise<UploadClaim> {
    this.logger.log(`Updating claim ${claimId} status to ${status}`);
    
    const claim = await this.uploadClaimModel.findOne({ claimId }).exec();
    if (!claim) {
      const errorMsg = `Claim with ID ${claimId} not found`;
      this.logger.warn(errorMsg);
      throw new NotFoundException(errorMsg);
    }

    const previousStatus = claim.status;
    claim.status = status;
    if (reason) claim.reason = reason;
    if (fileUrl) claim.fileUrl = fileUrl;
    if (moderationMessage) claim.moderationMessage = moderationMessage;
    if (fileMetadata) claim.fileMetadata = fileMetadata;

    await claim.save();
    this.logger.log(`Claim ${claimId} status updated to ${status}`);
    
    // If this is the first time the claim is being marked as 'uploaded', track it for rate limiting
    if (status === 'uploaded' && previousStatus !== 'uploaded') {
      await this.trackSuccessfulUpload(claim.claimRequestorUserId, claim.uploadProfile);
    }
    
    return claim;
  }

  /**
   * Retrieves a claim by its ID
   * @param claimId The ID of the claim to retrieve
   * @returns Promise with the claim, if found
   */
  async getClaim(claimId: string): Promise<UploadClaim> {
    this.logger.log(`Retrieving claim with ID: ${claimId}`);
    
    const claim = await this.uploadClaimModel.findOne({ claimId }).exec();
    if (!claim) {
      const errorMsg = `Claim with ID ${claimId} not found`;
      this.logger.warn(errorMsg);
      throw new NotFoundException(errorMsg);
    }
    
    return claim;
  }

  /**
   * Validates if a claim can be used for uploads
   * @param claimId The ID of the claim to validate
   * @returns Promise with the validated claim
   * @throws NotFoundException if claim is not found
   * @throws ForbiddenException if claim has expired or cannot be used for uploads
   */
  async validateClaimForUpload(claimId: string): Promise<UploadClaim> {
    this.logger.log(`Validating claim ${claimId} for upload`);
    
    const claim = await this.getClaim(claimId);
    
    // Check if claim has expired
    if (claim.expiresAt && new Date() > claim.expiresAt) {
      const errorMsg = `Claim ${claimId} has expired`;
      this.logger.warn(errorMsg);
      throw new ForbiddenException(errorMsg);
    }
    
    // Check if claim can be used based on its current status
    switch (claim.status) {
      case 'pending':
        // Initial state, claim can be used
        return claim;
      
      case 'processing':
        // Upload is already in progress
        throw new ForbiddenException(`Claim ${claimId} is already being processed`);
      
      case 'uploaded':
        // Claim was already used successfully
        throw new ForbiddenException(`Claim ${claimId} has already been successfully used`);
      
      case 'moderation_rejected':
        // Claim was rejected by moderation - no retries
        throw new ForbiddenException(`Claim ${claimId} was rejected by moderation and cannot be retried`);
      
      case 'failed':
        // Need to check if the failure was for a non-transient reason that allows retries
        const retryableFailureReasons = [
          'File processing error.',
          'Server error during processing.',
          'Content moderation failed'
        ];
        
        if (claim.reason && retryableFailureReasons.includes(claim.reason)) {
          this.logger.log(`Allowing retry for claim ${claimId} with retryable failure reason: ${claim.reason}`);
          return claim;
        } else {
          const errorMsg = `Claim ${claimId} failed for a non-retryable reason: ${claim.reason}`;
          this.logger.warn(errorMsg);
          throw new ForbiddenException(errorMsg);
        }
      
      default:
        const errorMsg = `Claim ${claimId} has an invalid status: ${claim.status}`;
        this.logger.warn(errorMsg);
        throw new ForbiddenException(errorMsg);
    }
  }

  /**
   * Gets rate limit information for a user and upload profile
   * @param userId The user ID
   * @param uploadProfile The upload profile name
   * @returns Information about the user's rate limits
   */
  async getRateLimitInfo(userId: string, uploadProfile: string): Promise<any> {
    this.logger.log(`Getting rate limit info for user ${userId} and profile ${uploadProfile}`);
    
    // Get the upload profile configuration
    const profile = config.media.uploadProfiles.find(p => p.name === uploadProfile);
    if (!profile) {
      throw new BadRequestException(`Upload profile ${uploadProfile} not found`);
    }
    
    if (!profile.rateLimit) {
      return {
        uploadProfile,
        maxUploads: 'unlimited',
        periodDays: 'N/A',
        remainingUploads: 'unlimited',
        nextResetDate: 'N/A'
      };
    }
    
    const { maxUploads, periodDays } = profile.rateLimit;
    
    // Get the user's upload stats
    const userStats = await this.userUploadStatsModel.findOne({ 
      userId, 
      profileName: uploadProfile 
    }).exec();
    
    // Calculate cutoff date for rate limit period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - periodDays);
    
    // If user has no stats or no uploads, they have all their uploads available
    if (!userStats || userStats.uploadDates.length === 0) {
      return {
        uploadProfile,
        maxUploads,
        periodDays,
        remainingUploads: maxUploads,
        nextResetDate: 'N/A'
      };
    }
    
    // Filter to get only recent uploads within the period
    const recentUploads = userStats.uploadDates.filter(date => new Date(date) > cutoffDate);
    
    // Calculate remaining uploads
    const remainingUploads = Math.max(0, maxUploads - recentUploads.length);
    
    // Calculate next reset date (when the oldest upload within the period will expire)
    let nextResetDate = 'N/A';
    if (recentUploads.length > 0 && recentUploads.length >= maxUploads) {
      // Sort dates in ascending order
      const sortedDates = [...recentUploads].sort((a, b) => a.getTime() - b.getTime());
      const oldestDate = new Date(sortedDates[0]);
      
      // The reset date is when the oldest upload ages out of the rate limit period
      const resetDate = new Date(oldestDate);
      resetDate.setDate(resetDate.getDate() + periodDays);
      
      nextResetDate = resetDate.toISOString();
    }
    
    return {
      uploadProfile,
      maxUploads,
      periodDays,
      remainingUploads,
      nextResetDate
    };
  }

  /**
   * Formats a claim as a ClaimResponseDto
   * @param claim The claim to format
   * @returns Formatted claim response
   */
  formatClaimResponse(claim: UploadClaim): ClaimResponseDto {
    const response: ClaimResponseDto = {
      claimId: claim.claimId,
      status: claim.status,
      message: this.getMessageForStatus(claim.status),
    };

    if (claim.reason) response.reason = claim.reason;
    if (claim.fileUrl) response.fileUrl = claim.fileUrl;
    if (claim.moderationMessage) response.moderationMessage = claim.moderationMessage;

    return response;
  }

  /**
   * Gets an upload profile by name
   * @param profileName The name of the profile to retrieve
   * @returns The upload profile or null if not found
   */
  private getUploadProfile(profileName: string): UploadProfile | null {
    return config.media.uploadProfiles.find(profile => profile.name === profileName) || null;
  }

  /**
   * Gets a standard message for a claim status
   * @param status The claim status
   * @returns A standard message for the status
   */
  private getMessageForStatus(status: ClaimStatus): string {
    switch (status) {
      case 'pending':
        return 'Claim request submitted successfully.';
      case 'processing':
        return 'File is being processed.';
      case 'uploaded':
        return 'File has been successfully uploaded.';
      case 'failed':
        return 'Upload failed.';
      case 'moderation_rejected':
        return 'Image rejected by moderation.';
      default:
        return 'Unknown status.';
    }
  }
}