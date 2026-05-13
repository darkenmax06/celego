export type BrowserNotificationResult = {
  shown: boolean;
  reason:
    | "shown"
    | "unsupported"
    | "permission_denied"
    | "permission_default"
    | "error";
};

export async function notifyInBrowser(args: {
  title: string;
  body: string;
  tag?: string;
  requireInteraction?: boolean;
}): Promise<BrowserNotificationResult> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return { shown: false, reason: "unsupported" };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return { shown: false, reason: "error" };
    }
  }

  if (permission !== "granted") {
    return {
      shown: false,
      reason: permission === "denied" ? "permission_denied" : "permission_default",
    };
  }

  try {
    new Notification(args.title, {
      body: args.body,
      tag: args.tag,
      requireInteraction: args.requireInteraction ?? false,
    });
    return { shown: true, reason: "shown" };
  } catch {
    return { shown: false, reason: "error" };
  }
}
