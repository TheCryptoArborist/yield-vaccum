"use client";

import Script from "next/script";

const TOPAZ_X_URL = "https://x.com/TopazDex";

export default function TopazXPanel() {
  return (
    <section className="topazXPanel" aria-labelledby="topaz-x-heading">
      <div className="topazXIntro">
        <span className="topazXMark" aria-hidden="true">𝕏</span>
        <small>FROM THE OFFICIAL TOPAZ DEX ACCOUNT</small>
        <strong id="topaz-x-heading">LATEST FROM @TOPAZDEX</strong>
        <p>Follow announcements, ecosystem updates, and community news as they are posted.</p>
        <a href={TOPAZ_X_URL} target="_blank" rel="noopener noreferrer">FOLLOW @TOPAZDEX ON X ↗</a>
      </div>
      <div className="topazXEmbed" aria-label="Latest post from Topaz DEX on X">
        <a
          className="twitter-timeline"
          data-theme="dark"
          data-tweet-limit="1"
          data-chrome="noheader nofooter noborders transparent"
          data-dnt="true"
          href={TOPAZ_X_URL}
        >
          View the latest post from @TopazDex on X
        </a>
      </div>
      <Script src="https://platform.twitter.com/widgets.js" strategy="afterInteractive" charSet="utf-8" />
    </section>
  );
}
