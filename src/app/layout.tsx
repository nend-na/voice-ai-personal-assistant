import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Missed Call Assistant",
  description: "Automated missed-call handling for small businesses.",
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  {href: "/businesses", label: "Businesses"},
  { href: "/workflows", label: "Workflows" },
  { href: "/simulator", label: "Simulator" },
  { href: "/settings/integrations", label: "Settings" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-hairline bg-surface">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
              <Link href="/dashboard" className="text-[15px] font-semibold text-ink">
                Missed Call Assistant
              </Link>
              <nav className="flex gap-1">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded px-3 py-1.5 text-sm text-muted transition-colors hover:bg-paper hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
