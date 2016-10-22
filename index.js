#!/Users/andrew/.nvm/versions/node/v6.5.0/bin/node
/* eslint-disable no-console */
const yargs = require('yargs');
const s3 = require('s3');
const fs = require('fs');
const path = require('path');
const async = require('async');
const moment = require('moment');

yargs.command(require('./upload'))
    .command(require('./list'))
    .help()
    .argv;

// const results = walk(path.resolve(argv.dir), MAC_PHOTOS_LIBRARY_FILTER_FUNCTION);
// const results = walk(path.resolve(argv.dir));
// results.forEach(imagePath => console.log(imagePath));
// const seriesFunctions = results
//     .map((image, index, allPaths) => uploadToS3.bind(this, image, index, allPaths.length));
// 
// async.series(seriesFunctions, () => console.log(`Done uploading. Total time ${((Date.now() - t0) / 60000).toFixed(2)} minutes.`));
