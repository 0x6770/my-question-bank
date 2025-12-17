import type { Metadata } from "next";
import "./globals.css";
import { AppNavbar } from "@/components/app-navbar";

export const metadata: Metadata = {
  title: "My Question Bank",
  description: "My Question Bank",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-svh flex-col">
          <AppNavbar />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </div>
      </body>
    </html>
  );
}
