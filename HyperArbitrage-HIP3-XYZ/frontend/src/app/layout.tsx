import type { Metadata } from "next";
import "@/styles/globals.css";
import Providers from "./providers";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import StatusBar from "@/components/layout/StatusBar";

export const metadata: Metadata = {
  title: "HyperArbitrage HIP-3 XYZ",
  description: "Hyperliquid HIP-3 Spread Arbitrage Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans bg-bg-primary text-text-primary antialiased">
        <Providers>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Header title="HyperArbitrage HIP-3" />
              <main className="flex-1 overflow-y-auto p-6">{children}</main>
              <StatusBar />
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
