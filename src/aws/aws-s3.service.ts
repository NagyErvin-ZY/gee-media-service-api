import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import config from '../config';
import { Observable, from, map, catchError, throwError } from 'rxjs';

@Injectable()
export class AwsS3Service {
  private readonly logger = new Logger(AwsS3Service.name);
  private readonly s3Client: S3Client;

  constructor() {
    this.logger.log('Initializing AWS S3 Service');
    
    if (config.aws.s3.useProfile) {
      this.logger.log(`Using AWS profile: ${config.aws.s3.profile} in region ${config.aws.s3.region}`);
      this.s3Client = new S3Client({
        region: config.aws.s3.region,
        profile: config.aws.s3.profile
      });
    } else {
      this.logger.log(`Using AWS direct credentials in region ${config.aws.s3.region}`);
      this.s3Client = new S3Client({
        region: config.aws.s3.region,
        credentials: {
          accessKeyId: config.aws.s3.accessKeyId,
          secretAccessKey: config.aws.s3.secretAccessKey
        }
      });
    }
    
    this.logger.log(`S3 bucket configured: ${config.aws.s3.bucket}`);
    this.logger.log(`S3 URL prefix: ${config.aws.s3.urlPrefix}`);
  }

  /**
   * Upload a file to S3
   * @param key The key (path) to store the file
   * @param body The file buffer
   * @param contentType The content type of the file
   * @returns Observable with the uploaded file URL
   */
  uploadFile(key: string, body: Buffer, contentType: string): Observable<string> {
    this.logger.log(`Starting upload to S3: key=${key}, contentType=${contentType}, size=${body.length} bytes`);
    
    const command = new PutObjectCommand({
      Bucket: config.aws.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read', // Make the object publicly readable
    });

    this.logger.debug(`S3 PutObjectCommand created with ACL=public-read`);

    return from(this.s3Client.send(command)).pipe(
      map(() => {
        const url = `${config.aws.s3.urlPrefix}/${key}`;
        this.logger.log(`File successfully uploaded to S3: ${url}`);
        return url;
      }),
      catchError((error) => {
        this.logger.error(`Failed to upload file to S3: ${error.message}`, error.stack);
        return throwError(() => new Error(`Failed to upload file to S3: ${error.message}`));
      })
    );
  }

  /**
   * Delete a folder (prefix) and all its contents from S3
   * @param folderPrefix The folder prefix to delete
   * @returns Promise that resolves when deletion is complete
   */
  async deleteFolder(folderPrefix: string): Promise<void> {
    this.logger.log(`Deleting folder from S3: ${folderPrefix}`);

    try {
      // List all objects in the folder
      const listCommand = new ListObjectsV2Command({
        Bucket: config.aws.s3.bucket,
        Prefix: folderPrefix,
      });

      const listedObjects = await this.s3Client.send(listCommand);
      
      if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
        this.logger.log(`No objects found in folder: ${folderPrefix}`);
        return;
      }

      this.logger.log(`Found ${listedObjects.Contents.length} objects to delete in folder: ${folderPrefix}`);

      // Create a list of objects to delete
      const deleteParams = {
        Bucket: config.aws.s3.bucket,
        Delete: {
          Objects: listedObjects.Contents.map(({ Key }) => ({ Key })),
          Quiet: false
        }
      };

      // Delete the objects
      const deleteCommand = new DeleteObjectsCommand(deleteParams);
      const deleteResult = await this.s3Client.send(deleteCommand);
      
      this.logger.log(`Successfully deleted ${deleteResult.Deleted?.length || 0} objects from folder: ${folderPrefix}`);
      
      // Check if we need to do another delete (if there were more than 1000 objects)
      if (listedObjects.IsTruncated) {
        this.logger.log(`Folder deletion was truncated, continuing deletion for: ${folderPrefix}`);
        await this.deleteFolder(folderPrefix);
      }
    } catch (error) {
      this.logger.error(`Error deleting folder from S3: ${error.message}`, error.stack);
      throw new Error(`Failed to delete folder from S3: ${error.message}`);
    }
  }
}