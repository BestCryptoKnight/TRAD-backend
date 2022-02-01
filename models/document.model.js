/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const documentSchema = new Schema(
  {
    documentTypeId: { type: Schema.Types.ObjectId, ref: 'document-type' },
    description: { type: Schema.Types.String },
    originalFileName: { type: Schema.Types.String },
    keyPath: { type: Schema.Types.String },
    mimeType: { type: Schema.Types.String },
    uploadByType: { type: Schema.Types.String, enum: ['user', 'client-user'] },
    uploadById: { type: Schema.Types.ObjectId },
    entityType: { type: Schema.Types.String },
    entityRefId: { type: Schema.Types.ObjectId },
    isPublic: { type: Schema.Types.Boolean, default: false },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

documentSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('document', documentSchema);
