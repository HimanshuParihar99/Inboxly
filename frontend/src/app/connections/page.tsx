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

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    const fetchConnections = async () => {
      try {
        const response = await fetch(`${API_URL}/imap/connections`, {
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
  }, [router, API_URL]);

  const handleSync = async (connectionId: string) => {
    setSyncStatus(prev => ({ ...prev, [connectionId]: 'syncing' }));

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/imap/sync/${connectionId}/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to start sync');
      }

      setSyncStatus(prev => ({ ...prev, [connectionId]: 'success' }));

      setTimeout(() => {
        setSyncStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[connectionId];
          return newStatus;
        });

        const fetchConnections = async () => {
          try {
            const response = await fetch(`${API_URL}/imap/connections`, {
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
      const response = await fetch(`${API_URL}/imap/connections/${connectionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete connection');
      }

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
      {/* your UI code stays the same */}
    </section>
  );
}
