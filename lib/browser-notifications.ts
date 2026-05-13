export type BrowserNotificationResult = {
  shown: boolean;
  reason:
    | "shown"
    | "unsupported"
    | "insecure_context"
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

  if (!window.isSecureContext) {
    return { shown: false, reason: "insecure_context" };
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

export function notificationFailureMessage(result: BrowserNotificationResult) {
  if (result.reason === "insecure_context") {
    return "Chrome bloquea notificaciones en HTTP no seguro. Usa HTTPS o localhost para habilitarlas.";
  }
  if (result.reason === "permission_denied") {
    return "El navegador tiene las notificaciones bloqueadas para este sitio.";
  }
  if (result.reason === "unsupported") {
    return "Este navegador o contexto no soporta notificaciones.";
  }
  return null;
}
