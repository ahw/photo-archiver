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
            console.log(`Found file ${path}`)
            results.push(path)
        } else if (stats.isDirectory()) {
            results = results.concat(walk(path, filterFn))
        }
    })

    return results
}

function uploadToS3(image, callback) {
    let parsedPath = path.parse(image)
    let resolvedPath = path.resolve(image)
    new ExifImage({ image }, (error, data) => {
        let timestamp = moment(exifDateParser.parse(data.image.ModifyDate))
        let newPath = timestamp.format("YYYY/MM/DD/") + parsedPath.base
        console.log(image + ' -> ' + newPath)

        let params = {
          localFile: resolvedPath,
          s3Params: {
            Bucket: 'photos.andrewhallagan',
            Key: `test/foo/bar/${newPath}`,
            // other options supported by putObject, except Body and ContentLength.
            // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
          },
        }

        let uploader = client.uploadFile(params)
        uploader.on('error', (err) => console.error("unable to upload:", err.stack))
        // uploader.on('progress', () => console.log(`progress: ${(100 * uploader.progressAmount/uploader.progressTotal).toFixed(2)}%`, uploader.progressMd5Amount, uploader.progressAmount, uploader.progressTotal))
        uploader.on('end', () => {
            console.log("done uploading")
            callback()
        })
    })
}

let results = walk(path.resolve(process.argv[2]), (path) => /Masters/.test(path) && /jpg/i.test(path))
async.parallelLimit(results.slice(0, 10).map(image => uploadToS3.bind(this, image)), 5, function() {
    console.log('Done')
})
