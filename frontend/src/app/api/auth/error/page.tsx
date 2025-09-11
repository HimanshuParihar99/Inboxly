export default function AuthErrorPage({ searchParams }: { searchParams: Record<string, string> }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <h1 className="text-3xl font-bold mb-4">Authentication Error</h1>
            <p className="text-lg mb-2">Something went wrong with authentication. Please try again or contact support.</p>
            <div className="mt-4 p-2 bg-red-100 text-red-700 rounded">
                <strong>Query parameters:</strong>
                <pre className="text-xs mt-2 bg-red-50 p-2 rounded">
                    {JSON.stringify(searchParams, null, 2)}
                </pre>
            </div>
        </div>
    );
}
