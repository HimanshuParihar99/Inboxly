export default function AuthErrorPage({ searchParams }: { searchParams: { error?: string } }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <h1 className="text-3xl font-bold mb-4">Authentication Error</h1>
            <p className="text-lg mb-2">Something went wrong with authentication. Please try again or contact support.</p>
            {searchParams?.error && (
                <div className="mt-4 p-2 bg-red-100 text-red-700 rounded">
                    <strong>Error code:</strong> {searchParams.error}
                </div>
            )}
        </div>
    );
}
