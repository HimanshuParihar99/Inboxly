'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Connection {
  _id: string;
  name: string;
  config: {
    host: string;
    port: number;
    user: string;
    tls: boolean;
  };
  lastSyncDate: string | null;
  isActive: boolean;
}

export default function Connections() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState<Record<string, string>>({});
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    // Fetch connections
    const fetchConnections = async () => {
      try {
        const response = await fetch('http://localhost:3001/imap/connections', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch connections');
        }

        const data = await response.json();
        setConnections(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConnections();
  }, [router]);

  const handleSync = async (connectionId: string) => {
    setSyncStatus(prev => ({ ...prev, [connectionId]: 'syncing' }));

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/imap/sync/${connectionId}/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to start sync');
      }

      setSyncStatus(prev => ({ ...prev, [connectionId]: 'success' }));

      // Refresh the connection list after a short delay
      setTimeout(() => {
        setSyncStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[connectionId];
          return newStatus;
        });

        // Refresh connections list
        const fetchConnections = async () => {
          try {
            const response = await fetch('http://localhost:3001/imap/connections', {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (!response.ok) {
              throw new Error('Failed to fetch connections');
            }

            const data = await response.json();
            setConnections(data);
          } catch (err: any) {
            setError(err.message);
          }
        };

        fetchConnections();
      }, 3000);
    } catch (err: any) {
      setSyncStatus(prev => ({ ...prev, [connectionId]: 'error' }));
      setError(err.message);

      // Clear error status after a delay
      setTimeout(() => {
        setSyncStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[connectionId];
          return newStatus;
        });
      }, 3000);
    }
  };

  const handleDelete = async (connectionId: string) => {
    if (!confirm('Are you sure you want to delete this connection?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/imap/connections/${connectionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete connection');
      }

      // Remove the deleted connection from the list
      setConnections(prev => prev.filter(conn => conn._id !== connectionId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (isLoading) {
    return (
      <section className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-zinc-900 dark:to-indigo-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-zinc-900 dark:to-indigo-950 py-8 px-2 sm:px-4 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-blue-600 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent animate-fade-in-up">Email Connections</h1>
          <div className="flex gap-2">
            <Link href="/dashboard" className="px-4 py-2 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors">Dashboard</Link>
            <Link href="/connections/new" className="px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow">Add Connection</Link>
          </div>
        </div>
        {error && (
          <div className="mb-4 text-red-600 animate-fade-in-up">{error}</div>
        )}
        {connections.length === 0 ? (
          <div className="glass p-8 rounded-2xl shadow-xl text-center animate-fade-in-up">
            <h2 className="text-lg font-semibold mb-2">No Email Connections</h2>
            <p className="text-gray-600 mb-4">You haven't added any email connections yet.</p>
            <Link href="/connections/new" className="inline-block px-6 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow">Add Your First Connection</Link>
          </div>
        ) : (
          <div className="glass rounded-2xl shadow-xl overflow-x-auto animate-fade-in-up">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white/80 dark:bg-zinc-900/80">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Server</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Sync</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white/70 dark:bg-zinc-900/70 divide-y divide-gray-200">
                {connections.map((connection) => (
                  <tr key={connection._id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{connection.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{connection.config.host}:{connection.config.port}{connection.config.tls && ' (TLS)'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{connection.config.user}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{connection.lastSyncDate ? new Date(connection.lastSyncDate).toLocaleString() : 'Never'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {connection.isActive ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Active</span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Inactive</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleSync(connection._id)} disabled={syncStatus[connection._id] === 'syncing'} className="px-3 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition disabled:opacity-50 disabled:cursor-not-allowed">
                          {syncStatus[connection._id] === 'syncing' ? 'Syncing...' : syncStatus[connection._id] === 'success' ? 'Sync Complete' : syncStatus[connection._id] === 'error' ? 'Sync Failed' : 'Sync'}
                        </button>
                        <button onClick={() => handleDelete(connection._id)} className="px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}