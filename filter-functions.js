const IMAGE_FILENAME_REGEX = /(jpg|jpeg|gif|png)$/i;

module.exports.defaultFilterFunction = function (fullPath) {
    return IMAGE_FILENAME_REGEX.test(fullPath);
}
