"use client";

import { useEffect } from "react";

export function PushNotifications() {
  useEffect(() => {
    // Load OneSignal config from our API
    fetch("/api/config").then((r) => r.json()).then((config) => {
      const appId = config.onesignal_app_id;
      if (!appId) return;

      // Load OneSignal SDK
      const script = document.createElement("script");
      script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      script.defer = true;
      script.onload = () => {
        (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
        (window as any).OneSignalDeferred.push(async function(OneSignal: any) {
          await OneSignal.init({
            appId,
            safari_web_id: config.onesignal_safari_id || undefined,
            notifyButton: { enable: true, size: "small", position: "bottom-left" },
            welcomeNotification: {
              title: "రాయలసీమ న్యూస్",
              message: "Breaking news alerts enabled!",
            },
            promptOptions: {
              slidedown: {
                prompts: [{
                  type: "push",
                  autoPrompt: true,
                  text: {
                    actionMessage: "రాయలసీమ న్యూస్ వార్త నోటిఫికేషన్లు పొందండి",
                    acceptButton: "Allow",
                    cancelButton: "Later",
                  },
                  delay: { pageViews: 2, timeDelay: 10 },
                }],
              },
            },
          });
        });
      };
      document.head.appendChild(script);
    }).catch(() => {});
  }, []);

  return null;
}
