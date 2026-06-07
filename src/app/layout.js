import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import InAppBrowserWarning from "@/components/InAppBrowserWarning";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Style Challenge by Patrick Cameron",
  description: "Master long-hair styling with Patrick Cameron's styling game — complete challenges and earn your certificate",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-HX31EZRX34"></script>
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-HX31EZRX34');
        `}} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <InAppBrowserWarning />
        {children}
      </body>
    </html>
  );
}