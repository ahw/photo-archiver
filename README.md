Dependencies
============
- node 4.2.1
- npm  2.14.7
- `access_key_id` file containing S3 access key id
- `secret_access_key` file containing S3 secret access key

Usage
====

    node index.js "/Users/andrew/Pictures//Photos Library.photoslibrary/Masters"

Better Usage
============

    ./index.js --dir

    ./index.js --dir /Users/andrwe/Photos --start-exif-date 2016-10-01 --end-exif-date 2017-01-01

    ./index.js --dir /Users/andrwe/Photos --start-exif-date 2016-10-01 --end-exif-date 2017-01-01
