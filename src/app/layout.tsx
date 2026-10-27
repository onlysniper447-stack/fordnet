import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Header } from "@/components/header";
import { isMocked } from "@/lib/rpc";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = { title: { default: "Fordnet — Zcash network intelligence", template: "%s · Fordnet" }, description: "Live Zcash network status, blocks, transparent lookups, pool history and a public REST API." };
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
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted">Fordnet reports only public protocol data. Shielded amounts and parties are not inferred.</footer>
        <Toaster theme="system" position="bottom-center" richColors />
      </body>
    </html>
  );
}
