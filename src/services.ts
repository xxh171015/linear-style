import type { LoopAction, Review } from "./types";

export type ReviewAction = "approve" | "request-changes" | "merge";
export interface ReviewAdapter {
  transition(review: Review, action: ReviewAction): Review;
}
export interface AutomationAdapter {
  external(action: Extract<LoopAction, "coding-session" | "slack-reply">): {
    status: "completed" | "limited" | "failed";
    message: string;
    log?: string;
  };
  codingConfigured?(): boolean;
  githubConfigured?(): boolean;
  startCodingSession?(issueId: string): {
    status: "completed" | "failed" | "limited";
    message: string;
    log?: string;
  };
}
export type ServiceAdapters = {
  reviews: ReviewAdapter;
  automations: AutomationAdapter;
};

/** These adapters perform no network, shell, hosted review or messaging action. */
export const offlineServices: ServiceAdapters = {
  reviews: {
    transition(review, action) {
      const status =
        action === "approve"
          ? "ready"
          : action === "merge"
            ? "merged"
            : "changes";
      return {
        ...review,
        status,
        approved: status === "ready" || status === "merged",
      };
    },
  },
  automations: {
    external(action) {
      return {
        status: "limited",
        message:
          action === "coding-session"
            ? "Coding sessions require an external coding service. No session was started."
            : "Slack delivery requires a connected Slack service. No message was sent.",
      };
    },
  },
};
