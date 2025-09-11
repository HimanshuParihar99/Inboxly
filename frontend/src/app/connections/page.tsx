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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Email Connections</h1>
          <div className="flex space-x-4">
            <Link
              href="/dashboard"
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/connections/new"
              className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Add Connection
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {connections.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">No Email Connections</h2>
            <p className="text-gray-600 mb-4">You haven't added any email connections yet.</p>
            <Link
              href="/connections/new"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Add Your First Connection
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Server
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Username
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Last Sync
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {connections.map((connection) => (
                  <tr key={connection._id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {connection.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {connection.config.host}:{connection.config.port}
                      {connection.config.tls && ' (TLS)'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {connection.config.user}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {connection.lastSyncDate
                        ? new Date(connection.lastSyncDate).toLocaleString()
                        : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {connection.isActive ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleSync(connection._id)}
                          disabled={syncStatus[connection._id] === 'syncing'}
                          className="text-blue-600 hover:text-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {syncStatus[connection._id] === 'syncing'
                            ? 'Syncing...'
                            : syncStatus[connection._id] === 'success'
                            ? 'Sync Complete'
                            : syncStatus[connection._id] === 'error'
                            ? 'Sync Failed'
                            : 'Sync'}
                        </button>
                        <button
                          onClick={() => handleDelete(connection._id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}