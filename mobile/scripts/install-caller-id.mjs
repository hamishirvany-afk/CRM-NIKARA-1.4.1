import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const androidMain = path.join(mobile, 'android', 'app', 'src', 'main');
const javaDir = path.join(androidMain, 'java', 'com', 'aicrm', 'offline');
const manifest = path.join(androidMain, 'AndroidManifest.xml');
const sourceDir = path.join(mobile, 'native-caller-id');

if (!fs.existsSync(androidMain)) {
  throw new Error('Android project not found. Run npx cap add android first.');
}
fs.mkdirSync(javaDir, { recursive: true });
for (const name of ['CallerIdPlugin.java', 'CrmCallScreeningService.java', 'CallerIdActivity.java', 'CallerIdOverlay.java', 'AttachmentViewerPlugin.java', 'InvoicePrintPlugin.java']) {
  fs.copyFileSync(path.join(sourceDir, name), path.join(javaDir, name));
}

// PDF bridge must live in package android.print (see NikaraPdfWriter.java).
const printBridgeDir = path.join(androidMain, 'java', 'android', 'print');
fs.mkdirSync(printBridgeDir, { recursive: true });
fs.copyFileSync(path.join(sourceDir, 'NikaraPdfWriter.java'), path.join(printBridgeDir, 'NikaraPdfWriter.java'));

const mainActivity = path.join(javaDir, 'MainActivity.java');
fs.writeFileSync(mainActivity, `package com.aicrm.offline;\n\nimport android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(CallerIdPlugin.class);\n        registerPlugin(AttachmentViewerPlugin.class);\n        registerPlugin(InvoicePrintPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}\n`);

const mainActivityText = fs.readFileSync(mainActivity, 'utf8');
if (!mainActivityText.includes('registerPlugin(AttachmentViewerPlugin.class)')) {
  throw new Error('AttachmentViewerPlugin was not registered in MainActivity');
}
if (!mainActivityText.includes('registerPlugin(InvoicePrintPlugin.class)') || !fs.existsSync(path.join(printBridgeDir, 'NikaraPdfWriter.java'))) {
  throw new Error('Invoice PDF/print plugin was not installed');
}
if (!fs.existsSync(path.join(javaDir, 'AttachmentViewerPlugin.java'))) {
  throw new Error('AttachmentViewerPlugin.java was not copied into Android sources');
}

let xml = fs.readFileSync(manifest, 'utf8');
if (!xml.includes('android.hardware.telephony')) {
  xml = xml.replace(/<application\b/, '<uses-feature android:name="android.hardware.telephony" android:required="false" />\n    <application');
}
const permissions = [
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.READ_CONTACTS" />',
  '<uses-permission android:name="android.permission.WRITE_CONTACTS" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />',
  '<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />',
  '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />'
];
for (const permission of permissions) {
  if (!xml.includes(permission)) xml = xml.replace(/<application\b/, `${permission}\n    <application`);
}
const fileProviderAuthority = '${applicationId}.fileprovider';
const provider = `
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${fileProviderAuthority}"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/crm_file_paths" />
        </provider>
`;
if (!xml.includes(fileProviderAuthority)) {
  const existingProvider = /<provider\b(?=[^>]*android:name="androidx\.core\.content\.FileProvider")[^>]*(?:\/>|>[\s\S]*?<\/provider>)/;
  xml = existingProvider.test(xml)
    ? xml.replace(existingProvider, provider.trim())
    : xml.replace(/\s*<\/application>/, `${provider}\n    </application>`);
}

if (!xml.includes('CrmCallScreeningService')) {
  const block = `\n        <!-- CRM Caller ID: Android routes incoming cellular calls here after the user grants the Caller ID & spam role. -->\n        <service\n            android:name=".CrmCallScreeningService"\n            android:permission="android.permission.BIND_SCREENING_SERVICE"\n            android:exported="true">\n            <intent-filter>\n                <action android:name="android.telecom.CallScreeningService" />\n            </intent-filter>\n        </service>\n\n        <activity\n            android:name=".CallerIdActivity"\n            android:exported="false"\n            android:excludeFromRecents="true"\n            android:launchMode="singleTop"\n            android:showWhenLocked="true"\n            android:turnScreenOn="true"\n            android:theme="@style/CallerIdTheme" />\n`;
  xml = xml.replace(/\s*<\/application>/, `${block}\n    </application>`);
  const deepLink = `
        <activity-alias
            android:name=".CrmContactDeepLink"
            android:targetActivity=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="crm-nikara" android:host="contact" />
            </intent-filter>
        </activity-alias>`;
  xml = xml.replace(/\s*<\/application>/, `${deepLink}\n    </application>`);
}
fs.writeFileSync(manifest, xml);


// CRM-NIKARA market branding and Android release identity.
const androidRoot = path.join(mobile, 'android');
const gradleCandidates = [path.join(androidRoot, 'app', 'build.gradle'), path.join(androidRoot, 'app', 'build.gradle.kts')];
for (const gradleFile of gradleCandidates) {
  if (!fs.existsSync(gradleFile)) continue;
  let gradle = fs.readFileSync(gradleFile, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 10400');
  gradle = gradle.replace(/versionName\s+["'][^"']+["']/, 'versionName "1.4.0"');
  fs.writeFileSync(gradleFile, gradle);
}

const brandingDir = path.join(mobile, 'branding');
const densities = ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi'];
for (const den of densities) {
  const mip = path.join(androidMain, 'res', `mipmap-${den}`);
  if (!fs.existsSync(mip)) continue;
  for (const [dst, src] of [
    ['ic_launcher.png', `ic_launcher_${den}.png`],
    ['ic_launcher_round.png', `ic_launcher_round_${den}.png`],
    ['ic_launcher_foreground.png', `ic_launcher_foreground_${den}.png`]
  ]) {
    const source = path.join(brandingDir, src);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(mip, dst));
  }
}
const brandingValuesDir = path.join(androidMain, 'res', 'values');
fs.mkdirSync(brandingValuesDir, { recursive: true });
const brandColors = path.join(brandingValuesDir, 'nikara_launcher_colors.xml');
fs.writeFileSync(brandColors, `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="nikara_launcher_background">#0B1220</color></resources>\n`);
for (const dirName of ['mipmap-anydpi-v26']) {
  const dir = path.join(androidMain, 'res', dirName);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter(x => x.endsWith('.xml'))) {
    const fp = path.join(dir, file);
    let xmlIcon = fs.readFileSync(fp, 'utf8');
    xmlIcon = xmlIcon.replace(/@color\/ic_launcher_background/g, '@color/nikara_launcher_background');
    fs.writeFileSync(fp, xmlIcon);
  }
}

const valuesDir = path.join(androidMain, 'res', 'values');
fs.mkdirSync(valuesDir, { recursive: true });
const xmlDir = path.join(androidMain, 'res', 'xml');
fs.mkdirSync(xmlDir, { recursive: true });
fs.writeFileSync(path.join(xmlDir, 'crm_file_paths.xml'), `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="crm_attachments" path="crm_attachments/" />
</paths>
`);

fs.writeFileSync(path.join(valuesDir, 'caller_id_styles.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <style name="CallerIdTheme" parent="android:style/Theme.Material.Light.NoActionBar">\n        <item name="android:windowIsTranslucent">false</item>\n        <item name="android:windowBackground">#F6F8FC</item>\n        <item name="android:windowNoTitle">true</item>\n        <item name="android:windowDisablePreview">true</item>\n        <item name="android:windowCloseOnTouchOutside">false</item>\n    </style>\n</resources>\n`);


const finalManifest = fs.readFileSync(manifest, 'utf8');
const requiredManifestMarkers = [
  'android.permission.READ_CONTACTS',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.RECORD_AUDIO',
  'CrmCallScreeningService',
  'android.permission.BIND_SCREENING_SERVICE',
  fileProviderAuthority,
  'CallerIdActivity'
];
for (const marker of requiredManifestMarkers) {
  if (!finalManifest.includes(marker)) throw new Error(`Android manifest check failed: ${marker}`);
}
for (const file of [
  path.join(javaDir, 'CallerIdPlugin.java'),
  path.join(javaDir, 'CrmCallScreeningService.java'),
  path.join(javaDir, 'CallerIdActivity.java'),
  path.join(javaDir, 'CallerIdOverlay.java'),
  path.join(javaDir, 'AttachmentViewerPlugin.java'),
  path.join(xmlDir, 'crm_file_paths.xml'),
  path.join(valuesDir, 'caller_id_styles.xml')
]) {
  if (!fs.existsSync(file)) throw new Error(`Generated Android file missing: ${file}`);
}

console.log('Caller ID + offline attachment viewer native integration installed and verified.');
