import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { getLang } from "@/lib/i18n/server";
import { LangProvider } from "@/lib/i18n/client";
import { SessionProvider } from "@/lib/session";
import "./styles/base.css";
import "./styles/site.css";
import "./styles/workspace.css";
import "./styles/i18n.css";
import "./styles/next.css";

export const metadata: Metadata = {
  title: { default: "LabClear | จองตรวจสุขภาพ เข้าใจผลตรวจ", template: "%s | LabClear" },
  description: "เปรียบเทียบแพ็กเกจตรวจสุขภาพ ขอนัดหมาย และให้ AI อธิบายผลแล็บพร้อมแหล่งอ้างอิง (ระบบจำลองเพื่อการศึกษา)",
  robots: { index: false, follow: false },
  icons: { icon: "/img/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfcfe" },
    { media: "(prefers-color-scheme: dark)", color: "#131216" },
  ],
};

/* Applies the saved theme before first paint; storage may be blocked and the page still works.
   Website motion starts hidden-then-revealed only when the visitor allows motion. */
const boot = `(()=>{try{var t=localStorage.getItem('rs-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('motion')})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <Script id="labclear-boot" strategy="beforeInteractive">
          {boot}
        </Script>
        <link rel="preload" href="/fonts/geist-variable.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/noto-sans-thai-400.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <LangProvider lang={lang}>
          <SessionProvider lang={lang}>{children}</SessionProvider>
        </LangProvider>
      </body>
    </html>
  );
}
