import { NativeModules } from "react-native";

export type ApkInfo = {
  packageName?: string;
  versionName?: string;
  sha256?: string;
  permissions?: string[];
  error?: string;
};

type ChetanaNativeType = {
  getApkInfoFromUri(uri: string): Promise<ApkInfo>;
  openNotificationListenerSettings(): Promise<void>;
};

export const ChetanaNative = NativeModules.ChetanaNative as ChetanaNativeType;
