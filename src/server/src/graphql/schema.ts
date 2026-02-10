import { gql } from "graphql-tag";
import { GitService } from "../services/git";
import { DockerService } from "../services/docker";
import { prisma } from "../lib/prisma";
import { inngest } from "../lib/inngest";
import { AgentService } from "../services/agent";

export const typeDefs = gql`
  type ApiKey {
    id: ID!
    key: String!
    name: String
    lastUsedAt: String
    createdAt: String!
  }

  type User {
    id: ID!
    email: String!
    name: String
    image: String
    workspaces: [WorkspaceMember!]
    isAgentConnected: Boolean
    apiKeys: [ApiKey!]
  }

  type Workspace {
    id: ID!
    name: String!
    slug: String!
    description: String
    repoUrl: String
    repoToken: String
    repoPath: String
    hostingType: String
    localPort: Int
    stack: String
    ownerId: String!
    owner: User!
    members: [WorkspaceMember!]!
    invites: [WorkspaceInvite!]
    containers: [Container!]
    createdAt: String!
    updatedAt: String!
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
    myFriends(userId: String!): [Friend!]!
  }

  type Friend {
    id: String!
    name: String
    image: String
    email: String!
  }

  type Mutation {
    createApiKey(userId: String!, email: String!, name: String): ApiKey
    revokeApiKey(id: String!): Boolean
    createWorkspace(name: String!, description: String, userId: String!, email: String!, repoUrl: String, repoToken: String, hostingType: String, localPort: Int): Workspace
    joinWorkspace(inviteCode: String!, userId: String!, email: String, name: String, image: String): Workspace
    deleteWorkspace(id: String!, userId: String!): Boolean
    createInvite(workspaceId: String!, role: String!, inviterId: String!): WorkspaceInvite
    removeMember(workspaceId: String!, userId: String!, adminId: String!): Boolean
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
        myFriends: async (_: any, { userId }: { userId: string }) => {
            const friendships = await (prisma as any).friendship.findMany({
                where: { userId },
                include: { friend: true },
            });
            return friendships.map((f: any) => ({
                id: f.friend.id,
                name: f.friend.name,
                image: f.friend.image,
                email: f.friend.email,
            }));
        },
    },
    User: {
        isAgentConnected: (parent: any) => {
            return AgentService.isAgentConnected(parent.id);
        },
        apiKeys: async (parent: any) => {
            return await prisma.apiKey.findMany({
                where: { userId: parent.id },
                orderBy: { createdAt: 'desc' }
            });
        }
    },
    Workspace: {
        invites: async (parent: any) => {
            return await prisma.workspaceInvite.findMany({
                where: { workspaceId: parent.id }
            });
        }
    },
    Mutation: {
        createApiKey: async (_: any, { userId, email, name }: { userId: string, email: string, name?: string }) => {
            // Upsert user to ensure they exist (Foreign Key Constraint)
            await prisma.user.upsert({
                where: { id: userId },
                update: { email },
                create: {
                    id: userId,
                    email,
                    name: email.split("@")[0]
                }
            });

            const key = "ccw_" + require("crypto").randomBytes(24).toString("hex");
            return await prisma.apiKey.create({
                data: {
                    userId,
                    name,
                    key
                }
            });
        },
        revokeApiKey: async (_: any, { id }: { id: string }) => {
            await prisma.apiKey.delete({ where: { id } });
            return true;
        },
        createWorkspace: async (
            _: any,
            {
                name,
                description,
                userId,
                email,
                repoUrl,
                repoToken,
                hostingType = "CLOUD",
                localPort,
            }: {
                name: string;
                description?: string;
                userId: string;
                email: string;
                repoUrl?: string;
                repoToken?: string;
                hostingType?: string;
                localPort?: number;
            }
        ) => {
            // 1. Ensure User exists (Upsert by Clerk ID)
            await prisma.user.upsert({
                where: { id: userId },
                update: { email }, // Update email if it changed in Clerk
                create: {
                    id: userId,
                    email: email,
                    name: email.split("@")[0], // Fallback name
                },
            });

            // 2. Create Workspace
            const workspace = await prisma.workspace.create({
                data: {
                    name,
                    slug: name.toLowerCase().replace(/ /g, "-") + "-" + Math.random().toString(36).substring(2, 7),
                    description,
                    ownerId: userId,
                    hostingType: (hostingType as any) || "CLOUD",
                    localPort,
                    repoUrl,
                    repoToken,
                    members: {
                        create: {
                            userId,
                            role: "OWNER",
                        },
                    },
                },
            });

            // Trigger background setup via Inngest
            try {
                await inngest.send({
                    name: "workspace/setup",
                    data: { workspaceId: workspace.id }
                });
                console.log(`[GraphQL] Triggered Inngest setup for workspace ${workspace.id}`);
            } catch (err: any) {
                console.error(`[GraphQL] Failed to trigger Inngest setup: ${err.message}`);
                // In local dev, we might still want the workspace to be "created" even if background setup fails
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
            { inviteCode, userId, email, name, image }: { inviteCode: string; userId: string; email?: string; name?: string; image?: string; },
            { io }: { io: any }
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

            try {
                // Sync user if they don't exist yet
                await prisma.user.upsert({
                    where: { id: userId },
                    update: {
                        email: email || undefined,
                        name: name || undefined,
                        image: image || undefined
                    },
                    create: {
                        id: userId,
                        email: email || `user-${userId}@clerk.com`,
                        name: name || "New Contributor",
                        image: image,
                    }
                });
            } catch (err) {
                console.error("joinWorkspace: User upsert failed", err);
            }

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
                // If already a member, just return the workspace
                const memberWithWorkspace = await prisma.workspaceMember.findUnique({
                    where: { id: existingMember.id },
                    include: { workspace: true },
                });
                return memberWithWorkspace?.workspace;
            }

            const member = await prisma.workspaceMember.create({
                data: {
                    userId,
                    workspaceId: invite.workspaceId,
                    role: invite.role,
                },
                include: { workspace: { include: { members: true } } },
            });

            // Emit event to notify existing members to refetch
            if (io) {
                console.log(`Mutation: Emitting member-joined for workspace ${invite.workspaceId}`);
                io.to(invite.workspaceId).emit("member-joined", {
                    workspaceId: invite.workspaceId,
                    userId,
                    name: name || email?.split("@")[0] || "New Member"
                });
            }

            // Auto-friend: Create mutual friendships with all existing members
            const existingMemberIds = member.workspace.members
                .map(m => (m as any).userId || m.userId)
                .filter(id => id !== userId);

            for (const memberId of existingMemberIds) {
                try {
                    await (prisma as any).friendship.upsert({
                        where: { userId_friendId: { userId, friendId: memberId } },
                        update: {},
                        create: { userId, friendId: memberId },
                    });
                    await (prisma as any).friendship.upsert({
                        where: { userId_friendId: { userId: memberId, friendId: userId } },
                        update: {},
                        create: { userId: memberId, friendId: userId },
                    });
                } catch (err) {
                    console.error(`joinWorkspace: Auto-friend failed for ${memberId}`, err);
                }
            }

            return member.workspace;
        },
        deleteWorkspace: async (_: any, { id, userId }: { id: string; userId: string }) => {
            const workspace = await prisma.workspace.findUnique({
                where: { id },
                select: { ownerId: true, hostingType: true }
            });

            if (!workspace || workspace.ownerId !== userId) {
                throw new Error("Unauthorized: Only the owner can delete this workspace");
            }

            // Stop and remove container
            try {
                if (workspace.hostingType === "CLOUD") {
                    const { AwsService } = await import("../services/aws");
                    await AwsService.stopContainer(id);
                } else {
                    await DockerService.stopAndRemoveContainer(id).catch(() => null);
                }
            } catch (e) {
                console.error("Failed to remove container on delete", e);
            }

            await prisma.workspace.delete({
                where: { id },
            });
            return true;
        },
        removeMember: async (
            _: any,
            { workspaceId, userId, adminId }: { workspaceId: string; userId: string; adminId: string },
            { io }: { io: any }
        ) => {
            const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { ownerId: true }
            });

            if (!workspace || workspace.ownerId !== adminId) {
                throw new Error("Unauthorized: Only the owner can remove members");
            }

            if (userId === workspace.ownerId) {
                throw new Error("Owner cannot be removed from their own workspace");
            }

            await prisma.workspaceMember.delete({
                where: {
                    workspaceId_userId: {
                        workspaceId,
                        userId,
                    },
                },
            });

            // Emit event to notify the user they have been kicked
            if (io) {
                console.log(`Mutation: Emitting user-kicked for user ${userId} from workspace ${workspaceId}`);
                io.to(userId).emit("user-kicked", {
                    workspaceId,
                    userId
                });
            }

            return true;
        },
    },
};
