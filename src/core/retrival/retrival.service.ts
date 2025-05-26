import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { forkJoin, from, Observable, of } from 'rxjs';
import { map, mergeMap, catchError } from 'rxjs/operators';
import { IImageAsset, IVideoAsset } from '@gpe/backend-common/dist/schema/media';
import { ImageAsset } from '../../shared/schemas/image-asset.schema';
import { VideoAsset } from '../../shared/schemas/video-asset.schema';

interface AssetTypeMap {
    image: string[];
    video: string[];
    [key: string]: string[];
}

export interface AssetExistenceResult {
    exists: boolean;
    type?: string;
}

export interface BulkExistenceResult {
    [assetId: string]: AssetExistenceResult;
}

@Injectable()
export class RetrivalService {
    constructor(
        @InjectModel(ImageAsset.name) private readonly imageAssetModel: Model<IImageAsset>,
        @InjectModel(VideoAsset.name) private readonly videoAssetModel: Model<IVideoAsset>
    ) { }

    async getAssetById(assetId: string): Promise<IImageAsset | IVideoAsset> {
        const [type, id] = assetId.split('-');

        if (!type || !id) {
            throw new BadRequestException('Invalid asset ID format. Expected format: {type}-{id}');
        }

        if (type.toLowerCase() === 'image') {
            const asset = await this.getImageAssetById(id);
            return this.withPrefixedId(asset, 'image');
        } else if (type.toLowerCase() === 'video') {
            const asset = await this.getVideoAssetById(id);
            return this.withPrefixedId(asset, 'video');
        } else {
            throw new BadRequestException(`Invalid asset type: ${type}. Expected 'image' or 'video'`);
        }
    }

    async getMultipleAssets(assetIds: string[]): Promise<Record<string, IImageAsset | IVideoAsset>> {
        // Enforce maximum limit of 25 assets
        if (assetIds.length > 25) {
            throw new BadRequestException('Cannot retrieve more than 25 assets at once');
        }

        // If no assets requested, return empty result
        if (assetIds.length === 0) {
            return {};
        }

        // Group asset IDs by type
        const groupedAssets = this.groupAssetsByType(assetIds);

        // Create a map to preserve original asset IDs
        const idMap: Record<string, string> = {};
        assetIds.forEach(assetId => {
            const [type, id] = assetId.split('-');
            if (type && id) {
                idMap[id] = assetId;
            }
        });

        // Prepare observables for each asset type query
        const imageObservable = this.fetchImageAssets(groupedAssets.image);
        const videoObservable = this.fetchVideoAssets(groupedAssets.video);

        // Run all queries in parallel using forkJoin
        const result = await forkJoin({
            images: imageObservable,
            videos: videoObservable
        }).pipe(
            map(({ images, videos }) => {
                const resultMap: Record<string, IImageAsset | IVideoAsset> = {};

                // Map results back to original asset IDs
                images.forEach((image: IImageAsset) => {
                    const id = image._id as unknown as { toString(): string };
                    const originalId = idMap[id.toString()];
                    if (originalId) {
                        resultMap[originalId] = this.withPrefixedId(image, 'image');
                    }
                });

                videos.forEach((video: IVideoAsset) => {
                    const id = video._id as unknown as { toString(): string };
                    const originalId = idMap[id.toString()];
                    if (originalId) {
                        resultMap[originalId] = this.withPrefixedId(video, 'video');
                    }
                });

                return resultMap;
            })
        ).toPromise();

        return result || {};
    }

    /**
     * HEAD method - Check if a single asset exists without retrieving its data
     * @param assetId Format: 'type-id' (e.g., 'image-123', 'video-456')
     * @returns Object with existence status and type information
     */
    async headAsset(assetId: string): Promise<AssetExistenceResult> {
        const [type, id] = assetId.split('-');

        if (!type || !id) {
            throw new BadRequestException('Invalid asset ID format. Expected format: {type}-{id}');
        }

        const lowerType = type.toLowerCase();
        let exists = false;

        if (lowerType === 'image') {
            exists = await this.checkImageAssetExists(id);
        } else if (lowerType === 'video') {
            exists = await this.checkVideoAssetExists(id);
        } else {
            throw new BadRequestException(`Invalid asset type: ${type}. Expected 'image' or 'video'`);
        }

        return {
            exists,
            type: exists ? lowerType : undefined
        };
    }

    /**
     * BULKHEAD method - Check if multiple assets exist in a single efficient operation
     * @param assetIds Array of asset IDs in format: 'type-id'
     * @returns Map of assetId to existence information
     */
    async bulkHeadAssets(assetIds: string[]): Promise<BulkExistenceResult> {
        // Enforce maximum limit of 100 assets
        if (assetIds.length > 100) {
            throw new BadRequestException('Cannot check existence of more than 100 assets at once');
        }

        // If no assets requested, return empty result
        if (assetIds.length === 0) {
            return {};
        }

        // Group asset IDs by type
        const groupedAssets = this.groupAssetsByType(assetIds);
        
        // Create a map to preserve original asset IDs
        const idMap: Record<string, string> = {};
        assetIds.forEach(assetId => {
            const [type, id] = assetId.split('-');
            if (type && id) {
                idMap[id] = assetId;
            }
        });

        // Prepare observables for each asset type existence check
        const imageExistsObservable = this.checkMultipleImageAssetsExist(groupedAssets.image);
        const videoExistsObservable = this.checkMultipleVideoAssetsExist(groupedAssets.video);

        // Run all queries in parallel using forkJoin
        const result = await forkJoin({
            imageExists: imageExistsObservable,
            videoExists: videoExistsObservable
        }).pipe(
            map(({ imageExists, videoExists }) => {
                const resultMap: BulkExistenceResult = {};

                // Initialize all requested IDs as not existing
                assetIds.forEach(assetId => {
                    resultMap[assetId] = { exists: false };
                });

                // Update with image existence results
                Object.entries(imageExists).forEach(([imageId, exists]) => {
                    const originalId = idMap[imageId];
                    if (originalId) {
                        resultMap[originalId] = { exists, type: exists ? 'image' : undefined };
                    }
                });

                // Update with video existence results
                Object.entries(videoExists).forEach(([videoId, exists]) => {
                    const originalId = idMap[videoId];
                    if (originalId) {
                        resultMap[originalId] = { exists, type: exists ? 'video' : undefined };
                    }
                });

                return resultMap;
            })
        ).toPromise();

        return result || {};
    }

    /**
     * Groups asset IDs by type (image or video)
     */
    private groupAssetsByType(assetIds: string[]): AssetTypeMap {
        const groupedAssets: AssetTypeMap = {
            image: [],
            video: []
        };

        assetIds.forEach(assetId => {
            const [type, id] = assetId.split('-');

            if (type && id) {
                const lowerType = type.toLowerCase();
                if (lowerType === 'image' || lowerType === 'video') {
                    groupedAssets[lowerType].push(id);
                }
            }
        });

        return groupedAssets;
    }

    /**
     * Fetches multiple image assets in a single query
     */
    private fetchImageAssets(imageIds: string[]): Observable<IImageAsset[]> {
        if (!imageIds.length) {
            return of([]);
        }

        return from(this.imageAssetModel.find({ _id: { $in: imageIds } }).exec()).pipe(
            catchError(error => {
                console.error('Error fetching image assets:', error);
                return of([]);
            })
        );
    }

    /**
     * Fetches multiple video assets in a single query
     */
    private fetchVideoAssets(videoIds: string[]): Observable<IVideoAsset[]> {
        if (!videoIds.length) {
            return of([]);
        }

        return from(this.videoAssetModel.find({ _id: { $in: videoIds } }).exec()).pipe(
            catchError(error => {
                console.error('Error fetching video assets:', error);
                return of([]);
            })
        );
    }

    /**
     * Check if a single image asset exists
     * @param id Image asset ID
     */
    private async checkImageAssetExists(id: string): Promise<boolean> {
        try {
            // Use countDocuments with limit(1) for fastest existence check
            const count = await this.imageAssetModel.countDocuments({ _id: id }).limit(1).exec();
            return count > 0;
        } catch (error) {
            console.error(`Error checking if image asset ${id} exists:`, error);
            return false;
        }
    }

    /**
     * Check if a single video asset exists
     * @param id Video asset ID
     */
    private async checkVideoAssetExists(id: string): Promise<boolean> {
        try {
            // Use countDocuments with limit(1) for fastest existence check
            const count = await this.videoAssetModel.countDocuments({ _id: id }).limit(1).exec();
            return count > 0;
        } catch (error) {
            console.error(`Error checking if video asset ${id} exists:`, error);
            return false;
        }
    }

    /**
     * Check if multiple image assets exist
     * @param imageIds Array of image asset IDs
     * @returns Map of image ID to existence status
     */
    private checkMultipleImageAssetsExist(imageIds: string[]): Observable<Record<string, boolean>> {
        if (!imageIds.length) {
            return of({});
        }

        return from(
            this.imageAssetModel
                .find({ _id: { $in: imageIds } })
                .select('_id') // Only select the ID field for efficiency
                .exec()
        ).pipe(
            map(results => {
                const existenceMap: Record<string, boolean> = {};
                
                // Initialize all IDs as not existing
                imageIds.forEach(id => {
                    existenceMap[id] = false;
                });
                
                // Mark found IDs as existing
                results.forEach(result => {
                    const id = result._id as unknown as { toString(): string };
                    existenceMap[id.toString()] = true;
                });
                
                return existenceMap;
            }),
            catchError(error => {
                console.error('Error checking image assets existence:', error);
                // Return all as not existing in case of error
                const errorResult: Record<string, boolean> = {};
                imageIds.forEach(id => {
                    errorResult[id] = false;
                });
                return of(errorResult);
            })
        );
    }

    /**
     * Check if multiple video assets exist
     * @param videoIds Array of video asset IDs
     * @returns Map of video ID to existence status
     */
    private checkMultipleVideoAssetsExist(videoIds: string[]): Observable<Record<string, boolean>> {
        if (!videoIds.length) {
            return of({});
        }

        return from(
            this.videoAssetModel
                .find({ _id: { $in: videoIds } })
                .select('_id') // Only select the ID field for efficiency
                .exec()
        ).pipe(
            map(results => {
                const existenceMap: Record<string, boolean> = {};
                
                // Initialize all IDs as not existing
                videoIds.forEach(id => {
                    existenceMap[id] = false;
                });
                
                // Mark found IDs as existing
                results.forEach(result => {
                    const id = result._id as unknown as { toString(): string };
                    existenceMap[id.toString()] = true;
                });
                
                return existenceMap;
            }),
            catchError(error => {
                console.error('Error checking video assets existence:', error);
                // Return all as not existing in case of error
                const errorResult: Record<string, boolean> = {};
                videoIds.forEach(id => {
                    errorResult[id] = false;
                });
                return of(errorResult);
            })
        );
    }

    /**
     * Helper to add id with prefix and remove _id from asset
     */
    private withPrefixedId<T extends { _id?: any; toObject?: () => any }>(asset: T, type: 'image' | 'video'): T & { id: string } {
        // Ensure we are working with a plain object, not a Mongoose document
        const plain = typeof asset.toObject === 'function' ? asset.toObject() : { ...asset };
        const id = plain._id?.toString?.() || '';
        const newAsset = { ...plain, id: `${type}-${id}` };
        delete (newAsset as any)._id;
        return newAsset;
    }

    private async getImageAssetById(id: string): Promise<IImageAsset> {
        const imageAsset = await this.imageAssetModel.findById(id).exec();
        if (!imageAsset) {
            throw new NotFoundException(`Image asset with ID "${id}" not found`);
        }
        return imageAsset;
    }

    private async getVideoAssetById(id: string): Promise<IVideoAsset> {
        const videoAsset = await this.videoAssetModel.findById(id).exec();
        if (!videoAsset) {
            throw new NotFoundException(`Video asset with ID "${id}" not found`);
        }
        return videoAsset;
    }
}
