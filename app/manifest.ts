import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Topaz: Yield Vacuum",
    short_name: "Yield Vacuum",
    description: "An independent educational game about Topaz DEX on BNB Chain.",
    start_url: "/",
    display: "standalone",
    background_color: "#020201",
    theme_color: "#120502",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
