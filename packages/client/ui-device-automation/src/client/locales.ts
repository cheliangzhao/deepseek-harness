/** Copy owned by the device automation workspace. */
export const en = {
  open: 'Device automation', close: 'Close device automation', title: 'Automation test mode', files: 'Files', device: 'Device', back: 'Back',
  automationTests: 'Automation tests', testCases: 'Test cases', selectTestCase: 'Select a workspace file to run',
  testViewHint: 'Choose a test case and submit it to the current automation session.', workspaceFiles: 'Workspace files',
  noTestSelected: 'No test case selected', noTestSelectedHint: 'Select a file from the workspace tree to prepare an automation run.',
  runTest: 'Run test', runTestHint: 'The automation agent reads this file and executes its steps against the connected device.',
  submittingTest: 'Submitting…', testSubmitted: 'Test submitted', testSubmittedHint: 'Execution continues in this session. Follow the result in Conversation or Trajectory.',
  testSubmitFailed: 'Unable to submit test', testSubmitFailedHint: 'Check the automation environment and retry.',
  emptyDirectory: 'This directory is empty', truncated: 'More entries are hidden', loading: 'Loading…',
  fileError: 'Unable to open file', directoryError: 'Unable to list directory',
  checkingEnvironment: 'Checking the automation environment', checkingCli: 'Locating DevEco CLI…',
  syncingSkills: 'Synchronizing HarmonyOS automation skills…', skillProgress: '{completed} of {total} completed',
  harmonyReady: 'HarmonyOS automation is ready', harmonyReadyHint: 'Skills synchronized. Opening the device workspace…',
  cliMissing: 'DevEco CLI is required', cliMissingHint: 'Install DevEco CLI, then retry the environment check.',
  downloadCli: 'Download DevEco CLI', retry: 'Retry',
  skillSyncFailed: 'Unable to synchronize test skills', skillSyncFailedHint: 'Check the network connection and retry.',
  imageAlt: 'Current automated device screen', noDevice: 'No device connected',
  noDeviceHint: 'Connect and authorize a device. The preview will appear automatically.',
} as const

/** Simplified Chinese device automation messages. */
export const zh: Record<keyof typeof en, string> = {
  open: '设备自动化', close: '关闭设备自动化', title: '自动化测试模式', files: '文件', device: '设备', back: '返回',
  automationTests: '自动化测试', testCases: '测试用例', selectTestCase: '选择工作区文件并运行',
  testViewHint: '选择测试用例，并提交到当前自动化会话。', workspaceFiles: '工作区文件',
  noTestSelected: '尚未选择测试用例', noTestSelectedHint: '从工作区文件树选择一个文件，准备自动化测试。',
  runTest: '运行测试', runTestHint: '自动化 Agent 将读取该文件，并在已连接设备上执行其中的步骤。',
  submittingTest: '正在提交…', testSubmitted: '测试已提交', testSubmittedHint: '测试将在当前会话中继续执行，可在“对话”或“轨迹”查看结果。',
  testSubmitFailed: '无法提交测试', testSubmitFailedHint: '请检查自动化环境后重试。',
  emptyDirectory: '当前目录为空', truncated: '更多条目已隐藏', loading: '加载中…',
  fileError: '无法打开文件', directoryError: '无法读取目录',
  checkingEnvironment: '正在检查自动化测试环境', checkingCli: '正在查找 DevEco CLI…',
  syncingSkills: '正在同步鸿蒙自动化 Skills…', skillProgress: '已完成 {completed}/{total}',
  harmonyReady: '鸿蒙自动化已就绪', harmonyReadyHint: 'Skills 已同步，正在打开设备工作区…',
  cliMissing: '需要安装 DevEco CLI', cliMissingHint: '请安装 DevEco CLI，然后重新检查环境。',
  downloadCli: '下载 DevEco CLI', retry: '重新检查',
  skillSyncFailed: '无法同步测试 Skills', skillSyncFailedHint: '请检查网络连接后重试。',
  imageAlt: '当前自动化设备画面', noDevice: '未连接设备',
  noDeviceHint: '请连接并授权设备，连接成功后画面会自动显示。',
}

/** Keys shared by the device automation dictionaries. */
export type DeviceAutomationKey = keyof typeof en
