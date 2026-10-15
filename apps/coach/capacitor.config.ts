import type { CapacitorConfig } from '@capacitor/cli';
// P0.5 — shells nativos. `npx cap add ios && npx cap add android` na máquina com Xcode/Android Studio.
const config: CapacitorConfig = {
  appId: 'os.luna.coach',
  appName: 'LUNA.OS',
  webDir: 'dist',
  ios: { contentInset: 'always' },
};
export default config;
