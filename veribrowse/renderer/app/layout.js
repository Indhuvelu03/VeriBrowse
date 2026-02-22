import '../styles/globals.css';

export const metadata = {
  title: 'VeriBrowse',
  description: 'AI-Powered Agentic Browser',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div id="root-portal" />
        {children}
      </body>
    </html>
  );
}
