import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestUser } from "../../tests/helpers";
import { db, schema } from "../db";
import { getCurrentUser, loginUser, registerUser } from "./auth.service";
import { isLegacyPasswordHash, verifyPassword } from "./utils";

const { users } = schema;

describe("AuthService", () => {
	describe("registerUser", () => {
		it("registers a new user with valid input", async () => {
			const result = await registerUser({
				email: "new@example.com",
				username: "newuser",
				displayName: "New User",
				password: "password123",
			});

			expect(result.userId).toBeDefined();
			expect(result.sessionToken).toBeDefined();

			// Verify user was created in database
			const user = await db.select().from(users).where(eq(users.id, result.userId)).get();

			expect(user).toBeDefined();
			expect(user?.email).toBe("new@example.com");
			expect(user?.username).toBe("newuser");
			expect(user?.role).toBe("user");
			expect(user?.passwordHash.startsWith("scrypt$v1$")).toBe(true);
			expect(isLegacyPasswordHash(user?.passwordHash || "")).toBe(false);
			expect(await verifyPassword("password123", user?.passwordHash || "")).toBe(true);
		});

		it("rejects duplicate email", async () => {
			await createTestUser({ email: "taken@example.com" });

			await expect(
				registerUser({
					email: "taken@example.com",
					username: "newuser",
					displayName: "New User",
					password: "password123",
				}),
			).rejects.toThrow("User with this email already exists");
		});

		it("rejects duplicate username", async () => {
			await createTestUser({ username: "takenname" });

			await expect(
				registerUser({
					email: "new@example.com",
					username: "takenname",
					displayName: "New User",
					password: "password123",
				}),
			).rejects.toThrow("Username already taken");
		});
	});

	describe("loginUser", () => {
		it("logs in with valid credentials", async () => {
			await createTestUser({
				email: "login@example.com",
				password: "correctpassword",
			});

			const result = await loginUser({
				email: "login@example.com",
				password: "correctpassword",
			});

			expect(result.userId).toBeDefined();
			expect(result.sessionToken).toBeDefined();
		});

		it("rejects invalid email", async () => {
			await expect(
				loginUser({
					email: "nonexistent@example.com",
					password: "password123",
				}),
			).rejects.toThrow("Invalid email or password");
		});

		it("rejects invalid password", async () => {
			await createTestUser({
				email: "user@example.com",
				password: "correctpassword",
			});

			await expect(
				loginUser({
					email: "user@example.com",
					password: "wrongpassword",
				}),
			).rejects.toThrow("Invalid email or password");
		});

		it("rejects banned user", async () => {
			const user = await createTestUser({
				email: "banned@example.com",
				password: "password123",
			});

			// Ban the user
			await db
				.update(users)
				.set({
					bannedAt: new Date(),
					bannedReason: "Violated ToS",
				})
				.where(eq(users.id, user.id));

			await expect(
				loginUser({
					email: "banned@example.com",
					password: "password123",
				}),
			).rejects.toThrow("Account banned: Violated ToS");
		});

		it("logs in a legacy user and upgrades the stored hash", async () => {
			const user = await createTestUser({
				email: "legacy@example.com",
				password: "legacy-password",
			});
			const otherUser = await createTestUser({
				email: "other-legacy@example.com",
				password: "legacy-password",
			});
			const legacyHash = createHash("sha256").update("legacy-passwordsalt").digest("hex");
			await Promise.all([
				db.update(users).set({ passwordHash: legacyHash }).where(eq(users.id, user.id)),
				db.update(users).set({ passwordHash: legacyHash }).where(eq(users.id, otherUser.id)),
			]);

			await loginUser({ email: "legacy@example.com", password: "legacy-password" });

			const upgradedUser = await db.select().from(users).where(eq(users.id, user.id)).get();
			const unchangedUser = await db.select().from(users).where(eq(users.id, otherUser.id)).get();
			expect(upgradedUser?.passwordHash).not.toBe(legacyHash);
			expect(upgradedUser?.passwordHash.startsWith("scrypt$v1$")).toBe(true);
			expect(await verifyPassword("legacy-password", upgradedUser?.passwordHash || "")).toBe(true);
			expect(unchangedUser?.passwordHash).toBe(legacyHash);
		});

		it("handles concurrent successful legacy logins without overwriting the upgraded hash", async () => {
			const user = await createTestUser({
				email: "legacy-concurrent@example.com",
				password: "legacy-password",
			});
			const legacyHash = createHash("sha256").update("legacy-passwordsalt").digest("hex");
			await db.update(users).set({ passwordHash: legacyHash }).where(eq(users.id, user.id));

			const results = await Promise.all([
				loginUser({ email: "legacy-concurrent@example.com", password: "legacy-password" }),
				loginUser({ email: "legacy-concurrent@example.com", password: "legacy-password" }),
			]);

			const upgradedUser = await db.select().from(users).where(eq(users.id, user.id)).get();
			expect(results.map((result) => result.userId)).toEqual([user.id, user.id]);
			expect(upgradedUser?.passwordHash.startsWith("scrypt$v1$")).toBe(true);
			expect(await verifyPassword("legacy-password", upgradedUser?.passwordHash || "")).toBe(true);
		});

		it("does not upgrade a legacy hash after a failed login", async () => {
			const user = await createTestUser({
				email: "legacy-failed@example.com",
				password: "legacy-password",
			});
			const legacyHash = createHash("sha256").update("legacy-passwordsalt").digest("hex");
			await db.update(users).set({ passwordHash: legacyHash }).where(eq(users.id, user.id));

			await expect(
				loginUser({ email: "legacy-failed@example.com", password: "wrong-password" }),
			).rejects.toThrow("Invalid email or password");

			const unchangedUser = await db.select().from(users).where(eq(users.id, user.id)).get();
			expect(unchangedUser?.passwordHash).toBe(legacyHash);
		});
	});

	describe("getCurrentUser", () => {
		it("returns user data for valid userId", async () => {
			const testUser = await createTestUser({
				email: "current@example.com",
				username: "currentuser",
				displayName: "Current User",
			});

			const user = await getCurrentUser(testUser.id);

			expect(user.id).toBe(testUser.id);
			expect(user.email).toBe("current@example.com");
			expect(user.username).toBe("currentuser");
			expect(user.displayName).toBe("Current User");
			expect(user.role).toBe("user");
		});

		it("throws for non-existent user", async () => {
			await expect(getCurrentUser("nonexistent-id")).rejects.toThrow("User not found");
		});
	});
});
