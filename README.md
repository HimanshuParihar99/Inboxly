# Inboxly - Email Analytics Platform

Inboxly is a robust application that connects to multiple email accounts across multiple IMAP servers and provides a centralized interface to connect, sync, and process emails with advanced analytics capabilities.

## Features

### Connection Capabilities
- Connect to source and destination IMAP servers simultaneously
- Connection pooling for handling multiple concurrent operations
- Support for different authentication methods (OAuth2, PLAIN, LOGIN)
- Graceful connection timeout and reconnection handling

### Synchronization Features
- Detect and recreate folder hierarchies with special character handling
- Preserve all message flags (Read, Answered, Flagged, Deleted, Draft)
- Maintain original message dates and headers
- Pause, resume, and cancel sync capabilities

### Email Processing & Analytics
- Real-time email analytics: Sender, sending domains, underlying ESP, time delta between sent and received
- Security checks: Open relay detection, TLS support verification, certificate validation
- Full-text search for email contents with advanced filtering
- Visual dashboard with sender domain statistics

## Tech Stack

### Frontend
- Next.js (React framework) with TypeScript
- Tailwind CSS for responsive, mobile-friendly UI
- Professional and engaging dashboard with analytics visualizations

### Backend
- Node.js with NestJS framework and TypeScript
- MongoDB database with Mongoose ODM
- JWT authentication for secure API access
- IMAP protocol implementation with connection pooling

## Project Structure

```
inboxly/
├── frontend/         # Next.js application
│   ├── src/
│   │   ├── app/      # Next.js App Router pages
│   │   └── components/ # Reusable UI components
└── backend/          # NestJS application
    ├── src/
    │   ├── auth/     # Authentication module
    │   ├── imap/     # IMAP connection and sync module
    │   └── users/    # User management module
```

## Getting Started

### Prerequisites
- Node.js (v16 or later)
- MongoDB (local or Atlas)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies for both frontend and backend
3. Configure environment variables
4. Start the development servers

Detailed instructions can be found in the respective README files in the frontend and backend directories.