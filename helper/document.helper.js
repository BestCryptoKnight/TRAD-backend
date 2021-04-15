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
  mimeType,
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const s3Response = await uploadFile({
        file: bufferData,
        filePath:
          'documents/' + entityType + '/' + Date.now() + '-' + originalFileName,
        fileType: mimeType,
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
        mimeType,
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

const getApplicationDocumentList = async ({ entityId }) => {
  try {
    const documents = await Document.find({
      isDeleted: false,
      entityRefId: entityId,
    })
      .populate({ path: 'documentTypeId', select: 'documentTitle' })
      .select('_id documentTypeId description')
      .lean();
    documents.forEach((i) => {
      if (i.documentTypeId && i.documentTypeId.documentTitle) {
        i.documentTypeId = i.documentTypeId.documentTitle;
      }
    });
    return documents;
  } catch (e) {
    Logger.log.error('Error occurred in get document list ', e.message || e);
  }
};

const getSpecificEntityDocumentList = async ({
  entityId,
  clientId,
  userId,
}) => {
  try {
    const query = [
      {
        $match: {
          $and: [
            { isDeleted: false },
            {
              entityRefId: mongoose.Types.ObjectId(entityId),
            },
            {
              $or: [
                {
                  uploadByType: 'client-user',
                  uploadById: mongoose.Types.ObjectId(clientId),
                },
                { uploadByType: 'user', isPublic: true },
                {
                  uploadByType: 'user',
                  uploadById: mongoose.Types.ObjectId(userId),
                },
              ],
            },
          ],
        },
      },
      {
        $addFields: {
          clientUserId: {
            $cond: [
              { $eq: ['$uploadByType', 'client-user'] },
              '$uploadById',
              null,
            ],
          },
          userId: {
            $cond: [{ $eq: ['$uploadByType', 'user'] }, '$uploadById', null],
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userId',
        },
      },
      {
        $lookup: {
          from: 'client-users',
          localField: 'clientUserId',
          foreignField: '_id',
          as: 'clientUserId',
        },
      },
      {
        $addFields: {
          uploadById: {
            $cond: [
              { $eq: ['$createdByType', 'client-user'] },
              '$clientUserId.name',
              '$userId.name',
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'document-types',
          localField: 'documentTypeId',
          foreignField: '_id',
          as: 'documentTypeId',
        },
      },
      {
        $unwind: {
          path: '$documentTypeId',
        },
      },
      {
        $project: {
          _id: 1,
          'documentTypeId.documentTitle': 1,
          description: 1,
          uploadById: 1,
          createdAt: 1,
        },
      },
    ];
    const documents = await Document.aggregate(query).allowDiskUse(true);
    documents.forEach((document) => {
      document.uploadById =
        document.uploadById.length !== 0 ? document.uploadById[0] : '';
      document.documentTypeId =
        document.documentTypeId && document.documentTypeId.documentTitle
          ? document.documentTypeId.documentTitle
          : '';
    });
    return documents;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get specific entity document list ',
      e.message || e,
    );
  }
};

module.exports = {
  deleteImage,
  uploadDocument,
  getApplicationDocumentList,
  getSpecificEntityDocumentList,
};
