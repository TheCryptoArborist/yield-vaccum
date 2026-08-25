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
  const [playerOpen, setPlayerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const check = () => {
      fetch("/api/topaz-live", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Live status unavailable");
          return response.json() as Promise<LiveStatus>;
        })
        .then((data) => {
          if (!active) return;
          setStatus(data);
          if (data.state !== "live") setPlayerOpen(false);
        })
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
    <section className={`topazLivePanel ${status.state} ${playerOpen ? "playerOpen" : ""}`} aria-live="polite">
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
        {isLive && status.videoId
          ? <button type="button" onClick={() => setPlayerOpen((open) => !open)} aria-expanded={playerOpen} aria-controls="topaz-live-player">{playerOpen ? "HIDE LIVE PLAYER ↑" : "WATCH LIVE HERE ▶"}</button>
          : <a href={watchUrl} target="_blank" rel="noopener noreferrer">{isLive ? "WATCH LIVE ON YOUTUBE ↗" : isUpcoming ? "VIEW & SET REMINDER ↗" : "VISIT TOPAZ YOUTUBE ↗"}</a>}
      </div>
      {isLive && status.videoId && playerOpen && (
        <div className="topazLivePlayer" id="topaz-live-player">
          <header><div><small>ON THE AIR</small><strong>{status.title || "Topaz DEX Weekly AMA"}</strong></div><button type="button" onClick={() => setPlayerOpen(false)} aria-label="Collapse the live Topaz video player">COLLAPSE ✕</button></header>
          <div className="topazLiveVideo">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${status.videoId}?autoplay=1&rel=0`}
              title={status.title || "Topaz DEX live broadcast"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          <a href={watchUrl} target="_blank" rel="noopener noreferrer">OPEN ON YOUTUBE ↗</a>
        </div>
      )}
    </section>
  );
}
