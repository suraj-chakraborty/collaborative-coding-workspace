import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../../../.env") });
import { gql } from "graphql-tag";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { GitService } from "../services/git";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

console.log("Prisma initialized with Prisma 7 adapter. DB URL status:", process.env.DATABASE_URL ? "Defined" : "UNDEFINED");

export const typeDefs = gql`
  type User {
    id: String!
    email: String!
    name: String
    image: String
    workspaces: [WorkspaceMember!]
  }

  type Workspace {
    id: String!
    name: String!
    description: String
    ownerId: String!
    members: [WorkspaceMember!]!
    invites: [WorkspaceInvite!]!
    createdAt: String!
    updatedAt: String!
    containers: [Container!]
  }

  type WorkspaceMember {
    id: String!
    role: String!
    user: User!
    workspace: Workspace!
  }

  type WorkspaceInvite {
    id: String!
    code: String!
    role: String!
    isRevoked: Boolean!
    workspaceId: String!
  }
  
  type Container {
    id: String!
    containerId: String
    status: String
  }

  type Query {
    me(email: String!): User
    myWorkspaces(email: String!): [Workspace!]!
    workspace(id: String!): Workspace
    workspaceByInvite(code: String!): Workspace
  }

  type Mutation {
    createWorkspace(
      name: String!
      description: String
      userId: String!
      email: String!
      repoUrl: String
      repoToken: String
    ): Workspace
    joinWorkspace(inviteCode: String!, userId: String!): Workspace
    deleteWorkspace(id: String!, userId: String!): Boolean
    createInvite(workspaceId: String!, role: String!, inviterId: String!): WorkspaceInvite
  }
`;

export const resolvers = {
    Query: {
        me: async (_: any, { email }: { email: string }) => {
            // Upsert user to ensure they exist in DB if they exist in Auth
            // This is a simplification; ideally we sync on login webhook
            return prisma.user.findUnique({
                where: { email },
                include: { workspaces: true },
            });
        },
        myWorkspaces: async (_: any, { email }: { email: string }) => {
            const user = await prisma.user.findUnique({
                where: { email },
                include: {
                    workspaces: {
                        include: {
                            workspace: {
                                include: {
                                    members: {
                                        include: { user: true }
                                    },
                                    invites: true
                                },
                            },
                        },
                    },
                },
            });
            return user?.workspaces.map((wm) => wm.workspace) || [];
        },
        workspace: async (_: any, { id }: { id: string }) => {
            return prisma.workspace.findUnique({
                where: { id },
                include: {
                    members: { include: { user: true } },
                    invites: true,
                },
            });
        },
        workspaceByInvite: async (_: any, { code }: { code: string }) => {
            const invite = await prisma.workspaceInvite.findUnique({
                where: { code },
                include: { workspace: true },
            });
            if (!invite || (invite as any).isRevoked) {
                throw new Error("Invalid or expired invite code");
            }
            return invite.workspace;
        },
    },
    Mutation: {
        createWorkspace: async (
            _: any,
            {
                name,
                description,
                userId,
                email,
                repoUrl,
                repoToken
            }: {
                name: string;
                description?: string;
                userId: string;
                email: string;
                repoUrl?: string;
                repoToken?: string;
            }
        ) => {
            // 1. Ensure User exists (Upsert by Clerk ID)
            await prisma.user.upsert({
                where: { id: userId },
                update: { email }, // Update email if it changed in Clerk
                create: {
                    id: userId,
                    email: email,
                    name: email.split('@')[0], // Fallback name
                },
            });

            // 2. Create Workspace
            const workspace = await prisma.workspace.create({
                data: {
                    name,
                    slug: name.toLowerCase().replace(/ /g, "-") + "-" + Math.random().toString(36).substring(2, 7),
                    description,
                    ownerId: userId,
                    members: {
                        create: {
                            userId,
                            role: "OWNER",
                        },
                    },
                },
            });

            // Handle Git Operations
            if (repoUrl) {
                try {
                    console.log(`Cloning ${repoUrl} for workspace ${workspace.id}`);
                    await GitService.cloneRepository(repoUrl, workspace.id, repoToken);
                } catch (e: any) {
                    console.error("Failed to clone repo", e);
                }
            } else {
                try {
                    await GitService.initRepository(workspace.id);
                } catch (e: any) {
                    console.error("Failed to init repo", e);
                }
            }

            return workspace;
        },
        createInvite: async (
            _: any,
            { workspaceId, role, inviterId }: { workspaceId: string; role: string; inviterId: string }
        ) => {
            const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { ownerId: true }
            });

            if (!workspace || workspace.ownerId !== inviterId) {
                throw new Error("Unauthorized: Only the owner can create invite codes");
            }

            return prisma.workspaceInvite.create({
                data: {
                    workspaceId,
                    role: role as any,
                    inviterId,
                    code: Math.random().toString(36).substring(2, 10).toUpperCase(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                },
            });
        },
        joinWorkspace: async (
            _: any,
            { inviteCode, userId }: { inviteCode: string; userId: string }
        ) => {
            // First ensure user exists (minimal info, based on clerk)
            // Ideally we'd have name/email from the client here too
            const invite = await prisma.workspaceInvite.findUnique({
                where: { code: inviteCode },
                include: { workspace: true }
            });

            if (!invite || (invite as any).isRevoked) {
                throw new Error("Invalid or revoked invite code");
            }

            // Sync user if they don't exist yet
            await prisma.user.upsert({
                where: { id: userId },
                update: {},
                create: {
                    id: userId,
                    email: `user-${userId}@clerk.com`, // Fallback, will sync on next login/dashboard load
                    name: "New Contributor"
                }
            });

            // Check if already a member
            const existingMember = await prisma.workspaceMember.findUnique({
                where: {
                    workspaceId_userId: {
                        userId,
                        workspaceId: invite.workspaceId,
                    },
                },
            });

            if (existingMember) {
                throw new Error("You are already a member of this workspace");
            }

            const member = await prisma.workspaceMember.create({
                data: {
                    userId,
                    workspaceId: invite.workspaceId,
                    role: invite.role,
                },
                include: { workspace: true },
            });

            return member.workspace;
        },
        deleteWorkspace: async (_: any, { id, userId }: { id: string; userId: string }) => {
            const workspace = await prisma.workspace.findUnique({
                where: { id },
                select: { ownerId: true }
            });

            if (!workspace || workspace.ownerId !== userId) {
                throw new Error("Unauthorized: Only the owner can delete this workspace");
            }

            // TODO: Stop and remove docker container
            try {
                const { DockerService } = require("../services/docker");
                await DockerService.stopContainer(id).catch(() => null);
            } catch (e) {
                console.error("Failed to stop container on delete", e);
            }

            await prisma.workspace.delete({
                where: { id },
            });
            return true;
        },
    },
};
