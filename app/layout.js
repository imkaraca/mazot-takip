export const metadata = {
  title: "Mazot Takip",
  description: "Şirket mazot takip sistemi",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#d6293a" />
      </head>
      <body style={{ margin: 0, background: "#f1f5f9" }}>{children}</body>
    </html>
  );
}
