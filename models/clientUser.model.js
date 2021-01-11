/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const clientUserSchema = new Schema(
    {
        clientId: {type: Schema.Types.ObjectId, ref: 'client'},
        firstName: Schema.Types.String,
        lastName: Schema.Types.String,
        contactNumber: {type: Schema.Types.String},
        department: {type: Schema.Types.String},
        hasPortalAccess: {type: Schema.Types.Boolean},
        hasLeftCompany: {type: Schema.Types.Boolean},
        isDecisionMaker: {type: Schema.Types.Boolean},
        crmContactId: {type: Schema.Types.String, unique: true},
        email: {
            type: Schema.Types.String,
            unique: true
        },
        password: Schema.Types.String,
        signUpToken: Schema.Types.String,
        profilePicture: Schema.Types.String,
        jwtToken: [Schema.Types.String],
        isDeleted: {type: Schema.Types.Boolean, default: false},

    },
    {timestamps: true},
);

clientUserSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('client-user', clientUserSchema);
