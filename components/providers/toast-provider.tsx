"use client";

import { Toaster } from "react-hot-toast";

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: "#0f2544",
          color: "#ffffff",
        },
        success: {
          iconTheme: {
            primary: "#34d399",
            secondary: "#0f2544",
          },
        },
        error: {
          iconTheme: {
            primary: "#fb7185",
            secondary: "#0f2544",
          },
        },
      }}
    />
  );
}
