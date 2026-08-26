export interface FeedbackInvocationPaths {
  feedbackQueuePath: string;
  reportModelPath: string;
  reportHtmlPath: string;
}

export interface FeedbackInvocations {
  codex: string;
  claude: string;
}

function invocation(prefix: string, paths: FeedbackInvocationPaths): string {
  return `${prefix} Apply the pending feedback queue at ${JSON.stringify(paths.feedbackQueuePath)} to the report model at ${JSON.stringify(paths.reportModelPath)} and refresh the clean HTML at ${JSON.stringify(paths.reportHtmlPath)}.`;
}

export function createFeedbackInvocations(paths: FeedbackInvocationPaths): FeedbackInvocations {
  return {
    codex: invocation("$progressbrief-report", paths),
    claude: invocation("/progressbrief-report", paths),
  };
}
