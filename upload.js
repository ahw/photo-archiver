const config = require('config');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const ExifImage = require('exif').ExifImage;
const exifDateParser = require('exif-date');
const client = require('./s3client').createClient();
const uploadedFilesList = 'uploaded-files.txt';

const defaultFilterFunction = require('./filter-functions').defaultFilterFunction;
/**
 *
 * @param imagePath
 * @returns {boolean}
 * @constructor
 */
function MAC_PHOTOS_LIBRARY_FILTER_FUNCTION(imagePath) {
    return /Masters/.test(imagePath)
        && /jpg/i.test(imagePath)
        // && /2014\/(02|10)/.test(path)
        && /2014\/03/.test(imagePath);
}

/**
 *
 * @param imagePath
 * @returns {boolean}
 * @constructor
 */
function WD_PASSPORT_FILTER_FUNCTION(imagePath) { // eslint-disable-line no-unused-vars
    return /png/i.test(imagePath) || /jpg/i.test(imagePath);
}


/**
 *
 * @param imagePath
 * @returns {boolean}
 * @constructor
 */
function SDMINI_FILTER_FUNCTION(imagePath) { // eslint-disable-line no-unused-vars
    return /jpg/i.test(imagePath)
        && !/Contact Sheet/.test(imagePath)
        && !/upholstery/.test(imagePath)
        && !/foam2/.test(imagePath)
        && !/home\/music/.test(imagePath)
        && !/Capture_/.test(imagePath)
        && !/markers/.test(imagePath)
        && !/timelapse_clips/.test(imagePath)
        && !/william_resize/.test(imagePath)
        && !/frame2_resize/.test(imagePath)
        && !/Downloads/.test(imagePath)
        && !/home\/2010/.test(imagePath)
        && !/home\/2011/.test(imagePath)
        && !/home\/55/.test(imagePath)
        && !/windows_desktop\/finishing/.test(imagePath)
        && !/windows_desktop\/foam1/.test(imagePath)
        && !/windows_desktop\/foam2/.test(imagePath)
        && !/windows_desktop\/foam3/.test(imagePath)
        && !/web_thumbnails_100/.test(imagePath)
        && !/web_thumbnails_75/.test(imagePath)
        && !/800x600/.test(imagePath)
        && !/resized/.test(imagePath)
        && !/resize/.test(imagePath);
}

function getPreviouslyUploadedIndex() {
    const index = {};
    try {
        console.log(`Reading file ${path.resolve(UPLOAD_LIST)}`);
        const lines = fs.readFileSync(path.resolve(UPLOAD_LIST)).toString().split('\n');
        lines.forEach(imagePath => index[imagePath.trim()] = 1); // eslint-disable-line no-return-assign, max-len
    } catch (e) {} // eslint-disable-line no-empty

    return index;
}

/**
 *
 * @param opts.imagePath
 * @param opts.prefix
 * @param opts.allowUnknownDates
 * @param opts.dryRun
 * @param opts.previouslyUploadedPaths
 * @param index
 * @param total
 * @param callback
 * @returns {*}
 */
function uploadToS3(opts, callback) {
    const { imagePath, prefix, allowUnknownDates, dryRun, previouslyUploadedPaths } = opts;
    const log = console.log.bind(console, `[upload${dryRun ? ' DRY RUN' : ''}]`);
    const parsedPath = path.parse(imagePath);
    const resolvedPath = path.resolve(imagePath);

    if (previouslyUploadedPaths[resolvedPath]) {
        log(`Ignoring image ${resolvedPath} because it has already been uploaded`);
        return callback(null, { ignored: true, reason: 'Previously uploaded' });
    }

    let ex = new ExifImage({ image: resolvedPath }, (error, data) => { // eslint-disable-line no-new
        let Key;

        if (error && /No Exif segment found in the given image/i.test(error.message)) {
            Key = `UNKNOWN_DATE/${parsedPath.base}`;
        } else if (error) {
            Key = `UNKNOWN_DATE/${parsedPath.base}`;
        } else {
            // No error
            const datetimeOriginal = data.exif.DateTimeOriginal;

            if (datetimeOriginal) {
                const timestamp = moment(exifDateParser.parse(datetimeOriginal));
                Key = timestamp.format('YYYY/MM/DD/') + parsedPath.base;
            } else {
                log('Could not parse out DateTimeOriginal EXIF data. Here are the following keys matching "time"');
                JSON.stringify(data.exif, null, '    ').split('\n').filter(line => /time/i.test(line)).forEach(log);
                Key = `UNKNOWN_DATE/${parsedPath.base}`;
            }
        }

        if (/UNKNOWN_DATE/.test(Key) && !allowUnknownDates) {
            // If option to uploadUnknownDates was false, return early
            log(`Not uploading image with unknown EXIF timestamp info ${resolvedPath}`);
            return callback(null, { ignored: true, reason: 'Could not parse out image date' });
        }

        const params = {
            localFile: resolvedPath,
            s3Params: {
                Bucket: config.get('bucket'),
                Key: prefix + Key,
                // other options supported by putObject, except Body and ContentLength.
                // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
            },
        };

        if (dryRun) {
            log(`Would have uploaded ${resolvedPath} to s3://${params.s3Params.Bucket}/${params.s3Params.Key}`);
            return callback(null, { ignored: true, reason: 'Dry run' });
        }

        const uploader = client.uploadFile(params);
        uploader.on('error', callback);
        uploader.on('end', () => {
            fs.writeFileSync(uploadedFilesList, `${resolvedPath}\n`, { flag: 'a' });
            return callback(null, params);
        });
    });
}

function walk(dir, pathRegex = /./) {
    let results = [];
    const contents = fs.readdirSync(dir);
    contents.map(file => path.join(dir, file)).forEach((imagePath) => {
        const stats = fs.statSync(imagePath);
        if (stats.isFile()
            && /(jpg|jpeg|png|gif)/i.test(imagePath)
            && pathRegex.test(imagePath)) {
            // console.log(`Found file ${imagePath}`);
            results.push(imagePath);
        } else if (stats.isDirectory()) {
            results = results.concat(walk(imagePath, pathRegex));
        }
    });

    return results;
}


exports.command = 'upload';
exports.describe = 'Recursively upload images in a directory to S3';
exports.builder = {
    dir: {
        default: '.',
    },
    prefix: {
        default: '',
    },
    allowUnknownDates: {
        default: false,
    },
    maxCount: {
        default: Infinity,
    },
    dryRun: {
        default: false,
    },
    pathRegex: {
        default: /./,
    },
}

exports.handler = function (argv) {
    const t0 = Date.now();
    const pathRegex = new RegExp(argv.pathRegex, 'i');
    const imagePaths = walk(argv.dir, pathRegex);
    const maxCount = Math.min(imagePaths.length, argv.maxCount);
    
    if (imagePaths.length === 0) {
        console.log(`No image files match --dir ${argv.dir} and --path-regex '${argv.pathRegex}' parameters!`);
        return;
    }

    const previouslyUploadedPaths = {};
    try {
        const previousUploads = fs.statSync(uploadedFilesList);
        if (previousUploads.isFile()) {
            fs.readFileSync(uploadedFilesList).toString().split('\n').forEach((imagePath) => {
                previouslyUploadedPaths[imagePath] = imagePath;
            });
        }
    } catch (e) {} // eslint-disable-lint no-empty

    function loop(i) {
        uploadToS3({
            imagePath: imagePaths[i],
            prefix: argv.prefix,
            allowUnknownDates: argv.allowUnknownDates,
            dryRun: argv.dryRun,
            previouslyUploadedPaths,
        }, (error, params) => {
            if (!params.ignored) {
                const elapsed = Date.now() - t0;
                const rate = (i + 1) / elapsed;
                const remaining = ((maxCount - i - 1) / rate) / 60000;
                console.log(`[upload] (${i + 1}/${maxCount} ${remaining.toFixed(2)} mins remain) Uploaded ${params.localFile} to s3://${params.s3Params.Bucket}/${params.s3Params.Key}`);
            }

            if (i < maxCount - 1) {
                loop(i + 1);
            }
        });
    }

    loop(0);
};
