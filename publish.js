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
const subDirForGit = process.env.GIT_PUBLISH_SUBDIR;
const gitPath = process.env.GIT_REPO_ABSDIR;
const gitURL = process.env.GIT_REPO_URL;
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

        // Git settings
        var gitPublish = (!(subDirForGit == null || gitPath == null) && file.indexOf(subDirForGit)>=0 && m.matter.data.gitURL !== undefined);
        var curAbsDir = path.parse(file).dir;
        var relDir = curAbsDir.substring(curAbsDir.indexOf(subDirForGit)+subDirForGit.length);
        var gitAbsDir = gitPath+'/'+relDir;
        var gitFileURL = gitURL+'/'+encodeURIComponent(relDir)+'/'+encodeURIComponent(path.parse(file).base);
        var updateFile = false;

        // If publish tag is added
        if (m.matter.data.publish) {
            console.log(path.parse(file).name);
            
            // If GUID doesn't already exist
            if (m.matter.data.guid === undefined) {
                // Add new GUID tag
                m.matter.data = extend(m.matter.data, {guid:short().new().substring(0,8)});
                updateFile = true;
            }

            // If GitURL doesn't exist (or is misaligned) - add it
            if (gitPublish && gitFileURL !== m.matter.data.gitURL ) {
                m.matter.data = extend(m.matter.data, {gitURL:gitFileURL});
                updateFile = true;
            }
        
            // Update file in-place
            if (updateFile) {
                let data = matter.stringify(m.matter.content, m.matter.data);
                fs.writeFileSync(file, data);
            }

            // Git Sync
            if (gitPublish) {
                // Create path if not exists
                if (!fs.existsSync(gitAbsDir)){
                    fs.mkdirSync(gitAbsDir, { recursive: true });
                }

                // Copy file
                fs.copyFileSync(file, gitAbsDir+'/'+path.parse(file).base);
            }

            // S3 Publish
            // Add title
            m.matter.content = `# ${path.parse(file).name} \n --- \n`+m.matter.content;

            // Handle embedded images and markdown
            m.matter.content.split('![[').forEach((str,i)=>{
                if (i>0) {
                    var imgName = str.split(']]')[0];
                    
                    // If not an image, treat as markdown embed and replace contents inline
                    if (!imgName.match(/\.(jpg|jpeg|png|gif)$/i)) {
                        glob.sync(baseDir + `/**/${imgName}.md`).forEach(file => {
                            var docData = fs.readFileSync(file);
                            docContent = matter(docData);
                            m.matter.content = m.matter.content.replaceAll(`![[${imgName}]]`, docContent.content);
                        });
                    } 
                    // Else upload the image
                    else {
                        glob.sync(baseDir + `/**/${imgName}`).forEach(file => {
                            var imgData = fs.readFileSync(file);
                            uploadToS3(imgName,imgData);
                        });
                    }
                }
            });

            // Log for reporting
            fileList.push({filename: path.basename(file), fileUpdated: updateFile, guid: m.matter.data.guid});

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
