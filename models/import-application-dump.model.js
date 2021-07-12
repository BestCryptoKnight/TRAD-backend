/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const importApplicationDumpSchema = new Schema(
  {
    applications: { type: Schema.Types.Mixed },
    currentStepIndex: {
      type: Schema.Types.String,
      enum: ['GENERATED', 'VALIDATED', 'PROCESSED'],
      default: 'GENERATED',
    },
  },
  { timestamps: true },
);

/**
 * Export Schema
 */
module.exports = mongoose.model(
  'import-application-dump',
  importApplicationDumpSchema,
);
