import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <section className="relative w-full flex flex-col items-center justify-center min-h-[80vh] py-16 px-4 overflow-hidden">
      {/* Animated Gradient Background */}
      <div className="absolute inset-0 -z-10 animate-gradient bg-gradient-to-tr from-blue-200 via-fuchsia-100 to-pink-200 dark:from-indigo-900 dark:via-fuchsia-900 dark:to-pink-900 opacity-80 blur-2xl" />

      {/* Hero Content */}
      <div className="max-w-3xl mx-auto text-center">
        <div className="flex flex-col items-center mb-6">
          <Image src="/vercel.svg" alt="Inboxly Logo" width={56} height={56} className="mb-2 drop-shadow-lg dark:invert" />
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent animate-fade-in-up mb-4">
            Understand Your Email Ecosystem
          </h1>
        </div>
        <p className="text-xl sm:text-2xl text-gray-700 dark:text-gray-300 mb-10 animate-fade-in-up delay-100">
          Inboxly analyzes your email communications to provide insights on sender domains, security practices, and communication patterns.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up delay-200">
          <Link
            href="/register"
            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-fuchsia-500 text-white rounded-lg shadow-lg hover:scale-105 hover:shadow-xl transition-all duration-200 text-lg font-semibold btn"
          >
            Get Started
          </Link>
          <Link
            href="/features"
            className="px-8 py-3 bg-white/80 dark:bg-zinc-800/80 text-blue-700 dark:text-fuchsia-300 rounded-lg shadow hover:bg-blue-50 dark:hover:bg-zinc-700 transition-all duration-200 text-lg font-semibold btn"
          >
            Learn More
          </Link>
        </div>
      </div>

      {/* Decorative SVG or shapes */}
      <svg className="absolute left-0 bottom-0 w-64 h-64 opacity-30 -z-10" viewBox="0 0 400 400" fill="none">
        <circle cx="200" cy="200" r="200" fill="url(#paint0_radial)" />
        <defs>
          <radialGradient id="paint0_radial" cx="0" cy="0" r="1" gradientTransform="translate(200 200) scale(200)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#818cf8" />
            <stop offset="1" stopColor="#f472b6" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </section>
  );


