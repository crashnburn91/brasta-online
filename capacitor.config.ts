/// <reference types="@capacitor/push-notifications" />

import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.BRASTA_ANDROID_SERVER_URL?.trim() || 'https://brasta.app';

const config: CapacitorConfig = {
  appId: 'app.brasta',
  appName: 'Brasta',
  webDir: 'mobile-shell',
  backgroundColor: '#071b13',
  loggingBehavior: 'debug',
  server: {
    url: serverUrl,
    androidScheme: 'https',
    cleartext: false,
    errorPath: 'offline.html',
  },
  android: {
    appendUserAgent: ' BrastaAndroid/0.1.0',
    backgroundColor: '#071b13',
    zoomEnabled: false,
  },
  plugins: {
    PushNotifications: {
      // Room-state haptics already cover the foreground experience. Native
      // notifications are displayed only while Brasta is backgrounded.
      presentationOptions: [],
    },
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
      hidden: true,
    },
  },
};

export default config;
