import type { Metadata } from "next";
import Link from "next/link";
import { Hanken_Grotesk, IBM_Plex_Mono, Rozha_One } from "next/font/google";
import { CartCount, CartProvider } from "@/components/cart";
import { Logo } from "@/components/art";
import { getCurrentUser } from "@/server/auth";
import "./globals.css";

const display = Rozha_One({ weight: "400", subsets: ["latin", "devanagari"], variable: "--font-display", display: "swap" });
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Koseli · Gifts delivered in Nepal", template: "%s · Koseli" },
  description: "Send cakes, flowers, hampers and local crafts to family in Nepal. Pay in Nepal with Fonepay, or from abroad by card.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <CartProvider>
          <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
            <div className="wrap flex h-16 items-center gap-4">
              <Link href="/" className="flex items-center gap-2" aria-label="Koseli home">
                <Logo />
                <span className="font-display text-2xl leading-none">Koseli</span>
                <span lang="ne" className="hidden font-display text-lg leading-none text-gurans sm:inline">कोसेली</span>
              </Link>
              <nav className="ml-auto flex items-center gap-1 text-sm font-semibold">
                <Link href="/shop" className="rounded-lg px-3 py-2 hover:bg-surface">Shop</Link>
                <Link href="/shop?today=1" className="hidden rounded-lg px-3 py-2 hover:bg-surface sm:inline">Today in Pokhara</Link>
                <Link href={user?.signedIn ? "/account" : "/signin"} className="rounded-lg px-3 py-2 hover:bg-surface">
                  {user?.signedIn ? "Account" : "Sign in"}
                </Link>
                <Link href="/cart" className="flex items-center rounded-lg px-3 py-2 hover:bg-surface">
                  Cart <CartCount />
                </Link>
              </nav>
            </div>
          </header>
          <div className="dhaka" aria-hidden="true" />
          {children}
          <footer className="mt-20 border-t border-line">
            <div className="wrap grid gap-2 py-10 text-sm text-muted sm:grid-cols-2">
              <p>
                <span className="font-display text-lg text-ink">Koseli</span> · gifts delivered in Pokhara. More cities soon.
              </p>
              <p className="sm:text-right">Pay in Nepal with Fonepay, or from abroad by card in USD, GBP, AUD, AED and more.</p>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
