/*
 * Module Imports
 * */
const AWS = require('aws-sdk');
const cloudFrontSign = require('aws-cloudfront-sign');
const path = require('path');

/*
 * Local Imports
 * */
const config = require('./../config');
const Logger = require('./../services/logger');

//configuring the AWS environment
AWS.config.update({
  accessKeyId: config.staticServing.accessKeyId,
  secretAccessKey: config.staticServing.secretAccessKey,
  signatureVersion: 'v4',
  region: config.staticServing.region,
});
const s3 = new AWS.S3();

if (config.staticServing.isCloudFrontEnabled) {
  let keyFileName = 'cloud-front-key.pem';
  let pathToCredentialFile = path.join(__dirname, '../keys/', keyFileName);
  let cloudFrontSigningParams = {
    keypairId: config.staticServing.cloudFrontKeyId,
    privateKeyPath: pathToCredentialFile,
  };
}

let uploadFile = ({ file, filePath, fileType }) => {
  return new Promise(async (resolve, reject) => {
    try {
      let s3SigningParams = {
        Bucket: config.staticServing.bucketName,
        Body: file,
        Key: filePath,
        ContentType: fileType,
      };
      s3.upload(s3SigningParams, function (err, data) {
        if (err) {
          Logger.log.error(
            'Error uploading file in s3',
            filePath,
            err.message || err,
          );
          return reject(err);
        }
        return resolve(data);
      });
    } catch (e) {
      Logger.log.error('Error in getting pre-signed URL', e.message || e);
    }
  });
};

let getPreSignedUrl = async ({ filePath, getCloudFrontUrl }) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!filePath) return resolve();
      if (config.staticServing.isCloudFrontEnabled && getCloudFrontUrl) {
        cloudFrontSigningParams['expireTime'] =
          Date.now() + config.staticServing.expiryTimeInMinutes * 60 * 1000;
        let signedUrl = cloudFrontSign.getSignedUrl(
          config.staticServing.cloudFrontUrl + filePath,
          signingParams,
        );
        return resolve(signedUrl);
      } else {
        let s3SigningParams = {
          Bucket: config.staticServing.bucketName,
          Key: filePath,
          Expires: config.staticServing.expiryTimeInMinutes * 60 * 1000,
        };
        s3.getSignedUrl('getObject', s3SigningParams, (err, signedUrl) => {
          if (err) {
            return reject(err);
          }
          return resolve(signedUrl);
        });
      }
    } catch (e) {
      Logger.log.error('Error in getting pre-signed URL', e.message || e);
      return reject(e);
    }
  });
};

let deleteFile = ({ filePath }) => {
  return new Promise(async (resolve, reject) => {
    try {
      let s3SigningParams = {
        Bucket: config.staticServing.bucketName,
        Key: filePath,
      };
      s3.deleteObject(s3SigningParams, function (err, data) {
        if (err) {
          Logger.log.error(
            'Error deleting file in s3',
            filePath,
            err.message || err,
          );
          return reject(err);
        }
        return resolve(data);
      });
    } catch (e) {
      Logger.log.error('Error in getting pre-signed URL', e.message || e);
    }
  });
};

module.exports = {
  uploadFile,
  getPreSignedUrl,
  deleteFile,
};
