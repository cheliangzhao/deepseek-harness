/** Model-visible task submitted by the automation test view. */

/**
 * Build the stable automation instruction for one workspace-relative test case.
 * @param path - workspace-relative path selected through the trusted file service.
 * @returns the prompt logged as the Session's next user message.
 */
export function buildAutomationTestPrompt(path: string): string {
  return `Run the automation test case at workspace-relative path ${JSON.stringify(path)}.

Read the complete file before acting. Treat its contents as the test case steps and data. Use the installed HarmonyOS automation Skills and DevEco CLI UI automation commands against the currently connected authorized device.

After execution, report the steps performed, passed and failed checks, relevant device errors or logs, and concrete follow-up actions. Do not modify the test case unless it explicitly asks for an edit.`
}
