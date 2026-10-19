import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const gradleFile = path.join(mobile, 'android', 'app', 'build.gradle');
if (!fs.existsSync(gradleFile)) throw new Error('Android app/build.gradle not found');
let s = fs.readFileSync(gradleFile, 'utf8');
if (!s.includes('nikaraRelease')) {
  const signing = `android {\n    signingConfigs {\n        nikaraRelease {\n            storeFile file("nikara-upload.jks")\n            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")\n            keyAlias System.getenv("ANDROID_KEY_ALIAS")\n            keyPassword System.getenv("ANDROID_KEY_PASSWORD")\n        }\n    }`;
  s = s.replace('android {', signing);
  s = s.replace('release {', 'release {\n            signingConfig signingConfigs.nikaraRelease');
}
fs.writeFileSync(gradleFile, s);
if (!s.includes('signingConfig signingConfigs.nikaraRelease')) throw new Error('Release signing config was not installed');
console.log('CRM-NIKARA release signing configured.');
