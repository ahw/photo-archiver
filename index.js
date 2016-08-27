'use strict'

let s3 = require('s3')
let fs = require('fs')
let path = require('path')
let async = require('async')
let moment = require('moment')
let ExifImage = require('exif').ExifImage
let exifDateParser = require('exif-date')

let accessKeyId = fs.readFileSync(`${__dirname}/access_key_id`).toString().trim()
let secretAccessKey = fs.readFileSync(`${__dirname}/secret_access_key`).toString().trim()
const BUCKET_NAME = 'photos.andrewhallagan'
const UPLOAD_LIST = 'upload-list.txt'
let t0 = Date.now()

let SDMINI_FILTER_FUNCTION = function(path) {
    return /jpg/i.test(path)
        && !/Contact Sheet/.test(path)
        && !/upholstery/.test(path)
        && !/foam2/.test(path)
        && !/home\/music/.test(path)
        && !/Capture_/.test(path)
        && !/markers/.test(path)
        && !/timelapse_clips/.test(path)
        && !/william_resize/.test(path)
        && !/frame2_resize/.test(path)
        && !/Downloads/.test(path)
        && !/home\/2010/.test(path)
        && !/home\/2011/.test(path)
        && !/home\/55/.test(path)
        && !/windows_desktop\/finishing/.test(path)
        && !/windows_desktop\/foam1/.test(path)
        && !/windows_desktop\/foam2/.test(path)
        && !/windows_desktop\/foam3/.test(path)
        && !/web_thumbnails_100/.test(path)
        && !/web_thumbnails_75/.test(path)
        && !/800x600/.test(path)
        && !/resized/.test(path)
        && !/resize/.test(path)
}

let client = s3.createClient({
  maxAsyncS3: 20,     // this is the default
  s3RetryCount: 3,    // this is the default
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
})


function walk(dir, filterFn) {
    let results = []
    filterFn = filterFn || () => false
    let contents = fs.readdirSync(dir)
    contents.map(file => path.join(dir, file)).forEach(path => {
        let stats = fs.statSync(path)
        if (stats.isFile() && filterFn(path)) {
            // console.log(`Found file ${path}`)
            results.push(path)
        } else if (stats.isDirectory()) {
            results = results.concat(walk(path, filterFn))
        }
    })

    return results
}

function getPreviouslyUploadedIndex() {
    let index = {}
    try {
        console.log('Reading file ' + path.resolve(UPLOAD_LIST))
        let lines = fs.readFileSync(path.resolve(UPLOAD_LIST)).toString().split('\n')
        lines.forEach(path => index[path.trim()] = 1)
    } catch (e) {}

    return index
}

let s3startTime = Date.now()
function uploadToS3(image, index, total, callback) {
    let parsedPath = path.parse(image)
    let resolvedPath = path.resolve(image)
    new ExifImage({ image }, (error, data) => {
        let Key = undefined

        if (error && /No Exif segment found in the given image/i.test(error.message)) {
            Key = 'UNKNOWN_DATE/' + parsedPath.base
        } else if (error) {
            console.log(`Ignoring image ${image}. ${error.message}`)
            // console.error(error)
            return callback()
        } else {
            // No error
            let timestamp = moment(exifDateParser.parse(data.image.ModifyDate))
            let newPath = timestamp.format("YYYY/MM/DD/") + parsedPath.base
            Key = `${newPath}`
        }

        let rate = (index + 1)/(Date.now() - s3startTime)

        let params = {
          localFile: resolvedPath,
          s3Params: {
            Bucket: BUCKET_NAME,
            Key,
            // other options supported by putObject, except Body and ContentLength.
            // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
          },
        }

        let uploader = client.uploadFile(params)
        uploader.on('error', (err) => console.error('Upload error!', err.stack))
        // uploader.on('progress', () => console.log(`progress: ${(100 * uploader.progressAmount/uploader.progressTotal).toFixed(2)}%`, uploader.progressMd5Amount, uploader.progressAmount, uploader.progressTotal))
        uploader.on('end', () => {
            let elapsed = (Date.now() - s3startTime)/60000
            let remaining = ((total - index - 1)/rate)/60000
            // console.log(`Finished uploading image ${index+1}/${total} ${resolvedPath} to S3`)
            fs.writeFileSync(path.resolve(UPLOAD_LIST), Key + '\n', { flag: 'a' })
            console.log(`[${index+1}/${total} ${elapsed.toFixed(2)} mins elapsed, ${remaining.toFixed(2)} remaining] ${resolvedPath} => ${Key}`)
            return callback()
        })
    })
}

let results = walk(path.resolve(process.argv[2]), SDMINI_FILTER_FUNCTION)
let seriesFunctions = results.slice(1160+400).map((image, index, results) => {
    return uploadToS3.bind(this, image, index, results.length)
})

async.series(seriesFunctions, () => console.log(`Done uploading. Total time ${((Date.now() - t0)/60000).toFixed(2)} minutes.`))
