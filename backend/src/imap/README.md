# IMAP Module Documentation

## Overview

The IMAP module provides functionality for connecting to, managing, and interacting with IMAP email servers. It allows users to configure email connections, synchronize emails, and analyze email data for insights and security information.

## Core Components

### Services

#### ImapConnectionService

Handles low-level IMAP connections and operations:

- Creates and manages IMAP client connections
- Retrieves folder structures from IMAP servers
- Handles connection pooling and cleanup of inactive connections
- Provides methods for testing connection validity

#### ImapConnectionsService

Manages user email connections at a higher level:

- CRUD operations for user email connections
- Connection testing and validation
- Folder retrieval for specific connections
- Sync status and progress tracking

#### ImapAnalyticsService

Provides analytics and insights about email data:

- User-level analytics (total emails, top senders, email frequency)
- Connection-specific analytics (sender analysis, domain analysis)
- Security analysis (TLS usage, SPF/DKIM/DMARC validation)
- Server security assessment

### Controllers

#### ImapConnectionsController

Exposes REST API endpoints for managing email connections:

- GET /connections - List all connections for a user
- GET /connections/:id - Get a specific connection
- POST /connections - Create a new connection
- PATCH /connections/:id - Update a connection
- DELETE /connections/:id - Remove a connection
- POST /connections/test - Test a connection configuration
- GET /connections/:id/folders - Get folders for a connection

#### ImapAnalyticsController

Exposes REST API endpoints for email analytics:

- GET /analytics/user - Get user-level analytics
- GET /analytics/connection/:id - Get connection-specific analytics
- POST /analytics/server-security - Analyze email server security

### Schemas

#### Connection Schema

Stores email connection configurations:

- Connection details (host, port, username, password)
- Security settings (TLS)
- Sync status and progress information

#### Email Schema

Stores email data with comprehensive fields:

- Basic email metadata (subject, from, to, date)
- Content (HTML, text)
- Attachment information
- Analytics data
- Security information (encryption, SPF/DKIM/DMARC status)

## Security Features

The IMAP module includes several security features:

- TLS connection support for secure communication
- Email security analysis (SPF, DKIM, DMARC validation)
- Phishing detection capabilities
- Server security assessment

## Usage Examples

### Creating a Connection

```typescript
// Example: Creating a new IMAP connection
const connectionDto = {
  host: 'imap.example.com',
  port: 993,
  username: 'user@example.com',
  password: 'password',
  tls: true
};

const connection = await imapConnectionsService.create(connectionDto, userId);
```

### Getting Email Analytics

```typescript
// Example: Retrieving analytics for a specific connection
const analytics = await imapAnalyticsService.getConnectionAnalytics(connectionId, userId);

// Example: Analyzing server security
const securityAnalysis = await imapAnalyticsService.analyzeServerSecurity('imap.example.com', 993);
```

## Error Handling

The IMAP module implements comprehensive error handling:

- Connection errors are properly caught and reported
- Invalid configurations are validated before use
- Resource cleanup is performed to prevent memory leaks
- Sync errors are tracked and reported to the user

## Testing

Unit tests are available for all major components:

- ImapConnectionService tests
- ImapConnectionsService tests
- ImapAnalyticsService tests

Run tests using the standard NestJS testing commands:

```bash
# Run unit tests
npm run test

# Run e2e tests
npm run test:e2e
```