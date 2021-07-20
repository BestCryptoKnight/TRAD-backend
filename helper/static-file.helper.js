/*
 * Module Imports
 * */
const archiver = require('archiver');
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
let cloudFrontSigningParams;

if (config.staticServing.isCloudFrontEnabled) {
  let keyFileName = 'cloud-front-key.pem';
  let pathToCredentialFile = path.join(__dirname, '../keys/', keyFileName);
  cloudFrontSigningParams = {
    keypairId: config.staticServing.cloudFrontKeyId,
    privateKeyPath: pathToCredentialFile,
  };
}

let uploadFile = ({ file, filePath, fileType, isPublicFile = false }) => {
  return new Promise(async (resolve, reject) => {
    try {
      let s3SigningParams = {
        Bucket: config.staticServing.bucketName,
        Body: file,
        Key: filePath,
        ContentType: fileType,
      };
      if (isPublicFile) {
        s3SigningParams.ACL = 'public-read';
      }
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
      Logger.log.error('Error in upload', e.message || e);
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
          cloudFrontSigningParams,
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

const createZipFile = ({ documentData }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const s3FileDownloadStreams = documentData.map((item) => {
        const stream = s3
          .getObject({
            Bucket: config.staticServing.bucketName,
            Key: item.keyPath,
          })
          .createReadStream();
        return {
          stream,
          fileName: item.originalFileName,
        };
      });
      let zip = new archiver.create('zip');
      zip.on('error', (error) => {
        Logger.log.error('Error occurred in creating zip ', error);
        return reject(error.message);
      });
      s3FileDownloadStreams.forEach((s3FileDownloadStream) => {
        zip.append(s3FileDownloadStream.stream, {
          name: s3FileDownloadStream.fileName,
        });
      });
      await zip.finalize();
      return resolve(zip);
    } catch (e) {
      Logger.log.error('Error occurred in creating zip file ', e);
      return reject(e.message);
    }
  });
};

const downloadDocument = ({ filePath }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await s3
        .getObject({ Bucket: config.staticServing.bucketName, Key: filePath })
        .createReadStream();
      return resolve(response);
    } catch (e) {
      Logger.log.error('Error occurred in download document ', e);
      return reject(e.message);
    }
  });
};

module.exports = {
  uploadFile,
  getPreSignedUrl,
  deleteFile,
  createZipFile,
  downloadDocument,
};
