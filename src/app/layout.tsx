import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Header } from "@/components/header";
import { isMocked } from "@/lib/rpc";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  title: { default: "Fordnet — Zcash network data and a public REST API", template: "%s · Fordnet" },
  description: "Live Zcash block, transaction, transparent-address and value-pool data from a node, served as a dashboard and a versioned REST API. Public protocol data only; shielded activity is never inferred.",
  openGraph: { type: "website", siteName: "Fordnet", title: "Fordnet — Zcash network data you can query in one request", description: "Dashboard and REST API for public Zcash protocol data." },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a0f0d" };

const themeScript = `try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mocked = isMocked();
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className={`${sans.variable} ${mono.variable} min-h-dvh font-sans antialiased`}>
        {mocked && (
          <div role="status" className="bg-warn/15 px-4 py-1.5 text-center text-xs text-warn">
            <strong>MOCKED DATA</strong> — no Zcash node is configured. Numbers are synthetic. Set ZCASH_RPC_URL to go live.
          </div>
        )}
        <Header />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-4 pb-8 text-xs text-muted"><span>{mocked ? "Data: MOCKED RPC" : "Data: Zcash mainnet node via JSON-RPC"}</span><a className="hover:text-fg" href="/developers">API docs</a><a className="hover:text-fg" href="https://github.com/onlysniper447-stack/fordnet">Source on GitHub</a></footer>
        <Toaster theme="system" position="bottom-center" richColors />
      </body>
    </html>
  );
}
