'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ConnectionForm {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
}

export default function NewConnection() {
  const [formData, setFormData] = useState<ConnectionForm>({
    name: '',
    host: '',
    port: 993,
    username: '',
    password: '',
    tls: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value) : value,
    }));
  };

  const testConnection = async () => {
    setTestStatus('testing');
    setTestMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/imap/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          config: {
            host: formData.host,
            port: formData.port,
            user: formData.username,
            password: formData.password,
            tls: formData.tls,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Connection test failed');
      }

      setTestStatus('success');
      setTestMessage('Connection successful!');
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || 'Connection test failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/imap/connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          config: {
            host: formData.host,
            port: formData.port,
            user: formData.username,
            password: formData.password,
            tls: formData.tls,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create connection');
      }

      // Redirect to connections list
      router.push('/connections');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-zinc-900 dark:to-indigo-950 py-8 px-2 sm:px-4 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-blue-600 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent animate-fade-in-up">Add Email Connection</h1>
          <Link href="/dashboard" className="px-4 py-2 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors">Back to Dashboard</Link>
        </div>
        {error && (
          <div className="mb-4 text-red-600 animate-fade-in-up">{error}</div>
        )}
        {testStatus === 'success' && (
          <div className="mb-4 text-green-600 animate-fade-in-up">{testMessage}</div>
        )}
        {testStatus === 'error' && (
          <div className="mb-4 text-red-600 animate-fade-in-up">{testMessage}</div>
        )}
        <div className="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-2xl shadow-xl animate-fade-in-up border border-gray-100 dark:border-zinc-800">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1">Connection Name</label>
              <input type="text" id="name" name="name" required value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-lg border border-gray-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-zinc-900/80" placeholder="Personal Gmail" />
            </div>
            <div>
              <label htmlFor="host" className="block text-sm font-medium mb-1">IMAP Server Host</label>
              <input type="text" id="host" name="host" required value={formData.host} onChange={handleChange} className="mt-1 block w-full rounded-lg border border-gray-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-zinc-900/80" placeholder="imap.gmail.com" />
            </div>
            <div>
              <label htmlFor="port" className="block text-sm font-medium mb-1">IMAP Server Port</label>
              <input type="number" id="port" name="port" required value={formData.port} onChange={handleChange} className="mt-1 block w-full rounded-lg border border-gray-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-zinc-900/80" />
            </div>
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-1">Username</label>
              <input type="text" id="username" name="username" required value={formData.username} onChange={handleChange} className="mt-1 block w-full rounded-lg border border-gray-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-zinc-900/80" placeholder="your.email@gmail.com" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
              <input type="password" id="password" name="password" required value={formData.password} onChange={handleChange} className="mt-1 block w-full rounded-lg border border-gray-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-zinc-900/80" placeholder="Your password or app password" />
            </div>
            <div className="flex items-center">
              <input type="checkbox" id="tls" name="tls" checked={formData.tls} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
              <label htmlFor="tls" className="ml-2 block text-sm">Use TLS</label>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 mt-6">
              <button
                type="button"
                onClick={testConnection}
                disabled={testStatus === 'testing' || isLoading}
                className="px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-blue-100 to-fuchsia-100 dark:from-zinc-800 dark:to-fuchsia-900 border border-blue-200 dark:border-zinc-800 text-blue-700 dark:text-fuchsia-200 hover:from-blue-200 hover:to-fuchsia-200 dark:hover:from-zinc-700 dark:hover:to-fuchsia-800 transition disabled:opacity-50 disabled:cursor-not-allowed shadow"
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-blue-600 to-fuchsia-500 text-white hover:from-blue-700 hover:to-fuchsia-600 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isLoading ? 'Saving...' : 'Save Connection'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}