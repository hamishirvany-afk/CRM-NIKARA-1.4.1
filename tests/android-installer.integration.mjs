import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function assert(condition, message) {
  if (!condition) throw new Error(`ANDROID_INSTALLER_INTEGRATION_FAIL: ${message}`);
}

const root = process.cwd();
const fixture = fs.mkdtempSync(path.join(root, '.test-crm-nikara-installer-'));
const mobile = path.join(fixture, 'mobile');
const androidMain = path.join(mobile, 'android', 'app', 'src', 'main');
const scripts = path.join(mobile, 'scripts');

try {
  fs.mkdirSync(path.join(androidMain, 'java', 'com', 'aicrm', 'offline'), { recursive: true });
  fs.mkdirSync(path.join(androidMain, 'res', 'values'), { recursive: true });
  fs.mkdirSync(scripts, { recursive: true });
  fs.cpSync(path.join(root, 'mobile', 'native-caller-id'), path.join(mobile, 'native-caller-id'), { recursive: true });
  fs.copyFileSync(path.join(root, 'mobile', 'scripts', 'install-caller-id.mjs'), path.join(scripts, 'install-caller-id.mjs'));
  fs.writeFileSync(path.join(androidMain, 'AndroidManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:label="CRM-NIKARA">
    <provider android:name="androidx.core.content.FileProvider" android:authorities="com.aicrm.offline.fileprovider" android:exported="false" />
  </application>
</manifest>
`);
  fs.writeFileSync(path.join(mobile, 'android', 'app', 'build.gradle'), `android { defaultConfig { versionCode 1\nversionName "0.0.1" } }\n`);

  for (let pass = 1; pass <= 2; pass++) {
    const result = spawnSync(process.execPath, [path.join(scripts, 'install-caller-id.mjs')], { encoding: 'utf8' });
    assert(result.status === 0, `installer pass ${pass} failed: ${result.stderr || result.stdout}`);
  }

  const manifest = fs.readFileSync(path.join(androidMain, 'AndroidManifest.xml'), 'utf8');
  const gradle = fs.readFileSync(path.join(mobile, 'android', 'app', 'build.gradle'), 'utf8');
  const mainActivity = fs.readFileSync(path.join(androidMain, 'java', 'com', 'aicrm', 'offline', 'MainActivity.java'), 'utf8');
  assert((manifest.match(/androidx\.core\.content\.FileProvider/g) || []).length === 1, 'FileProvider must be idempotent');
  assert(manifest.includes('android:authorities="${applicationId}.fileprovider"'), 'Gradle-safe FileProvider authority was not generated');
  assert(!manifest.includes('com.aicrm.offline.fileprovider'), 'obsolete hard-coded authority remains');
  assert(manifest.includes('CrmCallScreeningService') && manifest.includes('CallerIdActivity'), 'caller ID components are incomplete');
  assert(manifest.includes('android.permission.SCHEDULE_EXACT_ALARM') && manifest.includes('android.permission.READ_CONTACTS'), 'required permissions are incomplete');
  assert(mainActivity.includes('registerPlugin(CallerIdPlugin.class)') && mainActivity.includes('registerPlugin(AttachmentViewerPlugin.class)'), 'Capacitor plugins were not registered');
  assert(gradle.includes('versionCode 10400') && gradle.includes('versionName "1.4.0"'), 'Android version identity was not updated');
  assert(fs.existsSync(path.join(androidMain, 'res', 'xml', 'crm_file_paths.xml')), 'FileProvider paths resource missing');
  assert(fs.existsSync(path.join(androidMain, 'res', 'values', 'caller_id_styles.xml')), 'Caller ID theme missing');
  console.log('ANDROID_INSTALLER_INTEGRATION_PASS');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
