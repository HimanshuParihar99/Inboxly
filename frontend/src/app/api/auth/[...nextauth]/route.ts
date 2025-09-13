import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { JWT } from 'next-auth/jwt';

// Extended types for session and token
interface ExtendedToken extends JWT {
  connectionId?: string;
  accessToken?: string;
}

interface ExtendedSession {
  user?: {
    id?: string;
    name?: string;
    email?: string;
    image?: string;
  };
  connectionId?: string;
  expires: string;
}

// Connection pool management
const connectionPool = new Map<string, any>();

function getConnectionId(email: string): string {
  return `conn_${email}_${Date.now()}`;
}

function storeConnection(connectionId: string, connection: any) {
  connectionPool.set(connectionId, connection);
}

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
    CredentialsProvider({
      name: 'Email Server',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        server: { label: "IMAP Server", type: "text" },
        port: { label: "Port", type: "number" },
        authMethod: { label: "Authentication Method", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required');
        }

        try {
          // Here you would authenticate with the email server
          // For now, we'll simulate a successful connection
          const user = {
            id: credentials.email,
            email: credentials.email,
            name: credentials.email.split('@')[0],
          };

          // Generate a connection ID and store connection info
          const connectionId = getConnectionId(credentials.email);
          storeConnection(connectionId, {
            email: credentials.email,
            server: credentials.server,
            port: credentials.port,
            authMethod: credentials.authMethod,
            // Store other connection details as needed
          });

          return { ...user, connectionId };
        } catch (error) {
          console.error('Authentication error:', error);
          throw new Error('Authentication failed');
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user, account }: { token: ExtendedToken, user: any, account: any }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.connectionId = user.connectionId;
        
        if (account?.provider === 'google') {
          token.accessToken = account.access_token;
        }
      }
      return token;
    },
    async session({ session, token }: { session: ExtendedSession, token: ExtendedToken }) {
      if (token?.id) {
        if (session.user) {
          session.user.id = token.id as string;
        }
      }
      
      if (token?.connectionId) {
        session.connectionId = token.connectionId;
      }
      
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/api/auth/error',
  },
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };