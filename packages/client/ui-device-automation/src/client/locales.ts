/** Copy owned by the device automation workspace. */
export const en = {
  open: 'Device automation', close: 'Close device automation', title: 'Automation test mode', files: 'Files', device: 'Device', back: 'Back',
  emptyDirectory: 'This directory is empty', truncated: 'More entries are hidden', loading: 'Loading…',
  fileError: 'Unable to open file', directoryError: 'Unable to list directory',
  imageAlt: 'Current automated device screen', noDevice: 'No device connected',
  noDeviceHint: 'Connect and authorize a device. The preview will appear automatically.',
} as const

/** Simplified Chinese device automation messages. */
export const zh: Record<keyof typeof en, string> = {
  open: '设备自动化', close: '关闭设备自动化', title: '自动化测试模式', files: '文件', device: '设备', back: '返回',
  emptyDirectory: '当前目录为空', truncated: '更多条目已隐藏', loading: '加载中…',
  fileError: '无法打开文件', directoryError: '无法读取目录',
  imageAlt: '当前自动化设备画面', noDevice: '未连接设备',
  noDeviceHint: '请连接并授权设备，连接成功后画面会自动显示。',
}

/** Keys shared by the device automation dictionaries. */
export type DeviceAutomationKey = keyof typeof en
