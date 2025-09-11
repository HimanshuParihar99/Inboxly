import React from "react";

const features = [
    {
        title: "Unified Inbox",
        description: "Manage all your emails from multiple accounts in one place with powerful search and filtering.",
        icon: "📥",
    },
    {
        title: "Smart Organization",
        description: "Automatically categorize, prioritize, and declutter your inbox with customizable rules and filters.",
        icon: "🗂️",
    },
    {
        title: "Seamless Integrations",
        description: "Connect with your favorite productivity apps and services for a streamlined workflow.",
        icon: "🔗",
    },
    {
        title: "Privacy First",
        description: "Your data stays secure and private with end-to-end encryption and no ads.",
        icon: "🔒",
    },
];

export default function FeaturesPage() {
    return (
        <main className="min-h-screen bg-white text-gray-900 py-12 px-4 md:px-12">
            <section className="max-w-3xl mx-auto text-center mb-12">
                <h1 className="text-4xl font-bold mb-4">Learn More About Inboxly</h1>
                <p className="text-lg text-gray-600 mb-6">
                    Discover how Inboxly can help you take control of your email, boost productivity, and simplify your digital life.
                </p>
            </section>
            <section className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
                {features.map((feature) => (
                    <div
                        key={feature.title}
                        className="flex flex-col items-center bg-gray-50 rounded-lg shadow p-6 hover:shadow-lg transition"
                    >
                        <div className="text-5xl mb-4">{feature.icon}</div>
                        <h2 className="text-2xl font-semibold mb-2">{feature.title}</h2>
                        <p className="text-gray-600">{feature.description}</p>
                    </div>
                ))}
            </section>
            <section className="max-w-2xl mx-auto text-center">
                <h3 className="text-xl font-medium mb-2">Ready to get started?</h3>
                <a
                    href="/register"
                    className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold shadow hover:bg-blue-700 transition"
                >
                    Create Your Free Account
                </a>
            </section>
        </main>
    );
}
