'use strict'

let s3 = require('s3')
let fs = require('fs')
let path = require('path')

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

let filename = process.argv[2]
let resolvedPath = path.resolve(filename)
let parsedPath = path.parse(filename)

let params = {
  localFile: resolvedPath,
  s3Params: {
    Bucket: 'photos.andrewhallagan',
    Key: `test/foo/bar/${parsedPath.base}`,
    // other options supported by putObject, except Body and ContentLength.
    // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
  },
}

let uploader = client.uploadFile(params)

uploader.on('error', (err) => console.error("unable to upload:", err.stack))
uploader.on('progress', () => console.log(`progress: ${(100 * uploader.progressAmount/uploader.progressTotal).toFixed(2)}%`, uploader.progressMd5Amount, uploader.progressAmount, uploader.progressTotal))
uploader.on('end', () => console.log("done uploading"))
