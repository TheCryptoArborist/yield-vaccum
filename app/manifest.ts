import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Topaz: Yield Vaccum",
    short_name: "Yield Vaccum",
    description: "An independent eleven-mission educational game about Topaz DEX, LP risk, and expansion toward Robinhood Chain.",
    start_url: "/",
    display: "standalone",
    background_color: "#020201",
    theme_color: "#120502",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
