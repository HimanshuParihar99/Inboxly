'use client';

import { useState, useEffect } from 'react';



interface User {
  name: string;
  email: string;
}

export default function Dashboard() {
  const [user] = useState<User | null>(null);
  const [analytics] = useState<{
    totalEmails: number;
    topSenders: { domain: string; count: number }[];
    securityStats: {
      tlsSupported: number;
      tlsUnsupported: number;
      openRelays: number;
    };
  } | null>(null);
  const [isLoading] = useState(true);
  const [error] = useState('');

  useEffect(() => {
    // ...existing code to fetch user and analytics...
  }, []);

  if (isLoading) {
    return (
      <section className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-zinc-900 dark:to-indigo-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-zinc-900 dark:to-indigo-950 py-8 px-2 sm:px-4 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-blue-600 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent animate-fade-in-up">Dashboard</h1>
          <button onClick={() => {/* handle logout */ }} className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors font-semibold shadow">Logout</button>
        </div>
        {error && <div className="mb-4 text-red-600 animate-fade-in-up">{error}</div>}
        {user && (
          <div className="mb-8 bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-xl animate-fade-in-up border border-gray-100 dark:border-zinc-800">
            <h2 className="text-xl font-semibold mb-2">Welcome, {user.name}!</h2>
            <p className="text-gray-600 dark:text-gray-300">{user.email}</p>
          </div>
        )}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-xl animate-fade-in-up border border-gray-100 dark:border-zinc-800">
              <h3 className="text-lg font-semibold mb-2">Total Emails</h3>
              <p className="text-3xl font-bold text-blue-600">{analytics.totalEmails}</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-xl animate-fade-in-up border border-gray-100 dark:border-zinc-800">
              <h3 className="text-lg font-semibold mb-2">Top Senders</h3>
              <ul className="space-y-1">
                {analytics.topSenders.map((sender) => (
                  <li key={sender.domain} className="flex justify-between">
                    <span>{sender.domain}</span>
                    <span className="font-semibold text-blue-500">{sender.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-xl animate-fade-in-up col-span-1 md:col-span-2 border border-gray-100 dark:border-zinc-800">
              <h3 className="text-lg font-semibold mb-2">Security Stats</h3>
              <div className="flex flex-wrap gap-6">
                <div className="flex-1 min-w-[120px]">
                  <span className="block text-gray-500">TLS Supported</span>
                  <span className="text-xl font-bold text-green-600">{analytics.securityStats.tlsSupported}</span>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <span className="block text-gray-500">TLS Unsupported</span>
                  <span className="text-xl font-bold text-yellow-600">{analytics.securityStats.tlsUnsupported}</span>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <span className="block text-gray-500">Open Relays</span>
                  <span className="text-xl font-bold text-red-600">{analytics.securityStats.openRelays}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
