"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import GoogleSignInButton from '../GoogleSignInButton';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [server, setServer] = useState('');
  const [port, setPort] = useState('993');
  const [authMethod, setAuthMethod] = useState('PLAIN');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic client-side validation
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    // Simple email format check
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    // If advanced options are shown, validate server and port
    if (showAdvanced) {
      if (!server) {
        setError('Please enter the server address.');
        return;
      }
      if (!port || isNaN(Number(port))) {
        setError('Please enter a valid port number.');
        return;
      }
    }

    setIsLoading(true);
    try {
      // Use NextAuth for authentication
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
        server: showAdvanced ? server : undefined,
        port: showAdvanced ? port : undefined,
        authMethod: showAdvanced ? authMethod : undefined,
      });

      if (result?.error) {
        setError(result.error || 'Authentication failed');
        return;
      }

      // Redirect to dashboard on success
      router.push('/dashboard');
    } catch (err) {
      setError('Network error. Please try again later.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-zinc-900 dark:to-indigo-950 px-2 sm:px-4 md:px-8 py-8">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 p-3 sm:p-6 md:p-8 rounded-lg sm:rounded-2xl shadow-md sm:shadow-xl animate-fade-in-up border border-gray-100 dark:border-zinc-800">
        <div className="mb-6">
          <h2 className="text-center text-3xl font-extrabold bg-gradient-to-r from-blue-600 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">Sign in to your account</h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
            Or{' '}
            <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500 transition-colors">create a new account</Link>
          </p>
        </div>
        <GoogleSignInButton text="Sign in with Google" />
        <div className="flex items-center my-2">
          <div className="flex-grow h-px bg-gray-200" />
          <span className="mx-2 text-gray-400 text-xs">or</span>
          <div className="flex-grow h-px bg-gray-200" />
        </div>
        <form className="flex flex-col gap-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="relative">
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:underline focus:outline-none"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            
            {/* Advanced options toggle */}
            <div className="pt-4">
              <button 
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-blue-600 hover:text-blue-500 focus:outline-none flex items-center"
              >
                <svg 
                  className={`w-4 h-4 mr-1 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} 
                  fill="currentColor" 
                  viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                {showAdvanced ? 'Hide advanced options' : 'Show advanced options (IMAP server)'}
              </button>
            </div>
            
            {/* Advanced options */}
            {showAdvanced && (
              <div className="mt-4 space-y-4 border border-gray-200 rounded-md p-4 bg-gray-50">
                <div>
                  <label htmlFor="server" className="block text-sm font-medium text-gray-700 mb-1">
                    IMAP Server
                  </label>
                  <input
                    id="server"
                    name="server"
                    type="text"
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="imap.example.com"
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="port" className="block text-sm font-medium text-gray-700 mb-1">
                    Port
                  </label>
                  <input
                    id="port"
                    name="port"
                    type="text"
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="993"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="authMethod" className="block text-sm font-medium text-gray-700 mb-1">
                    Authentication Method
                  </label>
                  <select
                    id="authMethod"
                    name="authMethod"
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    value={authMethod}
                    onChange={(e) => setAuthMethod(e.target.value)}
                  >
                    <option value="PLAIN">PLAIN</option>
                    <option value="LOGIN">LOGIN</option>
                    <option value="OAUTH2">OAuth2</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                Remember me
              </label>
            </div>

            <div className="text-sm">
              <Link href="/forgot-password" className="font-medium text-blue-600 hover:text-blue-500">
                Forgot your password?
              </Link>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
