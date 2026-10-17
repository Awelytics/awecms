"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

export function Clarity() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Respect browser "Do Not Track" header
    const dnt =
      navigator.doNotTrack === "1" ||
      (window as any).doNotTrack === "1" ||
      (navigator as any).msDoNotTrack === "1";

    if (!dnt && process.env.NODE_ENV === "production") {
      setEnabled(true);
    }
  }, []);

  if (!enabled) return null;

  return (
    <Script
      id="microsoft-clarity"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "yz3bb0lp3o");
        `,
      }}
    />
  );
}