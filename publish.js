let extend = require('util')._extend;
let fs = require('fs');
let path = require('path');
let glob = require("glob");
let fsi = require('fs-filesysteminfo');
const dotenv = require('dotenv');
let matter = require('gray-matter');
let short = require('short-uuid');
let AWS = require('aws-sdk');

// Get env variables
dotenv.config();
const baseDir = process.env.BASE_MD_DIR;
const s3Bucket = process.env.AWS_BUCKET_NAME;
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Loop through files
glob(baseDir + '/**/*.md', (err,files) => {
    var fileList = [];
    files.forEach((file)=>{
        
        // Read front matter
        m = {};
        m.file = fs.readFileSync(file);
        m.fileSystemInfo = new fsi.FileSystemInfo(file);
        m.matter = matter(m.file);

        // If publish tag is added
        if (m.matter.data.publish) {
            
            console.log(path.parse(file).name);
            
            var newFileInd = false;
            // If GUID doesn't already exist
            if (m.matter.data.guid === undefined) {
                // Add new GUID tag
                m.matter.data = extend(m.matter.data, {guid:short().new()})
                    
                // Update file in-place
                let data = matter.stringify(m.matter.content, m.matter.data);
                fs.writeFile(file, data,  (err) => {
                    console.log(err);
                });
                newFileInd = true;
            }

            // Add title
            m.matter.content = `# ${path.parse(file).name} \n --- \n`+m.matter.content;

            // Upload dependent images
            m.matter.content.split('![[').forEach((str,i)=>{
                if (i>0) {
                    var imgName = str.split(']]')[0];
                    glob.sync(baseDir + `/**/${imgName}`).forEach(file => {
                        var imgData = fs.readFileSync(file);
                        uploadToS3(imgName,imgData);
                    });
                }
            });

            // Log for reporting
            fileList.push({filename: path.basename(file), new: newFileInd, guid: m.matter.data.guid});

            // Upload file to S3 (overwrite if exists)
            uploadToS3(`${m.matter.data.guid}.md`,matter.stringify(m.matter.content, m.matter.data));
        }
    });

    function uploadToS3(fileName, fileContent) {
        const params = {
            Bucket: s3Bucket,
            Key: fileName,
            Body: fileContent
        }
        s3.upload(params, (err, data) => {
            if (err) {
                console.log(err);
            }
        });
    }

    // // LOG SUMMARY
    // console.log("Existing Files Updated");
    // console.log(fileList.filter(d=>{return !d.new}));

    // console.log("New Files Added:");
    // console.log(fileList.filter(d=>{return d.new}));


})
