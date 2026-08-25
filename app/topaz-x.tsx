"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";

type TopazPost = {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  author: { name: string; handle: string; avatarUrl: string; verified: boolean };
  image?: { url: string; width: number; height: number };
};

const TOPAZ_X_URL = "https://x.com/TopazDex";

export default function TopazXPanel() {
  const [post, setPost] = useState<TopazPost | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/topaz-x", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Post unavailable");
        return response.json() as Promise<TopazPost>;
      })
      .then((data) => active && setPost(data))
      .catch(() => active && setFailed(true));
    return () => { active = false; };
  }, []);

  const postDate = post?.createdAt
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(post.createdAt))
    : null;

  return (
    <section className="topazXPanel" aria-labelledby="topaz-x-heading">
      <div className="topazXIntro">
        <span className="topazXMark" aria-hidden="true">𝕏</span>
        <small>FROM THE OFFICIAL TOPAZ DEX ACCOUNT</small>
        <strong id="topaz-x-heading">LATEST FROM @TOPAZDEX</strong>
        <p>Follow announcements, ecosystem updates, and community news as they are posted.</p>
        <a href={TOPAZ_X_URL} target="_blank" rel="noopener noreferrer">FOLLOW @TOPAZDEX ON X ↗</a>
      </div>

      <article className={`topazXPost ${post ? "loaded" : ""}`} aria-live="polite">
        {!post && !failed && <div className="topazXLoading"><i></i><span>LOADING THE LATEST POST…</span></div>}
        {!post && failed && <div className="topazXLoading"><span>THE POST COULD NOT LOAD.</span><a href={TOPAZ_X_URL} target="_blank" rel="noopener noreferrer">VIEW @TOPAZDEX ON X ↗</a></div>}
        {post && <>
          <header>
            <img src={post.author.avatarUrl} alt="Topaz DEX profile" />
            <div><strong>{post.author.name} {post.author.verified && <b aria-label="Verified account">✓</b>}</strong><span>@{post.author.handle} · {postDate}</span></div>
            <span className="postXMark" aria-hidden="true">𝕏</span>
          </header>
          <p>{post.text}</p>
          {post.image && <a className="topazXMedia" href={post.url} target="_blank" rel="noopener noreferrer"><img src={post.image.url} width={post.image.width} height={post.image.height} alt="Media attached to the latest Topaz DEX post" /></a>}
          <a className="topazXView" href={post.url} target="_blank" rel="noopener noreferrer">VIEW ORIGINAL POST ON X ↗</a>
        </>}
      </article>
    </section>
  );
}
