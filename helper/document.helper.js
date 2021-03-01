/*
 * Module Imports
 * */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Document = mongoose.model('document');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { uploadFile } = require('./static-file.helper');

let deleteImage = ({ filePath, fileName }) => {
  fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
  const imagePath = path.join(filePath, fileName);
  fs.unlink(imagePath, (err) => {
    if (err) {
      return Logger.log.error(
        'Error while finding an image : ',
        err.message || err,
      );
    }
    Logger.log.trace('File deleted successfully');
  });
};

const uploadDocument = ({
  documentTypeId,
  description,
  originalFileName,
  uploadByType,
  uploadById,
  entityType,
  entityRefId,
  isPublic,
  bufferData,
  mimetype,
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const s3Response = await uploadFile({
        file: bufferData,
        filePath:
          'documents/' + entityType + '/' + Date.now() + '-' + originalFileName,
        fileType: mimetype,
      });
      console.log('s3Response : ', s3Response);
      const document = await Document.create({
        keyPath: s3Response.key,
        documentTypeId,
        description,
        originalFileName,
        uploadByType,
        uploadById,
        entityType,
        entityRefId,
        isPublic,
      });
      return resolve(document);
    } catch (e) {
      Logger.log.error(
        'Error occurred while uploading document ',
        e.message || e,
      );
      return reject(e.message);
    }
  });
};

module.exports = { deleteImage, uploadDocument };
