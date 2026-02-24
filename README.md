<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/GraphQL-E10098?style=for-the-badge&logo=graphql" alt="GraphQL" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socket.io" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma" alt="Prisma" />
</p>

<h1 align="center">⚡ CCW — Collaborative Cloud Workspace</h1>

<p align="center">
  <strong>Instant, isolated cloud development environments with real-time multiplayer collaboration.</strong><br/>
  Code, build, and deploy together — from any device, anywhere.
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-project-structure">Project Structure</a> •
  <a href="#-environment-variables">Environment Variables</a> •
  <a href="#-cli-agent">CLI Agent</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

## 🎯 What is CCW?

**CCW (Collaborative Cloud Workspace)** is a full-stack, open-source platform that provides **instant, containerized development environments** accessible from any browser. Think of it as a self-hostable alternative to GitHub Codespaces or Gitpod — but with deep **real-time collaboration** built into every layer: live code editing, shared terminals, voice/video calls, and team chat.

Each workspace spins up an isolated Docker container running [code-server](https://github.com/coder/code-server), giving every team member a full VS Code experience in the browser with zero local setup.

---

## ✨ Features

### 🖥️ Cloud IDE
- **Monaco Editor** with syntax highlighting, IntelliSense, and multi-language support
- **Yjs-powered real-time collaboration** — see teammates' cursors and edits live
- **Integrated file explorer** with create, rename, delete, and drag-and-drop support
- **Shared terminal** — run commands in the container, visible to all workspace members

### 🐳 Container Management
- **One-click Docker provisioning** — isolated environments with resource limits (512 MB RAM, 50% CPU)
- **Start / Stop / Restart** containers directly from the dashboard
- **Automatic cleanup** of stale containers
- **Shared cache volumes** for pnpm, pip, Cargo, Gradle, and Maven — faster rebuilds across workspaces
- **GitHub repo cloning** — auto-clone a repository into the container on creation

### 👥 Team Collaboration
- **Real-time chat** with message persistence, likes, file attachments (via Cloudinary), and soft delete
- **Voice & video calls** via WebRTC peer-to-peer mesh with full signaling server
- **File locking & presence** — see who's editing what, in real-time
- **Online status tracking** — know which teammates are currently connected
- **Workspace invites** — generate invite codes, send real-time invitation notifications to online users

### 🌍 Internationalization
- **Multi-language support** powered by [Lingo.dev](https://lingo.dev)
- Currently supports **English**, **Spanish**, and **Hindi**
- Language toggle accessible from the navigation bar

### 🔐 Security & Auth
- **Clerk authentication** — sign-in/sign-up with email, OAuth, and session management
- **Socket.IO authentication middleware** — JWT token verification on every connection
- **API key management** — generate and revoke keys for programmatic access
- **Rate limiting** — 500 requests per 15 minutes per IP
- **Role-based access control** — Owner, Editor, and Viewer roles per workspace

### 🏗️ Infrastructure
- **Cloud hosting** via Docker on the server, or **local hosting** via the CLI agent
- **AWS ECS support** for production-grade container orchestration
- **HTTP proxy** to forward traffic into containers (both HTTP and WebSocket)
- **Inngest** background jobs for async workspace setup workflows
- **Server-Sent Events** for real-time provisioning progress updates

---

## 🏛️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
│                                                                  │
│   Next.js 16  ·  React 19  ·  Monaco Editor  ·  Yjs  ·  WebRTC │
│   Clerk Auth  ·  Apollo Client  ·  Socket.IO Client             │
└──────────────┬──────────────┬──────────────┬─────────────────────┘
               │ GraphQL      │ Socket.IO    │ WebSocket (Yjs)
               ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND SERVER (:3001)                        │
│                                                                  │
│   Express  ·  Apollo Server  ·  Socket.IO  ·  Yjs Handler       │
│   Docker Service  ·  Proxy Service  ·  Terminal Service          │
│   Git Service  ·  Agent Service  ·  AWS Service                  │
│   Inngest (Background Jobs)  ·  Rate Limiter                     │
└──────┬─────────────┬──────────────┬──────────────┬───────────────┘
       │             │              │              │
       ▼             ▼              ▼              ▼
  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
  │PostgreSQL│  │  Docker  │  │Cloudinary│  │  CLI Agent   │
  │ (Prisma) │  │Containers│  │ (Media)  │  │(Local Tunnel)│
  └─────────┘  └──────────┘  └──────────┘  └──────────────┘
```

### Data Flow

1. **User signs in** via Clerk → JWT token issued
2. **Dashboard** fetches workspaces via GraphQL → creates/joins workspaces
3. **Workspace opens** → Docker container provisioned (or connects to local agent)
4. **Monaco editor + Yjs** → real-time collaborative editing over WebSocket
5. **Chat, file ops, terminal** → all channeled through Socket.IO with room-based event broadcasting
6. **Voice/Video** → WebRTC peer connections established via the signaling server

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI, Framer Motion |
| **Code Editor** | Monaco Editor, Yjs (CRDT), y-websocket, y-monaco |
| **Backend** | Express.js, Apollo Server (GraphQL), Socket.IO, Yjs WebSocket handler |
| **Database** | PostgreSQL via Prisma ORM |
| **Auth** | Clerk (NextJS SDK + Node SDK) |
| **Containers** | Docker (Dockerode), code-server, AWS ECS (optional) |
| **Media Storage** | Cloudinary |
| **Background Jobs** | Inngest |
| **Voice/Video** | WebRTC (simple-peer), custom signaling server |
| **i18n** | Lingo.dev |
| **CLI Agent** | Commander.js, Chalk, Ora, Dockerode |
| **Package Manager** | pnpm (workspaces) |

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version |
|---|---|
| **Node.js** | ≥ 18.x |
| **pnpm** | ≥ 10.x |
| **Docker** | ≥ 20.x (daemon running) |
| **PostgreSQL** | ≥ 14.x |

### 1. Clone the repository

```bash
git clone https://github.com/suraj-chakraborty/collaborative-coding-workspace.git
cd collaborative-coding-workspace
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your credentials (see Environment Variables section below)
```

### 4. Set up the database

```bash
# Generate Prisma Client
pnpm db:generate

# Push the schema to your database
pnpm db:push
```

### 5. Start the development servers

```bash
pnpm dev
```

This starts both services concurrently:
- **Frontend** → [http://localhost:3000](http://localhost:3000)
- **Backend** → [http://localhost:3001](http://localhost:3001)

### 6. Ensure Docker is running

The platform requires the Docker daemon to provision workspace containers. Make sure Docker Desktop (or `dockerd`) is running before creating a workspace.

---

## 📁 Project Structure

```
collaborative-coding-workspace/
├── prisma/
│   └── schema.prisma          # Database schema (User, Workspace, Container, Chat, etc.)
├── src/
│   ├── apps/                  # @collab-cloud/apps — Next.js Frontend
│   │   ├── src/
│   │   │   ├── app/           # Next.js App Router pages
│   │   │   │   ├── page.tsx           # Landing page
│   │   │   │   ├── dashboard/         # Workspace dashboard
│   │   │   │   ├── workspace/[id]/    # Workspace IDE view
│   │   │   │   ├── (auth)/            # Sign-in / Sign-up (Clerk)
│   │   │   │   ├── join/              # Invite join page
│   │   │   │   └── profile/           # User profile
│   │   │   ├── components/
│   │   │   │   ├── editor/            # Monaco editor, file explorer, terminal, chat
│   │   │   │   ├── workspace/         # Create/join modals, voice chat, call system
│   │   │   │   └── ui/               # 56 Radix-based UI primitives (shadcn/ui)
│   │   │   ├── hooks/                 # useWebRTC, useMobile
│   │   │   └── lingo/                 # i18n translations (en, es, hi)
│   │   └── package.json
│   │
│   ├── server/                # @collab-cloud/server — Express Backend
│   │   ├── src/
│   │   │   ├── index.ts               # Server entry — Express, Apollo, Socket.IO, Yjs
│   │   │   ├── graphql/schema.ts      # GraphQL type definitions & resolvers
│   │   │   ├── services/
│   │   │   │   ├── docker.ts          # Container lifecycle management
│   │   │   │   ├── proxy.ts           # HTTP/WebSocket proxy to containers
│   │   │   │   ├── terminal.ts        # Shared terminal sessions
│   │   │   │   ├── agent.ts           # Local agent Socket.IO namespace
│   │   │   │   ├── aws.ts            # AWS ECS provisioning
│   │   │   │   ├── git.ts            # Repository cloning
│   │   │   │   └── progress.ts       # SSE provisioning progress
│   │   │   ├── routes/                # REST endpoints (files, upload, translate)
│   │   │   ├── inngest/               # Background job functions
│   │   │   └── yjs-handler.ts         # Yjs WebSocket connection handler
│   │   └── package.json
│   │
│   └── agent/                 # @collab-cloud/agent — CLI Agent
│       ├── src/
│       │   ├── index.ts               # CLI entry — Commander.js (start/stop)
│       │   └── utils/                 # StatusDisplay, ProcessManager
│       ├── README.md
│       └── package.json
│
├── package.json               # Root monorepo config
├── pnpm-workspace.yaml        # pnpm workspace definition
└── .env.example               # Environment variable template
```

---

## 🔑 Environment Variables

Create a `.env` file in the project root (and in `src/apps/` and `src/server/`) based on `.env.example`:

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key | ✅ |
| `CLERK_SECRET_KEY` | Clerk secret key | ✅ |
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `NEXT_PUBLIC_SERVER_URL` | Backend server URL (default: `http://localhost:3001`) | ✅ |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (for file uploads) | ⬚ |
| `CLOUDINARY_API_KEY` | Cloudinary API key | ⬚ |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | ⬚ |
| `LINGO_API_KEY` | Lingo.dev API key (for translations) | ⬚ |
| `INNGEST_EVENT_KEY` | Inngest event key (for background jobs) | ⬚ |
| `INNGEST_SIGNING_KEY` | Inngest signing key | ⬚ |

---

## 🤖 CLI Agent

The **CCW Agent** allows you to connect your **local machine** as a workspace host — no cloud container needed. It tunnels traffic through the backend server using Socket.IO.

### Install

```bash
npm install -g @collab-cloud/agent
```

### Usage

```bash
# Start the agent (will prompt for API key)
CCW start

# Start with key directly
CCW start --key <YOUR_API_KEY>

# Stop the running agent
CCW stop
```

### Live Status Dashboard

Once running, the agent displays real-time metrics:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Status:          Connected
🆔 Agent ID:       7WPOlTgyoX4bBdPhAAAF
⏱️  Uptime:         00:05:23
🐳 Containers:     1 running
📦 Requests proxied: 47
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Press Ctrl+C or run 'CCW stop' to exit
```

### What the Agent Does

- Manages local Docker containers for workspaces
- Proxies HTTP requests from the cloud backend to your local container
- Provides graceful shutdown with PID file management
- Auto-reconnects on connection loss

---

## 📐 Database Schema

The Prisma schema defines 7 core models:

| Model | Purpose |
|---|---|
| `User` | Authenticated users (synced from Clerk) |
| `Workspace` | Development environments with repo, hosting type, and stack settings |
| `WorkspaceMember` | Join table with role-based access (Owner / Editor / Viewer) |
| `WorkspaceInvite` | Time-limited invite codes with revocation support |
| `Container` | Docker container state tracking per workspace |
| `ChatMessage` | Persistent chat with file attachments, likes, and soft delete |
| `Friendship` | Social graph between users |
| `ApiKey` | User-generated API keys for CLI agent authentication |

---

## 🧪 Development Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start frontend + backend in development mode |
| `pnpm build` | Build both packages for production |
| `pnpm start` | Start production servers |
| `pnpm lint` | Run ESLint across both packages |
| `pnpm db:generate` | Generate Prisma Client |
| `pnpm db:push` | Push schema changes to the database |
| `pnpm db:seed` | Seed the database with initial data |

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

---

## 📄 License

This project is licensed under the **MIT License**.

---

<p align="center">
  <sub>Built by suraj Chakraborty for developers who believe coding is better together.</sub>
</p>
