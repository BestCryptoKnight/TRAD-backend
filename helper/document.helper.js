/*
 * Module Imports
 * */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Document = mongoose.model('document');
const DocumentType = mongoose.model('document-type');
const Client = mongoose.model('client');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { uploadFile } = require('./static-file.helper');
const { addAuditLog, getEntityName } = require('./audit-log.helper');

//Not in use
/*let deleteImage = ({ filePath, fileName }) => {
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
};*/

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
  userName,
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const s3Response = await uploadFile({
        file: bufferData,
        filePath:
          'documents/' + entityType + '/' + Date.now() + '-' + originalFileName,
        fileType: mimeType,
      });
      let document = await Document.create({
        keyPath: s3Response.key || s3Response.Key,
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
      document = JSON.parse(JSON.stringify(document));
      const [documentType, entityName] = await Promise.all([
        DocumentType.findOne({ _id: documentTypeId })
          .select('documentTitle')
          .lean(),
        getEntityName({
          entityId: entityRefId,
          entityType: entityType,
        }),
      ]);
      if (uploadByType === 'client-user') {
        userName = await getEntityName({
          entityId: uploadById,
          entityType: 'client',
        });
      }
      await addAuditLog({
        entityType: 'document',
        entityRefId: document._id,
        actionType: 'add',
        userType: uploadByType,
        userRefId: uploadById,
        logDescription: `A new document for ${entityName} is successfully uploaded by ${userName}`,
      });
      document.documentTypeId = documentType?.documentTitle || '';
      document.uploadById = userName;
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
  userId = null,
}) => {
  try {
    const conditions = [
      {
        uploadByType: 'client-user',
        uploadById: mongoose.Types.ObjectId(clientId),
      },
      // { uploadByType: 'user', isPublic: true },
    ];
    if (userId) {
      conditions.push({
        uploadByType: 'user',
        // uploadById: mongoose.Types.ObjectId(userId),
      });
    } else {
      conditions.push({
        uploadByType: 'user',
        isPublic: true,
      });
    }
    const query = [
      {
        $match: {
          $and: [
            { isDeleted: false },
            {
              entityRefId: mongoose.Types.ObjectId(entityId),
            },
            {
              $or: conditions,
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
          from: 'clients',
          localField: 'clientUserId',
          foreignField: '_id',
          as: 'clientId',
        },
      },
      {
        $addFields: {
          uploadById: {
            $cond: [
              { $eq: ['$uploadByType', 'client-user'] },
              '$clientId.name',
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
          uploadByType: 1,
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
  uploadDocument,
  getApplicationDocumentList,
  getSpecificEntityDocumentList,
};
