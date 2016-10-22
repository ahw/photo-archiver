const config = require('config');
const client = require('./s3client').createClient();

exports.command = 'list';
exports.describe = 'List all objects in your S3 bucket';

exports.handler = function (argv) {
    const basenames = {};
    const duplicates = {};
    let totalImages = 0;
    let totalSize = 0;

    const emitter = client.listObjects({
        s3Params: {
            Bucket: config.get('bucket'),
        },
    });

    emitter.on('data', (data) => {
        data.Contents.forEach(object => {
            console.log(`${object.Key}`);
            totalImages += 1;
            totalSize += object.Size;
            const matches = object.Key.match(/([^/]+)$/);
            const basename = matches ? matches[1] : undefined;
            if (basename && basenames[basename]) {
                console.log(`Found duplicate basename ${basename} => ${object.Key}`);
                if (typeof duplicates[basename] === 'undefined') {
                    duplicates[basename] = [];
                }

                duplicates[basename].push(object.Key);
            }
        });
    });

    emitter.on('end', () => {
        // Current cost is $0.03/GB for the first 1 TB. See https://aws.amazon.com/s3/pricing/
        console.log(`\n${totalImages} images, ${(totalSize / 1e9).toFixed(2)} GB (approx. $${(12 * 0.03 * totalSize / 1e9).toFixed(2)}/year)`);
    });

    emitter.on('error', (...args) => console.error(...args));
};
