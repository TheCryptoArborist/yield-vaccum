"use client";

import { useEffect, useState } from "react";

type LiveStatus = {
  state: "checking" | "live" | "upcoming" | "offline";
  videoId?: string;
  title?: string;
  scheduledStart?: string;
  channelUrl?: string;
};

const CHANNEL_URL = "https://www.youtube.com/@TopazDex";

export default function TopazLivePanel() {
  const [status, setStatus] = useState<LiveStatus>({ state: "checking" });

  useEffect(() => {
    let active = true;
    const check = () => {
      fetch("/api/topaz-live", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Live status unavailable");
          return response.json() as Promise<LiveStatus>;
        })
        .then((data) => active && setStatus(data))
        .catch(() => active && setStatus({ state: "offline", channelUrl: CHANNEL_URL }));
    };

    check();
    const interval = window.setInterval(check, 90_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const isLive = status.state === "live";
  const isUpcoming = status.state === "upcoming";
  const watchUrl = status.videoId ? `https://www.youtube.com/watch?v=${status.videoId}` : status.channelUrl || CHANNEL_URL;
  const scheduled = status.scheduledStart
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(status.scheduledStart))
    : null;

  return (
    <section className={`topazLivePanel ${status.state}`} aria-live="polite">
      <div className="topazLiveSignal" aria-hidden="true">
        <span className="youtubePlay">▶</span>
        <i></i>
      </div>
      <div className="topazLiveCopy">
        <small>OFFICIAL TOPAZ DEX YOUTUBE</small>
        <strong>{isLive ? "TOPAZ DEX IS LIVE NOW" : isUpcoming ? "NEXT TOPAZ AMA" : "WATCH THE WEEKLY TOPAZ AMA"}</strong>
        <span>
          {status.state === "checking"
            ? "Checking the channel’s live status…"
            : isLive
              ? status.title || "The weekly Topaz DEX community broadcast is live."
              : isUpcoming
                ? `${status.title || "The next community AMA is scheduled."}${scheduled ? ` · ${scheduled}` : ""}`
                : "Hear updates, ask questions, and learn directly from the Topaz DEX team."}
        </span>
      </div>
      <div className="topazLiveAction">
        <b className="topazLiveBadge"><i></i>{isLive ? "ON THE AIR" : isUpcoming ? "COMING UP" : status.state === "checking" ? "TUNING IN…" : "WEEKLY AMA"}</b>
        <a href={watchUrl} target="_blank" rel="noopener noreferrer">
          {isLive ? "WATCH LIVE ↗" : isUpcoming ? "VIEW & SET REMINDER ↗" : "VISIT TOPAZ YOUTUBE ↗"}
        </a>
      </div>
    </section>
  );
}
