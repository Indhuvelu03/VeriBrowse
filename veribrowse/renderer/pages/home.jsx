import React from 'react';
import Head from 'next/head';
import BrowserShell from '../components/BrowserShell';

export default function Home() {
  return (
    <React.Fragment>
      <Head>
        <title>VeriBrowse - Agentic Browser</title>
        <meta name="description" content="AI-powered agentic browser with voice commands" />
      </Head>
      <BrowserShell />
    </React.Fragment>
  );
}