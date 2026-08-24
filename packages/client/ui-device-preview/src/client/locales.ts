/** Copy owned by the device preview panel. */
export const en = { open: 'Device', imageAlt: 'Current HarmonyOS device screen', noDevice: 'No device connected', noDeviceHint: 'Connect and authorize a HarmonyOS device. The preview will appear automatically.' } as const
/** Simplified Chinese device-preview messages. */
export const zh = { open: '设备', imageAlt: '当前鸿蒙设备画面', noDevice: '未连接设备', noDeviceHint: '请连接并授权鸿蒙设备，连接成功后画面会自动显示。' } as const
/** Keys shared by the device-preview locale dictionaries. */
export type DevicePreviewKey = keyof typeof en
