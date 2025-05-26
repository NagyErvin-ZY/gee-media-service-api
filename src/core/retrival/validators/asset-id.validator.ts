import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { Types } from 'mongoose';

/**
 * Validates that a string follows the format of 'image-{objectId}' or 'video-{objectId}'
 * where {objectId} is a valid MongoDB ObjectId.
 */
export function IsAssetId(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isAssetId',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') {
            return false;
          }

          const parts = value.split('-');
          if (parts.length !== 2) {
            return false;
          }

          const [type, id] = parts;
          // Validate type is either 'image' or 'video'
          if (type !== 'image' && type !== 'video') {
            return false;
          }

          // Validate that id is a valid MongoDB ObjectId
          return Types.ObjectId.isValid(id);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be in format "image-{objectId}" or "video-{objectId}" with a valid MongoDB ObjectId`;
        },
      },
    });
  };
}

/**
 * Validates that all strings in an array follow the asset ID format
 */
export function IsAssetIdArray(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isAssetIdArray',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (!Array.isArray(value)) {
            return false;
          }

          return value.every(item => {
            if (typeof item !== 'string') {
              return false;
            }

            const parts = item.split('-');
            if (parts.length !== 2) {
              return false;
            }

            const [type, id] = parts;
            // Validate type is either 'image' or 'video'
            if (type !== 'image' && type !== 'video') {
              return false;
            }

            // Validate that id is a valid MongoDB ObjectId
            return Types.ObjectId.isValid(id);
          });
        },
        defaultMessage(args: ValidationArguments) {
          return `Each item in ${args.property} must be in format "image-{objectId}" or "video-{objectId}" with valid MongoDB ObjectIds`;
        },
      },
    });
  };
}