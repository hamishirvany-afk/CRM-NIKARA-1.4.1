import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aicrm.offline',
  appName: 'CRM-NIKARA',
  webDir: 'www',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false
  },
  plugins: {
    LocalNotifications: {}
  }
};

export default config;
