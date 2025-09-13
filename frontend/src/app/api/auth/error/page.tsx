'use client';

import Link from 'next/link';

export default function AuthErrorPage({ searchParams }: { searchParams: Record<string, string> }) {
    // Map error codes to user-friendly messages
    const errorMessages: Record<string, string> = {
        'Configuration': 'There is a problem with the server configuration.',
        'AccessDenied': 'Access denied. You do not have permission to access this resource.',
        'Verification': 'The verification link may have expired or already been used.',
        'Default': 'An authentication error occurred. Please try again.',
        'CredentialsSignin': 'The email or password you entered is incorrect.',
        'EmailSignin': 'The email could not be sent.',
        'SessionRequired': 'Please sign in to access this page.',
        'ConnectionFailed': 'Failed to connect to the email server. Please check your server details and try again.',
        'AuthMethodNotSupported': 'The selected authentication method is not supported by the server.',
        'IMAPConnectionError': 'Could not establish a secure connection to the IMAP server.',
    };

    const errorType = searchParams.error || 'Default';
    const errorMessage = errorMessages[errorType] || errorMessages['Default'];

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-zinc-900 dark:to-indigo-950 px-4">
            <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow-xl rounded-lg p-8 border border-gray-100 dark:border-zinc-800">
                <div className="text-center">
                    <h2 className="text-3xl font-bold text-red-600 mb-4">Authentication Error</h2>
                    <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-6">
                        <p className="text-red-700 dark:text-red-400">{errorMessage}</p>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 mb-6">
                        Please try again or contact support if the problem persists.
                    </p>
                    <div className="flex flex-col space-y-3">
                        <Link 
                            href="/login" 
                            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            Return to Login
                        </Link>
                        <Link 
                            href="/" 
                            className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            Go to Homepage
                        </Link>
                    </div>
                    
                    {/* Debug information - only show in development */}
                    {process.env.NODE_ENV === 'development' && (
                        <div className="mt-8 p-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded text-left">
                            <strong>Debug Information:</strong>
                            <pre className="text-xs mt-2 bg-gray-50 dark:bg-zinc-700 p-2 rounded overflow-auto max-h-40">
                                {JSON.stringify(searchParams, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
