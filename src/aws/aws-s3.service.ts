import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
}