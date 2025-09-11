"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Navbar() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setIsLoggedIn(!!localStorage.getItem('token'));
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('token');
        setIsLoggedIn(false);
        window.location.reload();
    };

    // Logo (Inboxly gradient text)
    const Logo = (
        <Link href="/" className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent drop-shadow">
            Inboxly
        </Link>
    );

    // All nav links
    const NavLinks = (
        <>
            <Link href="/" className="block px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-zinc-800 transition-colors">Home</Link>
            <a href="/features" className="block px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-zinc-800 transition-colors">Features</a>
            {isLoggedIn && (
                <>
                    <a href="/dashboard" className="block px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-zinc-800 transition-colors">Dashboard</a>
                    <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 rounded-lg font-semibold border border-red-500 text-red-500 bg-white dark:bg-zinc-900 hover:bg-red-500 hover:text-white dark:hover:bg-red-700 dark:hover:text-white transition-colors shadow-sm mt-2"
                    >
                        Logout
                    </button>
                </>
            )}
            {!isLoggedIn && (
                <>
                    <a href="/login" className="block px-4 py-2 rounded-lg font-semibold border border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-700 dark:hover:text-white transition-colors shadow-sm mt-2">Login</a>
                    <a href="/register" className="block px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-blue-600 to-fuchsia-500 text-white hover:from-blue-700 hover:to-fuchsia-600 shadow transition-colors mt-2">Register</a>
                </>
            )}
        </>
    );

    return (
        <nav className="w-full flex items-center justify-between">
            {/* Logo always visible */}
            {Logo}

            {/* Hamburger for mobile */}
            <button
                className="sm:hidden flex flex-col justify-center items-center w-10 h-10 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Open menu"
                onClick={() => setMenuOpen((v) => !v)}
            >
                <span className={`block w-6 h-0.5 bg-gray-700 dark:bg-gray-200 mb-1 transition-all ${menuOpen ? 'rotate-45 translate-y-1.5' : ''}`}></span>
                <span className={`block w-6 h-0.5 bg-gray-700 dark:bg-gray-200 mb-1 transition-all ${menuOpen ? 'opacity-0' : ''}`}></span>
                <span className={`block w-6 h-0.5 bg-gray-700 dark:bg-gray-200 transition-all ${menuOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></span>
            </button>

            {/* Desktop nav links */}
            <div className="hidden sm:flex gap-2 sm:gap-4 items-center">
                {NavLinks}
            </div>

            {/* Mobile dropdown menu */}
            {menuOpen && (
                <div className="absolute top-16 right-4 left-4 z-50 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-gray-100 dark:border-zinc-800 flex flex-col gap-1 p-4 animate-fade-in-up sm:hidden">
                    {NavLinks}
                </div>
            )}
        </nav>
    );
}
