/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const notificationSchema = new Schema(
  {
    isRead: { type: Schema.Types.Boolean, default: false },
    userType: { type: Schema.Types.String, enum: ['user', 'client-user'] },
    userId: { type: Schema.Types.ObjectId },
    description: { type: Schema.Types.String },
    entityType: {
      type: Schema.Types.String,
      enum: [
        'alert',
        'application',
        'debtor',
        'credit-limit',
        'claim',
        'credit-report',
        'overdue',
        'task',
      ],
    },
    entityId: { type: Schema.Types.Mixed },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('notification', notificationSchema);
