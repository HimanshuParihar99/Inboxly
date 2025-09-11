"use client";
import { signIn } from "next-auth/react";

export default function GoogleSignInButton({ text = "Sign in with Google" }: { text?: string }) {
    return (
        <button
            type="button"
            onClick={() => signIn("google")}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-gray-300 rounded-md bg-white text-gray-700 font-medium shadow hover:bg-gray-50 transition-colors mb-2"
        >
            <svg className="w-5 h-5" viewBox="0 0 48 48"><g><path fill="#4285F4" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.23l6.85-6.85C35.91 2.36 30.28 0 24 0 14.82 0 6.73 5.82 2.69 14.09l7.98 6.2C12.13 13.13 17.57 9.5 24 9.5z" /><path fill="#34A853" d="M46.1 24.55c0-1.64-.15-3.22-.42-4.74H24v9.01h12.42c-.54 2.9-2.18 5.36-4.65 7.02l7.19 5.6C43.98 37.13 46.1 31.36 46.1 24.55z" /><path fill="#FBBC05" d="M10.67 28.29a14.5 14.5 0 0 1 0-8.58l-7.98-6.2A23.94 23.94 0 0 0 0 24c0 3.93.94 7.65 2.69 10.89l7.98-6.2z" /><path fill="#EA4335" d="M24 48c6.28 0 11.91-2.07 15.88-5.64l-7.19-5.6c-2.01 1.35-4.59 2.15-8.69 2.15-6.43 0-11.87-3.63-14.33-8.89l-7.98 6.2C6.73 42.18 14.82 48 24 48z" /><path fill="none" d="M0 0h48v48H0z" /></g></svg>
            {text}
        </button>
    );
}
