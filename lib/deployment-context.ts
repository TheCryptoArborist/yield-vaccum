export function deploymentContext() {
  return process.env.CONTEXT || process.env.NEXT_PUBLIC_NETLIFY_CONTEXT || "local";
}
