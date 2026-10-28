const fs = require('fs');
const https = require('https');
const path = require('path');

const configPath = 'Z:/КАСТОМНЫЕ_МОБЫ_СЕРВЕР/.pterodactyl_config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function getUploadUrl() {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/client/servers/' + config.server_id + '/files/upload', config.panel_url);
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + config.api_token,
        'Accept': 'application/json'
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          resolve(j.attributes.url);
        } catch(e) { reject(new Error('Failed to get upload url: ' + b)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function uploadFile(uploadUrl, filePath, remoteDir) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    let header = '--' + boundary + '\r\n';
    header += 'Content-Disposition: form-data; name="files"; filename="' + fileName + '"\r\n';
    header += 'Content-Type: application/java-archive\r\n\r\n';
    
    const footer = '\r\n--' + boundary + '--\r\n';
    
    const fullUrl = new URL(uploadUrl);
    fullUrl.searchParams.set('directory', remoteDir);
    
    const req = https.request(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': Buffer.byteLength(header) + fileData.length + Buffer.byteLength(footer)
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ code: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.write(header);
    req.write(fileData);
    req.write(footer);
    req.end();
  });
}

async function run() {
  const jarPath = 'Z:/svinline/minecraft-plugin/target/SwinlineMine.jar';
  console.log('Requesting upload URL...');
  const upUrl = await getUploadUrl();
  console.log('Uploading SwinlineMine.jar to /plugins...');
  const res = await uploadFile(upUrl, jarPath, '/plugins');
  console.log('Upload response status:', res.code);
  if (res.code >= 200 && res.code < 300) {
    console.log('SUCCESS: SwinlineMine.jar uploaded to server plugins!');
  } else {
    console.error('Upload failed:', res.body);
  }
}

run().catch(console.error);
