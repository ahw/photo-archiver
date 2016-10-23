const config = require('config');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const ExifImage = require('exif').ExifImage;
const exifDateParser = require('exif-date');
const client = require('./s3client').createClient();

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
 * @param opts
 * @param index
 * @param total
 * @param callback
 * @returns {*}
 */
function uploadToS3(opts, callback) {
    const { imagePath, prefix, allowUnknownDates, dryRun } = opts;
    const log = console.log.bind(console, `[upload${dryRun ? ' DRY RUN' : ''}]`);
    const parsedPath = path.parse(imagePath);
    const resolvedPath = path.resolve(imagePath);

    // if (previousUploadIndex[resolvedPath]) {
    //     console.log(`[${index + 1}/${total} Ignoring image ${resolvedPath} because it has already been uploaded`);
    //     numIgnored += 1;
    //     return callback();
    // }

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
            return callback(new Error(`Could not parse out image date for file ${resolvedPath}`));
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
            return callback();
        }

        const uploader = client.uploadFile(params);
        uploader.on('error', callback);
        uploader.on('end', () => {
            log(`Uploaded ${resolvedPath} to s3://${params.s3Params.Bucket}/${params.s3Params.Key}`);
            return callback(null, params);
        });
    });
}

// exports.uploadAll = function (dir) {
//     const t0 = Date.now();
//
//     // const results = walk(path.resolve(argv.dir), MAC_PHOTOS_LIBRARY_FILTER_FUNCTION);
//     const results = walk(path.resolve(dir));
//     results.forEach(imagePath => console.log(imagePath));
//     const seriesFunctions = results
//         .map((image, index, allPaths) => uploadToS3.bind(this, image, index, allPaths.length));
//
//     async.series(seriesFunctions, () => console.log(`Done uploading. Total time ${((Date.now() - t0) / 60000).toFixed(2)} minutes.`));
// }

function walk(dir, filterFn = defaultFilterFunction) {
    let results = [];
    const contents = fs.readdirSync(dir);
    contents.map(file => path.join(dir, file)).forEach((imagePath) => {
        const stats = fs.statSync(imagePath);
        if (stats.isFile() && filterFn(imagePath)) {
            // console.log(`Found file ${imagePath}`);
            results.push(imagePath);
        } else if (stats.isDirectory()) {
            results = results.concat(walk(imagePath, filterFn));
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
    }
}

exports.handler = function (argv) {
    console.log(argv.maxCount, argv.prefix, argv.dryRun);

    const imagePaths = walk(argv.dir);

    function loop(i) {
        uploadToS3({
            imagePath: imagePaths[i],
            prefix: argv.prefix,
            allowUnknownDates: argv.allowUnknownDates,
            dryRun: argv.dryRun,
        }, (error, params) => {
            // const elapsed = (Date.now() - s3startTime) / 60000;
            // const remaining = ((total - index - 1) / rate) / 60000;
            // console.log(`Finished uploading image ${index+1}/${total} ${resolvedPath} to S3`)
            // fs.writeFileSync(path.resolve(UPLOAD_LIST), `${resolvedPath}\n`, { flag: 'a' });
            // console.log(`[${index + 1}/${total} ${elapsed.toFixed(2)} mins elapsed, ${remaining.toFixed(2)} remaining] ${resolvedPath} => ${Key}`);
            if (i < imagePaths.length - 1 && i < argv.maxCount) {
                loop(i + 1);
            }
        });
    }

    loop(0);
};
