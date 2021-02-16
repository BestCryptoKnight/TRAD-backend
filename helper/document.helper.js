/*
* Module Imports
* */
const fs = require('fs');
const path = require('path');

/*
* Local Imports
* */
const Logger = require('./../services/logger');

let deleteImage = ({ filePath, fileName }) => {
    fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
    const imagePath = path.join(filePath, fileName);
    fs.unlink(imagePath, (err) => {
        if (err) {
            return Logger.log.error('Error while finding an image : ', err.message || err,);
        }
        Logger.log.trace('File deleted successfully');
    });
};

module.exports = { deleteImage };
