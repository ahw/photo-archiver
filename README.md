Dependencies
============
- node 4.2.1
- npm  2.14.7
- `access_key_id` file containing S3 access key id
- `secret_access_key` file containing S3 secret access key

Usage
====

    ./index.js upload --dir ~/Desktop
    ./index.js upload --dir ~/Desktop --max-count 10
    ./index.js upload --dir "/Users/andrew/Pictures//Photos Library.photoslibrary/Masters" --max-count 10 --prefix test/ --dry-run
    ./index.js upload --dir "/Users/andrew/Pictures//Photos Library.photoslibrary/Masters" --max-count 10 --dry-run

Better Usage
============

    ./index.js --dir

    ./index.js --dir /Users/andrwe/Photos --start-exif-date 2016-10-01 --end-exif-date 2017-01-01

    ./index.js --dir /Users/andrwe/Photos --start-exif-date 2016-10-01 --end-exif-date 2017-01-01
