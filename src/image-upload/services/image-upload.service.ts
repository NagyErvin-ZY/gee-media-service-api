import { Injectable, Logger, UnsupportedMediaTypeException, BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { AwsS3Service } from '../../aws/aws-s3.service';
import { Observable, map, switchMap, tap, from, throwError, of, forkJoin, firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ImageProcessorService } from './image-processor.service';
import { ImageOptions } from '../../shared/interfaces/image-options.interface';
import { UploadResult } from '../../shared/interfaces/upload-result.interface';
import config from '../../config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ImageAsset } from '../../shared/schemas/image-asset.schema';
import { UploadClaimService } from '../../upload-claim/upload-claim.service';
import { ModerationService, ModerationResult } from '../../moderation/moderation.service';

interface ProcessedImageInfo {
    buffer: Buffer;
    info: {
        width: number;
        height: number;
    };
}

interface UploadContext {
    userId: string;
    claimId: string;
    profileName: string;
    folderPath: string;
    file: Express.Multer.File;
    mainImageInfo?: ProcessedImageInfo;
    mainImageUrl?: string;
    resolutionUrls?: Record<string, string>;
    moderationResult?: ModerationResult;
    moderationWarning?: string;
}

@Injectable()
export class ImageUploadService {
    private readonly logger = new Logger(ImageUploadService.name);

    constructor(
        private readonly awsS3Service: AwsS3Service,
        private readonly imageProcessorService: ImageProcessorService,
        private readonly uploadClaimService: UploadClaimService,
        private readonly moderationService: ModerationService,
        @InjectModel(ImageAsset.name) private imageAssetModel: Model<ImageAsset>
    ) {
        this.logger.log('ImageUploadService initialized');
    }

    /**
     * Upload an image with processing using a valid claim
     * @param file The image file
     * @param claimId The claim ID for this upload
     * @param userId The ID of the user performing the upload
     * @returns Observable with upload result
     */
    uploadImageWithClaim(
        file: Express.Multer.File,
        claimId: string,
        userId: string
    ): Observable<UploadResult> {
        this.logger.log(`Starting claim-based image upload: filename=${file.originalname}, claimId=${claimId}`);

        // Validate file type first
        if (!this.validateFileType(file)) {
            const errorMsg = `File type ${file.mimetype} not allowed. Allowed types: ${config.media.allowedMimeTypes.join(', ')}`;
            this.logger.warn(errorMsg);
            return throwError(() => new UnsupportedMediaTypeException(errorMsg));
        }

        let uploadContext: UploadContext | undefined;

        // Chain each step of the process together
        return this.validateAndPrepareUpload(file, claimId, userId).pipe(
            tap(context => {
                // Store context in wider scope for error handling
                uploadContext = context;
            }),
            switchMap(context => {
                // Process everything in parallel - moderation, main image, and all resolutions
                return this.runFullParallelProcessing(context);
            }),
            switchMap(context => {
                // After ALL processing is done, check if moderation failed
                if (context.moderationResult?.isInappropriate) {
                    this.logger.warn(`Content moderation detected issue: ${context.moderationResult.message}`);
                    
                    // Handle moderation failure - update claim status and clean up all uploaded files
                    this.handleModerationFailure(context.claimId, context.moderationResult, context.folderPath);
                    
                    // Instead of throwing an error, return a rejection directly
                    return of(new HttpException(
                        'Content moderation failed', 
                        HttpStatus.METHOD_NOT_ALLOWED
                    )).pipe(
                        // Using mergeMap and throwError prevents the uncaught exception in logs
                        // while still returning proper HTTP 405 response
                        switchMap(error => throwError(() => error))
                    );
                }
                
                // If moderation passed, finalize the upload
                return this.finalizeUpload(context);
            }),
            // Global error handling
            tap({
                error: (error) => {
                    // Only handle general upload errors, moderation is handled above
                    if (!(error instanceof HttpException) && uploadContext) {
                        this.handleUploadError(uploadContext.claimId, error);
                    } else if (!(error instanceof HttpException)) {
                        this.logger.error(`Error during upload process: ${error.message}`, error.stack);
                    }
                }
            })
        );
    }

    /**
     * Run all processing and uploads in parallel (moderation, main image, and all resolutions)
     */
    private runFullParallelProcessing(context: UploadContext): Observable<UploadContext> {
        this.logger.log('Starting parallel processing of everything: moderation + all image processing');

        const profile = config.media.uploadProfiles.find(p => p.name === context.profileName);
        if (!profile) {
            return throwError(() => new BadRequestException(`Profile ${context.profileName} not found`));
        }

        // Create observable for moderation check
        const moderationCheck$ = from(this.moderationService.moderateImage(context.file.buffer)).pipe(
            tap(moderationResult => {
                this.logger.log(`Image moderation completed: ${moderationResult.isInappropriate ? 'Failed' : 'Passed'}`);
                if (moderationResult.isInappropriate) {
                    this.logger.warn(`Moderation failure reason: ${moderationResult.message}`);
                }
            })
        );

        // Get image options from profile
        const imageOptions: ImageOptions = this.extractImageOptions(profile);

        // Process the main image
        const mainImage$ = this.imageProcessorService.processImage(context.file.buffer, imageOptions).pipe(
            switchMap(mainImageInfo => {
                this.logger.log(`Main image processing completed: width=${mainImageInfo.info.width}px, height=${mainImageInfo.info.height}px`);

                // Upload the main image as index.webp in the folder
                const mainFilePath = `${context.folderPath}index.webp`;
                this.logger.log(`Uploading main image to: ${mainFilePath}`);

                return this.awsS3Service.uploadFile(mainFilePath, mainImageInfo.buffer, 'image/webp').pipe(
                    map(mainImageUrl => ({
                        mainImageInfo,
                        mainImageUrl
                    }))
                );
            })
        );

        // Process all additional resolutions in parallel
        const resolutions = profile.constraints?.resolutions || [];
        let resolutions$ = of({ resolutionUrls: {} as Record<string, string> });
        
        if (resolutions.length > 0) {
            this.logger.log(`Processing ${resolutions.length} additional resolutions for profile ${context.profileName}`);
            
            const resolutionObservables = resolutions.map(resolution =>
                this.processAndUploadResolution(context, resolution)
            );

            resolutions$ = forkJoin(resolutionObservables).pipe(
                map(results => {
                    const resolutionUrls: Record<string, string> = {};
                    results.forEach(item => {
                        resolutionUrls[item.suffix] = item.url;
                    });
                    return { resolutionUrls };
                })
            );
        }

        // Run all processing in parallel and combine results
        return forkJoin({
            moderationResult: moderationCheck$,
            mainImage: mainImage$,
            resolutions: resolutions$
        }).pipe(
            map(({ moderationResult, mainImage, resolutions }) => {
                return {
                    ...context,
                    moderationResult,
                    mainImageInfo: mainImage.mainImageInfo,
                    mainImageUrl: mainImage.mainImageUrl,
                    resolutionUrls: resolutions.resolutionUrls
                };
            })
        );
    }

    /**
     * Handle moderation failure by cleaning up uploads and updating claim
     */
    private handleModerationFailure(claimId: string, moderationResult: ModerationResult, folderPath?: string): void {
        this.logger.warn(`Handling moderation failure for claim ${claimId}`);

        // Update claim to failed status with moderation error message
        // Using 'failed' status instead of 'moderation_rejected' to make it retryable
        this.uploadClaimService.updateClaimStatus(
            claimId,
            'failed',
            'Content moderation failed',
            undefined,
            moderationResult.message
        ).catch(error => {
            this.logger.error(`Failed to update claim status: ${error.message}`, error.stack);
        });

        // Delete uploaded files if a folder path was specified
        if (folderPath) {
            this.awsS3Service.deleteFolder(folderPath).catch(error => {
                this.logger.error(`Failed to delete uploaded files after moderation failure: ${error.message}`, error.stack);
            });
        }
    }

    /**
     * Validates file type against allowed MIME types
     */
    private validateFileType(file: Express.Multer.File): boolean {
        return config.media.allowedMimeTypes.includes(file.mimetype);
    }

    /**
     * Validates the upload claim and prepares the upload context
     */
    private validateAndPrepareUpload(
        file: Express.Multer.File,
        claimId: string,
        userId: string
    ): Observable<UploadContext> {
        this.logger.log(`Validating claim for upload. claimId=${claimId}, userId=${userId}`);

        return from(this.uploadClaimService.validateClaimForUpload(claimId)).pipe(
            switchMap(claim => {
                // Check if the user ID matches the claim requestor
                if (String(claim.claimRequestorUserId) !== String(userId)) {
                    this.logger.warn(`User ${userId} is not authorized to use claim ${claimId}`);
                    return throwError(() => new ForbiddenException(`User ${userId} is not authorized to use claim ${claimId}`));
                }

                // Get profile configuration
                const profileName = claim.uploadProfile;
                const profile = config.media.uploadProfiles.find(p => p.name === profileName);

                if (!profile) {
                    this.logger.warn(`Upload profile ${profileName} not found`);
                    return throwError(() => new BadRequestException(`Upload profile ${profileName} not found`));
                }

                this.logger.log(`Using profile ${profileName} for upload`);

                // Update claim status to processing
                return from(this.uploadClaimService.updateClaimStatus(claimId, 'processing')).pipe(
                    map(() => {
                        // Determine S3 prefix based on profile
                        let s3Prefix = 'images/';
                        if (profile.s3 && profile.s3.prefix) {
                            s3Prefix = profile.s3.prefix;
                        }

                        // Generate a UUID for the hash folder
                        const folderPath = `${s3Prefix}${uuidv4()}/`;
                        this.logger.log(`Generated folder path for S3: ${folderPath}`);

                        // Return the upload context
                        return {
                            userId,
                            claimId,
                            profileName,
                            folderPath,
                            file
                        };
                    })
                );
            })
        );
    }

    /**
     * Process and upload a single resolution
     */
    private processAndUploadResolution(context: UploadContext, resolution: any): Observable<{ suffix: string, url: string }> {
        return this.imageProcessorService.processImageAtResolution(context.file.buffer, resolution).pipe(
            switchMap(({ buffer: resBuffer, info }) => {
                const resolutionPath = `${context.folderPath}${resolution.suffix}.webp`;
                this.logger.log(`Uploading ${resolution.suffix} version to: ${resolutionPath}`);

                return this.awsS3Service.uploadFile(resolutionPath, resBuffer, 'image/webp').pipe(
                    map(url => ({
                        suffix: resolution.suffix,
                        url
                    }))
                );
            })
        );
    }

    /**
     * Creates records and finalizes the upload
     */
    private finalizeUpload(context: UploadContext): Observable<UploadResult> {
        const { mainImageInfo, mainImageUrl, userId, claimId, profileName, resolutionUrls, file, moderationWarning } = context;

        // Handle case where mainImageInfo might be undefined
        if (!mainImageInfo || !mainImageUrl) {
            return throwError(() => new Error('Main image processing failed'));
        }

        // Create metadata for the upload
        const fileMetadata = this.createFileMetadata(mainImageInfo, file.originalname, resolutionUrls);

        // Include moderation warning in metadata if available
        if (moderationWarning) {
            fileMetadata.moderationWarning = moderationWarning;
        }

        // Update claim status
        this.updateClaimStatus(claimId, mainImageUrl, fileMetadata);

        // Create and save upload record
        this.createAndSaveRecord(userId, profileName, mainImageInfo, mainImageUrl, file.originalname, claimId, resolutionUrls, moderationWarning);

        // Return the upload result
        const result = this.createUploadResult(mainImageInfo, mainImageUrl, resolutionUrls);
        
        // Include moderation warning in the result if available
        if (moderationWarning) {
            result.moderationWarning = moderationWarning;
        }
        
        return of(result);
    }

    /**
     * Extracts image options from profile constraints
     */
    private extractImageOptions(profile: any): ImageOptions {
        const imageOptions: ImageOptions = {};

        if (profile.constraints) {
            const constraints = profile.constraints;
            if (constraints.minWidth) imageOptions.minWidth = constraints.minWidth;
            if (constraints.minHeight) imageOptions.minHeight = constraints.minHeight;
            if (constraints.maxWidth) imageOptions.maxWidth = constraints.maxWidth;
            if (constraints.maxHeight) imageOptions.maxHeight = constraints.maxHeight;
            if (constraints.aspectRatio) imageOptions.aspectRatio = constraints.aspectRatio;
            if (constraints.allowedDeviation) imageOptions.allowedDeviation = constraints.allowedDeviation;
        }

        return imageOptions;
    }

    /**
     * Creates file metadata object
     */
    private createFileMetadata(mainImageInfo: ProcessedImageInfo, originalFilename: string, resolutionUrls?: Record<string, string>): any {
        const metadata: any = {
            width: mainImageInfo.info.width,
            height: mainImageInfo.info.height,
            format: 'webp',
            size: mainImageInfo.buffer.length,
            originalFilename
        };

        if (resolutionUrls) {
            metadata.resolutions = resolutionUrls;
        }

        return metadata;
    }

    /**
     * Updates claim status to uploaded
     */
    private updateClaimStatus(claimId: string, fileUrl: string, fileMetadata: any): void {
        this.uploadClaimService.updateClaimStatus(
            claimId,
            'uploaded',
            'File successfully uploaded and processed',
            fileUrl,
            undefined,
            fileMetadata
        ).catch(error => {
            this.logger.error(`Failed to update claim status: ${error.message}`, error.stack);
        });
    }

    /**
     * Creates and saves an upload record
     */
    private createAndSaveRecord(
        userId: string,
        profileName: string,
        mainImageInfo: ProcessedImageInfo,
        mainImageUrl: string,
        originalFilename: string,
        claimId: string,
        resolutionUrls?: Record<string, string>,
        moderationWarning?: string
    ): void {
        const recordData: any = {
            userId,
            profileName,
            storageUrl: mainImageUrl,
            fileSize: mainImageInfo.buffer.length,
            width: mainImageInfo.info.width,
            height: mainImageInfo.info.height,
            format: 'webp',
            originalFilename,
            claimId: claimId
        };

        // Format resolutions data to match our new schema structure
        if (resolutionUrls) {
            recordData.resizedVersions = {};
            
            // Convert the simple URL map to more structured data
            Object.entries(resolutionUrls).forEach(([suffix, url]) => {
                // Extract necessary information for each resolution
                let width = 0;
                let height = 0;
                
                // Try to get dimensions from profile config
                const profile = config.media.uploadProfiles.find(p => p.name === profileName);
                if (profile && profile.constraints && profile.constraints.resolutions) {
                    const resolutionConfig = profile.constraints.resolutions.find(r => r.suffix === suffix);
                    if (resolutionConfig) {
                        width = resolutionConfig.width;
                        height = resolutionConfig.height;
                    }
                }
                
                // Extract storage key from URL
                const urlParts = url.split('/');
                const storageKey = urlParts.slice(3).join('/');
                
                // Add to resizedVersions object
                recordData.resizedVersions[suffix] = {
                    url: url,
                    width: width,
                    height: height,
                    storageKey: storageKey
                };
            });
        }

        // Include moderation warning in record if available
        if (moderationWarning) {
            if (!recordData.metaData) recordData.metaData = {};
            recordData.metaData.moderationWarning = moderationWarning;
        }

        const record = new this.imageAssetModel(recordData);

        record.save().catch(error => {
            this.logger.error(`Failed to save image asset record: ${error.message}`, error.stack);
        });
    }

    /**
     * Creates the upload result object
     */
    private createUploadResult(
        mainImageInfo: ProcessedImageInfo,
        mainImageUrl: string,
        resolutionUrls?: Record<string, string>
    ): UploadResult {
        const result: any = {
            url: mainImageUrl,
            fileSize: mainImageInfo.buffer.length,
            width: mainImageInfo.info.width,
            height: mainImageInfo.info.height,
            format: 'webp'
        };

        if (resolutionUrls) {
            result.resolutions = resolutionUrls;
        }

        return result;
    }

    /**
     * Handles errors during upload process
     */
    private handleUploadError(claimId: string, error: any): void {
        const errorMsg = error.message || 'Unknown error during image processing';
        this.logger.error(`Error processing image for claim ${claimId}: ${errorMsg}`, error.stack);

        // Update claim to failed status with error message
        this.uploadClaimService.updateClaimStatus(
            claimId,
            'failed',
            'File processing error.',
            undefined,
            errorMsg
        ).catch(updateError => {
            this.logger.error(`Failed to update claim failure status: ${updateError.message}`, updateError.stack);
        });
    }

    /**
     * Get user uploads with pagination
     */
    async getUserUploads(userId: string, limit?: number, skip?: number) {
        this.logger.log(`Getting upload history for user ${userId}, limit=${limit}, skip=${skip}`);
        return this.imageAssetModel.find({ userId })
            .sort({ createdAt: -1 })
            .limit(limit || 100)
            .skip(skip || 0)
            .exec();
    }

    /**
     * Get a specific upload record by ID
     */
    async getRecordById(recordId: string) {
        this.logger.log(`Getting image asset with ID: ${recordId}`);
        return this.imageAssetModel.findById(recordId).exec();
    }
}