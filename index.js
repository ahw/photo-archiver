/* eslint-disable no-console */
let argv = require('yargs');
const s3 = require('s3');
const fs = require('fs');
const path = require('path');
const async = require('async');
const moment = require('moment');
const ExifImage = require('exif').ExifImage;
const exifDateParser = require('exif-date');

const accessKeyId = fs.readFileSync(`${__dirname}/access_key_id`).toString().trim();
const secretAccessKey = fs.readFileSync(`${__dirname}/secret_access_key`).toString().trim();
const BUCKET_NAME = 'photos.andrewhallagan';
const UPLOAD_LIST = 'upload-list.txt';
const t0 = Date.now();

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

const client = s3.createClient({
    maxAsyncS3: 20, // this is the default
    s3RetryCount: 3, // this is the default
    s3RetryDelay: 1000, // this is the default
    multipartUploadThreshold: 20971520, // this is the default (20 MB)
    multipartUploadSize: 15728640, // this is the default (15 MB)
    s3Options: {
        accessKeyId,
        secretAccessKey,
        region: 'us-east-1',
        // endpoint: 's3.yourdomain.com',
        // sslEnabled: false
        // any other options are passed to new AWS.S3()
        // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
    },
});


function walk(dir, filterFn = () => false) {
    let results = [];
    const contents = fs.readdirSync(dir);
    contents.map(file => path.join(dir, file)).forEach((imagePath) => {
        const stats = fs.statSync(imagePath);
        if (stats.isFile() && filterFn(imagePath)) {
            console.log(`Found file ${imagePath}`);
            results.push(imagePath);
        } else if (stats.isDirectory()) {
            results = results.concat(walk(imagePath, filterFn));
        }
    });

    return results;
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

const s3startTime = Date.now();
const previousUploadIndex = getPreviouslyUploadedIndex();
let numIgnored = 0;

function uploadToS3(image, index, total, callback) {
    const parsedPath = path.parse(image);
    const resolvedPath = path.resolve(image);

    if (previousUploadIndex[resolvedPath]) {
        console.log(`[${index + 1}/${total} Ignoring image ${resolvedPath} because it has already been uploaded`);
        numIgnored += 1;
        return callback();
    }

    new ExifImage({ image }, (error, data) => { // eslint-disable-line no-new
        let Key;

        if (error && /No Exif segment found in the given image/i.test(error.message)) {
            Key = `UNKNOWN_DATE/${parsedPath.base}`;
        } else if (error) {
            console.log(`Ignoring image ${image}. ${error.message}`);
            // console.error(error)
            return callback();
        } else {
            // No error
            const datetimeOriginal = data.image.DateTimeOriginal;
            console.log(`image.DateTime = ${data.image.DateTime}`);
            console.log(`image.CreateDate = ${data.image.CreateDate}`);
            console.log(`image.DateTimeOriginal = ${data.image.DateTimeOriginal}`);
            console.log(`image.DateTimeDigitized = ${data.image.DateTimeDigitized}`);

            if (datetimeOriginal) {
                const timestamp = moment(exifDateParser.parse(data.image.DateTimeOriginal));
                const newPath = timestamp.format('YYYY/MM/DD/') + parsedPath.base;
                Key = `${newPath}`;
            } else {
                const timestamp = moment(exifDateParser.parse(data.image.DateTimeOriginal));
                console.log(`Could not parse out DateTimeOriginal in EXIF data. Timestamp would have been ${timestamp}`);
                return callback();
            }
            return callback();
        }

        const rate = (index + 1 - numIgnored) / (Date.now() - s3startTime); // eslint-disable-line no-mixed-operators, max-len

        const params = {
            localFile: resolvedPath,
            s3Params: {
                Bucket: BUCKET_NAME,
                Key,
                // other options supported by putObject, except Body and ContentLength.
                // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
            },
        };

        const uploader = client.uploadFile(params);
        uploader.on('error', err => console.error('Upload error!', err.stack));
        // uploader.on('progress', () => console.log(`progress: ${(100 * uploader.progressAmount/uploader.progressTotal).toFixed(2)}%`, uploader.progressMd5Amount, uploader.progressAmount, uploader.progressTotal))
        uploader.on('end', () => {
            const elapsed = (Date.now() - s3startTime) / 60000;
            const remaining = ((total - index - 1) / rate) / 60000;
            // console.log(`Finished uploading image ${index+1}/${total} ${resolvedPath} to S3`)
            fs.writeFileSync(path.resolve(UPLOAD_LIST), `${resolvedPath}\n`, { flag: 'a' });
            console.log(`[${index + 1}/${total} ${elapsed.toFixed(2)} mins elapsed, ${remaining.toFixed(2)} remaining] ${resolvedPath} => ${Key}`);
            return callback();
        });
    });
}

const results = walk(path.resolve(process.argv[2]), MAC_PHOTOS_LIBRARY_FILTER_FUNCTION);
const seriesFunctions = results
    .map((image, index, allPaths) => uploadToS3.bind(this, image, index, allPaths.length));

async.series(seriesFunctions, () => console.log(`Done uploading. Total time ${((Date.now() - t0) / 60000).toFixed(2)} minutes.`));
