const s3 = require('s3');
const config = require('config');

let client; // This will get cached and re-used on subsequent calls to createClient()

exports.createClient = function () {
    if (!client) {
        const accessKeyId = config.get('accessKeyId');
        const secretAccessKey = config.get('secretAccessKey');
        const bucket = config.get('bucket');
        const region = config.get('region');

        client = s3.createClient({
            maxAsyncS3: 20, // this is the default
            s3RetryCount: 3, // this is the default
            s3RetryDelay: 1000, // this is the default
            multipartUploadThreshold: 20971520, // this is the default (20 MB)
            multipartUploadSize: 15728640, // this is the default (15 MB)
            s3Options: {
                accessKeyId,
                secretAccessKey,
                region,
                // endpoint: 's3.yourdomain.com',
                // sslEnabled: false
                // any other options are passed to new AWS.S3()
                // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
            },
        });
    }

    return client;
}
